import {
  BOARD_SIZE,
  Coord,
  Heading,
  PlayerState,
  Ship,
  ShipClassId,
  ShotOutcome,
  cellsOf,
  coordKey,
  isSunk,
  isReady,
} from '../engine';

export interface ShipCellView {
  classId: ShipClassId;
  isBow: boolean;
  heading: Heading;
  hit: boolean;
  sunk: boolean;
  selected: boolean;
  ready: boolean;
  cooldown: number;
}

export interface CellView {
  ship?: ShipCellView;
  shot?: { result: ShotOutcome; age: number };
  preview?: 'ok' | 'bad';
  target?: boolean;
}

export type Grid = CellView[][];

export function emptyGrid(): Grid {
  const grid: Grid = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    const row: CellView[] = [];
    for (let c = 0; c < BOARD_SIZE; c++) row.push({});
    grid.push(row);
  }
  return grid;
}

/**
 * The view of the cell at `c` in a grid from `emptyGrid`, BOARD_SIZE square.
 * `c` must be on the board, and everything painted through here is: the engine
 * never moves a hull or fires a shot off it, a target is a cell someone tapped,
 * a preview is bounds-checked before it gets here, and `src/storage.ts` refuses
 * a save whose hulls or shots say otherwise.
 */
function cellOn(grid: Grid, c: Coord): CellView {
  return grid[c.r]![c.c]!;
}

export function paintShips(grid: Grid, ships: readonly Ship[], selectedId?: string): void {
  for (const ship of ships) {
    const cells = cellsOf(ship);
    const sunk = isSunk(ship);
    cells.forEach((cell, i) => {
      cellOn(grid, cell).ship = {
        classId: ship.classId,
        isBow: i === 0,
        heading: ship.heading,
        // A hull carries one `hits` entry per cell.
        hit: ship.hits[i]!,
        sunk,
        selected: ship.id === selectedId,
        ready: isReady(ship),
        cooldown: ship.cooldown,
      };
    });
  }
}

export function paintPreview(grid: Grid, cells: readonly Coord[], ok: boolean): void {
  for (const c of cells) {
    if (c.r < 0 || c.c < 0 || c.r >= BOARD_SIZE || c.c >= BOARD_SIZE) continue;
    cellOn(grid, c).preview = ok ? 'ok' : 'bad';
  }
}

/** Latest shot per cell, with its age in half-turns. */
function paintShots(grid: Grid, shots: PlayerState['shots'], now: number, skipHitsOnShips: boolean): void {
  const latest = new Map<string, PlayerState['shots'][number]>();
  for (const s of shots) latest.set(coordKey(s), s);
  for (const s of latest.values()) {
    const cell = cellOn(grid, s);
    if (skipHitsOnShips && cell.ship) continue; // the ship itself shows its damage
    cell.shot = { result: s.result, age: now - s.turn };
  }
}

/** The owner's view of their own waters: ships, damage, and where the enemy has fired. */
export function buildFleetView(
  me: PlayerState,
  enemy: PlayerState,
  now: number,
  opts: { selectedShipId?: string; preview?: { cells: Coord[]; ok: boolean } } = {},
): Grid {
  const grid = emptyGrid();
  paintShips(grid, me.ships, opts.selectedShipId);
  paintShots(grid, enemy.shots, now, true);
  if (opts.preview) paintPreview(grid, opts.preview.cells, opts.preview.ok);
  return grid;
}

/** The attacker's view of enemy waters: shot history plus revealed sunk ships. */
export function buildTrackingView(me: PlayerState, enemy: PlayerState, now: number, target?: Coord): Grid {
  const grid = emptyGrid();
  paintShips(
    grid,
    enemy.ships.filter((s) => isSunk(s)),
  );
  paintShots(grid, me.shots, now, false);
  if (target) cellOn(grid, target).target = true;
  return grid;
}
