import { BOARD_SIZE } from './constants';
import { coordKey, inBounds, quadrantOf } from './geometry';
import { availableManeuvers, isReady } from './maneuver';
import { pick, Rng } from './random';
import { cellsOf, damageOf, isSunk } from './ships';
import { Coord, GameState, Maneuver, PlayerIndex, Quadrant, Ship, ShotRecord } from './types';
import { opponentOf } from './game';

export type Difficulty = 'easy' | 'normal' | 'hard';

export interface AiProfile {
  /** Search only cells whose parity can still hide the smallest ship. */
  useParity: boolean;
  /** Chase adjacent cells after a hit. */
  useTargeting: boolean;
  /** Use the splash quadrants the opponent's manoeuvres revealed. */
  useSplashes: boolean;
  /** Chance of moving a healthy ship on a given turn. */
  restlessness: number;
  /** Half-turns before a miss is worth re-checking. */
  staleMissTurns: number;
  /** Half-turns before a hit cell is worth re-checking. */
  staleHitTurns: number;
  /** Half-turns a hit keeps drawing follow-up shots. */
  hotHitWindow: number;
  /** Chance of simply firing at random instead of thinking. */
  blunderChance: number;
}

export const AI_PROFILES: Record<Difficulty, AiProfile> = {
  easy: {
    useParity: false,
    useTargeting: true,
    useSplashes: false,
    restlessness: 0.15,
    staleMissTurns: 12,
    staleHitTurns: 20,
    hotHitWindow: 6,
    blunderChance: 0.35,
  },
  normal: {
    useParity: true,
    useTargeting: true,
    useSplashes: false,
    restlessness: 0.35,
    staleMissTurns: 8,
    staleHitTurns: 16,
    hotHitWindow: 10,
    blunderChance: 0.08,
  },
  hard: {
    useParity: true,
    useTargeting: true,
    useSplashes: true,
    restlessness: 0.5,
    staleMissTurns: 6,
    staleHitTurns: 10,
    hotHitWindow: 8,
    blunderChance: 0,
  },
};

function latestByCell(shots: readonly ShotRecord[]): Map<string, ShotRecord> {
  const map = new Map<string, ShotRecord>();
  for (const s of shots) map.set(coordKey(s), s);
  return map;
}

/** Cells of enemy ships already sunk – known, and never worth another shell. */
function sunkCellKeys(state: GameState, ai: PlayerIndex): Set<string> {
  const enemy = state.players[opponentOf(ai)];
  const keys = new Set<string>();
  for (const s of enemy.ships) if (isSunk(s)) for (const c of cellsOf(s)) keys.add(coordKey(c));
  return keys;
}

/** Length of the smallest enemy ship still afloat – sets the useful search parity. */
function smallestAfloat(state: GameState, ai: PlayerIndex): number {
  const alive = state.players[opponentOf(ai)].ships.filter((s) => !isSunk(s));
  if (alive.length === 0) return 2;
  return Math.min(...alive.map((s) => s.length));
}

/**
 * Choose where the AI fires.
 *
 * Classic hunt/target logic adapted for moving targets: shots go stale and become
 * worth repeating, hits are only chased for a while, and – at higher difficulty –
 * the quadrant splashes left by enemy manoeuvres steer the search. A splash is
 * current information, so a stale cell inside a splashed quadrant beats a fresh
 * cell in quiet water.
 */
export function aiChooseShot(
  state: GameState,
  ai: PlayerIndex,
  rng: Rng,
  difficulty: Difficulty = 'normal',
): Coord {
  const profile = AI_PROFILES[difficulty];
  const me = state.players[ai];
  const memory = latestByCell(me.shots);
  const sunkCells = sunkCellKeys(state, ai);

  const openCells: Coord[] = [];
  for (let r = 0; r < BOARD_SIZE; r++) {
    for (let c = 0; c < BOARD_SIZE; c++) {
      if (!sunkCells.has(coordKey({ r, c }))) openCells.push({ r, c });
    }
  }
  if (openCells.length === 0) return { r: 0, c: 0 };

  if (profile.blunderChance > 0 && rng() < profile.blunderChance) {
    const unshot = openCells.filter((c) => !memory.has(coordKey(c)));
    return pick(rng, unshot.length > 0 ? unshot : openCells);
  }

  const splashQuadrants = new Set<Quadrant>(profile.useSplashes ? me.splashes.map((s) => s.quadrant) : []);
  const inSplash = (c: Coord): boolean => splashQuadrants.has(quadrantOf(c));

  /** A splashed quadrant holds a ship right now, so tolerate staler information there. */
  const isEligible = (c: Coord): boolean => {
    if (!inBounds(c) || sunkCells.has(coordKey(c))) return false;
    const mem = memory.get(coordKey(c));
    if (!mem) return true;
    const relief = inSplash(c) ? 0.5 : 1;
    const limit = (mem.result === 'hit' ? profile.staleHitTurns : profile.staleMissTurns) * relief;
    return state.turn - mem.turn >= limit;
  };

  // ---- Target mode: finish what we started. ----
  if (profile.useTargeting) {
    const recentHits = me.shots.filter(
      (s) =>
        s.result === 'hit' &&
        !sunkCells.has(coordKey(s)) &&
        state.turn - s.turn <= profile.hotHitWindow,
    );
    // One record per cell, newest first. A hull drifting back over a cell can be
    // hit there again and again, and the pair loop below is quadratic, so the
    // work has to be bounded by the board (at most BOARD_SIZE * BOARD_SIZE
    // cells) rather than by the length of a history we did not necessarily play.
    const hot = [...latestByCell(recentHits).values()].sort((a, b) => b.turn - a.turn);

    if (hot.length > 0) {
      const candidates: Coord[] = [];
      // Extend the line through any two adjacent hits – that is the hull's axis.
      for (const a of hot) {
        for (const b of hot) {
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
        const latest = hot[0];
        for (const n of [
          { r: latest.r - 1, c: latest.c },
          { r: latest.r + 1, c: latest.c },
          { r: latest.r, c: latest.c - 1 },
          { r: latest.r, c: latest.c + 1 },
        ]) {
          if (isEligible(n)) candidates.push(n);
        }
      }
      if (candidates.length > 0) {
        // Prefer a follow-up inside a splashed quadrant when we have that intel.
        const splashed = candidates.filter(inSplash);
        return pick(rng, splashed.length > 0 ? splashed : candidates);
      }
    }
  }

  // ---- Hunt mode: sweep, steered by splashes when available. ----
  const parity = smallestAfloat(state, ai);
  const onParity = (c: Coord): boolean => !profile.useParity || (c.r + c.c) % parity === 0;

  const eligible = openCells.filter(isEligible);
  const fresh = eligible.filter((c) => !memory.has(coordKey(c)));
  const stale = eligible.filter((c) => memory.has(coordKey(c)));

  // Splash intel outranks freshness: we know a hull is in that quadrant now.
  const tiers: Coord[][] = [
    fresh.filter((c) => inSplash(c) && onParity(c)),
    fresh.filter(inSplash),
    stale.filter((c) => inSplash(c) && onParity(c)),
    stale.filter(inSplash),
    fresh.filter(onParity),
    fresh,
    stale.filter(onParity),
    stale,
  ];
  for (const tier of tiers) {
    if (tier.length > 0) return pick(rng, tier);
  }

  // Everything is fresh intel; take any water that is not already known-sunk.
  return pick(rng, openCells);
}

export interface AiManeuverChoice {
  shipId: string;
  maneuver: Maneuver;
}

/**
 * Decide whether (and how) the AI moves a ship.
 *
 * Damaged ships try to slip away, because sitting still next to a known hit is
 * fatal. Healthy ships move only occasionally: every manoeuvre hands the enemy a
 * splash, so movement is intel the AI pays for.
 */
export function aiChooseManeuver(
  state: GameState,
  ai: PlayerIndex,
  rng: Rng,
  difficulty: Difficulty = 'normal',
): AiManeuverChoice | null {
  const profile = AI_PROFILES[difficulty];
  const me = state.players[ai];
  const enemy = state.players[opponentOf(ai)];
  const ready = me.ships.filter(isReady);
  if (ready.length === 0) return null;

  const damaged = ready.filter((s) => damageOf(s) > 0);

  // A ship the enemy has been shooting near is worth moving even if undamaged.
  const recentEnemyShots = enemy.shots.filter((s) => state.turn - s.turn <= 4);
  const threatened = ready.filter((s) => {
    if (damageOf(s) > 0) return false;
    const cells = cellsOf(s);
    return recentEnemyShots.some((shot) =>
      cells.some((c) => Math.abs(c.r - shot.r) + Math.abs(c.c - shot.c) <= 1),
    );
  });

  let pool: Ship[] = [];
  if (damaged.length > 0) pool = damaged;
  else if (threatened.length > 0 && profile.useSplashes) pool = threatened;
  else if (rng() < profile.restlessness) pool = ready;
  if (pool.length === 0) return null;

  const order = [...pool].sort(() => rng() - 0.5);
  for (const ship of order) {
    const options = availableManeuvers(ship, me.ships);
    if (options.length === 0) continue;
    // A real escape beats a nudge: prefer the longest run available.
    const far = options.filter((m) => (m.kind === 'ahead' || m.kind === 'astern') && (m.distance ?? 1) >= 2);
    const choice = far.length > 0 && rng() < 0.7 ? pick(rng, far) : pick(rng, options);
    return { shipId: ship.id, maneuver: choice };
  }
  return null;
}
