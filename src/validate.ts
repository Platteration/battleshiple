import type { Difficulty } from './engine';
import type { AppSettings, ReduceMotionSetting } from './settings';

/**
 * Records loaded from storage are untrusted: they may come from an older build
 * (missing fields), a newer one (unknown values), a device backup, or another
 * app on the same web origin. Every value here is clamped to one the app knows
 * before anything indexes a table with it — `AI_PROFILES[difficulty]` is read
 * without a fallback, and a `reduceMotion` the hook does not recognise would
 * be neither "follow the system" nor a choice.
 *
 * The tables are typed `Record<Union, true>` so that adding a member to the
 * union without adding it here fails the type check, and they are looked up by
 * own property only: on a plain object `'constructor' in DIFFICULTIES` is true.
 *
 * This module is free of React Native and the DOM so it can be tested bare.
 * Only the defaults live elsewhere: they are passed in, because `settings.tsx`
 * pulls in React. The saved game has its own validator in `storage.ts`, which
 * is older and shaped around the engine's invariants; the rule is the shape,
 * not the file.
 */

export const DIFFICULTIES: Record<Difficulty, true> = { easy: true, normal: true, hard: true };
export const REDUCE_MOTION: Record<ReduceMotionSetting, true> = { system: true, on: true, off: true };

type Fields = Record<string, unknown>;

function fields(raw: unknown): Fields {
  return raw !== null && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Fields) : {};
}

/** True when `value` is one of `table`'s own keys — never an inherited one like `constructor` or `toString`. */
function has<T extends string | number>(table: Record<T, unknown>, value: unknown): value is T {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  return Object.prototype.hasOwnProperty.call(table, value);
}

/** `value` when it is one of `table`'s own keys, else `fallback`. */
function pick<T extends string | number>(value: unknown, table: Record<T, unknown>, fallback: T): T {
  return has(table, value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

/**
 * The stored settings, with every unknown or missing field replaced from
 * `fallback` — field by field, never the record as a whole, so one value a
 * later build wrote does not cost the player the rest of their choices.
 */
export function cleanSettings(raw: unknown, fallback: AppSettings): AppSettings {
  const s = fields(raw);
  return {
    haptics: bool(s.haptics, fallback.haptics),
    reduceMotion: pick(s.reduceMotion, REDUCE_MOTION, fallback.reduceMotion),
    difficulty: pick(s.difficulty, DIFFICULTIES, fallback.difficulty),
  };
}
