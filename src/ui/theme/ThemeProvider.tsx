import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { palettes } from './palettes';
import { Palette, PaletteName, radius, spacing } from './tokens';
import { TypeScale, typeScale } from './type';

/** The player's Theme setting. `system` follows the device. */
export type ThemeSetting = 'system' | 'light' | 'dark';

export interface Theme {
  name: PaletteName;
  palette: Palette;
  type: TypeScale;
  spacing: typeof spacing;
  radius: typeof radius;
}

/**
 * One frozen Theme per palette. Memoised styles key on the object's identity,
 * so this must never mint a fresh object for the same palette.
 */
const THEMES = new Map<PaletteName, Theme>();
export function getTheme(name: PaletteName): Theme {
  const existing = THEMES.get(name);
  if (existing) return existing;
  const theme = Object.freeze({ name, palette: palettes[name], type: typeScale, spacing, radius });
  THEMES.set(name, theme);
  return theme;
}

/**
 * The palette a setting draws. `system` follows the device, and a device that
 * reports no scheme (`null`) gets dark, as CONVENTIONS.md decides for every
 * app: `system === 'light' ? 'light' : 'dark'`.
 */
export function resolveTheme(setting: ThemeSetting, system: string | null | undefined): PaletteName {
  if (setting === 'light' || setting === 'dark') return setting;
  return system === 'light' ? 'light' : 'dark';
}

const ThemeContext = createContext<Theme>(getTheme('dark'));

interface Props {
  theme?: ThemeSetting;
  children: React.ReactNode;
}

export function ThemeProvider({ theme: setting = 'system', children }: Props) {
  const system = useColorScheme();
  const theme = useMemo(() => getTheme(resolveTheme(setting, system)), [setting, system]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Theme-aware StyleSheet. The factory runs once per theme and is cached on the
 * theme object's identity, so switching appearance restyles the app while a
 * re-render costs a WeakMap lookup.
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(factory: (t: Theme) => T): () => T {
  const cache = new WeakMap<Theme, T>();
  return function useStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme);
    if (!styles) {
      styles = StyleSheet.create(factory(theme));
      cache.set(theme, styles);
    }
    return styles;
  };
}
