import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { palettes } from './palettes';
import { Palette, PaletteName, radius, spacing } from './tokens';
import { TypeScale, typeScale } from './type';

/** The player's appearance choice. `auto` follows the device. */
export type Appearance = 'auto' | 'light' | 'dark';

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

export function resolveAppearance(appearance: Appearance, system: string | null | undefined): PaletteName {
  if (appearance === 'light' || appearance === 'dark') return appearance;
  return system === 'dark' ? 'dark' : 'light';
}

const ThemeContext = createContext<Theme>(getTheme('light'));

interface Props {
  appearance?: Appearance;
  children: React.ReactNode;
}

export function ThemeProvider({ appearance = 'auto', children }: Props) {
  const system = useColorScheme();
  const theme = useMemo(() => getTheme(resolveAppearance(appearance, system)), [appearance, system]);
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
