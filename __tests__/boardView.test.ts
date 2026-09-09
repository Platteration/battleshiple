import { buildFleetView, buildTrackingView } from '../src/ui/boardView';
import { createGame, endTurn, fire, visibleLog, maneuver } from '../src/engine/game';
import { makeShip, cellsOf } from '../src/engine/ships';
import { GameState, Ship } from '../src/engine/types';

function fleet(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 4, c: 2 }, 'E'),
    makeShip('submarine', { r: 6, c: 2 }, 'E'),
    makeShip('patrol', { r: 8, c: 1 }, 'E'),
  ];
}

function game(): GameState {
  return createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
}

function shipCellCount(grid: ReturnType<typeof buildTrackingView>): number {
  return grid.flat().filter((c) => c.ship).length;
}

/**
 * The tracking board and the log filter are the only two things standing between
 * a pass-and-play opponent and the whole enemy fleet, and neither was covered.
 */
describe('hidden information', () => {
  test('the tracking board shows no un-sunk enemy ship, however much has been fired', () => {
    let g = game();
    // Rake the board: A fires at every cell of B's fleet except one of the patrol's.
    const targets = fleet().flatMap((s) => cellsOf(s));
    for (const t of targets) {
      if (t.r === 8 && t.c === 0) continue; // leave the patrol boat afloat
      g = endTurn(fire(g, t).state);
      g = endTurn(fire(g, { r: 9, c: 9 }).state);
    }
    const grid = buildTrackingView(g.players[0], g.players[1], g.turn);
    const revealed = grid.flat().filter((c) => c.ship);
    // Only cells of ships that are actually sunk may be painted.
    const sunkCells = g.players[1].ships.filter((s) => s.hits.every(Boolean)).flatMap(cellsOf);
    expect(revealed).toHaveLength(sunkCells.length);
    expect(revealed.every((c) => c.ship!.sunk)).toBe(true);
    // The surviving patrol boat is not on the tracking board anywhere.
    expect(g.players[1].ships.find((s) => s.id === 'patrol')!.hits.every(Boolean)).toBe(false);
    expect(revealed.some((c) => c.ship!.classId === 'patrol')).toBe(false);
  });

  test('a fresh tracking board reveals nothing at all', () => {
    const g = game();
    expect(shipCellCount(buildTrackingView(g.players[0], g.players[1], g.turn))).toBe(0);
  });

  test('the fleet view shows the owner every one of their own hulls', () => {
    const g = game();
    const grid = buildFleetView(g.players[0], g.players[1], g.turn);
    expect(shipCellCount(grid)).toBe(fleet().reduce((n, s) => n + s.length, 0));
  });

  test('the log hides the opponent’s manoeuvres but keeps their shots', () => {
    let g = game();
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
    g = endTurn(g);

    const mine = visibleLog(g, 0);
    const theirs = visibleLog(g, 1);
    expect(mine.some((e) => e.kind === 'move')).toBe(true);
    // Player 1 must not learn that a ship moved, nor which one.
    expect(theirs.some((e) => e.kind === 'move')).toBe(false);
    expect(theirs.some((e) => /Patrol Boat/.test(e.text))).toBe(false);
    expect(theirs.some((e) => e.kind === 'shot')).toBe(true);
  });
});
