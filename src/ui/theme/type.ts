import { TextStyle } from 'react-native';

/**
 * One type scale, in the platform sans-serif as VISUAL_STYLE.md requires:
 * weight, size and case establish hierarchy, not typefaces. It replaces the
 * ad-hoc 11-36pt sizes each screen used to set for itself.
 */
export interface TypeScale {
  display: TextStyle;
  title: TextStyle;
  heading: TextStyle;
  body: TextStyle;
  action: TextStyle;
  /** Incoming reports: tracked capitals so they read as signals, not prose. */
  teletype: TextStyle;
  label: TextStyle;
  caption: TextStyle;
  /** Board coordinates: size is set per board from the cell size. */
  coord: TextStyle;
  /** Stamps such as SUNK: sized where used. */
  stamp: TextStyle;
}

export const typeScale: TypeScale = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: '900', letterSpacing: 3 },
  title: { fontSize: 22, lineHeight: 28, fontWeight: '800' },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21, fontWeight: '400' },
  action: { fontSize: 16, lineHeight: 20, fontWeight: '700' },
  // Uppercase comes from style, never from the string: tests and screen
  // readers see normal case, and VoiceOver does not spell out capitals.
  teletype: { fontSize: 13, lineHeight: 18, fontWeight: '600', letterSpacing: 0.6, textTransform: 'uppercase' },
  label: { fontSize: 12, lineHeight: 16, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  caption: { fontSize: 13, lineHeight: 18, fontWeight: '400' },
  coord: { fontWeight: '700' },
  stamp: { fontWeight: '900', letterSpacing: 2, textTransform: 'uppercase' },
};
