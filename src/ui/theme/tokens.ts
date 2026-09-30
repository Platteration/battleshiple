import { ShipClassId } from '../../engine';

export type PaletteName = 'light' | 'dark';

/**
 * Semantic colour roles. Components ask for a role ("the ink for secondary
 * text"), never a hex, so light and dark — and anything later — change the
 * whole look without touching a component.
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
    /** The crisp outline that separates a piece from the board. */
    stroke: string;
    sunk: string;
    /** Details drawn on a hull, per class so each clears 3:1 on its own fill. */
    mark: Record<ShipClassId, string>;
  };
  /**
   * Shallow tabletop depth (VISUAL_STYLE.md): one small upper-left highlight
   * and one short lower edge. Translucent, so it reads on any fill.
   */
  depth: {
    highlight: string;
    highlightSoft: string;
    shade: string;
    edge: string;
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
  /**
   * An on/off switch. Both tracks clear 3:1 against the card they sit on, and
   * the thumb clears 3:1 against either track, so the state reads by position.
   */
  control: { trackOn: string; trackOff: string; thumb: string };
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

/** VISUAL_STYLE.md: 8 / 12 / 16 point corner radii. */
export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;
