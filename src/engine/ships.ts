import { BOARD_SIZE, FLEET, SHIP_CLASSES } from './constants';
import { HEADINGS, coordKey, inBounds, shipCells } from './geometry';
import { pick, randomInt, Rng } from './random';
import { Coord, Heading, Ship, ShipClassId } from './types';

export function makeShip(classId: ShipClassId, bow: Coord, heading: Heading): Ship {
  const cls = SHIP_CLASSES[classId];
  return {
    id: classId,
    classId,
    bow: { ...bow },
    heading,
    length: cls.length,
    hits: new Array<boolean>(cls.length).fill(false),
    cooldown: 0,
  };
}

export function cellsOf(ship: Pick<Ship, 'bow' | 'heading' | 'length'>): Coord[] {
  return shipCells(ship.bow, ship.heading, ship.length);
}

export function isSunk(ship: Ship): boolean {
  return ship.hits.every(Boolean);
}

export function damageOf(ship: Ship): number {
  return ship.hits.filter(Boolean).length;
}

/** Set of occupied cell keys for all ships except `ignoreId`. */
export function occupiedKeys(ships: readonly Ship[], ignoreId?: string): Set<string> {
  const set = new Set<string>();
  for (const s of ships) {
    if (s.id === ignoreId) continue;
    for (const c of cellsOf(s)) set.add(coordKey(c));
  }
  return set;
}

/** True when every cell is on the board and none collides with another ship. */
export function footprintIsFree(cells: readonly Coord[], ships: readonly Ship[], ignoreId?: string): boolean {
  const taken = occupiedKeys(ships, ignoreId);
  return cells.every((c) => inBounds(c) && !taken.has(coordKey(c)));
}

/** Find the ship (and segment index) occupying a cell, if any. */
export function shipAt(ships: readonly Ship[], coord: Coord): { ship: Ship; segment: number } | undefined {
  for (const ship of ships) {
    const cells = cellsOf(ship);
    const idx = cells.findIndex((c) => c.r === coord.r && c.c === coord.c);
    if (idx >= 0) return { ship, segment: idx };
  }
  return undefined;
}

export function fleetIsComplete(ships: readonly Ship[]): boolean {
  return FLEET.every((id) => ships.some((s) => s.classId === id));
}

/** Randomly place the full roster. Throws only if the board is impossibly crowded. */
export function randomFleet(rng: Rng): Ship[] {
  const ships: Ship[] = [];
  for (const classId of FLEET) {
    const length = SHIP_CLASSES[classId].length;
    let placed = false;
    for (let attempt = 0; attempt < 500 && !placed; attempt++) {
      const heading = pick(rng, HEADINGS);
      const bow = { r: randomInt(rng, BOARD_SIZE), c: randomInt(rng, BOARD_SIZE) };
      const cells = shipCells(bow, heading, length);
      if (footprintIsFree(cells, ships)) {
        ships.push(makeShip(classId, bow, heading));
        placed = true;
      }
    }
    if (!placed) throw new Error(`Could not place ${classId}`);
  }
  return ships;
}
