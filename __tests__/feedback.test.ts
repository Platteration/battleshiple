import * as Haptics from 'expo-haptics';
import { feedback, setHapticsEnabled } from '../src/ui/feedback';

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

const engine = [Haptics.selectionAsync, Haptics.impactAsync, Haptics.notificationAsync] as jest.Mock[];
const calls = () => engine.reduce((n, fn) => n + fn.mock.calls.length, 0);
const everything = () => {
  feedback.tap();
  feedback.miss();
  feedback.hit();
  feedback.sunk();
  feedback.incoming();
  feedback.maneuver();
};

describe('feedback', () => {
  beforeEach(() => {
    for (const fn of engine) fn.mockClear();
    setHapticsEnabled(true);
  });

  test('the Vibration switch gates every call, before it reaches the engine', () => {
    everything();
    expect(calls()).toBe(6);
    setHapticsEnabled(false);
    everything();
    expect(calls()).toBe(6);
    setHapticsEnabled(true);
    feedback.hit();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(3);
  });

  test('a pattern the device rejects never surfaces', async () => {
    (Haptics.impactAsync as jest.Mock).mockRejectedValueOnce(new Error('unsupported'));
    expect(() => feedback.miss()).not.toThrow();
    await Promise.resolve();
  });
});
