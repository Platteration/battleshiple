import { buildFleetView, buildTrackingView, CellView, emptyGrid, Grid, paintPreview, paintShips } from '../src/ui/boardView';
import { createGame, endTurn, fire, visibleLog, maneuver } from '../src/engine/game';
import { makeShip, cellsOf } from '../src/engine/ships';
import { GameState, PlayerState, Ship, ShotRecord } from '../src/engine/types';
import { toPlayerView } from '../src/engine/view';

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
    const grid = buildTrackingView(toPlayerView(g, 0));
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
    expect(shipCellCount(buildTrackingView(toPlayerView(g, 0)))).toBe(0);
  });

  test('the fleet view shows the owner every one of their own hulls', () => {
    const g = game();
    const grid = buildFleetView(toPlayerView(g, 0));
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

/** Every cell `has` holds for, as "r,c". Rows and columns differ throughout, so a transposed index shows. */
function where(grid: Grid, has: (cell: CellView) => boolean): string[] {
  const out: string[] = [];
  grid.forEach((row, r) => row.forEach((cell, c) => has(cell) && out.push(`${r},${c}`)));
  return out;
}

function player(shots: ShotRecord[] = []): PlayerState {
  return { index: 0, name: 'A', isAI: false, ships: [], shots, splashes: [] };
}

/**
 * Player 0's view of a match between these two sides at half-turn `turn`. The
 * boards are built from a PlayerView, so these go through the real projection:
 * whatever it withholds, the board cannot draw.
 */
function viewOf(me: PlayerState, enemy: PlayerState, turn: number) {
  const state: GameState = { mode: 'local', players: [me, { ...enemy, index: 1 }], current: 0, phase: 'fire', turn, log: [] };
  return toPlayerView(state, 0);
}

describe('board view', () => {
  test('a hull is painted on its own cells, bow first, with the damage on the segment that took it', () => {
    const destroyer = { ...makeShip('destroyer', { r: 2, c: 7 }, 'E'), hits: [false, true, false] };
    const grid = emptyGrid();
    paintShips(grid, [destroyer]);
    expect(where(grid, (cell) => cell.ship !== undefined)).toEqual(['2,5', '2,6', '2,7']);
    expect(where(grid, (cell) => cell.ship?.isBow === true)).toEqual(['2,7']);
    expect(where(grid, (cell) => cell.ship?.hit === true)).toEqual(['2,6']);
  });

  test('the latest shot at a cell is the one shown, and the target is the cell locked', () => {
    const shots: ShotRecord[] = [
      { r: 1, c: 8, result: 'miss', turn: 0 },
      { r: 6, c: 3, result: 'miss', turn: 2 },
      { r: 1, c: 8, result: 'hit', turn: 4 },
    ];
    const grid = buildTrackingView(viewOf(player(shots), player(), 10), { r: 4, c: 9 });
    expect(where(grid, (cell) => cell.shot !== undefined)).toEqual(['1,8', '6,3']);
    expect(grid[1]?.[8]?.shot).toEqual({ result: 'hit', age: 6 });
    expect(grid[6]?.[3]?.shot).toEqual({ result: 'miss', age: 8 });
    expect(where(grid, (cell) => cell.target === true)).toEqual(['4,9']);
  });

  test('on the fleet board a shot on a hull is left to the hull, and one in open water is shown', () => {
    const me = { ...player(), ships: [makeShip('patrol', { r: 8, c: 1 }, 'N')] };
    const enemy = player([
      { r: 9, c: 1, result: 'hit', turn: 1 },
      { r: 0, c: 5, result: 'miss', turn: 3 },
    ]);
    const grid = buildFleetView(viewOf(me, enemy, 5));
    expect(where(grid, (cell) => cell.shot !== undefined)).toEqual(['0,5']);
  });

  test('the targeting board shows the enemy hulls that are sunk, hides the ones afloat, and keeps every shot', () => {
    const sunk = { ...makeShip('patrol', { r: 1, c: 4 }, 'W'), hits: [true, true] };
    const afloat = { ...makeShip('destroyer', { r: 6, c: 8 }, 'N'), hits: [false, true, false] };
    const me = player([
      { r: 1, c: 4, result: 'hit', turn: 1 },
      { r: 1, c: 5, result: 'hit', turn: 3 },
      { r: 7, c: 8, result: 'hit', turn: 5 },
      { r: 3, c: 0, result: 'miss', turn: 7 },
    ]);
    const grid = buildTrackingView(viewOf(me, { ...player(), ships: [sunk, afloat] }, 9));
    expect(where(grid, (cell) => cell.ship !== undefined)).toEqual(['1,4', '1,5']);
    expect(where(grid, (cell) => cell.ship?.sunk === true)).toEqual(['1,4', '1,5']);
    expect(where(grid, (cell) => cell.shot !== undefined)).toEqual(['1,4', '1,5', '3,0', '7,8']);
  });

  test('on the fleet board the selected hull and the sunk one are marked, and the preview is painted as it was judged', () => {
    const destroyer = makeShip('destroyer', { r: 2, c: 7 }, 'E');
    const patrol = { ...makeShip('patrol', { r: 8, c: 1 }, 'N'), hits: [true, true] };
    const me = { ...player(), ships: [destroyer, patrol] };
    const cells = [{ r: 3, c: 5 }, { r: 3, c: 6 }, { r: 3, c: 7 }];
    const grid = buildFleetView(viewOf(me, player(), 4), { selectedShipId: 'destroyer', preview: { cells, ok: true } });
    expect(where(grid, (cell) => cell.ship?.selected === true)).toEqual(['2,5', '2,6', '2,7']);
    expect(where(grid, (cell) => cell.ship?.sunk === true)).toEqual(['8,1', '9,1']);
    expect(where(grid, (cell) => cell.preview === 'ok')).toEqual(['3,5', '3,6', '3,7']);
    expect(where(grid, (cell) => cell.preview === 'bad')).toEqual([]);
  });

  test('a preview that runs off the board paints the cells on it and skips the rest', () => {
    const grid = emptyGrid();
    paintPreview(grid, [{ r: -1, c: 3 }, { r: 0, c: 3 }, { r: 3, c: 10 }, { r: 3, c: 9 }], false);
    expect(where(grid, (cell) => cell.preview === 'bad')).toEqual(['0,3', '3,9']);
  });
});
