import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { makeShip } from '../src/engine/ships';
import { emptyGrid, hullsOf, paintShips } from '../src/ui/boardView';
import { Board } from '../src/ui/components/Board';
import { dark, light, Palette, ThemeProvider } from '../src/ui/theme';

// The board draws the splash overlay, which reads the Reduce motion setting.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const SIDES = ['borderTopColor', 'borderLeftColor', 'borderRightColor', 'borderBottomColor'] as const;

/**
 * The patrol boat's hull, in the fill colour. Hulls used to be drawn a tile per
 * cell and were found inside the cell labelled B9; they are now one silhouette
 * in the layer beneath the cells, found by its test id and checked for the
 * same fill before any style is read.
 */
function hullStyle(root: ReactTestInstance, palette: Palette) {
  const hull = root.find((n) => n.props.testID === 'hull-patrol' && String(n.type) === 'View');
  const style = StyleSheet.flatten(hull.props.style);
  expect(style.backgroundColor).toBe(palette.token.fill.patrol);
  return style;
}

/**
 * The restyle gave every hull per-side bevel colours. React Native resolves
 * `borderTopColor` and friends ahead of `borderColor`, so a selection style
 * that only sets `borderColor` is silently beaten by the bevel and tapping a
 * ship to manoeuvre showed no ring at all.
 *
 * Colours come from the palette rather than raw constants, and the check runs
 * in both appearances. The dark palette's bevel tokens are the exact values
 * this test first asserted as literals.
 */
describe.each([
  ['light', light],
  ['dark', dark],
] as const)('Board selection ring (%s)', (appearance, palette) => {
  let renderer: ReactTestRenderer;

  afterEach(() => {
    act(() => renderer.unmount());
  });

  /** A patrol boat on B9/A9, selected or not, on a board no one can press. */
  function render(selected: boolean) {
    const ship = makeShip('patrol', { r: 8, c: 1 }, 'E');
    const grid = emptyGrid();
    paintShips(grid, [ship], selected ? ship.id : undefined);
    act(() => {
      renderer = create(
        <ThemeProvider theme={appearance}>
          <Board grid={grid} hulls={hullsOf([ship], selected ? ship.id : undefined)} width={330} />
        </ThemeProvider>,
      );
    });
  }

  test('a selected ship is ringed in the selection colour on every side', () => {
    render(true);
    const style = hullStyle(renderer.root, palette);
    for (const side of SIDES) expect(style[side]).toBe(palette.selected);
    expect(style.borderWidth).toBe(2);
    expect(style.borderBottomWidth).toBe(2);
  });

  test('an unselected ship keeps its bevel and no side is the selection colour', () => {
    render(false);
    const style = hullStyle(renderer.root, palette);
    for (const side of SIDES) expect(style[side]).not.toBe(palette.selected);
    expect(style.borderTopColor).toBe(palette.depth.highlight);
    expect(style.borderBottomColor).toBe(palette.depth.edge);
    expect(style.borderBottomWidth).toBe(3);
  });
});

test('the dark bevel is exactly the one the tabletop restyle introduced', () => {
  expect(dark.depth.highlight).toBe('rgba(255,255,255,0.5)');
  expect(dark.depth.edge).toBe('rgba(0,0,0,0.45)');
});

describe.each([
  ['light', light],
  ['dark', dark],
] as const)('Board outline plate (%s)', (appearance, palette) => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  function plateColour(selected: boolean) {
    const ship = makeShip('patrol', { r: 8, c: 1 }, 'E');
    const grid = emptyGrid();
    paintShips(grid, [ship], selected ? ship.id : undefined);
    act(() => {
      renderer = create(
        <ThemeProvider theme={appearance}>
          <Board grid={grid} hulls={hullsOf([ship], selected ? ship.id : undefined)} width={330} />
        </ThemeProvider>,
      );
    });
    // The plate itself. The cell used to hold only the plate and the hull, so
    // "some view in it is the stroke colour" meant the plate; the footprint now
    // also holds deck details, and the patrol boat's is deep ink in light, the
    // same value as the stroke, so the plate is read directly.
    const plate = renderer.root.find((n) => n.props.testID === 'hull-plate-patrol' && String(n.type) === 'View');
    return StyleSheet.flatten(plate.props.style).backgroundColor;
  }

  test('an unselected hull sits on the crisp outline colour', () => {
    expect(plateColour(false)).toBe(palette.token.stroke);
  });

  test('a selected hull sits on a plate in the selection colour, framing it against the water', () => {
    const colour = plateColour(true);
    expect(colour).toBe(palette.selected);
    expect(colour).not.toBe(palette.token.stroke);
  });
});
