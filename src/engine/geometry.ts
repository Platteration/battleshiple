import { BOARD_SIZE } from './constants';
import { Coord, Heading, Quadrant } from './types';

export const HEADINGS: Heading[] = ['N', 'E', 'S', 'W'];

export const HEADING_VECTORS: Record<Heading, Coord> = {
  N: { r: -1, c: 0 },
  E: { r: 0, c: 1 },
  S: { r: 1, c: 0 },
  W: { r: 0, c: -1 },
};

export function rotateCW(h: Heading): Heading {
  return HEADINGS[(HEADINGS.indexOf(h) + 1) % 4];
}

export function rotateCCW(h: Heading): Heading {
  return HEADINGS[(HEADINGS.indexOf(h) + 3) % 4];
}

export function add(a: Coord, b: Coord, times = 1): Coord {
  return { r: a.r + b.r * times, c: a.c + b.c * times };
}

export function sameCoord(a: Coord, b: Coord): boolean {
  return a.r === b.r && a.c === b.c;
}

export function coordKey(c: Coord): string {
  return `${c.r},${c.c}`;
}

export function inBounds(c: Coord): boolean {
  return c.r >= 0 && c.c >= 0 && c.r < BOARD_SIZE && c.c < BOARD_SIZE;
}

/** Cells occupied by a ship, bow first, extending backwards from the bow. */
export function shipCells(bow: Coord, heading: Heading, length: number): Coord[] {
  const back = HEADING_VECTORS[heading];
  const cells: Coord[] = [];
  for (let i = 0; i < length; i++) {
    cells.push({ r: bow.r - back.r * i, c: bow.c - back.c * i });
  }
  return cells;
}

export function quadrantOf(c: Coord): Quadrant {
  const half = BOARD_SIZE / 2;
  const south = c.r >= half;
  const east = c.c >= half;
  if (south) return east ? 'SE' : 'SW';
  return east ? 'NE' : 'NW';
}

export const QUADRANT_NAMES: Record<Quadrant, string> = {
  NW: 'north-west',
  NE: 'north-east',
  SW: 'south-west',
  SE: 'south-east',
};

const COLS = 'ABCDEFGHIJ';

/** Human-friendly label such as "C7". */
export function coordLabel(c: Coord): string {
  return `${COLS[c.c] ?? '?'}${c.r + 1}`;
}

export function headingArrow(h: Heading): string {
  switch (h) {
    case 'N':
      return '▲';
    case 'E':
      return '▶';
    case 'S':
      return '▼';
    case 'W':
      return '◀';
  }
}
