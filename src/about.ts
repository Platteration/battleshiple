/**
 * What the About card says. Free of React Native so a test can hold each
 * line to what is true: the source link is the repository, and the privacy
 * line is backed by the app config test, which scans the source for network
 * code and for any URL but this one (the website's account client, which a
 * phone never gets, aside).
 */
export const APP_NAME = 'Battleshiple';
export const TAGLINE =
  'Battleship where the fleets move: after every shot one ship may manoeuvre, and its opponent sees only a splash.';
export const LICENCE = 'MIT licence';
export const SOURCE_URL = 'https://github.com/Platteration/battleshiple';
/** On a phone, and on a website whose host runs no sign-in. */
export const PRIVACY = 'Nothing leaves your device.';
/**
 * On a website whose api/ offers sign-in (server/kit): what signing in and paying tell the site
 * and Stripe, and what the site keeps. The email is kept in the session record alone, which
 * signing out deletes and which ends after thirty days. Buying sends Stripe the account id
 * (server/kit's createCheckoutSession: client_reference_id and metadata.user, copied onto the
 * payment), which Delete account cannot take back there.
 */
export const PRIVACY_WITH_ACCOUNT =
  "Nothing leaves your device unless you sign in or buy. Signing in with Google tells this site an account id and your email address; a payment goes through Stripe, which handles it and is told that account id with it. The site keeps the account id, what was bought and Stripe's customer id, and your email address only while you are signed in. The game itself is never uploaded.";
/** What About says to a visitor the site's api/ reports as a supporter. Nothing else changes for them. */
export const SUPPORTER_THANKS = 'Thank you for supporting Battleshiple.';

/** The version the build carries (app.json's, through expo-constants), or a placeholder a missing config cannot be mistaken for. */
export function appVersion(configured: unknown): string {
  return typeof configured === 'string' && configured.length > 0 ? configured : '0.0.0';
}
