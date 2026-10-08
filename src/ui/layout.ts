import { createContext, useContext } from 'react';
import { useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BOARD_SIZE } from '../engine';
import { spacing } from './theme/tokens';

/** Below this usable height (pt, window less safe-area insets) the game screen goes compact. */
export const COMPACT_BELOW = 700;

/**
 * Smallest cell the layout will choose. A notched 390x844 iPhone (47 + 34 pt of
 * insets) needs 24 to fit the worst turn: an incoming hit and a splash in the
 * report while the helm is up.
 */
export const MIN_CELL = 24;

/** Largest board: past this a tablet's board stops growing and the screen centres it. */
export const MAX_BOARD = 440;

/**
 * Everything on the game screen except the board, in its tallest state: the
 * manoeuvre phase with a ship selected and a preview pending. Sizing the board
 * from the tallest state keeps it the same size in every phase, so it never
 * jumps when the turn moves on. Measured, not estimated: tools/screenshots.js
 * reports the overflow of every phase, including a planted worst turn (an
 * incoming hit and a splash in the report while the helm is up), and these are
 * the largest values it found: regular 499 pt, compact 350. The
 * screen still scrolls, with the action bar pinned, if a large system font makes
 * the chrome taller than this.
 */
export const CHROME = {
  regular: 499,
  compact: 350,
} as const;

export interface GameLayout {
  /** Side of one cell, in pt. */
  cell: number;
  /** Width to hand the Board: a whole number of cells including the label column. */
  boardWidth: number;
  /** Short screens: no roster strip, one report line, no board caption, a one-row helm. */
  compact: boolean;
}

interface Size {
  width: number;
  height: number;
}
export interface Insets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/** The game screen's board size for a window. Pure, so every target phone is tested directly. */
export function gameLayout(window: Size, insets: Insets, size: number = BOARD_SIZE): GameLayout {
  const usable = window.height - insets.top - insets.bottom;
  const compact = usable < COMPACT_BELOW;
  const byWidth = window.width - insets.left - insets.right - spacing.md * 2;
  const byHeight = usable - (compact ? CHROME.compact : CHROME.regular);
  const span = Math.min(byWidth, byHeight, MAX_BOARD);
  const cell = Math.max(MIN_CELL, Math.floor(span / (size + 1)));
  return { cell, boardWidth: cell * (size + 1), compact };
}

/**
 * The height drawn over the bottom of the window outside every screen: the
 * storage note (`StorageNote`) while the store refuses to save, 0 otherwise.
 * It includes the bottom safe-area inset, which the note pads itself by.
 */
export const BottomReserve = createContext(0);

/**
 * The safe-area insets a screen lays itself out by: the device's, with the
 * bottom raised to clear whatever is drawn over the bottom of the window. Every
 * screen pads by these and the game board is sized from them, so the note
 * takes its height from the board rather than covering the action bar.
 */
export function useScreenInsets(): Insets {
  const insets = useSafeAreaInsets();
  const reserve = useContext(BottomReserve);
  return reserve > insets.bottom ? { ...insets, bottom: reserve } : insets;
}

export function useGameLayout(size: number = BOARD_SIZE): GameLayout {
  const window = useWindowDimensions();
  const insets = useScreenInsets();
  return gameLayout(window, insets, size);
}
