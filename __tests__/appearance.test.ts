import fs from 'fs';
import path from 'path';
import { DEFAULT_SETTINGS } from '../src/settings';
import { dark, light, palettes, resolveTheme } from '../src/ui/theme';
import { SETTINGS_ROWS } from '../src/ui/screens/SettingsScreen';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;

describe('appearance', () => {
  it('has two palettes, so the OS follows the device and the settings have a theme row', () => {
    // This test used to pin one palette: `userInterfaceStyle: "dark"` and no
    // theme row, noting that a second palette would make the value
    // 'automatic' and bring a row whose `system` resolves null to dark. The
    // tabletop style brought that second palette (warm ivory beside deep ink),
    // so this pins exactly that.
    expect(Object.keys(palettes).sort()).toEqual(['dark', 'light']);
    expect(palettes.light).toBe(light);
    expect(palettes.dark).toBe(dark);
    expect(appConfig.userInterfaceStyle).toBe('automatic');
    expect(Object.keys(DEFAULT_SETTINGS)).toContain('theme');
    expect(DEFAULT_SETTINGS.theme).toBe('system');
    expect(SETTINGS_ROWS).toContain('Theme');
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('colorScheme');
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('appearance');
  });

  it('resolves system with no reported scheme to dark', () => {
    expect(resolveTheme('system', null)).toBe('dark');
    expect(resolveTheme('system', 'light')).toBe('light');
  });

  it('boots on the paper of each palette', () => {
    // The splash shows before any JavaScript runs: ivory on a light device,
    // the dark palette's deep ink on a dark one. The root background is one
    // colour for both, the light paper.
    expect(appConfig.backgroundColor).toBe(light.surface.base);
    const splash = appConfig.plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-splash-screen')[1];
    expect(splash.backgroundColor).toBe(light.surface.base);
    expect(splash.dark.backgroundColor).toBe(dark.surface.base);
  });
});
