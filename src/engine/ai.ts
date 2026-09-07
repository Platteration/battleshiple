import { BOARD_SIZE } from './constants';
import { coordKey, inBounds } from './geometry';
import { availableManeuvers, isReady } from './maneuver';
import { pick, Rng } from './random';
import { cellsOf, damageOf, isSunk } from './ships';
import { Coord, GameState, Maneuver, PlayerIndex, ShotRecord } from './types';
import { opponentOf } from './game';

/** How many half-turns before a previously shot cell is worth shooting again. */
const STALE_AFTER = 8;
/** How many half-turns a hit stays "hot" for targeting when no sink followed. */
const HOT_HIT_WINDOW = 10;

interface CellMemory {
  last: ShotRecord;
}

function latestByCell(shots: readonly ShotRecord[]): Map<string, CellMemory> {
  const map = new Map<string, CellMemory>();
  for (const s of shots) map.set(coordKey(s), { last: s });
  return map;
}

/**
 * Choose where the AI fires. Classic hunt/target logic, adapted for moving targets:
 * old shots go stale and become eligible again, and hits that never led to a sink
 * are only chased for a limited time.
 */
export function aiChooseShot(state: GameState, ai: PlayerIndex, rng: Rng): Coord {
  const me = state.players[ai];
  const enemy = state.players[opponentOf(ai)];
  const memory = latestByCell(me.shots);

  // Cells belonging to sunk enemy ships are known and useless.
  const sunkCells = new Set<string>();
  for (const s of enemy.ships) if (isSunk(s)) for (const c of cellsOf(s)) sunkCells.add(coordKey(c));

  const isEligible = (c: Coord): boolean => {
    if (!inBounds(c) || sunkCells.has(coordKey(c))) return false;
    const mem = memory.get(coordKey(c));
    if (!mem) return true;
    if (mem.last.result === 'hit') return state.turn - mem.last.turn >= STALE_AFTER * 2;
    return state.turn - mem.last.turn >= STALE_AFTER;
  };

  // Target mode: chase recent hits that did not sink anything.
  const hotHits = me.shots
    .filter((s) => s.result === 'hit' && !sunkCells.has(coordKey(s)) && state.turn - s.turn <= HOT_HIT_WINDOW)
    .sort((a, b) => b.turn - a.turn);

  if (hotHits.length > 0) {
    const candidates: Coord[] = [];
    // Extend lines formed by pairs of hot hits.
    for (const a of hotHits) {
      for (const b of hotHits) {
        if (a === b) continue;
        const dr = b.r - a.r;
        const dc = b.c - a.c;
        if ((Math.abs(dr) === 1 && dc === 0) || (Math.abs(dc) === 1 && dr === 0)) {
          const beyond = { r: b.r + dr, c: b.c + dc };
          if (isEligible(beyond)) candidates.push(beyond);
        }
      }
    }
    if (candidates.length === 0) {
      const latest = hotHits[0];
      const neighbours: Coord[] = [
        { r: latest.r - 1, c: latest.c },
        { r: latest.r + 1, c: latest.c },
        { r: latest.r, c: latest.c - 1 },
        { r: latest.r, c: latest.c + 1 },
      ];
      for (const n of neighbours) if (isEligible(n)) candidates.push(n);
    }
    if (candidates.length > 0) return pick(rng, candidates);
  }

  // Hunt mode: parity search over eligible cells, never-shot cells first.
  const fresh: Coord[] = [];
  const stale: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      const coord = { r, c };
      if (!isEligible(coord)) continue;
      if (memory.has(coordKey(coord))) stale.push(coord);
      else fresh.push(coord);
    }
  }
  const parity = fresh.filter((c) => (c.r + c.c) % 2 === 0);
  if (parity.length > 0) return pick(rng, parity);
  if (fresh.length > 0) return pick(rng, fresh);
  if (stale.length > 0) return pick(rng, stale);

  // Everything is hot; fall back to any non-sunk cell.
  const any: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r++)
    for (let c = 0; c < BOARD_SIZE; c++) if (!sunkCells.has(coordKey({ r, c }))) any.push({ r, c });
  return pick(rng, any);
}

export interface AiManeuverChoice {
  shipId: string;
  maneuver: Maneuver;
}

/**
 * Decide whether (and how) the AI moves a ship this turn.
 * Damaged ships try to slip away; otherwise the AI occasionally repositions a healthy ship.
 */
export function aiChooseManeuver(state: GameState, ai: PlayerIndex, rng: Rng, restlessness = 0.35): AiManeuverChoice | null {
  const me = state.players[ai];
  const ready = me.ships.filter((s) => isReady(s));
  if (ready.length === 0) return null;

  const damaged = ready.filter((s) => damageOf(s) > 0);
  const pool = damaged.length > 0 ? damaged : rng() < restlessness ? ready : [];
  if (pool.length === 0) return null;

  // Try ships in random order until one has a legal move.
  const order = [...pool].sort(() => rng() - 0.5);
  for (const ship of order) {
    const options = availableManeuvers(ship, me.ships);
    if (options.length === 0) continue;
    // Prefer the biggest displacement so a damaged ship really leaves the area.
    const far = options.filter((m) => (m.kind === 'ahead' || m.kind === 'astern') && (m.distance ?? 1) >= 2);
    const choice = far.length > 0 && rng() < 0.7 ? pick(rng, far) : pick(rng, options);
    return { shipId: ship.id, maneuver: choice };
  }
  return null;
}
