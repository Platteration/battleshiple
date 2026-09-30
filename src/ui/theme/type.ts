import { TextStyle } from 'react-native';

/**
 * Three OFL families, five files:
 *
 * - Stardos Stencil (display): period stencil lettering for titles, the
 *   cartouche and stamps. The breaks in its letters make it unreadable small,
 *   so it is never used below 18pt and never on a button.
 * - Courier Prime (mono): teletype reports, coordinates and labels. Drawn to
 *   fix Courier's hairline strokes on screens; monospace keeps typed text from
 *   reflowing, and it separates I from 1, which matters for the coordinate I1.
 * - Atkinson Hyperlegible Next (body): designed by the Braille Institute for
 *   low vision. It disambiguates 1/l/I and 0/O at small sizes.
 *
 * Each weight is its own family name, because Android does not reliably
 * synthesise `fontWeight` on a custom font. `fontWeight` is only applied while
 * the fonts are still loading and the system font stands in.
 */
export const FONT_FILES = {
  'Stencil-Bold': 'StardosStencil_700Bold',
  'Mono-Regular': 'CourierPrime_400Regular',
  'Mono-Bold': 'CourierPrime_700Bold',
  'Body-Regular': 'AtkinsonHyperlegibleNext_400Regular',
  'Body-SemiBold': 'AtkinsonHyperlegibleNext_600SemiBold',
} as const;

type FamilyKey = keyof typeof FONT_FILES;

export interface TypeScale {
  display: TextStyle;
  title: TextStyle;
  heading: TextStyle;
  body: TextStyle;
  action: TextStyle;
  teletype: TextStyle;
  label: TextStyle;
  caption: TextStyle;
  /** Board coordinates: size is set per board from the cell size. */
  coord: TextStyle;
  /** Stamps and the cartouche: sized where used. */
  stamp: TextStyle;
}

function face(family: FamilyKey, fallbackWeight: TextStyle['fontWeight'], ready: boolean): TextStyle {
  return ready ? { fontFamily: family } : { fontWeight: fallbackWeight };
}

export function typeScale(fontsReady: boolean): TypeScale {
  const stencil = face('Stencil-Bold', '900', fontsReady);
  const mono = face('Mono-Regular', '400', fontsReady);
  const monoBold = face('Mono-Bold', '700', fontsReady);
  const body = face('Body-Regular', '400', fontsReady);
  const bodySemi = face('Body-SemiBold', '700', fontsReady);
  return {
    display: { ...stencil, fontSize: 34, lineHeight: 40, letterSpacing: 3 },
    title: { ...stencil, fontSize: 22, lineHeight: 28, letterSpacing: 1 },
    heading: { ...bodySemi, fontSize: 17, lineHeight: 22 },
    body: { ...body, fontSize: 15, lineHeight: 21 },
    action: { ...bodySemi, fontSize: 16, lineHeight: 20 },
    // Uppercase comes from style, never from the string: tests and screen
    // readers see normal case, and VoiceOver does not spell out capitals.
    teletype: { ...mono, fontSize: 14, lineHeight: 19, textTransform: 'uppercase' },
    label: { ...monoBold, fontSize: 12, lineHeight: 16, letterSpacing: 1, textTransform: 'uppercase' },
    caption: { ...body, fontSize: 13, lineHeight: 18 },
    coord: { ...monoBold },
    stamp: { ...stencil, textTransform: 'uppercase', letterSpacing: 2 },
  };
}
