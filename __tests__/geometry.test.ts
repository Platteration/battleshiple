import { quadrantOf, rotateCCW, rotateCW, shipCells, coordLabel } from '../src/engine/geometry';

describe('geometry', () => {
  test('ship cells extend backwards from the bow', () => {
    expect(shipCells({ r: 2, c: 5 }, 'N', 3)).toEqual([
      { r: 2, c: 5 },
      { r: 3, c: 5 },
      { r: 4, c: 5 },
    ]);
    expect(shipCells({ r: 7, c: 4 }, 'E', 2)).toEqual([
      { r: 7, c: 4 },
      { r: 7, c: 3 },
    ]);
    expect(shipCells({ r: 1, c: 1 }, 'S', 2)).toEqual([
      { r: 1, c: 1 },
      { r: 0, c: 1 },
    ]);
    expect(shipCells({ r: 1, c: 1 }, 'W', 2)).toEqual([
      { r: 1, c: 1 },
      { r: 1, c: 2 },
    ]);
  });

  test('rotation cycles through headings', () => {
    expect(rotateCW('N')).toBe('E');
    expect(rotateCW('W')).toBe('N');
    expect(rotateCCW('N')).toBe('W');
    expect(rotateCCW('E')).toBe('N');
  });

  test('quadrants split the board in four', () => {
    expect(quadrantOf({ r: 0, c: 0 })).toBe('NW');
    expect(quadrantOf({ r: 4, c: 4 })).toBe('NW');
    expect(quadrantOf({ r: 0, c: 5 })).toBe('NE');
    expect(quadrantOf({ r: 5, c: 0 })).toBe('SW');
    expect(quadrantOf({ r: 9, c: 9 })).toBe('SE');
  });

  test('labels', () => {
    expect(coordLabel({ r: 0, c: 0 })).toBe('A1');
    expect(coordLabel({ r: 9, c: 9 })).toBe('J10');
  });
});
