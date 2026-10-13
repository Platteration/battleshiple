/**
 * The website's sign-in and "Support this app", below the screens: what the page reads from the
 * site's api/ (src/accountModel.ts), and the web client that asks for it (src/accountClient.web.ts),
 * driven here against a fetch and an address that stand in for the browser's. Nothing reaches a
 * network: the fetch is a jest function that answers as server/kit answers.
 */
import { CHECKOUT_ORIGIN, accountClient as web, apiUrl, isCheckoutUrl } from '../src/accountClient.web';
import {
  ACCOUNT_NOTES,
  NO_LANDING,
  POLL,
  SUPPORTER_ENTITLEMENT,
  SUPPORTER_PRODUCT,
  WORDS,
  formatPrice,
  landingOf,
  pollFor,
  readApiConfig,
  readMe,
} from '../src/accountModel';

/** What server/kit's `GET api/config` answers for this app's catalogue (server/catalogue.js). */
const CONFIG = {
  auth: { google: true },
  shop: {
    products: [
      {
        id: 'supporter',
        name: 'Support this app',
        description: 'A one-time payment towards Battleshiple.',
        mode: 'payment',
        price: { unit_amount: 400, currency: 'usd' },
      },
    ],
  },
};

describe('readApiConfig', () => {
  it('reads sign-in and the one product this app sells', () => {
    expect(readApiConfig(CONFIG)).toEqual({
      signIn: true,
      supporter: { id: 'supporter', name: 'Support this app', description: 'A one-time payment towards Battleshiple.', price: { unitAmount: 400, currency: 'usd' } },
    });
  });

  it('is nothing at all when sign-in is off, or the body is not the kit’s', () => {
    for (const raw of [
      null,
      undefined,
      'config',
      [],
      {},
      { auth: { google: false }, shop: { products: [] } },
      { auth: { google: 'yes' }, shop: { products: [] } },
      { auth: true },
      // The kit sells nothing without sign-in: a product listed beside sign-in off is no shop.
      { auth: { google: false }, shop: CONFIG.shop },
    ]) {
      expect([raw, readApiConfig(raw)]).toEqual([raw, null]);
    }
  });

  it('is sign-in alone when the shop lists nothing this build sells', () => {
    const withProducts = (products: unknown) => readApiConfig({ auth: { google: true }, shop: { products } });
    const base = CONFIG.shop.products[0]!; // the fixture has one product
    expect(readApiConfig({ auth: { google: true } })).toEqual({ signIn: true, supporter: null });
    expect(withProducts([])).toEqual({ signIn: true, supporter: null });
    expect(withProducts('supporter')).toEqual({ signIn: true, supporter: null });
    // Another app's product, a subscription, or one whose words cannot be drawn.
    for (const product of [
      { ...base, id: 'pro' },
      { ...base, mode: 'subscription' },
      { ...base, name: '' },
      { ...base, name: 7 },
      { ...base, name: 'x'.repeat(101) },
      { ...base, name: 'Support\nthis app' },
      { ...base, description: undefined },
      { ...base, description: 'x'.repeat(501) },
      { ...base, description: 'bell\u0007' },
    ]) {
      expect([product, withProducts([product])]).toEqual([product, { signIn: true, supporter: null }]);
    }
    // An empty description is still a description.
    expect(withProducts([{ ...base, description: '' }])?.supporter?.description).toBe('');
  });

  it('lists the product without a price when the price cannot be read', () => {
    const base = CONFIG.shop.products[0]!; // the fixture has one product
    for (const price of [undefined, null, {}, { unit_amount: 4.5, currency: 'usd' }, { unit_amount: -1, currency: 'usd' }, { unit_amount: '400', currency: 'usd' }, { unit_amount: 400, currency: 'USD' }, { unit_amount: 400, currency: 'us' }]) {
      const read = readApiConfig({ auth: { google: true }, shop: { products: [{ ...base, price }] } });
      expect([price, read?.supporter?.name, read?.supporter?.price]).toEqual([price, 'Support this app', null]);
    }
  });
});

describe('readMe', () => {
  it('reads who is signed in and what they hold', () => {
    expect(readMe({ user: { email: 'ada@example.com' }, entitlements: ['supporter'] })).toEqual({ user: { email: 'ada@example.com' }, entitlements: ['supporter'] });
    expect(readMe({ user: {}, entitlements: [] })).toEqual({ user: { email: null }, entitlements: [] });
    expect(readMe({ user: null, entitlements: [] })).toEqual({ user: null, entitlements: [] });
  });

  it('keeps only entitlements of the kit’s shape, once each', () => {
    expect(readMe({ user: null, entitlements: ['supporter', 'supporter', 'Supporter', 7, '', 'a'.repeat(33), '__proto__', 'pro'] })?.entitlements).toEqual(['supporter', 'pro']);
  });

  it('draws no email it cannot show as text', () => {
    for (const email of [7, '', 'a\nb', 'x'.repeat(321)]) expect(readMe({ user: { email }, entitlements: [] })?.user).toEqual({ email: null });
  });

  it('is null for a body that is not the kit’s', () => {
    for (const raw of [null, 'me', [], {}, { user: null }, { user: 'ada', entitlements: [] }, { user: [], entitlements: [] }, { user: null, entitlements: 'supporter' }]) {
      expect([raw, readMe(raw)]).toEqual([raw, null]);
    }
  });
});

describe('formatPrice', () => {
  it('reads Stripe’s smallest unit for each kind of currency', () => {
    expect(formatPrice({ unitAmount: 400, currency: 'usd' }, 'en-US')).toBe('$4.00');
    expect(formatPrice({ unitAmount: 499, currency: 'jpy' }, 'en-US')).toBe('¥499');
    expect(formatPrice({ unitAmount: 1500, currency: 'kwd' }, 'en-US')).toMatch(/^KWD\s1\.500$/); // Intl puts a no-break space there
  });

  it('is null for a currency the platform cannot format', () => {
    expect(formatPrice({ unitAmount: 400, currency: 'zz1' }, 'en-US')).toBeNull();
  });
});

describe('landingOf', () => {
  it('reads what the kit and Checkout write, and gives the address back without it', () => {
    expect(landingOf('https://b.example/battleshiple/?signin=failed')).toEqual({ landing: { signIn: 'failed', purchase: null }, without: '/battleshiple/' });
    expect(landingOf('https://b.example/?purchase=success')).toEqual({ landing: { signIn: null, purchase: 'success' }, without: '/' });
    expect(landingOf('https://b.example/?purchase=cancelled&keep=1#top')).toEqual({ landing: { signIn: null, purchase: 'cancelled' }, without: '/?keep=1#top' });
  });

  it('leaves alone what is not the kit’s', () => {
    for (const href of ['https://b.example/', 'https://b.example/?signin=ok', 'https://b.example/?purchase=maybe', 'not an address']) {
      expect(landingOf(href)).toEqual({ landing: NO_LANDING, without: null });
    }
  });
});

describe('pollFor', () => {
  it('asks until the purchase shows, then stops', async () => {
    const answers = [{ user: null, entitlements: [] }, null, { user: null, entitlements: ['supporter'] }];
    const me = jest.fn(async () => answers.shift() ?? null);
    const waits: number[] = [];
    const result = await pollFor(SUPPORTER_ENTITLEMENT, me, async (ms) => void waits.push(ms));
    expect(result).toEqual({ held: true, me: { user: null, entitlements: ['supporter'] } });
    expect(me).toHaveBeenCalledTimes(3);
    expect(waits).toEqual([POLL.everyMs, POLL.everyMs, POLL.everyMs]);
  });

  it('gives up after five tries over fifteen seconds', async () => {
    const me = jest.fn(async () => ({ user: null, entitlements: [] }));
    const waits: number[] = [];
    expect(await pollFor(SUPPORTER_ENTITLEMENT, me, async (ms) => void waits.push(ms))).toEqual({ held: false, me: { user: null, entitlements: [] } });
    expect(me).toHaveBeenCalledTimes(5);
    expect(waits.reduce((a, b) => a + b, 0)).toBe(15000);
  });
});

describe('the words', () => {
  it('are the ones every app that carries the kit says', () => {
    expect(SUPPORTER_PRODUCT).toBe('supporter');
    expect(WORDS.signIn).toBe('Sign in with Google');
    expect(WORDS.signedInAs('ada@example.com')).toBe('Signed in as ada@example.com');
    expect(WORDS.signedIn).toBe('Signed in with Google');
    expect(WORDS.signInFailed).toBe("Sign-in didn't complete.");
    expect(WORDS.thanks('Support this app')).toBe('Thank you — Support this app is unlocked.');
    expect(WORDS.paymentPending).toBe('Payment received. It can take a minute to appear — reload to check.');
    expect([WORDS.buy, WORDS.signInToBuy, WORDS.owned, WORDS.signOut, WORDS.deleteAccount]).toEqual(['Buy', 'Sign in to buy', 'Owned', 'Sign out', 'Delete account']);
    // Deleting says the support goes with the account, and the payment stays with Stripe.
    expect(ACCOUNT_NOTES.deleteBody).toMatch(/support with it/);
    expect(ACCOUNT_NOTES.deleteBody).toMatch(/stays with Stripe, with the account id it was made under/);
  });
});

describe('the web client', () => {
  const PAGE = 'https://b.example/battleshiple/';
  let assign: jest.Mock;
  let replaceState: jest.Mock;
  let fetch: jest.Mock;
  const saved = globalThis.fetch;
  const setPage = (href: string) => {
    const url = new URL(href);
    Object.defineProperty(window, 'location', { configurable: true, value: { href, pathname: url.pathname, search: url.search, assign } });
  };

  beforeEach(() => {
    assign = jest.fn();
    replaceState = jest.fn();
    fetch = jest.fn();
    globalThis.fetch = fetch;
    setPage(PAGE);
    Object.defineProperty(window, 'history', { configurable: true, value: { state: { at: 1 }, replaceState } });
  });
  afterEach(() => {
    globalThis.fetch = saved;
    Reflect.deleteProperty(window, 'location');
    Reflect.deleteProperty(window, 'history');
  });

  const answer = (status: number, body?: unknown) => fetch.mockResolvedValueOnce(new Response(body === undefined ? null : JSON.stringify(body), { status }));

  it('asks the api/ beside the page, under a sub-path too', () => {
    expect(apiUrl('config', 'https://b.example/battleshiple/')).toBe('https://b.example/battleshiple/api/config');
    expect(apiUrl('config', 'https://b.example/')).toBe('https://b.example/api/config');
    expect(apiUrl('me')).toBe('https://b.example/battleshiple/api/me');
  });

  it('reads api/config, and takes a 404, a network error or a body that is not JSON for nothing on', async () => {
    answer(200, CONFIG);
    expect((await web.config())?.supporter?.name).toBe('Support this app');
    expect(fetch).toHaveBeenLastCalledWith('https://b.example/battleshiple/api/config', expect.objectContaining({ credentials: 'same-origin' }));
    answer(404, { error: 'not_found' });
    expect(await web.config()).toBeNull();
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await web.config()).toBeNull();
    fetch.mockResolvedValueOnce(new Response('<!DOCTYPE html>', { status: 200 }));
    expect(await web.config()).toBeNull();
    // Whatever a failed answer carries is not read, even a body of the kit's shape.
    answer(500, CONFIG);
    expect(await web.config()).toBeNull();
  });

  it('reads api/me past every cache', async () => {
    answer(200, { user: { email: 'ada@example.com' }, entitlements: ['supporter'] });
    expect(await web.me()).toEqual({ user: { email: 'ada@example.com' }, entitlements: ['supporter'] });
    expect(fetch).toHaveBeenLastCalledWith('https://b.example/battleshiple/api/me', expect.objectContaining({ cache: 'no-store' }));
  });

  it('signs in by leaving for api/auth/google/start, asking to come back to this address', () => {
    setPage('https://b.example/battleshiple/?keep=1');
    web.signIn();
    expect(assign).toHaveBeenCalledWith('https://b.example/battleshiple/api/auth/google/start?return=%2Fbattleshiple%2F%3Fkeep%3D1');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('signs out and deletes with a same-origin request, and says whether it worked', async () => {
    answer(204);
    expect(await web.signOut()).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith('https://b.example/battleshiple/api/auth/logout', expect.objectContaining({ method: 'POST', credentials: 'same-origin', body: undefined }));
    answer(403, { error: 'forbidden' });
    expect(await web.signOut()).toBe(false);
    answer(204);
    expect(await web.deleteAccount()).toBe(true);
    expect(fetch).toHaveBeenLastCalledWith('https://b.example/battleshiple/api/me', expect.objectContaining({ method: 'DELETE' }));
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await web.deleteAccount()).toBe(false);
  });

  it('takes no answer but the kit’s 204 for a sign-out or a deletion that happened', async () => {
    // A session that has ended (401), a cross-site refusal (403), a conflict (409), a server or
    // proxy error (500, 502) and an unexpected 200 each leave the account as it was: the page
    // says it did not work, rather than drawing the visitor signed out or the account gone.
    for (const status of [200, 401, 403, 409, 500, 502]) {
      answer(status, { error: 'x' });
      expect([status, 'signOut', await web.signOut()]).toEqual([status, 'signOut', false]);
      answer(status, { error: 'x' });
      expect([status, 'deleteAccount', await web.deleteAccount()]).toEqual([status, 'deleteAccount', false]);
    }
  });

  it('buys by sending the product as JSON, and leaves only for Stripe’s Checkout', async () => {
    answer(200, { url: 'https://checkout.stripe.com/c/pay/cs_test_1' });
    expect(await web.checkout('supporter')).toBe('redirecting');
    expect(fetch).toHaveBeenLastCalledWith(
      'https://b.example/battleshiple/api/checkout',
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ 'content-type': 'application/json' }), body: '{"product":"supporter"}' }),
    );
    expect(assign).toHaveBeenCalledWith('https://checkout.stripe.com/c/pay/cs_test_1');
    for (const url of ['https://checkout.stripe.com.evil.example/c', 'https://checkout.stripe.com@evil.example/', 'http://checkout.stripe.com/c', 'javascript:alert(1)', 7, undefined]) {
      assign.mockClear();
      answer(200, { url });
      expect([url, await web.checkout('supporter')]).toEqual([url, 'failed']);
      expect(assign).not.toHaveBeenCalled();
    }
  });

  it('says why a purchase did not start', async () => {
    for (const [status, result] of [
      [401, 'signin'],
      [409, 'owned'],
      [404, 'unavailable'],
      [429, 'busy'],
      [502, 'failed'],
    ] as const) {
      answer(status, { error: 'x' });
      expect([status, await web.checkout('supporter')]).toEqual([status, result]);
    }
    fetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    expect(await web.checkout('supporter')).toBe('failed');
    expect(assign).not.toHaveBeenCalled();
  });

  it('reads the landing once, and takes it out of the address', () => {
    setPage('https://b.example/battleshiple/?signin=failed');
    expect(web.takeLanding()).toEqual({ signIn: 'failed', purchase: null });
    expect(replaceState).toHaveBeenCalledWith({ at: 1 }, '', '/battleshiple/');
    replaceState.mockClear();
    setPage('https://b.example/battleshiple/');
    expect(web.takeLanding()).toEqual(NO_LANDING);
    expect(replaceState).not.toHaveBeenCalled();
  });

  it('names Checkout by its origin and a slash', () => {
    expect(CHECKOUT_ORIGIN).toBe('https://checkout.stripe.com');
    expect(isCheckoutUrl('https://checkout.stripe.com/c/pay/x')).toBe(true);
    expect(isCheckoutUrl('https://checkout.stripe.com')).toBe(false);
  });
});
