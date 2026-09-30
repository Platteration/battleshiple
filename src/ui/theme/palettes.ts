import { Palette } from './tokens';

/**
 * Exactly the colours the app shipped with before the restyle. It exists so the
 * move onto semantic tokens can be proven pixel-identical before anything is
 * allowed to change.
 */
export const legacy: Palette = {
  name: 'legacy',
  statusBar: 'light',
  surface: {
    base: '#061a2b',
    raised: '#0b2740',
    border: '#164466',
    scrim: 'rgba(0, 0, 0, 0.5)',
  },
  ink: {
    primary: '#e6f1fb',
    secondary: '#8fb3d1',
    onAccent: '#1a1a1a',
  },
  accent: {
    fill: '#ffd166',
    text: '#ffd166',
  },
  signal: {
    danger: '#ff4d4d',
    success: '#3ddc97',
  },
  board: {
    water: '#0e3a5c',
    grid: '#1b5280',
    label: '#8fb3d1',
    sectorLine: '#1b5280',
    sectorLabel: '#8fb3d1',
  },
  pencil: {
    hit: '#ff4d4d',
    miss: '#cfe8ff',
    aged: '#cfe8ff',
    target: '#ffd166',
    hitHalo: 'transparent',
  },
  token: {
    fill: {
      carrier: '#8e9aaf',
      battleship: '#b08968',
      destroyer: '#6c9a8b',
      submarine: '#7d5ba6',
      patrol: '#e0a458',
    },
    stroke: 'transparent',
    sunk: '#3a3f47',
    mark: 'rgba(0, 0, 0, 0.65)',
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
    badStroke: '#ff4d4d',
  },
  stamp: {
    ink: '#ff4d4d',
  },
  selected: '#ffd166',
  grain: {
    tint: 'transparent',
    opacity: 0,
  },
};

export const palettes = { legacy } as const;
