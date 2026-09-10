import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AI_PROFILES,
  Difficulty,
  GameState,
  HEADINGS,
  QUADRANT_NAMES,
  SHIP_CLASSES,
  Ship,
  ShipClassId,
  cellsOf,
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
 * Games run long, so an interrupted match is worth keeping. The save is a plain
 * JSON snapshot of the engine state – the engine holds no functions or classes.
 */
export async function saveGame(state: GameState, difficulty: Difficulty): Promise<void> {
  if (state.phase === 'over') {
    await clearGame();
    return;
  }
  const payload: SavedGame = { version: 1, savedAt: Date.now(), difficulty, state };
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
    typeof v.text === 'string'
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
  return (
    isRecord(v.sunk) &&
    typeof v.sunk.shipId === 'string' &&
    isKeyOf(SHIP_CLASSES, v.sunk.classId) &&
    Array.isArray(v.sunk.cells) &&
    v.sunk.cells.every(isCell)
  );
}

function isPlayer(v: unknown, index: 0 | 1): boolean {
  return (
    isRecord(v) &&
    v.index === index &&
    typeof v.name === 'string' &&
    typeof v.isAI === 'boolean' &&
    Array.isArray(v.ships) &&
    v.ships.length > 0 &&
    v.ships.every(isShip) &&
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
  return isPlayer(v.players[0], 0) && isPlayer(v.players[1], 1);
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

export async function loadGame(): Promise<SavedGame | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
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
