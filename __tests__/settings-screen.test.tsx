import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Alert, Linking, Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { SettingsProvider } from '../src/settings';
import { STORAGE_KEYS } from '../src/storage';
import { feedback } from '../src/ui/feedback';
import { SETTINGS_ROWS, SOURCE_URL, SettingsScreen } from '../src/ui/screens/SettingsScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// What a build embeds. Under jest nothing does, and the screen would show 0.0.0.
jest.mock('expo-constants', () => ({ __esModule: true, default: { expoConfig: { version: '1.2.3' } } }));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

function findByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const matches = root.findAll(
    (n) => String(n.type) === 'Text' && n.children.length > 0 && n.children.map((c) => String(c)).join('').includes(text),
  );
  if (matches.length === 0) throw new Error(`No text node containing "${text}"`);
  return matches[0];
}

function pressText(root: ReactTestInstance, text: string) {
  let cur: ReactTestInstance | null = findByText(root, text);
  while (cur && typeof cur.props.onPress !== 'function') cur = cur.parent;
  if (!cur) throw new Error(`Nothing pressable holds "${text}"`);
  const target = cur;
  act(() => {
    target.props.onPress();
  });
}

const stored = async () => JSON.parse((await AsyncStorage.getItem(STORAGE_KEYS.settings)) ?? 'null');

describe('SettingsScreen', () => {
  let renderer: ReactTestRenderer;
  const onBack = jest.fn();
  /** A battle on the disk, byte for byte, to prove a reset leaves it alone. */
  const SAVE = '{"version":1,"savedAt":1,"difficulty":"hard","state":{"not":"read by this screen"}}';

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    await AsyncStorage.setItem(STORAGE_KEYS.savegame, SAVE);
    onBack.mockClear();
    await act(async () => {
      renderer = create(
        <SettingsProvider>
          <SettingsScreen onBack={onBack} />
        </SettingsProvider>,
      );
    });
    await flush();
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
  });

  test('shows every row the contract lists', () => {
    for (const row of SETTINGS_ROWS) findByText(renderer.root, row);
  });

  test('the Vibration switch is stored, and stops the haptics engine being called at all', async () => {
    const toggle = renderer.root.find((n) => n.props.accessibilityLabel === 'Vibration' && typeof n.props.onValueChange === 'function');
    expect(toggle.props.value).toBe(true);
    feedback.hit();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);

    act(() => toggle.props.onValueChange(false));
    await flush();
    expect((await stored()).haptics).toBe(false);
    feedback.hit();
    feedback.miss();
    expect(Haptics.notificationAsync).toHaveBeenCalledTimes(1);
    expect(Haptics.impactAsync).not.toHaveBeenCalled();

    act(() => toggle.props.onValueChange(true));
    await flush();
    expect((await stored()).haptics).toBe(true);
  });

  test('Reduce motion is three-state and stored', async () => {
    const group = renderer.root.find((n) => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'Reduce motion');
    // A Pressable and the Views it renders all carry the props; the outermost of each option is counted once.
    const options = group.findAll((n) => n.props.accessibilityRole === 'radio' && n.parent?.props.accessibilityRole !== 'radio');
    expect(options.map((o) => o.props.accessibilityState.checked)).toEqual([true, false, false]);
    pressText(renderer.root, 'On');
    await flush();
    expect((await stored()).reduceMotion).toBe('on');
    pressText(renderer.root, 'Off');
    await flush();
    expect((await stored()).reduceMotion).toBe('off');
    expect(options.map((o) => o.props.accessibilityState.checked)).toEqual([false, false, true]);
  });

  test('Reset to defaults is confirmed, and touches the settings record only', async () => {
    pressText(renderer.root, 'Off');
    const toggle = renderer.root.find((n) => n.props.accessibilityLabel === 'Vibration' && typeof n.props.onValueChange === 'function');
    act(() => toggle.props.onValueChange(false));
    await flush();
    expect(await stored()).toEqual({ haptics: false, reduceMotion: 'off', difficulty: 'normal' });

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      pressText(renderer.root, 'Reset to defaults');
      expect(alert).toHaveBeenCalledTimes(1);
      const buttons = alert.mock.calls[0][2] as { text: string; style?: string; onPress?: () => void }[];
      expect(buttons.map((b) => [b.text, b.style])).toEqual([
        ['Cancel', 'cancel'],
        ['Reset', 'destructive'],
      ]);
      // Nothing has happened yet.
      expect(await stored()).toEqual({ haptics: false, reduceMotion: 'off', difficulty: 'normal' });
      act(() => buttons[1].onPress!());
      await flush();
    } finally {
      alert.mockRestore();
    }
    expect(await stored()).toEqual({ haptics: true, reduceMotion: 'system', difficulty: 'normal' });
    expect(toggle.props.value).toBe(true);
    // The battle was never at stake.
    expect(await AsyncStorage.getItem(STORAGE_KEYS.savegame)).toBe(SAVE);
  });

  test('About says what it is, which version, under which licence, and that nothing leaves the device', () => {
    const root = renderer.root;
    findByText(root, 'Battleshiple 1.2.3');
    findByText(root, 'fleets move');
    findByText(root, 'Nothing leaves your device.');
    const link = findByText(root, 'MIT licence');
    expect(link.props.accessibilityRole).toBe('link');
    act(() => link.props.onPress());
    expect(Linking.openURL).toHaveBeenCalledWith(SOURCE_URL);
    expect(SOURCE_URL).toMatch(/^https:\/\/github\.com\//);
  });

  test('Back to menu goes back', () => {
    pressText(renderer.root, 'Back to menu');
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test('accessibility floor: every pressable has a role, and the switch carries its label', () => {
    const pressables = renderer.root.findAll((n) => typeof n.props.onPress === 'function' && typeof n.type !== 'string');
    expect(pressables.length).toBeGreaterThan(3);
    for (const p of pressables) {
      // A Text link and the shared Button/Segmented all carry one; a host
      // node inherits its composite's props, so composites are what is checked.
      expect(p.props.accessibilityRole ?? p.findAll((n) => !!n.props.accessibilityRole)[0]?.props.accessibilityRole).toBeDefined();
    }
    const toggle = renderer.root.find((n) => typeof n.props.onValueChange === 'function' && n.type !== Text);
    expect(toggle.props.accessibilityLabel).toBe('Vibration');
  });
});
