import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_PROFILES,
  Difficulty,
  FLEET,
  GameState,
  HEADINGS,
  PlayerState,
  QUADRANT_NAMES,
  SHIP_CLASSES,
  SPLASH_TTL,
  Ship,
  ShipClassId,
  cellsOf,
  fleetSunk,
  inBounds,
} from './engine';

const KEY = 'battleshiple:savegame:v1';

export interface SavedGame {
  version: 1;
  savedAt: number;
  difficulty: Difficulty;
  state: GameState;
}

/**
 * How many of each, not just what shape each is. A save can be correct element
 * by element and still unplayable because of the count: the AI pairs up every
 * recent hit against every other one, so a shot history tens of thousands long
 * hangs the app on Resume rather than merely slowing it down, `visibleLog`
 * filters the whole log on every render of the game screen, and `incomingReport`
 * writes a line per splash. Play cannot come close – one shot and at most one
 * splash per half-turn, and a match is decided in about a hundred – so these are
 * ceilings on the absurd rather than limits on anything real. A save above one
 * is clipped to it on the way in: the count is the only thing wrong with it, and
 * answering a match that went on too long by deleting the match is the one
 * outcome the save exists to prevent.
 */
const MAX_HALF_TURNS = 2000;
/** One shot per half-turn of the player's own. */
const MAX_SHOTS = MAX_HALF_TURNS;
/** A shot line, a move line and the odd system line per half-turn. */
const MAX_LOG = MAX_HALF_TURNS * 4;
/** The opponent's latest manoeuvre; the rest expire at the end of the turn. */
const MAX_SPLASHES = SPLASH_TTL * 2;
/** The engine's longest line – a manoeuvre report – runs to about eighty. */
const MAX_LOG_TEXT = 200;
/** Names come from `playerNames`: the longest is 'Admiral Byte'. */
const MAX_NAME = 40;

/**
 * Games run long, so an interrupted match is worth keeping. The save is a plain
 * JSON snapshot of the engine state – the engine holds no functions or classes.
 */
export async function saveGame(state: GameState, difficulty: Difficulty): Promise<void> {
  if (state.phase === 'over') {
    await clearGame();
    return;
  }
  // Bound what goes out as well as what comes in. The log is the one list a
  // legitimate match grows without limit – two lines a half-turn, and no draw,
  // stalemate or turn limit to stop it – and it is history rather than state:
  // the game screen draws the last four entries and the game-over screen counts
  // the manoeuvres in it, both of which survive losing the oldest lines. A game
  // long enough to cross the ceiling is the last one anyone would want deleted.
  const trimmed = state.log.length > MAX_LOG ? { ...state, log: state.log.slice(-MAX_LOG) } : state;
  const payload: SavedGame = { version: 1, savedAt: Date.now(), difficulty, state: trimmed };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A failed autosave must never interrupt play.
  }
}

/**
 * A save is replayed straight into the engine and the renderer, both of which
 * index into it without re-checking anything: `AI_PROFILES[difficulty]`,
 * `grid[cell.r][cell.c]`, `SHIP_CLASSES[sunk.classId]`, `state.log.filter`. A
 * payload of the wrong shape therefore throws during render rather than merely
 * playing oddly, so every field the two of them touch is checked here before it
 * is handed over. The realistic source of a wrong shape is us – a later build
 * that changes GameState, or a device backup restored from one – not an
 * attacker; the file is app-private.
 */
type Rec = Record<string, unknown>;

function isRecord(v: unknown): v is Rec {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A key actually present on one of the engine's own lookup tables. */
function isKeyOf(table: object, v: unknown): boolean {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(table, v);
}

function isPlayerIndex(v: unknown): boolean {
  return v === 0 || v === 1;
}

/** Turn counters, cooldowns and timestamps: finite, whole and never negative. */
function isCount(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0;
}

/** A string the interface draws: the right type, and small enough to draw. */
function isText(v: unknown, max: number): boolean {
  return typeof v === 'string' && v.length <= max;
}

function isCell(v: unknown): boolean {
  return isRecord(v) && Number.isInteger(v.r) && Number.isInteger(v.c) && inBounds({ r: v.r as number, c: v.c as number });
}

function isShip(v: unknown): v is Ship {
  if (!isRecord(v)) return false;
  if (typeof v.id !== 'string') return false;
  if (!isKeyOf(SHIP_CLASSES, v.classId)) return false;
  if (!HEADINGS.some((h) => h === v.heading)) return false;
  if (!isRecord(v.bow) || !Number.isInteger(v.bow.r) || !Number.isInteger(v.bow.c)) return false;
  if (!isCount(v.cooldown)) return false;
  // The renderer walks `hits` in step with the hull's cells, and `isSunk` reads
  // every one of them, so the two lengths have to agree with the class roster.
  const length = SHIP_CLASSES[v.classId as ShipClassId].length;
  if (v.length !== length) return false;
  if (!Array.isArray(v.hits) || v.hits.length !== length) return false;
  if (!v.hits.every((h) => typeof h === 'boolean')) return false;
  // paintShips indexes the grid with these directly and does not bounds-check.
  return cellsOf(v as unknown as Ship).every(inBounds);
}

function isShot(v: unknown): boolean {
  return (
    isRecord(v) &&
    isCell(v) &&
    (v.result === 'hit' || v.result === 'miss') &&
    isCount(v.turn)
  );
}

function isSplash(v: unknown): boolean {
  return isRecord(v) && isKeyOf(QUADRANT_NAMES, v.quadrant) && isCount(v.turn);
}

function isLogEntry(v: unknown): boolean {
  return (
    isRecord(v) &&
    isCount(v.turn) &&
    isPlayerIndex(v.by) &&
    (v.kind === 'shot' || v.kind === 'move' || v.kind === 'system') &&
    // The last four of these are drawn; the engine writes about eighty
    // characters, and nothing in the app writes a megabyte into a <Text>.
    isText(v.text, MAX_LOG_TEXT)
  );
}

/** The banner the game screen draws from the previous shot. */
function isLastShot(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (!isCell(v.coord)) return false;
  if (v.result !== 'hit' && v.result !== 'miss') return false;
  if (typeof v.alreadyDamaged !== 'boolean' || typeof v.gameOver !== 'boolean') return false;
  if (!isPlayerIndex(v.by)) return false;
  if (v.shipId !== undefined && typeof v.shipId !== 'string') return false;
  if (v.sunk === undefined) return true;
  // Shape is not size here either: `fire` reports a sunk hull as exactly the
  // cells of its class, so the roster gives the count without the array being
  // asked how long it thinks it is.
  return (
    isRecord(v.sunk) &&
    typeof v.sunk.shipId === 'string' &&
    isKeyOf(SHIP_CLASSES, v.sunk.classId) &&
    Array.isArray(v.sunk.cells) &&
    v.sunk.cells.length === SHIP_CLASSES[v.sunk.classId as ShipClassId].length &&
    v.sunk.cells.every(isCell)
  );
}

function isPlayer(v: unknown, index: 0 | 1): boolean {
  return (
    isRecord(v) &&
    v.index === index &&
    // The name is the game screen's header and is in every log line.
    isText(v.name, MAX_NAME) &&
    typeof v.isAI === 'boolean' &&
    Array.isArray(v.ships) &&
    v.ships.length > 0 &&
    // More hulls than the fleet is dealt is a wrong shape, not a long game:
    // there is no honest way to pick which extra ship to drop.
    v.ships.length <= FLEET.length &&
    v.ships.every(isShip) &&
    // `shots` and `splashes` are clipped to their ceilings by `trimCounts`
    // before this runs, so what is left to check is what each element is.
    Array.isArray(v.shots) &&
    v.shots.every(isShot) &&
    Array.isArray(v.splashes) &&
    v.splashes.every(isSplash)
  );
}

function isGameState(v: unknown): boolean {
  if (!isRecord(v)) return false;
  if (v.mode !== 'ai' && v.mode !== 'local') return false;
  if (!isPlayerIndex(v.current)) return false;
  // A finished game is cleared rather than saved, so 'over' is not resumable.
  if (v.phase !== 'fire' && v.phase !== 'maneuver') return false;
  if (!isCount(v.turn)) return false;
  if (v.maneuveredShipId !== undefined && typeof v.maneuveredShipId !== 'string') return false;
  if (v.lastShot !== undefined && !isLastShot(v.lastShot)) return false;
  if (!Array.isArray(v.log) || !v.log.every(isLogEntry)) return false;
  if (!Array.isArray(v.players) || v.players.length !== 2) return false;
  if (!isPlayer(v.players[0], 0) || !isPlayer(v.players[1], 1)) return false;

  // Fields that are each valid on their own and wrong only in combination.
  // These are written as the invariants the app holds, not as the crashes they
  // are known to cause: every one of them describes a state no build of this
  // app can write – the computer fires, manoeuvres and ends its turn in one
  // synchronous block, and `createGame` deals the roles – and every one of them
  // leaves the app with a turn it cannot play, either a throw inside the AI's
  // timer where no error boundary can see it, or a board nobody can move.
  const players = v.players as [PlayerState, PlayerState];
  const current = players[v.current as 0 | 1];

  // A vs-Computer match has exactly one computer and it is player 1. That is
  // the only arrangement `createGame` makes; the game screen shows player 0's
  // board in that mode whoever is to move, and the driver only ever takes a
  // turn for a player marked `isAI`. Every other pairing leaves a side nobody
  // plays: a computer in a pass & play match takes a human's turn, and a
  // vs-Computer match without one waits for a human who is never shown the
  // board.
  if (players[0].isAI) return false;
  if (players[1].isAI !== (v.mode === 'ai')) return false;

  // The computer's turn opens with fire(), which throws outside the firing phase.
  if (current.isAI && v.phase !== 'fire') return false;

  // A ship is recorded as moved only by `maneuver` – in the manoeuvre phase, on
  // one of the mover's own hulls – and `endTurn` clears it as the turn passes.
  // Carried into a firing phase it survives the computer's fire() and then
  // throws out of its maneuver(): 'Only one ship may move per turn'.
  if (v.maneuveredShipId !== undefined) {
    if (v.phase !== 'maneuver') return false;
    if (!current.ships.some((ship) => ship.id === v.maneuveredShipId)) return false;
  }

  // The shot that sinks the last hull ends the game there and then, and a
  // finished game is cleared rather than saved. So a resumable save has both
  // fleets still afloat and nobody has won it: a winner in one is either a
  // game the menu is offering to play past its own ending, or – since the
  // game-over screen indexes the pair with it – an index into nothing.
  if (v.winner !== undefined) return false;
  if (fleetSunk(players[0].ships) || fleetSunk(players[1].ships)) return false;
  return true;
}

function isValid(value: unknown): value is SavedGame {
  return (
    isRecord(value) &&
    value.version === 1 &&
    isCount(value.savedAt) &&
    isKeyOf(AI_PROFILES, value.difficulty) &&
    isGameState(value.state)
  );
}

/** The newest entries are the ones the board draws and the AI hunts from. */
function clip<T>(xs: T[], max: number): T[] {
  // Counted from the front rather than with a negative index: `slice(-0)` is
  // the whole array, so a ceiling of none would keep everything.
  return xs.length > max ? xs.slice(xs.length - max) : xs;
}

/**
 * Clip the three lists a long game grows, in place, on the way in. A count
 * above its ceiling is the only thing wrong with such a save – every element in
 * it is exactly what the validator asks for – so it costs the player their
 * oldest shot markers rather than the match. `saveGame` keeps the log under its
 * own ceiling, so in practice this catches a shot history from a marathon game
 * and anything that did not come from this build at all.
 */
function trimCounts(v: unknown): void {
  if (!isRecord(v) || !isRecord(v.state)) return;
  const state = v.state;
  if (Array.isArray(state.log)) state.log = clip(state.log, MAX_LOG);
  if (!Array.isArray(state.players)) return;
  for (const player of state.players) {
    if (!isRecord(player)) continue;
    if (Array.isArray(player.shots)) player.shots = clip(player.shots, MAX_SHOTS);
    if (Array.isArray(player.splashes)) player.splashes = clip(player.splashes, MAX_SPLASHES);
  }
}

export async function loadGame(): Promise<SavedGame | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    trimCounts(parsed);
    if (!isValid(parsed)) {
      await clearGame();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function clearGame(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Nothing useful to do if the store is unavailable.
  }
}
