import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';
import { pick, randomInt, seededRng, shuffled } from '../src/engine/random';

/** Counts how many values a run draws, which is the property `sort` broke. */
function countingRng(seed: number) {
  const inner = seededRng(seed);
  let draws = 0;
  const rng = () => {
    draws += 1;
    return inner();
  };
  return { rng, draws: () => draws };
}

describe('seeded rng', () => {
  test('the same seed replays the same stream', () => {
    const a = seededRng(99);
    const b = seededRng(99);
    const first = Array.from({ length: 50 }, () => a());
    const second = Array.from({ length: 50 }, () => b());
    expect(first).toEqual(second);
    expect(new Set(first).size).toBeGreaterThan(40); // not a constant stream
    expect(first.every((v) => v >= 0 && v < 1)).toBe(true);
  });

  test('different seeds diverge', () => {
    const a = Array.from({ length: 20 }, seededRng(1));
    const b = Array.from({ length: 20 }, seededRng(2));
    expect(a).not.toEqual(b);
  });

  test('randomInt stays in range and pick never falls off the end', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 500; i++) {
      const n = randomInt(rng, 10);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(10);
    }
    const items = ['a', 'b', 'c'];
    const r2 = seededRng(8);
    for (let i = 0; i < 200; i++) expect(items).toContain(pick(r2, items));
  });
});

describe('shuffled', () => {
  test('is a permutation and is reproducible for a seed', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8];
    const a = shuffled(seededRng(42), items);
    const b = shuffled(seededRng(42), items);
    expect(a).toEqual(b);
    expect([...a].sort((x, y) => x - y)).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // input untouched
  });

  test('consumes exactly n-1 draws, so later draws never shift', () => {
    // This is the regression. `sort` with a random comparator calls it an
    // implementation-defined number of times, so the same seed produced
    // different downstream values on V8 and Hermes.
    for (const n of [0, 1, 2, 5, 9, 17]) {
      const { rng, draws } = countingRng(3);
      shuffled(rng, Array.from({ length: n }, (_, i) => i));
      expect(draws()).toBe(Math.max(0, n - 1));
    }
  });

  test('the value drawn after a shuffle does not depend on the shuffle', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const withShuffle = (() => {
      const rng = seededRng(5);
      shuffled(rng, items);
      return rng();
    })();
    const withoutShuffle = (() => {
      const rng = seededRng(5);
      for (let i = 0; i < items.length - 1; i++) rng(); // same fixed cost
      return rng();
    })();
    expect(withShuffle).toBe(withoutShuffle);
  });

  test('no source file shuffles with a random sort comparator', () => {
    // A unit test on `shuffled` cannot stop the one-liner reappearing somewhere
    // else, and the failure it causes is invisible on the machine that writes it
    // — it only shows up on a different JS engine. So guard the source directly.
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') || full.endsWith('.tsx') ? [full] : [];
      });

    // Strip comments first: this very antipattern is quoted in the docs for
    // `shuffled` above, and a guard that trips on its own explanation is useless.
    const stripComments = (src: string) =>
      src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    const offenders = walk(join(__dirname, '..', 'src')).filter((file) =>
      /\.sort\(\s*\(\s*\)\s*=>/.test(stripComments(readFileSync(file, 'utf8'))),
    );
    expect(offenders).toEqual([]);
  });

  test('every position is reachable, so the shuffle is not degenerate', () => {
    const rng = seededRng(11);
    const seen = new Map<string, Set<number>>();
    for (let i = 0; i < 2000; i++) {
      shuffled(rng, ['a', 'b', 'c', 'd']).forEach((item, idx) => {
        if (!seen.has(item)) seen.set(item, new Set());
        seen.get(item)!.add(idx);
      });
    }
    for (const positions of seen.values()) expect(positions.size).toBe(4);
  });
});
