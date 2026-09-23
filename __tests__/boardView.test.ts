import { makeShip } from '../src/engine/ships';
import { PlayerState, ShotRecord } from '../src/engine/types';
import { buildFleetView, buildTrackingView, CellView, emptyGrid, Grid, paintPreview, paintShips } from '../src/ui/boardView';

/** Every cell `has` holds for, as "r,c". Rows and columns differ throughout, so a transposed index shows. */
function where(grid: Grid, has: (cell: CellView) => boolean): string[] {
  const out: string[] = [];
  grid.forEach((row, r) => row.forEach((cell, c) => has(cell) && out.push(`${r},${c}`)));
  return out;
}

function player(shots: ShotRecord[] = []): PlayerState {
  return { index: 0, name: 'A', isAI: false, ships: [], shots, splashes: [] };
}

describe('board view', () => {
  test('a hull is painted on its own cells, bow first, with the damage on the segment that took it', () => {
    const destroyer = { ...makeShip('destroyer', { r: 2, c: 7 }, 'E'), hits: [false, true, false] };
    const grid = emptyGrid();
    paintShips(grid, [destroyer]);
    expect(where(grid, (cell) => cell.ship !== undefined)).toEqual(['2,5', '2,6', '2,7']);
    expect(where(grid, (cell) => cell.ship?.isBow === true)).toEqual(['2,7']);
    expect(where(grid, (cell) => cell.ship?.hit === true)).toEqual(['2,6']);
  });

  test('the latest shot at a cell is the one shown, and the target is the cell locked', () => {
    const shots: ShotRecord[] = [
      { r: 1, c: 8, result: 'miss', turn: 0 },
      { r: 6, c: 3, result: 'miss', turn: 2 },
      { r: 1, c: 8, result: 'hit', turn: 4 },
    ];
    const grid = buildTrackingView(player(shots), player(), 10, { r: 4, c: 9 });
    expect(where(grid, (cell) => cell.shot !== undefined)).toEqual(['1,8', '6,3']);
    expect(grid[1]?.[8]?.shot).toEqual({ result: 'hit', age: 6 });
    expect(grid[6]?.[3]?.shot).toEqual({ result: 'miss', age: 8 });
    expect(where(grid, (cell) => cell.target === true)).toEqual(['4,9']);
  });

  test('on the fleet board a shot on a hull is left to the hull, and one in open water is shown', () => {
    const me = { ...player(), ships: [makeShip('patrol', { r: 8, c: 1 }, 'N')] };
    const enemy = player([
      { r: 9, c: 1, result: 'hit', turn: 1 },
      { r: 0, c: 5, result: 'miss', turn: 3 },
    ]);
    const grid = buildFleetView(me, enemy, 5);
    expect(where(grid, (cell) => cell.shot !== undefined)).toEqual(['0,5']);
  });

  test('a preview that runs off the board paints the cells on it and skips the rest', () => {
    const grid = emptyGrid();
    paintPreview(grid, [{ r: -1, c: 3 }, { r: 0, c: 3 }, { r: 3, c: 10 }, { r: 3, c: 9 }], false);
    expect(where(grid, (cell) => cell.preview === 'bad')).toEqual(['0,3', '3,9']);
  });
});
