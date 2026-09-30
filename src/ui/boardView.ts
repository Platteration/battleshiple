import {
  BOARD_SIZE,
  Coord,
  Heading,
  PlayerView,
  PublicShip,
  ShotRecord,
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

/** A blank board `size` cells square. Everything that draws a grid reads its size from `grid.length`. */
export function emptyGrid(size: number = BOARD_SIZE): Grid {
  const grid: Grid = [];
  for (let r = 0; r < size; r++) {
    const row: CellView[] = [];
    for (let c = 0; c < size; c++) row.push({});
    grid.push(row);
  }
  return grid;
}

/**
 * The view of the cell at `c` in a grid from `emptyGrid`.
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
    if (c.r < 0 || c.c < 0 || c.r >= grid.length || c.c >= grid.length) continue;
    cellOn(grid, c).preview = ok ? 'ok' : 'bad';
  }
}

/** Latest shot per cell, with its age in half-turns. */
function paintShots(grid: Grid, shots: readonly ShotRecord[], now: number, skipHitsOnShips: boolean): void {
  const latest = new Map<string, ShotRecord>();
  for (const s of shots) latest.set(coordKey(s), s);
  for (const s of latest.values()) {
    const cell = cellOn(grid, s);
    if (skipHitsOnShips && cell.ship) continue; // the ship itself shows its damage
    cell.shot = { result: s.result, age: now - s.turn };
  }
}

/** The owner's view of their own waters: ships, damage, and where the enemy has fired. */
export function buildFleetView(
  view: PlayerView,
  opts: { selectedShipId?: string; preview?: { cells: Coord[]; ok: boolean } } = {},
): Grid {
  const grid = emptyGrid();
  paintShips(grid, view.me.ships, opts.selectedShipId);
  paintShots(grid, view.enemy.shots, view.turn, true);
  if (opts.preview) paintPreview(grid, opts.preview.cells, opts.preview.ok);
  return grid;
}

/** A sunk opponent ship, as a drawable hull. Every section of a wreck is hit. */
function wreck(ship: Extract<PublicShip, { sunk: true }>): Ship {
  return {
    id: ship.classId,
    classId: ship.classId,
    bow: { ...ship.bow },
    heading: ship.heading,
    length: ship.length,
    hits: new Array<boolean>(ship.length).fill(true),
    cooldown: 0,
  };
}

/**
 * The attacker's view of enemy waters: shot history plus revealed wrecks.
 * Built from a PlayerView, which carries no position for an enemy ship still
 * afloat, so this board cannot draw one even by mistake.
 */
export function buildTrackingView(view: PlayerView, target?: Coord): Grid {
  const grid = emptyGrid();
  const wrecks = view.enemy.fleet.flatMap((s) => (s.sunk ? [wreck(s)] : []));
  paintShips(grid, wrecks);
  paintShots(grid, view.me.shots, view.turn, false);
  if (target) cellOn(grid, target).target = true;
  return grid;
}

/**
 * A whole hull, for drawing one continuous silhouette rather than a tile per
 * cell. `r`/`c` is the top-left cell of its footprint; `bowAt` says which end
 * of that footprint is the bow ('start' is the top or left end).
 */
export interface HullView {
  id: string;
  classId: ShipClassId;
  r: number;
  c: number;
  length: number;
  horizontal: boolean;
  bowAt: 'start' | 'end';
  heading: Heading;
  sunk: boolean;
  selected: boolean;
  ready: boolean;
}

export function hullOf(ship: Ship, selectedId?: string): HullView {
  const cells = cellsOf(ship);
  const r = Math.min(...cells.map((x) => x.r));
  const c = Math.min(...cells.map((x) => x.c));
  const horizontal = cells.every((x) => x.r === ship.bow.r);
  const bowAt = (horizontal ? ship.bow.c === c : ship.bow.r === r) ? 'start' : 'end';
  return {
    id: ship.id,
    classId: ship.classId,
    r,
    c,
    length: ship.length,
    horizontal,
    bowAt,
    heading: ship.heading,
    sunk: isSunk(ship),
    selected: ship.id === selectedId,
    ready: isReady(ship),
  };
}

export function hullsOf(ships: readonly Ship[], selectedId?: string): HullView[] {
  return ships.map((s) => hullOf(s, selectedId));
}

/** The viewer's own fleet, every hull of it. */
export function fleetHulls(view: PlayerView, selectedShipId?: string): HullView[] {
  return hullsOf(view.me.ships, selectedShipId);
}

/**
 * The enemy hulls the viewer may see: wrecks, and nothing else. Built from the
 * PlayerView's public fleet, which carries no position for a ship afloat.
 */
export function trackingHulls(view: PlayerView): HullView[] {
  return hullsOf(view.enemy.fleet.flatMap((s) => (s.sunk ? [wreck(s)] : [])));
}

