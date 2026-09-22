import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Difficulty } from './engine';
import { loadJSON, saveJSON, STORAGE_KEYS } from './storage';
import { setHapticsEnabled } from './ui/feedback';
import { cleanSettings } from './validate';

export type ReduceMotionSetting = 'system' | 'on' | 'off';

export interface AppSettings {
  /** Haptic feedback on shots, hits and manoeuvres. */
  haptics: boolean;
  /** Hold the splash ripples still. `system` follows the device's accessibility setting. */
  reduceMotion: ReduceMotionSetting;
  /** The computer's skill, chosen on the menu and kept across launches. */
  difficulty: Difficulty;
}

export const DEFAULT_SETTINGS: AppSettings = {
  haptics: true,
  reduceMotion: 'system',
  difficulty: 'normal',
};

const KEY = STORAGE_KEYS.settings;

export interface SettingsContextValue {
  settings: AppSettings;
  update: (patch: Partial<AppSettings>) => void;
  /** Back to `DEFAULT_SETTINGS`. Touches the settings record only: the saved game is not a preference. */
  reset: () => void;
  /** The stored record has been read. Until then `settings` is the defaults, and the menu holds its skill control. */
  loaded: boolean;
}

const SettingsContext = createContext<SettingsContextValue>({
  settings: DEFAULT_SETTINGS,
  update: () => {},
  reset: () => {},
  loaded: false,
});

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  // Changes made before the stored record has come back. The menu is drawn at
  // once and a tap on it can beat the read, so what is on disk is merged under
  // those rather than written over them — and nothing is written until then,
  // so the record on disk is never one with a field the player did not choose.
  const early = useRef<Partial<AppSettings>>({});
  const read = useRef(false);
  // The settings as of the last call, kept beside the state so that `update`
  // can decide and write at the moment it is called. Deciding inside the
  // state updater put the write where React runs it — deferred to the render
  // for a second update outside an event — and a read that completed in
  // between wrote the merged record first and then had a stale one written
  // over it.
  const latest = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let alive = true;
    // Clamped on the way in: an unknown difficulty would index AI_PROFILES to
    // undefined on the computer's first turn.
    void loadJSON(KEY).then((stored) => {
      if (!alive) return;
      const next = { ...cleanSettings(stored, DEFAULT_SETTINGS), ...early.current };
      read.current = true;
      latest.current = next;
      setSettings(next);
      setLoaded(true);
      if (Object.keys(early.current).length > 0) void saveJSON(KEY, next);
    });
    return () => {
      alive = false;
    };
  }, []);

  const update = useCallback((patch: Partial<AppSettings>) => {
    const next = { ...latest.current, ...patch };
    latest.current = next;
    if (read.current) void saveJSON(KEY, next);
    else early.current = { ...early.current, ...patch };
    setSettings(next);
  }, []);

  // Nothing here records what the player has already seen: the app has no
  // first-run flag. If one is added it belongs in this record and is the one
  // field a reset keeps.
  const reset = useCallback(() => update({ ...DEFAULT_SETTINGS }), [update]);

  // The module flag is what gates every call in feedback.ts, so the switch
  // reaches shots fired from anywhere, not only from components that render
  // under this provider.
  useEffect(() => setHapticsEnabled(settings.haptics), [settings.haptics]);

  const value = useMemo(() => ({ settings, update, reset, loaded }), [settings, update, reset, loaded]);
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings(): SettingsContextValue {
  return useContext(SettingsContext);
}
