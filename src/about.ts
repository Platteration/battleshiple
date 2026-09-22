/**
 * What the About card says. Free of React Native so a test can hold each
 * line to what is true: the source link is the repository, and the privacy
 * line is backed by the app config test, which scans the source for network
 * code and for any URL but this one.
 */
export const APP_NAME = 'Battleshiple';
export const TAGLINE =
  'Battleship where the fleets move: after every shot one ship may manoeuvre, and its opponent sees only a splash.';
export const LICENCE = 'MIT licence';
export const SOURCE_URL = 'https://github.com/Platteration/battleshiple';
export const PRIVACY = 'Nothing leaves your device.';

/** The version the build carries (app.json's, through expo-constants), or a placeholder a missing config cannot be mistaken for. */
export function appVersion(configured: unknown): string {
  return typeof configured === 'string' && configured.length > 0 ? configured : '0.0.0';
}
