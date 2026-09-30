import React from 'react';
import { StyleSheet } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { createGame, endTurn, fire } from '../src/engine/game';
import { cellsOf, makeShip } from '../src/engine/ships';
import { Heading, Ship } from '../src/engine/types';
import { toPlayerView } from '../src/engine/view';
import { emptyGrid, fleetHulls, hullOf, trackingHulls } from '../src/ui/boardView';
import { Board } from '../src/ui/components/Board';
import { DETAILS } from '../src/ui/components/Hull';
import { ThemeProvider } from '../src/ui/theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('hullOf', () => {
  // A destroyer with its bow at D5 (r 4, c 3), pointing each way.
  test.each([
    ['E', { r: 4, c: 1, horizontal: true, bowAt: 'end' }],
    ['W', { r: 4, c: 3, horizontal: true, bowAt: 'start' }],
    ['N', { r: 4, c: 3, horizontal: false, bowAt: 'start' }],
    ['S', { r: 2, c: 3, horizontal: false, bowAt: 'end' }],
  ] as const)('heading %s', (heading, expected) => {
    const ship = makeShip('destroyer', { r: 4, c: 3 }, heading as Heading);
    const h = hullOf(ship);
    expect({ r: h.r, c: h.c, horizontal: h.horizontal, bowAt: h.bowAt }).toEqual(expected);
    // The footprint is exactly the ship's cells.
    const cells = cellsOf(ship).map(({ r, c }) => `${r},${c}`).sort();
    const drawn = Array.from({ length: 3 }, (_, i) => (h.horizontal ? `${h.r},${h.c + i}` : `${h.r + i},${h.c}`)).sort();
    expect(drawn).toEqual(cells);
    // ...and the bow end is the cell the bow is on.
    const bowCell = h.bowAt === 'start' ? `${h.r},${h.c}` : h.horizontal ? `${h.r},${h.c + 2}` : `${h.r + 2},${h.c}`;
    expect(bowCell).toBe(`${ship.bow.r},${ship.bow.c}`);
  });

  test('carries selection, readiness and sinking', () => {
    const ship: Ship = { ...makeShip('patrol', { r: 0, c: 0 }, 'W'), cooldown: 2 };
    expect(hullOf(ship, 'patrol')).toMatchObject({ selected: true, ready: false, sunk: false });
    expect(hullOf({ ...ship, hits: [true, true] })).toMatchObject({ selected: false, sunk: true });
  });
});

describe('what each board may draw', () => {
  function fleet(): Ship[] {
    return [
      makeShip('carrier', { r: 0, c: 4 }, 'E'),
      makeShip('battleship', { r: 2, c: 3 }, 'E'),
      makeShip('destroyer', { r: 4, c: 2 }, 'E'),
      makeShip('submarine', { r: 6, c: 2 }, 'E'),
      makeShip('patrol', { r: 8, c: 1 }, 'E'),
    ];
  }

  test('the tracking board draws wrecks and never a ship afloat, however damaged', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    // Sink B's patrol boat, and hit two of three sections of its destroyer.
    for (const t of [{ r: 8, c: 1 }, { r: 8, c: 0 }, { r: 4, c: 2 }, { r: 4, c: 1 }]) {
      g = endTurn(fire(g, t).state);
      g = endTurn(fire(g, { r: 9, c: 9 }).state);
    }
    const view = toPlayerView(g, 0);
    expect(trackingHulls(view).map((h) => [h.classId, h.sunk])).toEqual([['patrol', true]]);
    // A fresh game shows none at all.
    const fresh = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    expect(trackingHulls(toPlayerView(fresh, 0))).toEqual([]);
    // The owner's board shows all five.
    expect(fleetHulls(view).map((h) => h.classId)).toEqual(['carrier', 'battleship', 'destroyer', 'submarine', 'patrol']);
  });
});

describe('Board with hulls', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  test('a hull covers its footprint, carries its class details, and presses still reach the cells', () => {
    const onPress = jest.fn();
    const ship = makeShip('battleship', { r: 2, c: 6 }, 'E'); // D3..G3
    act(() => {
      renderer = create(
        <ThemeProvider theme="dark">
          <Board grid={emptyGrid()} hulls={[hullOf(ship)]} width={330} onPressCell={onPress} />
        </ThemeProvider>,
      );
    });
    const cell = Math.floor(330 / 11);
    const root = renderer.root;
    const footprint = root.find((n) => n.props.testID === 'hull-footprint-battleship' && String(n.type) === 'View');
    expect(StyleSheet.flatten(footprint.props.style)).toMatchObject({ left: 3 * cell, top: 2 * cell, width: 4 * cell, height: cell });
    expect(root.find((n) => n.props.testID === 'board-hulls' && typeof n.type === 'string').props.pointerEvents).toBe('none');
    const details = root.findAll((n) => n.props.testID === 'hull-detail-battleship' && String(n.type) === 'View');
    expect(details).toHaveLength(DETAILS.battleship.length);
    // The cell under the hull is still the pressable one.
    const e3 = root.find((n) => n.props.accessibilityLabel === 'E3' && typeof n.props.onPress === 'function');
    act(() => e3.props.onPress());
    expect(onPress).toHaveBeenCalledWith({ r: 2, c: 4 });
  });

  test('a wreck is drawn without deck details or a bow arrow', () => {
    const wreck = { ...makeShip('carrier', { r: 0, c: 4 }, 'E'), hits: [true, true, true, true, true] };
    act(() => {
      renderer = create(
        <ThemeProvider theme="light">
          <Board grid={emptyGrid()} hulls={[hullOf(wreck)]} width={330} />
        </ThemeProvider>,
      );
    });
    const footprint = renderer.root.find((n) => n.props.testID === 'hull-footprint-carrier' && String(n.type) === 'View');
    expect(footprint.findAll((n) => n.props.testID === 'hull-detail-carrier')).toHaveLength(0);
    expect(footprint.findAll((n) => String(n.type) === 'Text')).toHaveLength(0);
  });
});
