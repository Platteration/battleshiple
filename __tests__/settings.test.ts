import AsyncStorage from '@react-native-async-storage/async-storage';
import { AI_PROFILES } from '../src/engine';
import { AppSettings, DEFAULT_SETTINGS } from '../src/settings';
import { STORAGE_KEYS, loadJSON, saveJSON } from '../src/storage';
import { DIFFICULTIES, REDUCE_MOTION, cleanSettings } from '../src/validate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * A fallback that differs from the defaults in every field, so a test can tell
 * "fell back" from "kept" without looking at the value twice.
 */
const D: AppSettings = { haptics: false, reduceMotion: 'off', difficulty: 'hard' };

describe('cleanSettings', () => {
  test('the defaults survive themselves', () => {
    expect(cleanSettings(DEFAULT_SETTINGS, DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
    expect(cleanSettings(D, D)).toEqual(D);
  });

  test('every value of every table round-trips', () => {
    // Dropping a member from a table fails here before it fails tsc — and the
    // difficulty table is checked against the engine's own, so it cannot be
    // shortened to match a shortened test.
    expect(Object.keys(DIFFICULTIES).sort()).toEqual(Object.keys(AI_PROFILES).sort());
    for (const difficulty of Object.keys(DIFFICULTIES)) {
      expect(cleanSettings({ difficulty }, D).difficulty).toBe(difficulty);
    }
    expect(Object.keys(REDUCE_MOTION)).toEqual(['system', 'on', 'off']);
    for (const reduceMotion of Object.keys(REDUCE_MOTION)) {
      expect(cleanSettings({ reduceMotion }, D).reduceMotion).toBe(reduceMotion);
    }
    expect(cleanSettings({ haptics: true }, D).haptics).toBe(true);
    expect(cleanSettings({ haptics: false }, { ...D, haptics: true }).haptics).toBe(false);
  });

  test('a name inherited from Object.prototype is not a value', () => {
    // On a plain object `'constructor' in DIFFICULTIES` is true and
    // `DIFFICULTIES['toString']` is a function — truthy. The lookup has to be
    // an own-property one; change `has` to `value in table` and this fails on
    // `constructor`. Built with JSON.parse rather than a literal because
    // `{__proto__: ...}` as a literal sets the prototype, while parsing makes
    // an own key, which is the case a stored record presents.
    for (const name of Object.getOwnPropertyNames(Object.prototype)) {
      const record = JSON.parse(
        `{"haptics":${JSON.stringify(name)},"reduceMotion":${JSON.stringify(name)},"difficulty":${JSON.stringify(name)}}`,
      );
      expect(cleanSettings(record, D)).toEqual(D);
    }
    expect(cleanSettings({ difficulty: 'constructor' }, D).difficulty).toBe(D.difficulty);
    // An own `__proto__` key holding a whole record is just an unknown field.
    expect(cleanSettings(JSON.parse('{"__proto__":{"difficulty":"easy","haptics":true}}'), D)).toEqual(D);
    // And the crash this stands in front of: the value that reaches the engine
    // has a profile.
    expect(AI_PROFILES[cleanSettings({ difficulty: 'valueOf' }, D).difficulty]).toBeDefined();
  });

  test('a bad field falls back on its own, not the record as a whole', () => {
    expect(cleanSettings({ haptics: 'yes', reduceMotion: 'on', difficulty: 'easy' }, D)).toEqual({
      haptics: D.haptics,
      reduceMotion: 'on',
      difficulty: 'easy',
    });
    expect(cleanSettings({ haptics: true, reduceMotion: 'sometimes', difficulty: 'nightmare' }, D)).toEqual({
      ...D,
      haptics: true,
    });
    // A field of the right table but the wrong type: a number is not a key of a string table.
    expect(cleanSettings({ difficulty: 1, reduceMotion: null }, D)).toEqual(D);
  });

  test('a record that is not an object at all', () => {
    expect(cleanSettings(undefined, D)).toEqual(D);
    expect(cleanSettings(null, D)).toEqual(D);
    expect(cleanSettings(42, D)).toEqual(D);
    expect(cleanSettings('hard', D)).toEqual(D);
    expect(cleanSettings(['hard'], D)).toEqual(D);
  });

  test('unknown fields are dropped rather than carried', () => {
    const out = cleanSettings({ ...D, theme: 'light', seenIntro: true }, D);
    expect(Object.keys(out).sort()).toEqual(Object.keys(D).sort());
  });
});

describe('the settings record on disk', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  test('round-trips through its key', async () => {
    const record: AppSettings = { haptics: false, reduceMotion: 'on', difficulty: 'easy' };
    expect(await saveJSON(STORAGE_KEYS.settings, record)).toBe(true);
    expect(cleanSettings(await loadJSON(STORAGE_KEYS.settings), DEFAULT_SETTINGS)).toEqual(record);
    // ...and lands under the key the contract names, nowhere else.
    expect(await AsyncStorage.getItem('battleshiple.settings.v1')).toBe(JSON.stringify(record));
    expect(await AsyncStorage.getItem(STORAGE_KEYS.savegame)).toBeNull();
  });

  test('absent, unreadable and hostile records all become the defaults', async () => {
    expect(await loadJSON(STORAGE_KEYS.settings)).toBeUndefined();
    expect(cleanSettings(await loadJSON(STORAGE_KEYS.settings), DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);

    await AsyncStorage.setItem(STORAGE_KEYS.settings, '{not json');
    expect(await loadJSON(STORAGE_KEYS.settings)).toBeUndefined();

    await AsyncStorage.setItem(STORAGE_KEYS.settings, '{"difficulty":"__proto__","haptics":"true"}');
    expect(cleanSettings(await loadJSON(STORAGE_KEYS.settings), DEFAULT_SETTINGS)).toEqual(DEFAULT_SETTINGS);
  });

  test('a write that fails says so and never throws', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    try {
      await expect(saveJSON(STORAGE_KEYS.settings, DEFAULT_SETTINGS)).resolves.toBe(false);
    } finally {
      spy.mockRestore();
    }
    const read = jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('no store'));
    try {
      await expect(loadJSON(STORAGE_KEYS.settings)).resolves.toBeUndefined();
    } finally {
      read.mockRestore();
    }
  });
});
