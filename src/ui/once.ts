/**
 * The one-off moments (a splash's ripple, a manoeuvre's tween, a wreck's badge)
 * each play once per app run, keyed by what they are about. Module-level, so a
 * re-render, or the remount a board switch causes, never plays one again.
 * Bounded: only recent moments can still be on screen.
 */
const played: string[] = [];

/** True the first time `key` is asked about, false ever after (until it ages out). */
export function firstSight(key: string): boolean {
  if (played.includes(key)) return false;
  played.push(key);
  if (played.length > 32) played.shift();
  return true;
}
