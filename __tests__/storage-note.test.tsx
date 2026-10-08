import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { saveJSON, storageRefused, STORAGE_KEYS } from '../src/storage';
import { STORAGE_REFUSED_NATIVE, STORAGE_REFUSED_WEB, StorageNoteFrame } from '../src/ui/components/StorageNote';
import { useScreenInsets } from '../src/ui/layout';
import { spacing, ThemeProvider } from '../src/ui/theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** A phone with a home indicator: 34 pt the screens already keep clear. */
const mockInsets = { top: 47, right: 0, bottom: 34, left: 0 };
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
  useSafeAreaInsets: () => mockInsets,
}));

/** What a screen inside the frame lays itself out by. */
function Probe() {
  return <Text testID="probe">{String(useScreenInsets().bottom)}</Text>;
}

const SETTINGS = STORAGE_KEYS.settings;
const real = AsyncStorage.setItem;
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('StorageNoteFrame', () => {
  let renderer: ReactTestRenderer;
  let full = false;

  beforeEach(async () => {
    full = false;
    AsyncStorage.setItem = jest.fn((key: string, value: string) =>
      full ? Promise.reject(new Error('QuotaExceededError')) : real(key, value),
    );
    await saveJSON(SETTINGS, {});
    expect(storageRefused()).toBe(false);
    act(() => {
      renderer = create(
        <ThemeProvider theme="light">
          <StorageNoteFrame>
            <Probe />
          </StorageNoteFrame>
        </ThemeProvider>,
      );
    });
  });

  afterEach(async () => {
    act(() => renderer.unmount());
    full = false;
    // Leave nothing refused for the next test: an accepted write clears it.
    await saveJSON(SETTINGS, {});
    await flush();
    AsyncStorage.setItem = real;
  });

  const note = () => renderer.root.findAll((n) => typeof n.type === 'string' && n.props.testID === 'storage-note');
  const words = (n: ReactTestInstance) => n.findAll((x) => String(x.type) === 'Text').map((x) => x.children.join('')).join('');
  const probe = () => renderer.root.find((n) => n.props.testID === 'probe' && typeof n.type !== 'string').props.children as string;

  async function write() {
    await act(async () => {
      await saveJSON(SETTINGS, { theme: 'dark' });
      await flush();
    });
  }

  test('says nothing while the store takes every write', async () => {
    await write();
    expect(note()).toHaveLength(0);
    expect(probe()).toBe('34');
  });

  test('says so while a write is refused, and goes once one gets through', async () => {
    full = true;
    await write();
    const [shown] = note();
    expect(shown).toBeDefined();
    expect(words(shown!)).toBe(STORAGE_REFUSED_NATIVE);
    // Announced when it appears, not merely drawn.
    expect(shown!.props.accessibilityRole).toBe('alert');
    // It pads itself by the inset it is drawn over.
    expect(StyleSheet.flatten(shown!.props.style).paddingBottom).toBe(mockInsets.bottom + spacing.sm);

    full = false;
    await write();
    expect(note()).toHaveLength(0);
  });

  test('its height, once laid out, is what the screens keep clear at the bottom', async () => {
    full = true;
    await write();
    // Before it has been measured the screens keep the inset they always did.
    expect(probe()).toBe('34');
    act(() => note()[0]!.props.onLayout({ nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 120 } } }));
    expect(probe()).toBe('120');

    full = false;
    await write();
    expect(probe()).toBe('34');
  });

  test('in a browser it names the browser, whose storage another site on the origin can fill', async () => {
    const os = jest.replaceProperty(Platform, 'OS', 'web');
    try {
      full = true;
      await write();
      expect(words(note()[0]!)).toBe(STORAGE_REFUSED_WEB);
    } finally {
      os.restore();
    }
  });
});
