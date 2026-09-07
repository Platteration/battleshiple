import {
  applyManeuver,
  availableManeuvers,
  checkManeuver,
  cooldownFor,
  projectedCells,
} from '../src/engine/maneuver';
import { makeShip } from '../src/engine/ships';

describe('maneuvers', () => {
  test('ahead / astern move along the heading up to mobility', () => {
    const patrol = makeShip('patrol', { r: 5, c: 5 }, 'N');
    expect(checkManeuver(patrol, { kind: 'ahead', distance: 2 }, [patrol]).ok).toBe(true);
    expect(projectedCells(patrol, { kind: 'ahead', distance: 2 })).toEqual([
      { r: 3, c: 5 },
      { r: 4, c: 5 },
    ]);
    expect(checkManeuver(patrol, { kind: 'ahead', distance: 3 }, [patrol])).toMatchObject({ ok: false });
    expect(projectedCells(patrol, { kind: 'astern', distance: 1 })).toEqual([
      { r: 6, c: 5 },
      { r: 7, c: 5 },
    ]);
  });

  test('carrier mobility is 1', () => {
    const carrier = makeShip('carrier', { r: 5, c: 5 }, 'E');
    expect(checkManeuver(carrier, { kind: 'ahead', distance: 1 }, [carrier]).ok).toBe(true);
    expect(checkManeuver(carrier, { kind: 'ahead', distance: 2 }, [carrier]).ok).toBe(false);
  });

  test('port / starboard shift one cell sideways', () => {
    const ship = makeShip('destroyer', { r: 5, c: 5 }, 'N');
    expect(projectedCells(ship, { kind: 'starboard' })[0]).toEqual({ r: 5, c: 6 });
    expect(projectedCells(ship, { kind: 'port' })[0]).toEqual({ r: 5, c: 4 });
    const east = makeShip('destroyer', { r: 5, c: 5 }, 'E');
    expect(projectedCells(east, { kind: 'starboard' })[0]).toEqual({ r: 6, c: 5 });
    expect(projectedCells(east, { kind: 'port' })[0]).toEqual({ r: 4, c: 5 });
  });

  test('rotation pivots on the bow', () => {
    const ship = makeShip('destroyer', { r: 5, c: 5 }, 'N');
    expect(projectedCells(ship, { kind: 'rotateCW' })).toEqual([
      { r: 5, c: 5 },
      { r: 5, c: 4 },
      { r: 5, c: 3 },
    ]);
    expect(projectedCells(ship, { kind: 'rotateCCW' })).toEqual([
      { r: 5, c: 5 },
      { r: 5, c: 6 },
      { r: 5, c: 7 },
    ]);
  });

  test('cannot move off the board or through another ship', () => {
    const edge = makeShip('patrol', { r: 0, c: 0 }, 'N');
    expect(checkManeuver(edge, { kind: 'ahead', distance: 1 }, [edge]).ok).toBe(false);
    expect(checkManeuver(edge, { kind: 'port' }, [edge]).ok).toBe(false);
    expect(checkManeuver(edge, { kind: 'starboard' }, [edge]).ok).toBe(true);

    const mover = makeShip('patrol', { r: 5, c: 5 }, 'N');
    const blocker = makeShip('submarine', { r: 4, c: 5 }, 'E');
    expect(checkManeuver(mover, { kind: 'ahead', distance: 1 }, [mover, blocker]).ok).toBe(false);
    expect(checkManeuver(mover, { kind: 'astern', distance: 1 }, [mover, blocker]).ok).toBe(true);
  });

  test('cooldown grows with damage and blocks further moves', () => {
    const ship = makeShip('destroyer', { r: 5, c: 5 }, 'N');
    expect(cooldownFor(ship)).toBe(2);
    ship.hits[1] = true;
    expect(cooldownFor(ship)).toBe(3);
    const moved = applyManeuver(ship, { kind: 'ahead', distance: 1 });
    expect(moved.cooldown).toBe(3);
    expect(moved.hits).toEqual([false, true, false]);
    expect(checkManeuver(moved, { kind: 'ahead', distance: 1 }, [moved])).toMatchObject({ ok: false });
  });

  test('sunk ships cannot move', () => {
    const ship = makeShip('patrol', { r: 5, c: 5 }, 'N');
    ship.hits = [true, true];
    expect(availableManeuvers(ship, [ship])).toEqual([]);
  });

  test('availableManeuvers lists legal moves in open water', () => {
    const ship = makeShip('patrol', { r: 5, c: 5 }, 'N');
    const kinds = availableManeuvers(ship, [ship]).map((m) => `${m.kind}${m.distance ?? ''}`);
    expect(kinds).toEqual(['ahead1', 'ahead2', 'astern1', 'astern2', 'port', 'starboard', 'rotateCW', 'rotateCCW']);
  });
});
