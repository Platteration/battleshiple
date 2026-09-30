import React, { createContext, useContext, useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { palettes } from './palettes';
import { Palette, PaletteName, radius, spacing } from './tokens';

export interface Theme {
  name: PaletteName;
  palette: Palette;
  spacing: typeof spacing;
  radius: typeof radius;
}

function themeFor(palette: Palette): Theme {
  return { name: palette.name, palette, spacing, radius };
}

/** One frozen Theme object per palette, so memoised styles can key on identity. */
const THEMES: Partial<Record<PaletteName, Theme>> = {};
export function getTheme(name: PaletteName): Theme {
  const existing = THEMES[name];
  if (existing) return existing;
  const palette = (palettes as Partial<Record<PaletteName, Palette>>)[name] ?? palettes.legacy;
  const theme = Object.freeze(themeFor(palette));
  THEMES[name] = theme;
  return theme;
}

const ThemeContext = createContext<Theme>(getTheme('legacy'));

interface Props {
  palette?: PaletteName;
  children: React.ReactNode;
}

export function ThemeProvider({ palette = 'legacy', children }: Props) {
  const theme = useMemo(() => getTheme(palette), [palette]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * Theme-aware StyleSheet. The factory runs once per theme and is cached on the
 * theme object's identity, so switching the lamp restyles the app while a
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
