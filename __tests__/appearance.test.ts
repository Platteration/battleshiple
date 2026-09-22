import fs from 'fs';
import path from 'path';
import { DEFAULT_SETTINGS } from '../src/settings';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const appConfig = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'app.json'), 'utf8')).expo;

describe('appearance', () => {
  it('has one palette, so the OS is told dark and the settings have no theme row', () => {
    // src/ui/theme.ts is a single static `colors` object, consumed by
    // module-level StyleSheet.create in every screen: there is no light
    // palette to offer, and a theme row with one option would be a lie. A
    // theme row appears only with a second palette, and with it this value
    // becomes 'automatic' and the row's `system` resolves null to dark.
    expect(appConfig.userInterfaceStyle).toBe('dark');
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('theme');
    expect(Object.keys(DEFAULT_SETTINGS)).not.toContain('colorScheme');
  });
});
