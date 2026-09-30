import { ShipClassId } from '../../engine';

export type PaletteName = 'day' | 'night';

/**
 * Semantic colour roles. Components ask for a role ("the ink for secondary
 * text"), never a hex, so a palette can change the whole look — including the
 * red-lamp night palette — without touching a component.
 */
export interface Palette {
  name: PaletteName;
  /** Status-bar content style that reads on `surface.base`. */
  statusBar: 'light' | 'dark';
  surface: {
    /** Page ground. */
    base: string;
    /** Cards, panels, the helm. */
    raised: string;
    border: string;
    /** Behind a sheet or modal. */
    scrim: string;
  };
  ink: {
    primary: string;
    secondary: string;
    /** Text drawn on an `accent.fill` surface. */
    onAccent: string;
  };
  accent: {
    /** Primary action fill, selection. */
    fill: string;
    /** Accent-coloured text on `surface.base` (titles, the player's name). */
    text: string;
  };
  signal: {
    danger: string;
    success: string;
  };
  board: {
    water: string;
    grid: string;
    /** Row and column coordinates. */
    label: string;
    /** The heavier lines dividing the four quadrants the splash refers to. */
    sectorLine: string;
    sectorLabel: string;
  };
  pencil: {
    hit: string;
    miss: string;
    /** Old marks fade to this colour, never to transparency. */
    aged: string;
    target: string;
    /** Drawn under a hit mark so it stays legible on a token. */
    hitHalo: string;
  };
  token: {
    fill: Record<ShipClassId, string>;
    stroke: string;
    sunk: string;
    /** Details drawn on a token: bow marker, turrets. */
    mark: string;
  };
  /** The splash, drawn as a contact report over a quadrant. */
  intel: {
    stroke: string;
    fill: string;
  };
  preview: {
    okFill: string;
    okStroke: string;
    badFill: string;
    badStroke: string;
  };
  stamp: {
    ink: string;
  };
  selected: string;
  grain: {
    tint: string;
    opacity: number;
  };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;
