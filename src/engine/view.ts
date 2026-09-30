import { opponentOf, visibleLog } from './game';
import { cellsOf, isSunk } from './ships';
import {
  Coord,
  GameMode,
  GameState,
  Heading,
  IncomingShot,
  LogEntry,
  Phase,
  PlayerIndex,
  Ship,
  ShipClassId,
  ShotOutcome,
  ShotRecord,
  Splash,
} from './types';

/**
 * One player's view of a game: everything they are entitled to know, and
 * nothing else.
 *
 * GameState holds both fleets, so handing it to a screen relies on that screen
 * never looking at the wrong half. This is the projection a screen should get
 * instead, and it is what a server would send to one client. It is built
 * default-deny: a field reaches the view only if it is listed here, so a new
 * GameState field stays private until someone decides it is public.
 */
export interface PlayerView {
  mode: GameMode;
  viewer: PlayerIndex;
  current: PlayerIndex;
  phase: Phase;
  turn: number;
  winner?: PlayerIndex;
  me: OwnView;
  enemy: OpponentView;
  lastShot?: ShotView;
  /** Only while it is the viewer's own turn: which of their ships has moved. */
  maneuveredShipId?: string;
  /** visibleLog: the opponent's manoeuvres are withheld. */
  log: LogEntry[];
}

/** The viewer's own side: all of it is theirs to know. */
export interface OwnView {
  index: PlayerIndex;
  name: string;
  isAI: boolean;
  ships: Ship[];
  /** Shots the viewer has fired. */
  shots: ShotRecord[];
  /** Splashes the viewer can currently see. */
  splashes: Splash[];
  lastIncoming?: IncomingShot;
}

/**
 * An opposing ship. Afloat, only its class and length are public: which
 * classes remain is announced as each one sinks, and lengths are the rules.
 * Sunk, its final position is public too; the tracking board draws the wreck.
 */
export type PublicShip =
  | { classId: ShipClassId; length: number; sunk: false }
  | { classId: ShipClassId; length: number; sunk: true; bow: Coord; heading: Heading; cells: Coord[] };

export interface OpponentView {
  index: PlayerIndex;
  name: string;
  isAI: boolean;
  /** Shots fired at the viewer. They landed on the viewer's water, so they are public. */
  shots: ShotRecord[];
  fleet: PublicShip[];
}

/** The most recent shot, without the id of the ship it struck. */
export interface ShotView {
  by: PlayerIndex;
  coord: Coord;
  result: ShotOutcome;
  /** The struck section was already hit. Shown to the shooter deliberately. */
  alreadyDamaged: boolean;
  sunk?: { classId: ShipClassId; cells: Coord[] };
  gameOver: boolean;
}

function publicShip(ship: Ship): PublicShip {
  if (!isSunk(ship)) return { classId: ship.classId, length: ship.length, sunk: false };
  return {
    classId: ship.classId,
    length: ship.length,
    sunk: true,
    bow: { ...ship.bow },
    heading: ship.heading,
    cells: cellsOf(ship),
  };
}

function copyShip(ship: Ship): Ship {
  return { ...ship, bow: { ...ship.bow }, hits: [...ship.hits] };
}

export function toPlayerView(state: GameState, viewer: PlayerIndex): PlayerView {
  const mine = state.players[viewer];
  const theirs = state.players[opponentOf(viewer)];

  const view: PlayerView = {
    mode: state.mode,
    viewer,
    current: state.current,
    phase: state.phase,
    turn: state.turn,
    me: {
      index: mine.index,
      name: mine.name,
      isAI: mine.isAI,
      ships: mine.ships.map(copyShip),
      shots: mine.shots.map((s) => ({ ...s })),
      splashes: mine.splashes.map((s) => ({ ...s })),
    },
    enemy: {
      index: theirs.index,
      name: theirs.name,
      isAI: theirs.isAI,
      shots: theirs.shots.map((s) => ({ ...s })),
      fleet: theirs.ships.map(publicShip),
    },
    log: visibleLog(state, viewer).map((e) => ({ ...e })),
  };

  // Optional fields are only set when present, so the view's key set is exact.
  if (state.winner !== undefined) view.winner = state.winner;
  if (mine.lastIncoming) view.me.lastIncoming = { ...mine.lastIncoming };
  if (state.maneuveredShipId && state.current === viewer) view.maneuveredShipId = state.maneuveredShipId;
  if (state.lastShot) {
    const ls = state.lastShot;
    // Deliberately omitted: `shipId`. Ship ids are class ids, so it would name
    // the class of an un-sunk ship the viewer hit.
    const shot: ShotView = {
      by: ls.by,
      coord: { ...ls.coord },
      result: ls.result,
      alreadyDamaged: ls.alreadyDamaged,
      gameOver: ls.gameOver,
    };
    if (ls.sunk) shot.sunk = { classId: ls.sunk.classId, cells: ls.sunk.cells.map((c) => ({ ...c })) };
    view.lastShot = shot;
  }
  return view;
}

/** Ships the opponent still has afloat. */
export function afloatCount(fleet: readonly PublicShip[]): number {
  return fleet.filter((s) => !s.sunk).length;
}
