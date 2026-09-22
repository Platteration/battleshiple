import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

let enabled = true;

/**
 * Set by the settings provider from the Vibration switch. Off means every call
 * below is skipped before it reaches the engine, not merely quietened.
 */
export function setHapticsEnabled(on: boolean): void {
  enabled = on;
}

/**
 * Thin haptics wrapper. Web has no haptics engine and older devices may reject a
 * pattern, so every call is best-effort and never rejects.
 */
function safe(run: () => Promise<void>): void {
  if (Platform.OS === 'web' || !enabled) return;
  void run().catch(() => undefined);
}

export const feedback = {
  tap(): void {
    safe(() => Haptics.selectionAsync());
  },
  miss(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
  },
  hit(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
  },
  sunk(): void {
    safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
  },
  incoming(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
  },
  maneuver(): void {
    safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
  },
};
