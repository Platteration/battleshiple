import { AtkinsonHyperlegibleNext_400Regular } from '@expo-google-fonts/atkinson-hyperlegible-next/400Regular';
import { AtkinsonHyperlegibleNext_600SemiBold } from '@expo-google-fonts/atkinson-hyperlegible-next/600SemiBold';
import { CourierPrime_400Regular } from '@expo-google-fonts/courier-prime/400Regular';
import { CourierPrime_700Bold } from '@expo-google-fonts/courier-prime/700Bold';
import { StardosStencil_700Bold } from '@expo-google-fonts/stardos-stencil/700Bold';
import { useFonts } from 'expo-font';
import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { StyleSheet, useColorScheme } from 'react-native';
import { palettes } from './palettes';
import { Palette, PaletteName, radius, spacing } from './tokens';
import { TypeScale, typeScale } from './type';

/** The player's choice of plotting-room lighting. `auto` follows the device. */
export type Lamp = 'auto' | 'day' | 'night';

export interface Theme {
  name: PaletteName;
  palette: Palette;
  type: TypeScale;
  spacing: typeof spacing;
  radius: typeof radius;
  fontsReady: boolean;
}

/**
 * One frozen Theme per (palette, fonts loaded). Memoised styles key on the
 * object's identity, so this must never mint a fresh object for the same pair.
 */
const THEMES = new Map<string, Theme>();
export function getTheme(name: PaletteName, fontsReady = false): Theme {
  const key = `${name}:${fontsReady}`;
  const existing = THEMES.get(key);
  if (existing) return existing;
  const theme = Object.freeze({
    name,
    palette: palettes[name],
    type: typeScale(fontsReady),
    spacing,
    radius,
    fontsReady,
  });
  THEMES.set(key, theme);
  return theme;
}

export function resolveLamp(lamp: Lamp, system: string | null | undefined): PaletteName {
  if (lamp === 'day' || lamp === 'night') return lamp;
  return system === 'dark' ? 'night' : 'day';
}

const ThemeContext = createContext<Theme>(getTheme('day'));

/** How long to wait for fonts before drawing with the system font anyway. */
const FONT_TIMEOUT_MS = 1500;

interface Props {
  lamp?: Lamp;
  children: React.ReactNode;
}

export function ThemeProvider({ lamp = 'auto', children }: Props) {
  const system = useColorScheme();
  const [loaded, error] = useFonts({
    'Stencil-Bold': StardosStencil_700Bold,
    'Mono-Regular': CourierPrime_400Regular,
    'Mono-Bold': CourierPrime_700Bold,
    'Body-Regular': AtkinsonHyperlegibleNext_400Regular,
    'Body-SemiBold': AtkinsonHyperlegibleNext_600SemiBold,
  });
  // Rendering never waits on fonts: the system font stands in until they load,
  // and a failure to load simply leaves it there.
  const fontsReady = loaded && !error;

  const theme = useMemo(() => getTheme(resolveLamp(lamp, system), fontsReady), [lamp, system, fontsReady]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Theme {
  return useContext(ThemeContext);
}

/**
 * True once fonts are in or the wait has timed out: the moment the native
 * splash screen may lift without a visible font swap under the player.
 */
export function useFirstPaintReady(): boolean {
  const { fontsReady } = useTheme();
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), FONT_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, []);
  return fontsReady || timedOut;
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
