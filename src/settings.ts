import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Lamp } from './ui/theme';

const KEY = 'battleshiple:settings:v1';

export interface Settings {
  /** Plotting-room lighting: follow the device, or force day or night. */
  lamp: Lamp;
}

export const DEFAULT_SETTINGS: Settings = { lamp: 'auto' };

interface SavedSettings {
  version: 1;
  settings: Settings;
}

const LAMPS: readonly Lamp[] = ['auto', 'day', 'night'];

function isValid(value: unknown): value is SavedSettings {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Partial<SavedSettings>;
  return v.version === 1 && typeof v.settings === 'object' && v.settings !== null && LAMPS.includes(v.settings.lamp);
}

/**
 * Same contract as saved games: a corrupt or foreign entry is discarded in
 * favour of defaults, and storage failures never reach the caller. A broken
 * preference must never stop the game from starting.
 */
export async function loadSettings(): Promise<Settings> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed: unknown = JSON.parse(raw);
    if (!isValid(parsed)) {
      await AsyncStorage.removeItem(KEY).catch(() => undefined);
      return DEFAULT_SETTINGS;
    }
    return { ...DEFAULT_SETTINGS, ...parsed.settings };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveSettings(settings: Settings): Promise<void> {
  const payload: SavedSettings = { version: 1, settings };
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
  } catch {
    // A preference that fails to persist is not worth interrupting play for.
  }
}
