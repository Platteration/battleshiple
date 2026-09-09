import { SHIP_CLASSES, SPLASH_VISIBLE_TURNS } from './constants';
import { coordLabel, inBounds, quadrantOf, QUADRANT_NAMES } from './geometry';
import { applyManeuver, checkManeuver, describeManeuver } from './maneuver';
import { cellsOf, fleetIsComplete, footprintIsFree, isSunk, shipAt } from './ships';
import {
  Coord,
  GameMode,
  GameState,
  LogEntry,
  LogKind,
  Maneuver,
  PlayerIndex,
  PlayerState,
  Ship,
  ShotResult,
} from './types';

export interface CreateGameOptions {
  mode: GameMode;
  names: [string, string];
  fleets: [Ship[], Ship[]];
  aiPlayer?: PlayerIndex;
}

function validateFleet(ships: Ship[], label: string): void {
  if (!fleetIsComplete(ships)) throw new Error(`${label}: fleet is incomplete`);
  for (const ship of ships) {
    const others = ships.filter((s) => s !== ship);
    if (!footprintIsFree(cellsOf(ship), others)) throw new Error(`${label}: ${ship.classId} overlaps or is off the board`);
  }
}

export function createGame(opts: CreateGameOptions): GameState {
  validateFleet(opts.fleets[0], opts.names[0]);
  validateFleet(opts.fleets[1], opts.names[1]);
  const mk = (index: PlayerIndex): PlayerState => ({
    index,
    name: opts.names[index],
    isAI: opts.aiPlayer === index,
    ships: opts.fleets[index].map((s) => ({ ...s, bow: { ...s.bow }, hits: [...s.hits], cooldown: 0 })),
    shots: [],
    splashes: [],
  });
  return {
    mode: opts.mode,
    players: [mk(0), mk(1)],
    current: 0,
    phase: 'fire',
    turn: 0,
    log: [],
  };
}

export function opponentOf(p: PlayerIndex): PlayerIndex {
  return p === 0 ? 1 : 0;
}

export function fleetSunk(ships: readonly Ship[]): boolean {
  return ships.every(isSunk);
}

export function shipsRemaining(ships: readonly Ship[]): number {
  return ships.filter((s) => !isSunk(s)).length;
}

function withPlayer(state: GameState, index: PlayerIndex, patch: Partial<PlayerState>): GameState {
  const players: [PlayerState, PlayerState] = [state.players[0], state.players[1]];
  players[index] = { ...players[index], ...patch };
  return { ...state, players };
}

function log(state: GameState, text: string, kind: LogKind = 'system'): GameState {
  return { ...state, log: [...state.log, { turn: state.turn, by: state.current, kind, text }] };
}

/** Log entries a given player is allowed to read (the opponent's moves stay hidden). */
export function visibleLog(state: GameState, viewer: PlayerIndex): LogEntry[] {
  return state.log.filter((e) => e.kind !== 'move' || e.by === viewer);
}

/**
 * The current player fires at `coord` on the opponent's board.
 * Cells may be fired at more than once – ships move, so a miss today may be a hit tomorrow.
 */
export function fire(state: GameState, coord: Coord): { state: GameState; result: ShotResult } {
  if (state.phase !== 'fire') throw new Error('Not the firing phase');
  if (!inBounds(coord)) throw new Error('Shot is off the board');
  const shooter = state.current;
  const target = opponentOf(shooter);
  const targetPlayer = state.players[target];
  const found = shipAt(targetPlayer.ships, coord);

  let result: ShotResult;
  let next = state;

  if (found) {
    const { ship, segment } = found;
    const alreadyDamaged = ship.hits[segment];
    const hits = [...ship.hits];
    hits[segment] = true;
    const updated: Ship = { ...ship, hits };
    const ships = targetPlayer.ships.map((s) => (s.id === ship.id ? updated : s));
    next = withPlayer(next, target, {
      ships,
      // Snapshot what the defender saw now: their own ships move later this game,
      // and re-deriving the banner from live hulls misreports it.
      lastIncoming: {
        r: coord.r,
        c: coord.c,
        result: 'hit',
        turn: state.turn,
        classId: ship.classId,
        sunk: isSunk(updated),
      },
    });
    const sunkNow = !alreadyDamaged && isSunk(updated);
    result = {
      coord,
      result: 'hit',
      shipId: ship.id,
      alreadyDamaged,
      sunk: sunkNow ? { shipId: ship.id, classId: ship.classId, cells: cellsOf(updated) } : undefined,
      gameOver: fleetSunk(ships),
    };
  } else {
    result = { coord, result: 'miss', alreadyDamaged: false, gameOver: false };
    next = withPlayer(next, target, {
      lastIncoming: { r: coord.r, c: coord.c, result: 'miss', turn: state.turn, sunk: false },
    });
  }

  const shooterState = next.players[shooter];
  next = withPlayer(next, shooter, {
    shots: [...shooterState.shots, { r: coord.r, c: coord.c, result: result.result, turn: state.turn }],
  });
  next = { ...next, lastShot: { ...result, by: shooter } };

  const label = coordLabel(coord);
  if (result.result === 'miss') next = log(next, `${shooterState.name} fired at ${label}: miss.`, 'shot');
  else if (result.sunk) next = log(next, `${shooterState.name} fired at ${label}: hit! ${SHIP_CLASSES[result.sunk.classId].name} sunk!`, 'shot');
  else if (result.alreadyDamaged) next = log(next, `${shooterState.name} fired at ${label}: hit an already damaged section.`, 'shot');
  else next = log(next, `${shooterState.name} fired at ${label}: hit!`, 'shot');

  if (result.gameOver) {
    next = { ...next, phase: 'over', winner: shooter };
    next = log(next, `${shooterState.name} wins!`);
  } else {
    next = { ...next, phase: 'maneuver' };
  }
  return { state: next, result };
}

/** The current player manoeuvres one ship. Produces a splash for the opponent. */
export function maneuver(state: GameState, shipId: string, m: Maneuver): GameState {
  if (state.phase !== 'maneuver') throw new Error('Not the manoeuvre phase');
  if (state.maneuveredShipId) throw new Error('Only one ship may move per turn');
  const me = state.current;
  const player = state.players[me];
  const ship = player.ships.find((s) => s.id === shipId);
  if (!ship) throw new Error('Unknown ship');
  const check = checkManeuver(ship, m, player.ships);
  if (!check.ok) throw new Error(check.reason ?? 'Illegal manoeuvre');

  const moved = applyManeuver(ship, m);
  const ships = player.ships.map((s) => (s.id === shipId ? moved : s));
  let next = withPlayer(state, me, { ships });

  // The opponent sees a splash in the quadrant where the ship now sits (its midpoint).
  const cells = cellsOf(moved);
  const mid = cells[Math.floor((cells.length - 1) / 2)];
  const quadrant = quadrantOf(mid);
  const enemy = opponentOf(me);
  next = withPlayer(next, enemy, {
    splashes: [...next.players[enemy].splashes, { quadrant, turn: state.turn }],
  });
  next = { ...next, maneuveredShipId: shipId };
  next = log(
    next,
    // Phrased without a possessive: the human player is literally called "You",
    // which made the old wording read "You's Patrol Boat".
    `${player.name} moved the ${SHIP_CLASSES[ship.classId].name} ${describeManeuver(m)} ` +
      `(splash in the ${QUADRANT_NAMES[quadrant]}).`,
    'move',
  );
  return next;
}

/** End the current player's turn (after firing, with or without a manoeuvre). */
export function endTurn(state: GameState): GameState {
  if (state.phase !== 'maneuver') throw new Error('Cannot end turn now');
  const me = state.current;
  const player = state.players[me];

  // Cooldowns tick down at the end of the owner's turn, except for the ship that just moved.
  const ships = player.ships.map((s) =>
    s.id !== state.maneuveredShipId && s.cooldown > 0 ? { ...s, cooldown: s.cooldown - 1 } : s,
  );
  const nextTurn = state.turn + 1;
  // Splashes this player has already had a chance to see expire. Turns alternate,
  // so one observer turn is two half-turns of age.
  const splashes = player.splashes.filter(
    (sp) => nextTurn - sp.turn < 2 * SPLASH_VISIBLE_TURNS,
  );
  let next = withPlayer(state, me, { ships, splashes });
  next = {
    ...next,
    current: opponentOf(me),
    phase: 'fire',
    turn: nextTurn,
    maneuveredShipId: undefined,
    lastShot: undefined,
  };
  return next;
}

/** Skip the manoeuvre and end the turn. Convenience wrapper. */
export function holdPosition(state: GameState): GameState {
  return endTurn(state);
}
