import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { quadrantOf } from '../src/engine/geometry';
import { emptyGrid, Grid } from '../src/ui/boardView';
import { Board, FRESH_AGE } from '../src/ui/components/Board';
import { dark, light, ThemeProvider } from '../src/ui/theme';

// The board draws the splash overlay, which reads the Reduce motion setting.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

let renderer: ReactTestRenderer;
afterEach(() => act(() => renderer.unmount()));

function render(grid: Grid, width = 330, theme: 'light' | 'dark' = 'light') {
  act(() => {
    renderer = create(
      <ThemeProvider theme={theme}>
        <Board grid={grid} width={width} onPressCell={() => {}} />
      </ThemeProvider>,
    );
  });
  return renderer.root;
}

const byTestID = (root: ReactTestInstance, id: string) => root.find((n) => n.props.testID === id && typeof n.type === 'string');
const style = (n: ReactTestInstance) => StyleSheet.flatten(n.props.style);

/** The cell Pressables: pressable, and labelled with a coordinate. */
const cells = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.props.onPress === 'function' && /^[A-Z]\d+$/.test(n.props.accessibilityLabel ?? '') && typeof n.type !== 'string');

describe.each([10, 8])('quadrant dividers on a %i-cell board', (size) => {
  test('fall on the boundary quadrantOf uses, for every cell', () => {
    const width = 330;
    const cell = Math.floor(width / (size + 1));
    const root = render(emptyGrid(size), width);
    const v = style(byTestID(root, 'divider-v'));
    const h = style(byTestID(root, 'divider-h'));
    const vx = (v.left as number) + (v.width as number) / 2;
    const hy = (h.top as number) + (h.height as number) / 2;
    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const east = (c + 0.5) * cell > vx;
        const south = (r + 0.5) * cell > hy;
        const drawn = `${south ? 'S' : 'N'}${east ? 'E' : 'W'}`;
        expect({ r, c, q: drawn }).toEqual({ r, c, q: quadrantOf({ r, c }, size) });
      }
    }
  });
});

test('a board takes its size from the grid it is given', () => {
  const root = render(emptyGrid(8));
  expect(cells(root)).toHaveLength(64);
  const texts = root.findAll((n) => String(n.type) === 'Text').map((n) => n.children.join(''));
  expect(texts.filter((t) => /^[A-Z]$/.test(t))).toEqual(['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']);
  expect(texts.filter((t) => /^\d+$/.test(t))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
});

test('the chart is drawn beneath the cells and never takes a press', () => {
  const root = render(emptyGrid());
  for (const id of ['board-water', 'board-chart', 'board-intel']) {
    expect(byTestID(root, id).props.pointerEvents).toBe('none');
  }
  // Every coordinate is still exactly one pressable cell, as pressCell requires.
  const labels = cells(root).map((n) => n.props.accessibilityLabel);
  expect(labels).toHaveLength(100);
  expect(new Set(labels).size).toBe(100);
  expect(labels.filter((l) => l === 'E5')).toHaveLength(1);
});

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('sector labels (%s)', (theme, palette) => {
  test('name the four quadrants in the measured label colour, silently to a screen reader', () => {
    const root = render(emptyGrid(), 330, theme);
    const sectors = root.findAll((n) => String(n.type) === 'Text' && /^(NW|NE|SW|SE)$/.test(n.children.join('')));
    expect(sectors.map((n) => n.children.join('')).sort()).toEqual(['NE', 'NW', 'SE', 'SW']);
    for (const n of sectors) {
      expect(style(n).color).toBe(palette.board.sectorLabel);
      expect(n.props.accessible).toBe(false);
    }
  });
});

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('shot marks age by colour, not opacity (%s)', (theme, palette) => {
  test('fresh marks keep their colour, older ones take the aged colour, and none fades', () => {
    const grid = emptyGrid();
    grid[0]![0]!.shot = { result: 'miss', age: FRESH_AGE };
    grid[0]![1]!.shot = { result: 'miss', age: FRESH_AGE + 1 };
    grid[0]![2]!.shot = { result: 'hit', age: 0 };
    grid[0]![3]!.shot = { result: 'hit', age: 9 };
    const root = render(grid, 330, theme);
    const fresh = root.findAll((n) => n.props.testID === 'mark-fresh' && typeof n.type === 'string').map(style);
    const aged = root.findAll((n) => n.props.testID === 'mark-aged' && typeof n.type === 'string').map(style);
    expect(fresh).toHaveLength(2);
    expect(aged).toHaveLength(2);
    expect(fresh.map((s) => s.backgroundColor ?? s.color).sort()).toEqual([palette.pencil.hit, palette.pencil.miss].sort());
    expect(aged.map((s) => s.backgroundColor ?? s.color)).toEqual([palette.pencil.aged, palette.pencil.aged]);
    for (const s of [...fresh, ...aged]) expect(s.opacity ?? 1).toBe(1);
  });
});
