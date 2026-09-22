import fs from 'fs';
import path from 'path';
import { DEFAULT_SETTINGS } from '../src/settings';
import { STORAGE_KEYS } from '../src/storage';
import { SETTINGS_ROWS } from '../src/ui/screens/SettingsScreen';
import { DIFFICULTIES, REDUCE_MOTION } from '../src/validate';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

/**
 * The settings contract shared with the sibling apps (CONVENTIONS.md, "User-facing
 * settings"), pinned as literals. A renamed key silently orphans every player's
 * record, which is the highest-cost drift there is, so nothing here is derived
 * from the code it checks.
 */
describe('settings contract', () => {
  it('names every storage key, as literals', () => {
    // The savegame keeps its colon form: it predates the dot scheme and a
    // rename for spelling would put every unfinished battle through a
    // migration for nothing. The exception is listed here so it stays visible.
    expect(STORAGE_KEYS).toEqual({
      savegame: 'battleshiple:savegame:v1',
      settings: 'battleshiple.settings.v1',
    });
  });

  it('stores exactly these fields, with these defaults', () => {
    expect(DEFAULT_SETTINGS).toEqual({ haptics: true, reduceMotion: 'system', difficulty: 'normal' });
    expect(Object.keys(DEFAULT_SETTINGS)).toEqual(['haptics', 'reduceMotion', 'difficulty']);
  });

  it('shows these rows, in this order', () => {
    // No Sound (the app makes none), no Theme (one palette — appearance.test.ts),
    // no onboarding (no first-run flag). Computer skill stays on the menu.
    expect(SETTINGS_ROWS).toEqual(['Vibration', 'Reduce motion', 'Reset to defaults', 'About']);
  });

  it('accepts exactly these enum values', () => {
    expect(Object.keys(REDUCE_MOTION)).toEqual(['system', 'on', 'off']);
    expect(Object.keys(DIFFICULTIES)).toEqual(['easy', 'normal', 'hard']);
  });

  it('shows the version app.json carries, and package.json agrees with it', () => {
    const root = path.join(__dirname, '..');
    const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
    const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
    expect(app.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(pkg.version).toBe(app.version);
    // expo-constants is what reads it back at runtime, and has to be a direct
    // dependency: nested under expo/node_modules it resolves only by accident.
    expect(pkg.dependencies['expo-constants']).toBeDefined();
  });
});
