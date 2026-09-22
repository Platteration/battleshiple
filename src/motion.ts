import { useEffect, useState } from 'react';
import { AccessibilityInfo, Platform } from 'react-native';
import type { ReduceMotionSetting } from './settings';

/**
 * Whether a web page can answer the media query at all. react-native-web's
 * AccessibilityInfo resolves *true* when `matchMedia` is missing (jsdom, an
 * old browser), which would hold every ripple still for a preference nobody
 * set; here a page that cannot answer means no preference.
 */
function webCanAnswer(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function';
}

/** The platform's answer to "reduce motion?", or false when it has none. */
export function systemReducesMotion(): Promise<boolean> {
  if (Platform.OS === 'web' && !webCanAnswer()) return Promise.resolve(false);
  // On native the call rejects when there is no module behind it (a bare
  // runtime, jest); that is an absence, not a preference.
  return AccessibilityInfo.isReduceMotionEnabled()
    .then((on) => on === true)
    .catch(() => false);
}

/**
 * Whether decorative motion should hold still. `on` and `off` are the player's
 * word; `system` follows the device's accessibility setting, and keeps
 * following it while the screen is up.
 */
export function useReduceMotion(setting: ReduceMotionSetting): boolean {
  const [system, setSystem] = useState(false);

  useEffect(() => {
    if (setting !== 'system') return;
    let alive = true;
    void systemReducesMotion().then((on) => {
      if (alive) setSystem(on);
    });
    if (Platform.OS === 'web' && !webCanAnswer()) {
      return () => {
        alive = false;
      };
    }
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => {
      if (alive) setSystem(on === true);
    });
    return () => {
      alive = false;
      sub.remove();
    };
  }, [setting]);

  return setting === 'system' ? system : setting === 'on';
}
