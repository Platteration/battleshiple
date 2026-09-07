import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Thin haptics wrapper. Web has no haptics engine and older devices may reject a
 * pattern, so every call is best-effort and never rejects.
 */
function safe(run: () => Promise<void>): void {
  if (Platform.OS === 'web') return;
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
