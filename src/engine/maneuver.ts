import { SHIP_CLASSES } from './constants';
import { HEADING_VECTORS, add, rotateCCW, rotateCW } from './geometry';
import { cellsOf, damageOf, footprintIsFree, isSunk } from './ships';
import { Coord, Heading, Maneuver, ManeuverKind, Ship } from './types';

export interface Pose {
  bow: Coord;
  heading: Heading;
}

/** Compute where the ship would end up after a manoeuvre (no validation). */
export function projectManeuver(ship: Ship, m: Maneuver): Pose {
  const fwd = HEADING_VECTORS[ship.heading];
  const distance = m.distance ?? 1;
  switch (m.kind) {
    case 'ahead':
      return { bow: add(ship.bow, fwd, distance), heading: ship.heading };
    case 'astern':
      return { bow: add(ship.bow, fwd, -distance), heading: ship.heading };
    case 'starboard':
      return { bow: add(ship.bow, HEADING_VECTORS[rotateCW(ship.heading)]), heading: ship.heading };
    case 'port':
      return { bow: add(ship.bow, HEADING_VECTORS[rotateCCW(ship.heading)]), heading: ship.heading };
    case 'rotateCW':
      // Pivot on the bow: the stern swings around.
      return { bow: { ...ship.bow }, heading: rotateCW(ship.heading) };
    case 'rotateCCW':
      return { bow: { ...ship.bow }, heading: rotateCCW(ship.heading) };
  }
}

export function projectedCells(ship: Ship, m: Maneuver): Coord[] {
  const pose = projectManeuver(ship, m);
  return cellsOf({ bow: pose.bow, heading: pose.heading, length: ship.length });
}

/** Cooldown a ship incurs when it manoeuvres: class cooldown plus one per damaged segment. */
export function cooldownFor(ship: Ship): number {
  return SHIP_CLASSES[ship.classId].cooldown + damageOf(ship);
}

export function mobilityOf(ship: Ship): number {
  return SHIP_CLASSES[ship.classId].mobility;
}

export function isReady(ship: Ship): boolean {
  return ship.cooldown === 0 && !isSunk(ship);
}

export interface ManeuverCheck {
  ok: boolean;
  reason?: string;
}

/** Validate a manoeuvre for a ship among its fleet-mates. */
export function checkManeuver(ship: Ship, m: Maneuver, fleet: readonly Ship[]): ManeuverCheck {
  if (isSunk(ship)) return { ok: false, reason: 'Ship is sunk' };
  if (ship.cooldown > 0) return { ok: false, reason: `Ready in ${ship.cooldown} turn${ship.cooldown === 1 ? '' : 's'}` };
  const distance = m.distance ?? 1;
  if (m.kind === 'ahead' || m.kind === 'astern') {
    if (!Number.isInteger(distance) || distance < 1) return { ok: false, reason: 'Invalid distance' };
    if (distance > mobilityOf(ship)) return { ok: false, reason: `Mobility is ${mobilityOf(ship)}` };
  }
  const cells = projectedCells(ship, m);
  if (!footprintIsFree(cells, fleet, ship.id)) return { ok: false, reason: 'Blocked or off the board' };
  return { ok: true };
}

/** Return the ship after the manoeuvre (cooldown applied). Does not validate. */
export function applyManeuver(ship: Ship, m: Maneuver): Ship {
  const pose = projectManeuver(ship, m);
  return { ...ship, bow: pose.bow, heading: pose.heading, hits: [...ship.hits], cooldown: cooldownFor(ship) };
}

const KINDS: ManeuverKind[] = ['ahead', 'astern', 'port', 'starboard', 'rotateCW', 'rotateCCW'];

/** Every manoeuvre the ship could legally perform right now. */
export function availableManeuvers(ship: Ship, fleet: readonly Ship[]): Maneuver[] {
  const out: Maneuver[] = [];
  for (const kind of KINDS) {
    if (kind === 'ahead' || kind === 'astern') {
      for (let d = 1; d <= mobilityOf(ship); d++) {
        const m = { kind, distance: d };
        if (checkManeuver(ship, m, fleet).ok) out.push(m);
      }
    } else {
      const m = { kind };
      if (checkManeuver(ship, m, fleet).ok) out.push(m);
    }
  }
  return out;
}

export function describeManeuver(m: Maneuver): string {
  const d = m.distance ?? 1;
  switch (m.kind) {
    case 'ahead':
      return `ahead ${d}`;
    case 'astern':
      return `astern ${d}`;
    case 'port':
      return 'shifted to port';
    case 'starboard':
      return 'shifted to starboard';
    case 'rotateCW':
      return 'turned clockwise';
    case 'rotateCCW':
      return 'turned counter-clockwise';
  }
}
