import { Palette } from './tokens';

/**
 * The plotting room by day: an admiralty-style chart under ordinary light.
 *
 * Every pairing the UI relies on is checked in __tests__/theme.test.ts
 * against WCAG (4.5:1 for text, 3:1 for marks and lines), so a colour change
 * that looks fine on one screen cannot quietly break legibility on another.
 */
export const day: Palette = {
  name: 'day',
  statusBar: 'dark',
  surface: {
    base: '#EFE6D2', // chart paper
    raised: '#F7F2E6', // index card
    border: '#C9BC9C',
    scrim: 'rgba(27, 42, 65, 0.45)',
  },
  ink: {
    primary: '#1B2A41', // navy ink, 11.6:1 on paper
    secondary: '#4A5568',
    onAccent: '#EFE6D2',
  },
  accent: {
    fill: '#1B2A41',
    // Grease-pencil red darkened for text: #B83A2E is only 4.59:1 on paper.
    text: '#A8322A',
  },
  signal: {
    danger: '#A8322A',
    success: '#2F6B4F',
  },
  board: {
    water: '#E3E6DA',
    grid: '#857D69',
    label: '#4A5568',
    sectorLine: '#1B2A41',
    sectorLabel: '#6E6A62',
  },
  pencil: {
    hit: '#B83A2E', // marks only need 3:1
    miss: '#2E3A4E',
    aged: '#6E6A62', // graphite: old marks change colour, never opacity
    target: '#A8322A',
    hitHalo: '#EFE6D2', // a red X on brass is 1.8:1 without this
  },
  token: {
    // Brass alone is 2.5:1 on paper, so tokens are always ink-outlined. The
    // slight per-class variation is a secondary cue; silhouettes carry identity.
    fill: {
      carrier: '#B8893B',
      battleship: '#A07A45',
      destroyer: '#B09058',
      submarine: '#8C7658',
      patrol: '#C9A25A',
    },
    stroke: '#1B2A41',
    sunk: '#8A8478',
    mark: '#1B2A41',
  },
  intel: {
    stroke: '#7A5718', // dark brass, 5.2:1 on water
    fill: 'rgba(184, 137, 59, 0.16)',
  },
  preview: {
    okFill: 'rgba(27, 42, 65, 0.16)',
    okStroke: '#1B2A41',
    badFill: 'rgba(168, 50, 42, 0.18)',
    badStroke: '#A8322A',
  },
  stamp: {
    ink: '#A8322A',
  },
  selected: '#A8322A',
  grain: {
    tint: '#1B2A41',
    opacity: 0.07,
  },
};

/**
 * The plotting room at night, lit by red lamps as real operations rooms were
 * to preserve night vision. Red-monochrome, so nothing may rely on hue: hit and
 * miss differ by shape, ship classes by silhouette.
 */
export const night: Palette = {
  name: 'night',
  statusBar: 'light',
  surface: {
    base: '#140807',
    raised: '#1C0B09',
    border: '#4A1A12',
    scrim: 'rgba(0, 0, 0, 0.6)',
  },
  ink: {
    primary: '#F2A08A',
    secondary: '#C86A52',
    onAccent: '#140807',
  },
  accent: {
    fill: '#F2A08A',
    text: '#FF7A5C',
  },
  signal: {
    danger: '#FF7A5C',
    success: '#D9954F', // no green under a red lamp
  },
  board: {
    water: '#1A0A08',
    grid: '#A84434',
    label: '#C86A52',
    sectorLine: '#C0553C',
    sectorLabel: '#AA4636',
  },
  pencil: {
    hit: '#FFD2C2',
    miss: '#C86A52',
    aged: '#B04A36',
    target: '#FF7A5C',
    hitHalo: '#140807',
  },
  token: {
    fill: {
      carrier: '#3A1510',
      battleship: '#40170F',
      destroyer: '#361310',
      submarine: '#2E100C',
      patrol: '#44190F',
    },
    stroke: '#D9954F',
    sunk: '#241008',
    mark: '#D9954F',
  },
  intel: {
    stroke: '#D9954F',
    fill: 'rgba(217, 149, 79, 0.14)',
  },
  preview: {
    okFill: 'rgba(242, 160, 138, 0.18)',
    okStroke: '#F2A08A',
    badFill: 'rgba(255, 122, 92, 0.2)',
    badStroke: '#FF7A5C',
  },
  stamp: {
    ink: '#FF7A5C',
  },
  selected: '#FF7A5C',
  grain: {
    tint: '#000000',
    opacity: 0.22,
  },
};

export const palettes = { day, night } as const;
