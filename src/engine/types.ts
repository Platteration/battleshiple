/**
 * Core data types for Battleshiple – Battleship with mobile fleets.
 *
 * Conventions:
 *  - Board coordinates are { r: row, c: col }, zero-based, row 0 at the top.
 *  - A ship is described by the position of its BOW (front cell) and a heading.
 *    Cell i of a ship (0 = bow) sits i cells *behind* the bow, i.e. opposite the heading.
 *  - `hits[i]` records damage on segment i. Damage travels with the ship when it moves.
 */

export type Heading = 'N' | 'E' | 'S' | 'W';

export interface Coord {
  r: number;
  c: number;
}

export type Quadrant = 'NW' | 'NE' | 'SW' | 'SE';

export type ShipClassId = 'carrier' | 'battleship' | 'destroyer' | 'submarine' | 'patrol';

export interface ShipClass {
  id: ShipClassId;
  name: string;
  length: number;
  /** Number of the owner's turns the ship must sit out after manoeuvring. */
  cooldown: number;
  /** Maximum cells the ship may travel ahead / astern in a single manoeuvre. */
  mobility: number;
}

export interface Ship {
  id: string;
  classId: ShipClassId;
  bow: Coord;
  heading: Heading;
  length: number;
  hits: boolean[];
  /** Turns (of the owner) remaining before the ship may manoeuvre again. */
  cooldown: number;
}

export type ManeuverKind = 'ahead' | 'astern' | 'port' | 'starboard' | 'rotateCW' | 'rotateCCW';

export interface Maneuver {
  kind: ManeuverKind;
  /** Only used by 'ahead' / 'astern'. Defaults to 1. */
  distance?: number;
}

export type ShotOutcome = 'hit' | 'miss';

export interface ShotRecord {
  r: number;
  c: number;
  result: ShotOutcome;
  /** Global half-turn counter at the time of the shot. */
  turn: number;
}

export interface SunkInfo {
  shipId: string;
  classId: ShipClassId;
  cells: Coord[];
}

export interface ShotResult {
  coord: Coord;
  result: ShotOutcome;
  shipId?: string;
  /** True when the segment was already damaged before this shot. */
  alreadyDamaged: boolean;
  sunk?: SunkInfo;
  gameOver: boolean;
}

export interface Splash {
  quadrant: Quadrant;
  /** Global half-turn counter when the splash was created. */
  turn: number;
}

export type PlayerIndex = 0 | 1;

/** What a player saw arrive on their own waters, captured when the shot landed. */
export interface IncomingShot {
  r: number;
  c: number;
  result: ShotOutcome;
  /** Global half-turn counter when the shot landed. */
  turn: number;
  /** Class of the ship hit, if any. Known to the defender, never to the shooter. */
  classId?: ShipClassId;
  sunk: boolean;
}

export interface PlayerState {
  index: PlayerIndex;
  name: string;
  isAI: boolean;
  ships: Ship[];
  /** Shots this player has fired at the opponent. */
  shots: ShotRecord[];
  /** Splashes visible to this player (caused by the opponent's manoeuvres). */
  splashes: Splash[];
  /** The most recent shot this player received, as it was at the moment of impact. */
  lastIncoming?: IncomingShot;
}

export type Phase = 'fire' | 'maneuver' | 'over';

export type GameMode = 'ai' | 'local';

export type LogKind = 'shot' | 'move' | 'system';

export interface LogEntry {
  turn: number;
  by: PlayerIndex;
  kind: LogKind;
  /** Move entries reveal which ship moved and how – only the mover may see them. */
  text: string;
}

export interface GameState {
  mode: GameMode;
  players: [PlayerState, PlayerState];
  current: PlayerIndex;
  phase: Phase;
  /** Global half-turn counter. Increments every time a player ends their turn. */
  turn: number;
  winner?: PlayerIndex;
  /** Result of the most recent shot, for the UI. */
  lastShot?: ShotResult & { by: PlayerIndex };
  /** Ship the current player has already moved this turn (if any). */
  maneuveredShipId?: string;
  log: LogEntry[];
}
