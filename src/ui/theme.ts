import { ShipClassId } from '../engine';

export const colors = {
  bg: '#19232d',
  panel: '#24323e',
  panelBorder: '#526674',
  water: '#315563',
  waterLine: '#577883',
  waterDeep: '#294651',
  text: '#f7f1e5',
  textDim: '#b7c2c7',
  accent: '#e8bd70',
  accentText: '#1a1a1a',
  danger: '#ef9290',
  success: '#93c6a1',
  miss: '#cfe8ff',
  hit: '#ef9290',
  sunk: '#3a3f47',
  selected: '#e8bd70',
  // Cyan, not green: green collided with the Destroyer's hull colour, so a
  // manoeuvre preview was easy to read as another ship. Splashes never render
  // on the fleet board, so cyan is unambiguous there.
  previewOk: 'rgba(155, 224, 255, 0.50)',
  previewOkBorder: '#9be0ff',
  previewBad: 'rgba(255, 77, 77, 0.50)',
  previewBadBorder: '#ef9290',
  splash: '#9be0ff',
};

export const shipColors: Record<ShipClassId, string> = {
  carrier: '#8e9aaf',
  battleship: '#b08968',
  destroyer: '#6c9a8b',
  submarine: '#7d5ba6',
  patrol: '#e0a458',
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
};

export const radius = {
  sm: 8,
  md: 12,
  lg: 16,
};
