import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { accountClient } from './accountClient';
import {
  ACCOUNT_NOTES,
  AccountClient,
  Me,
  ShopProduct,
  SIGNED_OUT,
  SUPPORTER_ENTITLEMENT,
  SUPPORTER_PRODUCT,
  WORDS,
  pollFor,
} from './accountModel';

/**
 * The website's account and "Support this app", for the screens. On a phone the platform's
 * client is the inert twin, so this is off from the first frame and stays off: nothing is asked
 * and nothing is drawn. On the web it asks the site's `api/config` once; anything but a sign-in
 * that is on (a 404 on GitHub Pages, a network error, a body that is not the kit's) leaves it
 * off for good, with nothing stored and nothing retried, and the page exactly as it is without it.
 */
export interface AccountApi {
  /** Whether the site offers sign-in: the Account card of Settings is drawn only then. */
  signInOn: boolean;
  /** "Support this app" when the site sells it: its card in Settings is drawn only then. */
  supporter: ShopProduct | null;
  /** Who is signed in, when someone is. */
  user: Me['user'];
  /** Whether the server says the visitor has supported the app: About thanks them for it. */
  supported: boolean;
  /**
   * One line for the menu: sign-in failed, a payment received, or one still on its way. A line
   * about a payment is said only to a visitor api/me reports signed in, and every line goes once
   * the page finds nobody signed in (sign-out, deletion, a session that ended).
   */
  notice: string | null;
  dismissNotice: () => void;
  /** Leaves for Google, and comes back here. */
  signIn: () => void;
  /** Each returns what to tell the visitor when it did not work, or null. */
  signOut: () => Promise<string | null>;
  deleteAccount: () => Promise<string | null>;
  /** Leaves for Stripe's Checkout when it can; otherwise says why it did not. */
  buySupport: () => Promise<string | null>;
}

const OFF: AccountApi = {
  signInOn: false,
  supporter: null,
  user: null,
  supported: false,
  notice: null,
  dismissNotice: () => {},
  signIn: () => {},
  signOut: async () => null,
  deleteAccount: async () => null,
  buySupport: async () => null,
};

const Ctx = createContext<AccountApi>(OFF);

interface State {
  on: boolean;
  supporter: ShopProduct | null;
  me: Me;
  notice: string | null;
}

const OFF_STATE: State = { on: false, supporter: null, me: SIGNED_OUT, notice: null };

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const holds = (me: Me) => me.entitlements.includes(SUPPORTER_ENTITLEMENT);

interface Props {
  children?: React.ReactNode;
  /** The tests' client and clock; the app passes neither. */
  client?: AccountClient;
  wait?: (ms: number) => Promise<void>;
}

export function AccountProvider({ children, client = accountClient, wait = sleep }: Props) {
  const [state, setState] = useState<State>(OFF_STATE);
  const alive = useRef(true);
  // Which visitor an answer is about: moves on whenever the page learns that nobody is signed in
  // any more (sign-out, deletion, a session that ended), so the payment poll, if it is still
  // asking, does not put a line about the payment back on a page that is signed out.
  const visitor = useRef(0);

  useEffect(() => {
    alive.current = true;
    if (!client.web) return undefined;
    void (async () => {
      const config = await client.config();
      if (!alive.current || !config) return;
      const landing = client.takeLanding();
      const me = (await client.me()) ?? SIGNED_OUT;
      if (!alive.current) return;
      const product = config.supporter;
      // Anyone can open the address Checkout returns to. Only a visitor api/me reports signed in
      // can have paid: to anyone else the page says nothing about a payment and asks nothing more,
      // as for a cancelled Checkout (takeLanding has already taken it out of the address).
      const bought = landing.purchase === 'success' && product !== null && me.user !== null;
      const thanks = product ? WORDS.thanks(product.name) : null;
      setState({
        on: true,
        supporter: product,
        me,
        notice: landing.signIn === 'failed' ? WORDS.signInFailed : bought && holds(me) ? thanks : null,
      });
      if (!bought || holds(me)) return;
      // Stripe's webhook grants the purchase, and may land after the visitor is back.
      const asked = visitor.current;
      const { held, me: last } = await pollFor(SUPPORTER_ENTITLEMENT, () => client.me(), wait);
      if (!alive.current || visitor.current !== asked) return;
      setState((s) => {
        const now = last ?? s.me;
        // A session that ended while the page asked (another tab signed out) hears nothing either.
        return { ...s, me: now, notice: now.user === null ? null : held ? thanks : WORDS.paymentPending };
      });
    })();
    return () => {
      alive.current = false;
    };
  }, [client, wait]);

  const refresh = useCallback(async () => {
    const me = (await client.me()) ?? SIGNED_OUT;
    if (!alive.current) return;
    if (me.user === null) visitor.current += 1;
    // Nobody signed in now: the line on the menu (a thank-you, a payment on its way, a sign-in
    // that did not complete) spoke to the visitor who was, and goes with them.
    setState((s) => ({ ...s, me, notice: me.user === null ? null : s.notice }));
  }, [client]);

  const signOut = useCallback(async () => {
    if (!(await client.signOut())) return ACCOUNT_NOTES.signOutFailed;
    await refresh();
    return null;
  }, [client, refresh]);

  const deleteAccount = useCallback(async () => {
    if (!(await client.deleteAccount())) return ACCOUNT_NOTES.deleteFailed;
    await refresh();
    return null;
  }, [client, refresh]);

  const buySupport = useCallback(async () => {
    const result = await client.checkout(SUPPORTER_PRODUCT);
    if (result === 'redirecting') return null;
    if (result === 'signin' || result === 'owned') {
      // The session ended, or the payment is already on record: what the page shows is stale.
      await refresh();
      return null;
    }
    return ACCOUNT_NOTES[result];
  }, [client, refresh]);

  const api = useMemo<AccountApi>(
    () =>
      state.on
        ? {
            signInOn: true,
            supporter: state.supporter,
            user: state.me.user,
            supported: holds(state.me),
            notice: state.notice,
            dismissNotice: () => setState((s) => ({ ...s, notice: null })),
            signIn: () => client.signIn(),
            signOut,
            deleteAccount,
            buySupport,
          }
        : OFF,
    [state, client, signOut, deleteAccount, buySupport],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useAccount(): AccountApi {
  return useContext(Ctx);
}
