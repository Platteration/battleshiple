import { shipsRemaining } from './game';
import { GameMode, GameState, PlayerIndex, Ship } from './types';

/** One side of a finished battle. */
export interface SideReport {
  index: PlayerIndex;
  name: string;
  isAI: boolean;
  shots: number;
  hits: number;
  /** Hits per shot, 0 to 1; 0 when no shot was fired. */
  hitRate: number;
  manoeuvres: number;
  afloat: number;
  /** The fleet where it ended up. Public now: the battle is over. */
  fleet: Ship[];
}

export interface AfterActionReport {
  mode: GameMode;
  winner: PlayerIndex;
  /** Turns per side, as the game screen counts them. */
  turns: number;
  sides: [SideReport, SideReport];
}

function side(state: GameState, index: PlayerIndex): SideReport {
  const p = state.players[index];
  const hits = p.shots.filter((s) => s.result === 'hit').length;
  return {
    index,
    name: p.name,
    isAI: p.isAI,
    shots: p.shots.length,
    hits,
    hitRate: p.shots.length === 0 ? 0 : hits / p.shots.length,
    manoeuvres: state.log.filter((e) => e.kind === 'move' && e.by === index).length,
    afloat: shipsRemaining(p.ships),
    fleet: p.ships.map((s) => ({ ...s, bow: { ...s.bow }, hits: [...s.hits] })),
  };
}

/**
 * Everything the game-over screen shows, and only once there is nothing left
 * to hide: both fleets' positions and every manoeuvre are secrets until the
 * last ship sinks. It throws for a game still in play, so it can never become
 * a way round the PlayerView a screen gets during a match.
 */
export function afterActionReport(state: GameState): AfterActionReport {
  if (state.phase !== 'over' || state.winner === undefined) {
    throw new Error('afterActionReport: the battle is not over');
  }
  return {
    mode: state.mode,
    winner: state.winner,
    turns: Math.floor(state.turn / 2) + 1,
    sides: [side(state, 0), side(state, 1)],
  };
}
