import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import {
  AI_PROFILES,
  Difficulty,
  FLEET,
  GameState,
  HEADINGS,
  PlayerState,
  QUADRANT_NAMES,
  SHIP_CLASSES,
  SPLASH_VISIBLE_TURNS,
  Ship,
  ShipClassId,
  cellsOf,
  fleetSunk,
  inBounds,
} from './engine';

/**
 * Every key the app writes, so a rename cannot happen in one file and orphan
 * the record behind it. The savegame keeps its colon-form key: it predates the
 * `<app>.<record>.v<N>` scheme the newer record follows, and renaming it for
 * spelling would put every player's unfinished battle through a migration for
 * nothing. Both are pinned by `__tests__/settings-contract.test.ts`.
 */
export const STORAGE_KEYS = {
  savegame: 'battleshiple:savegame:v1',
  settings: 'battleshiple.settings.v1',
} as const;

const KEY = STORAGE_KEYS.savegame;

/**
 * The record stored under `key`, parsed and nothing more: `unknown` until a
 * validator has been over it. Undefined when there is none, or when it cannot
 * be read back — either way the caller's default applies.
 */
export async function loadJSON(key: string): Promise<unknown> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as unknown) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Writes the store refused, by key: the write's number, what the key should now
 * hold (null for removed), and what the store held when it refused – what the
 * value would have replaced. A refused write never interrupts play, but it is
 * never silent either. On the web the store is the origin's localStorage, and a
 * GitHub Pages project site shares that origin, and its few megabytes, with
 * every other app the account publishes: once one of them has filled it, every
 * save here throws. Swallowing that let a battle be played to its last turn with
 * nothing written and nothing said, and a reload then offered nothing to resume.
 * So a refused write is kept here, `StorageNoteFrame` says so across the bottom
 * of every screen while any is, and each is tried again (`retryRefused`) after
 * the next write the store accepts, whenever another page on the origin changes
 * the store (which is how room comes back there), and whenever the app or page
 * is hidden or shown again. That is how saving resumes by itself once there is
 * room. A phone whose disk is full refuses the same way.
 *
 * The store is shared, and this module's memory is not: every tab of the game
 * has its own. So a refused value is written back only while the store still
 * holds what it held when the value was refused. A battle another tab saved
 * since is newer than the one refused here, and is left where it is: replaying
 * the refused one over it deleted the newer battle with nothing said.
 */
const refused = new Map<string, { id: number; value: string | null; over: string | null | undefined }>();
/** The newest write asked of each key here, so that a refused value is only retried while nothing newer was asked. */
const newest = new Map<string, number>();
let writes = 0;
let catchingUp = false;
/** A retry asked for while one was running: the running one goes round again. */
let again = false;
const listeners = new Set<() => void>();
/** Stops listening for room once nothing is refused; null while not listening. */
let unwatch: (() => void) | null = null;

/** True while the store has refused the latest write of any record. */
export function storageRefused(): boolean {
  return refused.size > 0;
}

/** Calls `listener` whenever `storageRefused()` may have changed; returns the unsubscribe. */
export function onStorageRefusedChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Tells the listeners when the refused set has grown or emptied, and listens for room only while it is not empty. */
function refusedChanged(before: number): void {
  if (refused.size === before) return;
  for (const listener of listeners) listener();
  if (refused.size > 0 && !unwatch) {
    const app = AppState.addEventListener('change', retryRefused);
    // On the web: another page on the origin – another app on a shared GitHub
    // Pages address, or another tab of this one – changed the store, and may
    // have made room. A page's own changes raise no storage event in it. React
    // Native's global `window` has no addEventListener.
    const page = typeof window !== 'undefined' && typeof window.addEventListener === 'function' ? window : null;
    page?.addEventListener('storage', retryRefused);
    unwatch = () => {
      // react-native-web hands back no subscription where there is no document.
      app?.remove();
      page?.removeEventListener('storage', retryRefused);
    };
  } else if (refused.size === 0 && unwatch) {
    unwatch();
    unwatch = null;
  }
}

/** What the store holds under `key` now, or undefined when it cannot be read. */
async function stored(key: string): Promise<string | null | undefined> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return undefined;
  }
}

async function write(key: string, value: string | null): Promise<boolean> {
  const id = ++writes;
  newest.set(key, id);
  let ok = true;
  try {
    if (value === null) await AsyncStorage.removeItem(key);
    else await AsyncStorage.setItem(key, value);
  } catch {
    ok = false;
  }
  // What the refused value would have replaced: it is written back only while the store still holds this.
  const over = ok ? undefined : await stored(key);
  const before = refused.size;
  if (ok) refused.delete(key);
  // A write that failed after a newer one to the same key was asked has nothing
  // left to retry: the newer one is what the key should hold, and it reports for itself.
  else if (newest.get(key) === id) refused.set(key, { id, value, over });
  refusedChanged(before);
  if (ok && refused.size > 0) retryRefused();
  return ok;
}

/**
 * Write what the store refused again, each record once: after a write the store
 * accepted, when another page on the origin changed the store, and when the app
 * or page is hidden or shown. A record is written only while its refused value
 * is still the newest one asked of its key, here and in the store: on the web a
 * write takes effect when it is called, so a value refused earlier must not land
 * over one written since, by this page or by another tab. One that another tab
 * has overwritten is let go – the store holds the newer value – and is no longer
 * reported as refused.
 */
function retryRefused(): void {
  if (catchingUp) again = true;
  else void catchUp();
}

async function catchUp(): Promise<void> {
  catchingUp = true;
  try {
    do {
      again = false;
      for (const [key, entry] of [...refused]) {
        if (newest.get(key) !== entry.id) continue;
        const now = await stored(key);
        // A newer write to the key was asked here while it was being read: that one reports for itself.
        if (newest.get(key) !== entry.id) continue;
        // The store cannot be read now: the record stays refused, and said, for the next try.
        if (now === undefined) continue;
        // Another tab wrote the key after the refusal. Unknown when the store could not be read
        // then: with nothing to say another tab wrote, the value is this one's to write back.
        if (entry.over !== undefined && now !== entry.over) {
          const before = refused.size;
          refused.delete(key);
          refusedChanged(before);
          continue;
        }
        await write(key, entry.value);
      }
    } while (again);
  } finally {
    catchingUp = false;
  }
}

/** True when the write reached the store. A refusal never interrupts play; `storageRefused()` says so instead. */
export async function saveJSON(key: string, value: unknown): Promise<boolean> {
  let text: string;
  try {
    text = JSON.stringify(value);
  } catch {
    return false;
  }
  return write(key, text);
}

export function safeParse<T>(text: string): T {
  return JSON.parse(text, (key, value) => {
    return key === '__proto__' || key === 'constructor' || key === 'prototype' ? undefined : value;
  }) as T;
}

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
/**
 * The opponent's latest manoeuvre; the rest expire at the end of the turn. A
 * splash lives `2 * SPLASH_VISIBLE_TURNS` half-turns (the old `SPLASH_TTL`),
 * and the ceiling stays twice that.
 */
const MAX_SPLASHES = 2 * SPLASH_VISIBLE_TURNS * 2;
/** The engine's longest line – a manoeuvre report – runs to about eighty. */
const MAX_LOG_TEXT = 200;
/** Names come from `playerNames` and `src/ui/opponents.ts`: the longest is 'Capt. Varga' (11), and older saves carry 'Admiral Byte' (12). */
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
  // A failed autosave never interrupts play; `storageRefused()` says so instead,
  // and the save is written again once there is room (`retryRefused`).
  await write(KEY, JSON.stringify(payload));
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
    // The newest is drawn in the report strip and every one in the signal log;
    // the engine writes about eighty characters, and nothing in the app writes a
    // megabyte into a <Text>.
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

/**
 * What the opponent's last shot did to you, as the game screen's report strip
 * draws it: `coordLabel` of the cell, and `SHIP_CLASSES[classId].name` for a hit.
 */
function isIncoming(v: unknown): boolean {
  return (
    isRecord(v) &&
    isCell(v) &&
    (v.result === 'hit' || v.result === 'miss') &&
    isCount(v.turn) &&
    (v.classId === undefined || isKeyOf(SHIP_CLASSES, v.classId)) &&
    typeof v.sunk === 'boolean'
  );
}

function isPose(v: unknown): boolean {
  return isRecord(v) && isCell(v.bow) && HEADINGS.some((h) => h === v.heading);
}

/**
 * The part of a manoeuvre's record the game screen reads to play your own move
 * out once on the board: which hull, and the pose it left and reached. The rest
 * of the record is read by nothing yet; whatever comes to read it extends this.
 */
function isMoveRecord(v: unknown): boolean {
  return isRecord(v) && typeof v.shipId === 'string' && isPose(v.from) && isPose(v.to);
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

/**
 * Drop, in place, the two fields only the screens read and only for show: a
 * player's `lastIncoming`, the report strip's line about the opponent's last
 * shot, and a log entry's `move`, which lets the board play your own manoeuvre
 * out once. Neither is in a save older than the feature that wrote it, and
 * every screen draws a state without them – the line is not shown, the move not
 * played – so one that does not hold up costs that and nothing more, not the
 * match. Kept, the renderer indexed `SHIP_CLASSES` with whatever class the field
 * named ('constructor' drew "hit your Object", an unknown one threw, and the
 * battle was set aside on every Resume) and read a pose off `null`. Run after
 * `trimCounts`, so the log it walks is already within its ceiling.
 */
function dropUnreadable(v: unknown): void {
  if (!isRecord(v) || !isRecord(v.state)) return;
  const state = v.state;
  if (Array.isArray(state.players)) {
    for (const player of state.players) {
      if (isRecord(player) && player.lastIncoming !== undefined && !isIncoming(player.lastIncoming)) delete player.lastIncoming;
    }
  }
  if (Array.isArray(state.log)) {
    for (const entry of state.log) {
      if (isRecord(entry) && entry.move !== undefined && !isMoveRecord(entry.move)) delete entry.move;
    }
  }
}

export async function loadGame(): Promise<SavedGame | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = safeParse(raw);
    trimCounts(parsed);
    dropUnreadable(parsed);
    if (!isValid(parsed)) {
      await clearGame();
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Through the same write as a save, so that clearing is the newest thing asked
 * of the key: a save the store refused earlier is then never written back over
 * a battle that has since finished.
 */
export async function clearGame(): Promise<void> {
  await write(KEY, null);
}
