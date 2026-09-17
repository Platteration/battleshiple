import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { makeShip } from '../src/engine/ships';
import { emptyGrid, paintShips } from '../src/ui/boardView';
import { Board } from '../src/ui/components/Board';
import { colors, shipColors } from '../src/ui/theme';

const SIDES = ['borderTopColor', 'borderLeftColor', 'borderRightColor', 'borderBottomColor'] as const;

/** The hull view drawn inside the cell with the given label ("A1"). */
function hullStyle(root: ReactTestInstance, label: string) {
  const cell = root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  const hull = cell.find(
    (n) => String(n.type) === 'View' && StyleSheet.flatten(n.props.style)?.backgroundColor === shipColors.patrol,
  );
  return StyleSheet.flatten(hull.props.style);
}

/**
 * The restyle gave every hull per-side bevel colours. React Native resolves
 * `borderTopColor` and friends ahead of `borderColor`, so a selection style
 * that only sets `borderColor` is silently beaten by the bevel and tapping a
 * ship to manoeuvre showed no ring at all.
 */
describe('Board selection ring', () => {
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
      renderer = create(<Board grid={grid} width={330} />);
    });
  }

  test('a selected ship is ringed in the selection colour on every side', () => {
    render(true);
    const style = hullStyle(renderer.root, 'B9');
    for (const side of SIDES) expect(style[side]).toBe(colors.selected);
    expect(style.borderWidth).toBe(2);
    expect(style.borderBottomWidth).toBe(2);
  });

  test('an unselected ship keeps its bevel and no side is the selection colour', () => {
    render(false);
    const style = hullStyle(renderer.root, 'B9');
    for (const side of SIDES) expect(style[side]).not.toBe(colors.selected);
    expect(style.borderTopColor).toBe('rgba(255,255,255,0.5)');
    expect(style.borderBottomColor).toBe('rgba(0,0,0,0.45)');
    expect(style.borderBottomWidth).toBe(3);
  });
});
