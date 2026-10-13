/**
 * The website's sign-in and "Support this app" on the screens: AccountProvider (src/account.tsx)
 * with a stand-in for the platform's client, under the Settings screen and the menu. A phone, and
 * a site whose host runs no api/ (its api/config a 404), draw nothing of it; a site that offers
 * them draws an Account card and the support card between Reset to defaults and About, and About
 * thanks a supporter. Nothing else changes for one.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import fs from 'fs';
import path from 'path';
import React from 'react';
import { Alert } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { PRIVACY, PRIVACY_WITH_ACCOUNT, SUPPORTER_THANKS } from '../src/about';
import { AccountProvider } from '../src/account';
import { AccountClient, ApiConfig, CheckoutResult, Landing, Me, NO_LANDING, POLL } from '../src/accountModel';
import { SettingsProvider } from '../src/settings';
import { HomeScreen } from '../src/ui/screens/HomeScreen';
import { SettingsScreen } from '../src/ui/screens/SettingsScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));
jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

const CONFIGURED: ApiConfig = {
  signIn: true,
  supporter: { id: 'supporter', name: 'Support this app', description: 'A one-time payment towards Battleshiple.', price: { unitAmount: 400, currency: 'usd' } },
};
const ADA: Me = { user: { email: 'ada@example.com' }, entitlements: [] };
const SUPPORTER: Me = { user: { email: 'ada@example.com' }, entitlements: ['supporter'] };

/** A client that answers as told, and records what it was asked. */
function fakeClient(options: { web?: boolean; config?: ApiConfig | null; me?: (Me | null)[]; landing?: Landing; checkout?: CheckoutResult; signOut?: boolean; deleteAccount?: boolean } = {}) {
  const calls: string[] = [];
  const answers = [...(options.me ?? [])];
  let last: Me | null = answers[0] ?? null;
  const client: AccountClient = {
    web: options.web ?? true,
    config: async () => {
      calls.push('config');
      return options.config === undefined ? CONFIGURED : options.config;
    },
    me: async () => {
      calls.push('me');
      if (answers.length) last = answers.shift() ?? null;
      return last;
    },
    signIn: () => void calls.push('signIn'),
    signOut: async () => {
      calls.push('signOut');
      return options.signOut ?? true;
    },
    deleteAccount: async () => {
      calls.push('deleteAccount');
      return options.deleteAccount ?? true;
    },
    checkout: async (product) => {
      calls.push(`checkout:${product}`);
      return options.checkout ?? 'redirecting';
    },
    takeLanding: () => {
      calls.push('takeLanding');
      return options.landing ?? NO_LANDING;
    },
  };
  return { client, calls };
}

const texts = (root: ReactTestInstance) =>
  root
    .findAll((n) => String(n.type) === 'Text' && n.children.length > 0)
    .map((n) => n.children.map((c) => (typeof c === 'string' ? c : '')).join(''))
    .filter(Boolean);

function findByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const [first] = root.findAll((n) => String(n.type) === 'Text' && n.children.length > 0 && n.children.map((c) => String(c)).join('') === text);
  if (!first) throw new Error(`No text node "${text}"`);
  return first;
}

async function press(root: ReactTestInstance, text: string) {
  let cur: ReactTestInstance | null = findByText(root, text);
  while (cur && typeof cur.props.onPress !== 'function') cur = cur.parent;
  if (!cur) throw new Error(`Nothing pressable holds "${text}"`);
  const target = cur;
  await act(async () => {
    target.props.onPress();
    await Promise.resolve();
  });
}

const flush = () =>
  act(async () => {
    for (let i = 0; i < 10; i += 1) await Promise.resolve();
  });

let renderer: ReactTestRenderer | undefined;
afterEach(() => {
  const r = renderer;
  if (r) act(() => r.unmount());
  renderer = undefined;
});
beforeEach(async () => {
  await AsyncStorage.clear();
});

async function settingsWith(client: AccountClient, wait: (ms: number) => Promise<void> = async () => {}) {
  await act(async () => {
    renderer = create(
      <SettingsProvider>
        <AccountProvider client={client} wait={wait}>
          <SettingsScreen onBack={() => {}} />
        </AccountProvider>
      </SettingsProvider>,
    );
  });
  await flush();
  return renderer!.root; // assigned just above
}

async function menuWith(client: AccountClient, wait: (ms: number) => Promise<void> = async () => {}) {
  await act(async () => {
    renderer = create(
      <AccountProvider client={client} wait={wait}>
        <HomeScreen difficulty="normal" onDifficultyChange={() => {}} loaded onStart={() => {}} onSettings={() => {}} />
      </AccountProvider>,
    );
  });
  await flush();
  return renderer!.root; // assigned just above
}

describe('where there is no account to offer', () => {
  it('a phone asks nothing and draws nothing', async () => {
    const { client, calls } = fakeClient({ web: false });
    const root = await settingsWith(client);
    expect(calls).toEqual([]);
    const shown = texts(root);
    for (const word of ['Account', 'Sign in with Google', 'Support this app', 'Sign in to buy', 'Buy']) expect(shown).not.toContain(word);
    expect(shown).toContain(PRIVACY);
    expect(shown).not.toContain(PRIVACY_WITH_ACCOUNT);
  });

  it('a site whose api/config is a 404 asks once, and draws nothing, the menu included', async () => {
    const { client, calls } = fakeClient({ config: null });
    const root = await settingsWith(client);
    expect(calls).toEqual(['config']);
    const shown = texts(root);
    for (const word of ['Account', 'Sign in with Google', 'Support this app']) expect(shown).not.toContain(word);
    expect(shown).toContain(PRIVACY);
    act(() => renderer!.unmount()); // rendered just above
    renderer = undefined;
    const menu = await menuWith(fakeClient({ config: null }).client);
    expect(menu.findAll((n) => n.props.accessibilityRole === 'alert')).toEqual([]);
  });
});

describe('on a site that offers sign-in and support', () => {
  it('draws the Account card and the support card between Reset to defaults and About, signed out', async () => {
    const { client, calls } = fakeClient({ me: [{ user: null, entitlements: [] }] });
    const root = await settingsWith(client);
    expect(calls).toEqual(['config', 'takeLanding', 'me']);
    const shown = texts(root);
    const order = ['Reset to defaults', 'Account', 'Sign in with Google', 'Support this app', 'A one-time payment towards Battleshiple.', '$4.00', 'Sign in to buy', 'About'].map((t) => shown.indexOf(t));
    expect(order.every((at) => at >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(shown).toContain(PRIVACY_WITH_ACCOUNT);
    expect(shown).not.toContain(PRIVACY);
    expect(shown).not.toContain('Buy');
    await press(root, 'Sign in with Google');
    await press(root, 'Sign in to buy');
    expect(calls.filter((c) => c === 'signIn')).toHaveLength(2);
  });

  it('with sign-in on and nothing sold, draws the Account card alone', async () => {
    const { client } = fakeClient({ config: { signIn: true, supporter: null }, me: [ADA] });
    const shown = texts(await settingsWith(client));
    expect(shown).toContain('Signed in as ada@example.com');
    expect(shown).not.toContain('Support this app');
    expect(shown).toContain(PRIVACY_WITH_ACCOUNT);
  });

  it('signed in: who, Sign out, and Buy, which goes to Checkout', async () => {
    const { client, calls } = fakeClient({ me: [ADA, { user: null, entitlements: [] }] });
    const root = await settingsWith(client);
    findByText(root, 'Signed in as ada@example.com');
    await press(root, 'Buy');
    expect(calls).toContain('checkout:supporter');
    await press(root, 'Sign out');
    await flush();
    expect(calls.slice(-2)).toEqual(['signOut', 'me']);
    findByText(root, 'Sign in with Google');
  });

  it('says signed in with Google when Google gave no verified email', async () => {
    const { client } = fakeClient({ me: [{ user: { email: null }, entitlements: [] }] });
    findByText(await settingsWith(client), 'Signed in with Google');
  });

  it.each([
    ['unavailable', 'Support is not on sale right now.'],
    ['busy', 'Too many tries for now. Try again in a while.'],
    ['failed', 'The shop could not be reached. Try again.'],
  ] as const)('a purchase that cannot start (%s) says why', async (result, note) => {
    const { client } = fakeClient({ me: [ADA], checkout: result });
    const root = await settingsWith(client);
    await press(root, 'Buy');
    await flush();
    findByText(root, note);
  });

  it('a purchase already on record, or a session that ended, is read again rather than said', async () => {
    const { client, calls } = fakeClient({ me: [ADA, SUPPORTER], checkout: 'owned' });
    const root = await settingsWith(client);
    await press(root, 'Buy');
    await flush();
    expect(calls.slice(-2)).toEqual(['checkout:supporter', 'me']);
    findByText(root, 'Owned');
  });

  it('a sign-out the server refused says so, and keeps the visitor signed in', async () => {
    const { client } = fakeClient({ me: [ADA], signOut: false });
    const root = await settingsWith(client);
    await press(root, 'Sign out');
    await flush();
    findByText(root, 'Could not sign out. Try again.');
    findByText(root, 'Signed in as ada@example.com');
  });

  it('Delete account asks first, through the app’s own confirmation, and says the support goes with it', async () => {
    const { client, calls } = fakeClient({ me: [SUPPORTER, { user: null, entitlements: [] }] });
    const root = await settingsWith(client);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      await press(root, 'Delete account');
      expect(alert).toHaveBeenCalledTimes(1);
      const [title, message, buttons] = alert.mock.calls[0]! as [string, string, { text: string; style?: string; onPress?: () => void }[]]; // called once, just above
      expect(title).toBe('Delete account?');
      expect(message).toMatch(/your support with it: the thank-you in About goes too\. The payment itself stays with Stripe\./);
      expect(buttons.map((b) => [b.text, b.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Delete account', 'destructive'],
      ]);
      expect(calls).not.toContain('deleteAccount');
      await act(async () => {
        buttons[1]!.onPress!(); // the destructive button, checked above
        await Promise.resolve();
      });
      await flush();
    } finally {
      alert.mockRestore();
    }
    expect(calls.slice(-2)).toEqual(['deleteAccount', 'me']);
    findByText(root, 'Sign in with Google');
    expect(texts(root)).not.toContain(SUPPORTER_THANKS);
  });

  it('a deletion the server refused says so', async () => {
    const { client } = fakeClient({ me: [ADA], deleteAccount: false });
    const root = await settingsWith(client);
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.[1]?.onPress?.());
    try {
      await press(root, 'Delete account');
      await flush();
    } finally {
      alert.mockRestore();
    }
    findByText(root, 'The account could not be deleted. Try again.');
  });

  it('a supporter is thanked in About, and the support card says Owned rather than Buy', async () => {
    const { client } = fakeClient({ me: [SUPPORTER] });
    const shown = texts(await settingsWith(client));
    expect(shown).toContain(SUPPORTER_THANKS);
    expect(shown.indexOf(SUPPORTER_THANKS)).toBeGreaterThan(shown.indexOf('About'));
    expect(shown).toContain('Owned');
    expect(shown).not.toContain('Buy');
  });

  it('nothing else reads whether the visitor is a supporter', () => {
    // What a supporter gets is the line in About: nothing in the game, the menu or the board.
    const readers: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.tsx?$/.test(entry.name) && /\.supported\b/.test(fs.readFileSync(full, 'utf8'))) readers.push(path.relative(path.join(__dirname, '..'), full));
      }
    };
    walk(path.join(__dirname, '..', 'src'));
    expect(readers).toEqual([path.join('src', 'ui', 'screens', 'SettingsScreen.tsx')]);
    expect(fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8')).not.toMatch(/\.supported\b|useAccount/);
  });
});

describe('coming back to the menu from Google and Stripe', () => {
  it('a sign-in that did not complete is said once, and goes when dismissed', async () => {
    const { client } = fakeClient({ landing: { signIn: 'failed', purchase: null }, me: [{ user: null, entitlements: [] }] });
    const root = await menuWith(client);
    const [alert] = root.findAll((n) => n.props.accessibilityRole === 'alert' && typeof n.type !== 'string');
    expect(alert).toBeDefined();
    findByText(root, "Sign-in didn't complete.");
    await press(root, 'Dismiss');
    expect(texts(root)).not.toContain("Sign-in didn't complete.");
  });

  it('a payment the webhook has already granted is thanked at once', async () => {
    const waits: number[] = [];
    const { client, calls } = fakeClient({ landing: { signIn: null, purchase: 'success' }, me: [SUPPORTER] });
    const root = await menuWith(client, async (ms) => void waits.push(ms));
    findByText(root, 'Thank you — Support this app is unlocked.');
    expect(waits).toEqual([]);
    expect(calls.filter((c) => c === 'me')).toHaveLength(1);
  });

  it('a payment the webhook grants a little later is asked for, then thanked', async () => {
    const waits: number[] = [];
    const { client, calls } = fakeClient({ landing: { signIn: null, purchase: 'success' }, me: [ADA, ADA, SUPPORTER] });
    const root = await menuWith(client, async (ms) => void waits.push(ms));
    await flush();
    findByText(root, 'Thank you — Support this app is unlocked.');
    expect(waits).toEqual([POLL.everyMs, POLL.everyMs]);
    expect(calls.filter((c) => c === 'me')).toHaveLength(3);
  });

  it('a payment not yet granted is not thanked while the page is still asking', async () => {
    // The webhook is what grants it: until api/me says so, the menu says nothing.
    const { client, calls } = fakeClient({ landing: { signIn: null, purchase: 'success' }, me: [ADA] });
    const root = await menuWith(client, () => new Promise<void>(() => {}));
    expect(calls).toEqual(['config', 'takeLanding', 'me']);
    expect(root.findAll((n) => n.props.accessibilityRole === 'alert')).toEqual([]);
  });

  it('a payment that has not shown after five tries says it can take a minute', async () => {
    const { client, calls } = fakeClient({ landing: { signIn: null, purchase: 'success' }, me: [ADA] });
    const root = await menuWith(client);
    await flush();
    findByText(root, 'Payment received. It can take a minute to appear — reload to check.');
    expect(calls.filter((c) => c === 'me')).toHaveLength(1 + POLL.tries);
  });

  it('a cancelled Checkout says nothing', async () => {
    const { client, calls } = fakeClient({ landing: { signIn: null, purchase: 'cancelled' }, me: [ADA] });
    const root = await menuWith(client);
    await flush();
    expect(root.findAll((n) => n.props.accessibilityRole === 'alert')).toEqual([]);
    expect(calls).toEqual(['config', 'takeLanding', 'me']);
  });
});
