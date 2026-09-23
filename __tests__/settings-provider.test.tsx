import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect } from 'react';
import { Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { AppSettings, SettingsContextValue, SettingsProvider, useSettings } from '../src/settings';
import { STORAGE_KEYS } from '../src/storage';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/** A record that differs from the defaults in every field, so a merge in the wrong order shows. */
const STORED: AppSettings = { haptics: false, reduceMotion: 'off', difficulty: 'hard' };
const KEY = STORAGE_KEYS.settings;

let api: SettingsContextValue;
/** Hands the context out through a prop from an effect, so nothing outside a component is written during render. */
function Probe({ onValue }: { onValue: (value: SettingsContextValue) => void }) {
  const value = useSettings();
  useEffect(() => onValue(value), [value, onValue]);
  return <Text>{JSON.stringify(value.settings)}</Text>;
}
const capture = (value: SettingsContextValue) => {
  api = value;
};

/**
 * The provider's two claims: a change made before the stored record has come
 * back is merged UNDER it, and nothing is written until then. Both need a read
 * that has not completed yet, which the in-memory store never gives, so the
 * read is held open here and released by hand.
 */
describe('SettingsProvider with the read still open', () => {
  let renderer: ReactTestRenderer;
  let release: (raw: string | null) => void;
  // The store is already a jest.fn, so its implementation is swapped and put
  // back by hand: a spy's mockRestore would strip it for good.
  const getItem = AsyncStorage.getItem as jest.Mock;
  const setItem = AsyncStorage.setItem as jest.Mock;
  const original = getItem.getMockImplementation()!;

  const writes = () => setItem.mock.calls.map(([key, raw]) => ({ key, record: JSON.parse(raw as string) }));

  async function settle() {
    await act(async () => {
      for (let i = 0; i < 5; i++) await Promise.resolve();
    });
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    getItem.mockImplementation(
      () =>
        new Promise<string | null>((resolve) => {
          release = resolve;
        }),
    );
    setItem.mockClear();
    await act(async () => {
      renderer = create(
        <SettingsProvider>
          <Probe onValue={capture} />
        </SettingsProvider>,
      );
    });
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
    getItem.mockImplementation(original);
  });

  test('a change that beats the read is merged under the stored record, and nothing is written before then', async () => {
    expect(api.loaded).toBe(false);
    act(() => api.update({ difficulty: 'easy' }));
    // On screen at once, on disk not yet: a write now would carry defaults
    // for the fields the player never touched.
    expect(api.settings.difficulty).toBe('easy');
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      release(JSON.stringify(STORED));
    });
    await settle();

    expect(api.loaded).toBe(true);
    expect(api.settings).toEqual({ ...STORED, difficulty: 'easy' });
    expect(writes()).toEqual([{ key: KEY, record: { ...STORED, difficulty: 'easy' } }]);

    // From here every change is written as it is made.
    act(() => api.update({ haptics: true }));
    expect(writes()).toHaveLength(2);
    expect(writes()[1]!.record).toEqual({ ...STORED, difficulty: 'easy', haptics: true });
  });

  test('two changes outside an event, with the read completing before React renders, still write once', async () => {
    // A timer or a promise continuation calls `update` outside React's event
    // batching, so its render is deferred. Deciding whether to write inside
    // the state updater then ran at that render, after the read had already
    // merged and written — and wrote a record built from the defaults over
    // it. The decision is made when `update` is called.
    const env = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
    const wasAct = env.IS_REACT_ACT_ENVIRONMENT;
    env.IS_REACT_ACT_ENVIRONMENT = false;
    try {
      api.update({ difficulty: 'easy' });
      api.update({ reduceMotion: 'on' });
    } finally {
      env.IS_REACT_ACT_ENVIRONMENT = wasAct;
    }
    expect(setItem).not.toHaveBeenCalled();

    await act(async () => {
      release(JSON.stringify(STORED));
    });
    await settle();

    const expected = { haptics: false, reduceMotion: 'on', difficulty: 'easy' };
    expect(writes()).toEqual([{ key: KEY, record: expected }]);
    expect(api.settings).toEqual(expected);
    // ...and the disk agrees with the screen, which is the point. (Read through
    // the store's own implementation: the provider's held read is still open.)
    expect(JSON.parse((await original(KEY)) ?? 'null')).toEqual(expected);
  });

  test('a read that comes back empty still honours the early change, once', async () => {
    act(() => api.update({ haptics: false }));
    await act(async () => {
      release(null);
    });
    await settle();
    expect(api.settings).toEqual({ haptics: false, reduceMotion: 'system', difficulty: 'normal' });
    expect(writes()).toEqual([{ key: KEY, record: api.settings }]);
  });

  test('with nothing changed early, the read writes nothing', async () => {
    await act(async () => {
      release(JSON.stringify(STORED));
    });
    await settle();
    expect(api.settings).toEqual(STORED);
    expect(setItem).not.toHaveBeenCalled();
  });
});
