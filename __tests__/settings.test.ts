import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../src/settings';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'battleshiple:settings:v1';

describe('settings', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('defaults to following the device lamp', async () => {
    expect(await loadSettings()).toEqual({ lamp: 'auto' });
    expect(DEFAULT_SETTINGS.lamp).toBe('auto');
  });

  test('round-trips a lamp choice', async () => {
    await saveSettings({ lamp: 'night' });
    expect(await loadSettings()).toEqual({ lamp: 'night' });
  });

  test('a corrupt or unknown entry falls back to defaults and is discarded', async () => {
    await AsyncStorage.setItem(KEY, 'not json');
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);

    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 1, settings: { lamp: 'disco' } }));
    expect(await loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  test('a storage failure never reaches the caller', async () => {
    const real = AsyncStorage.getItem;
    AsyncStorage.getItem = jest.fn().mockRejectedValueOnce(new Error('io'));
    try {
      await expect(loadSettings()).resolves.toEqual(DEFAULT_SETTINGS);
    } finally {
      AsyncStorage.getItem = real;
    }
  });
});
