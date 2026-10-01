import { CHROME, COMPACT_BELOW, gameLayout, MAX_BOARD, MIN_CELL } from '../src/ui/layout';

const NO_INSETS = { top: 0, bottom: 0, left: 0, right: 0 };

/**
 * The phones the screenshot matrix renders. gameLayout is pure, so each is
 * tested here directly: the Jest window (750x1334) would hide a compact-mode bug.
 */
describe.each([
  ['390x844', { width: 390, height: 844 }, false],
  ['360x640', { width: 360, height: 640 }, true],
  ['430x932', { width: 430, height: 932 }, false],
] as const)('game layout at %s', (_name, window, compact) => {
  const layout = gameLayout(window, NO_INSETS);

  test('picks the compact arrangement only on a short screen', () => {
    expect(layout.compact).toBe(compact);
  });

  test('a cell big enough to tap, on a board that fits the width', () => {
    expect(layout.cell).toBeGreaterThanOrEqual(MIN_CELL);
    expect(layout.boardWidth).toBe(layout.cell * 11);
    expect(layout.boardWidth).toBeLessThanOrEqual(window.width - 24);
  });

  test('the board plus the tallest chrome fits the height', () => {
    expect(layout.boardWidth + (compact ? CHROME.compact : CHROME.regular)).toBeLessThanOrEqual(window.height);
  });
});

test('safe-area insets come out of the space the board may take', () => {
  const bare = gameLayout({ width: 390, height: 844 }, NO_INSETS);
  const notched = gameLayout({ width: 390, height: 844 }, { top: 47, bottom: 34, left: 0, right: 0 });
  expect(notched.cell).toBeLessThan(bare.cell);
  expect(notched.boardWidth + CHROME.regular).toBeLessThanOrEqual(844 - 47 - 34);
});

test('a tablet stops growing the board at the maximum', () => {
  const layout = gameLayout({ width: 1024, height: 1366 }, NO_INSETS);
  expect(layout.boardWidth).toBeLessThanOrEqual(MAX_BOARD);
  expect(layout.compact).toBe(false);
});

test('the compact threshold is the one the screen uses', () => {
  expect(gameLayout({ width: 390, height: COMPACT_BELOW - 1 }, NO_INSETS).compact).toBe(true);
  expect(gameLayout({ width: 390, height: COMPACT_BELOW }, NO_INSETS).compact).toBe(false);
});

test('an 8-cell board gets bigger cells in the same space', () => {
  const ten = gameLayout({ width: 390, height: 844 }, NO_INSETS);
  const eight = gameLayout({ width: 390, height: 844 }, NO_INSETS, 8);
  expect(eight.cell).toBeGreaterThan(ten.cell);
  expect(eight.boardWidth).toBe(eight.cell * 9);
});
