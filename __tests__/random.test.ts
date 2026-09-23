import { pick, seededRng } from '../src/engine/random';

describe('pick', () => {
  test('an empty list has nothing to pick, and says so rather than answering undefined', () => {
    expect(() => pick(seededRng(1), [])).toThrow(RangeError);
  });

  // The README's balance numbers are seeded runs, so a non-empty list must cost
  // exactly the one draw it always did, mapped to the same element.
  test('a non-empty list costs one draw, mapped the way it always was', () => {
    const items = ['a', 'b', 'c', 'd', 'e'];
    const rng = seededRng(42);
    const reference = seededRng(42);
    for (let i = 0; i < 50; i++) expect(pick(rng, items)).toBe(items[Math.floor(reference() * items.length)]);
  });
});
