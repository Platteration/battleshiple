import { ShipClassId } from '../engine';

export const colors = {
  bg: '#061a2b',
  panel: '#0b2740',
  panelBorder: '#164466',
  water: '#0e3a5c',
  waterLine: '#1b5280',
  waterDeep: '#0a2e4a',
  text: '#e6f1fb',
  textDim: '#8fb3d1',
  accent: '#ffd166',
  accentText: '#1a1a1a',
  danger: '#ff4d4d',
  success: '#3ddc97',
  miss: '#cfe8ff',
  hit: '#ff4d4d',
  sunk: '#3a3f47',
  selected: '#ffd166',
  previewOk: 'rgba(61, 220, 151, 0.55)',
  previewBad: 'rgba(255, 77, 77, 0.55)',
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
  sm: 6,
  md: 10,
  lg: 16,
};
