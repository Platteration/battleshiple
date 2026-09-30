/** Small deterministic PRNG (mulberry32) so tests and replays are reproducible. */
export type Rng = () => number;

export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomInt(rng: Rng, maxExclusive: number): number {
  return Math.floor(rng() * maxExclusive);
}

/** A uniformly chosen element. An empty list has none to give, so it throws rather than hand back undefined. */
export function pick<T>(rng: Rng, items: readonly T[]): T {
  if (items.length === 0) throw new RangeError('pick: the list is empty');
  // An Rng answers in [0, 1), so the index is in [0, items.length).
  return items[randomInt(rng, items.length)]!;
}

/**
 * Fisher-Yates shuffle.
 *
 * `[...xs].sort(() => rng() - 0.5)` is the tempting one-liner and it is wrong
 * twice over: the comparator is non-transitive, so the permutation is biased,
 * and `sort` calls it an implementation-defined number of times. V8 and Hermes
 * therefore draw a different COUNT of values from `rng`, and every subsequent
 * draw diverges from the same seed — which breaks seeded replays, the daily
 * puzzle, and any server-side re-derivation of a turn.
 *
 * This consumes exactly `items.length - 1` values, on every engine.
 */
export function shuffled<T>(rng: Rng, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randomInt(rng, i + 1);
    // Both indices are in [0, i], inside the array.
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

export const defaultRng: Rng = () => Math.random();
