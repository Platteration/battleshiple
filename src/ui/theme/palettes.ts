import { Palette } from './tokens';

/**
 * Both palettes follow VISUAL_STYLE.md: warm ivory or deep ink behind opaque
 * paper and panel surfaces, with muted sea-glass and amber accents.
 *
 * Every pairing the UI relies on is checked in __tests__/theme.test.ts against
 * WCAG — 4.5:1 for text, 3:1 for marks, lines and outlines — and game pieces
 * must be distinguishable from the board they sit on (AGENTS.md section 6).
 */

const SHIP_FILLS = {
  carrier: '#8e9aaf',
  battleship: '#b08968',
  destroyer: '#6c9a8b',
  submarine: '#7d5ba6',
  patrol: '#e0a458',
};

/**
 * Details on a hull: deep ink reads on every fill except the submarine's
 * purple (2.97:1), where ivory does (4.76:1).
 */
const SHIP_MARKS = {
  carrier: '#19232d',
  battleship: '#19232d',
  destroyer: '#19232d',
  submarine: '#f7f1e5',
  patrol: '#19232d',
};

/**
 * Dark: the shared tabletop palette as applied to this repository in PR #1,
 * with each role kept. Where a pairing measured below the floor, only that
 * pairing moved:
 * - grid #577883 -> #86a6ab: 1.69:1 on the water, now 3.09:1;
 * - hull fills measured 1.50-2.83:1 on the water, so pieces gained a crisp
 *   ivory outline (7.15:1) instead of new fills;
 * - the hit mark measured 1.05-2.34:1 on the hulls, so it sits on a deep-ink
 *   halo (6.96:1).
 */
export const dark: Palette = {
  name: 'dark',
  statusBar: 'light',
  surface: {
    base: '#19232d',
    raised: '#24323e',
    border: '#526674',
    scrim: 'rgba(0, 0, 0, 0.5)',
  },
  ink: {
    primary: '#f7f1e5',
    secondary: '#b7c2c7',
    onAccent: '#1a1a1a',
  },
  accent: {
    fill: '#e8bd70',
    text: '#e8bd70',
  },
  signal: {
    danger: '#ef9290',
    success: '#93c6a1',
  },
  board: {
    water: '#315563',
    grid: '#86a6ab',
    label: '#b7c2c7',
    sectorLine: '#b7c2c7',
    sectorLabel: '#b7c2c7',
  },
  pencil: {
    hit: '#ef9290',
    miss: '#cfe8ff',
    aged: '#9fb0b4',
    target: '#e8bd70',
    hitHalo: '#19232d',
  },
  token: {
    fill: SHIP_FILLS,
    stroke: '#f7f1e5',
    sunk: '#3a3f47',
    mark: SHIP_MARKS,
  },
  depth: {
    highlight: 'rgba(255,255,255,0.5)',
    highlightSoft: 'rgba(255,255,255,0.3)',
    shade: 'rgba(0,0,0,0.3)',
    edge: 'rgba(0,0,0,0.45)',
  },
  intel: {
    stroke: '#9be0ff',
    fill: 'rgba(155, 224, 255, 0.12)',
  },
  preview: {
    // Cyan, not green: green collided with the Destroyer's hull colour, so a
    // manoeuvre preview was easy to read as another ship.
    okFill: 'rgba(155, 224, 255, 0.50)',
    okStroke: '#9be0ff',
    badFill: 'rgba(255, 77, 77, 0.50)',
    badStroke: '#ef9290',
  },
  stamp: {
    ink: '#ef9290',
  },
  selected: '#e8bd70',
};

/**
 * Light: new. Warm ivory ground (the guide's #f5f0e6) with deep ink as text,
 * a pale sea-glass sea, and amber for selection — darkened where it must read
 * as a line or text on the light ground.
 */
export const light: Palette = {
  name: 'light',
  statusBar: 'dark',
  surface: {
    base: '#f5f0e6',
    raised: '#fffcf5',
    border: '#cbbfa8',
    scrim: 'rgba(25, 35, 45, 0.4)',
  },
  ink: {
    primary: '#19232d',
    secondary: '#4d5b66',
    onAccent: '#19232d',
  },
  accent: {
    fill: '#e8bd70',
    text: '#8a5a10',
  },
  signal: {
    danger: '#a8413a',
    success: '#2f6b4f',
  },
  board: {
    water: '#d7e6e2',
    grid: '#64818a',
    label: '#4d5b66',
    sectorLine: '#19232d',
    sectorLabel: '#4d5b66',
  },
  pencil: {
    hit: '#b23f37',
    miss: '#19232d',
    aged: '#6b7780',
    target: '#8a5a10',
    hitHalo: '#f5f0e6',
  },
  token: {
    fill: SHIP_FILLS,
    stroke: '#19232d',
    sunk: '#8a8f96',
    mark: SHIP_MARKS,
  },
  depth: {
    highlight: 'rgba(255,255,255,0.6)',
    highlightSoft: 'rgba(255,255,255,0.35)',
    shade: 'rgba(0,0,0,0.18)',
    edge: 'rgba(0,0,0,0.3)',
  },
  intel: {
    stroke: '#1f6468',
    fill: 'rgba(31, 100, 104, 0.12)',
  },
  preview: {
    okFill: 'rgba(25, 35, 45, 0.14)',
    okStroke: '#19232d',
    badFill: 'rgba(168, 65, 58, 0.18)',
    badStroke: '#a8413a',
  },
  stamp: {
    ink: '#a8413a',
  },
  selected: '#8a5a10',
};

export const palettes = { light, dark } as const;
