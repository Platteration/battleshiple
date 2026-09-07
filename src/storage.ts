import AsyncStorage from '@react-native-async-storage/async-storage';
import { Difficulty, GameState } from './engine';

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

function isValid(value: unknown): value is SavedGame {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SavedGame>;
  if (v.version !== 1 || !v.state) return false;
  const s = v.state;
  return (
    Array.isArray(s.players) &&
    s.players.length === 2 &&
    s.players.every((p) => Array.isArray(p.ships) && Array.isArray(p.shots) && Array.isArray(p.splashes)) &&
    typeof s.turn === 'number' &&
    (s.phase === 'fire' || s.phase === 'maneuver')
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
