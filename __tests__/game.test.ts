import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { SPLASH_VISIBLE_TURNS } from '../src/engine/constants';
import { quadrantOf } from '../src/engine/geometry';
import { makeShip, randomFleet, shipAt } from '../src/engine/ships';
import { seededRng } from '../src/engine/random';
import { GameState, Ship } from '../src/engine/types';

function fleetA(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 4, c: 2 }, 'E'),
    makeShip('submarine', { r: 6, c: 2 }, 'E'),
    makeShip('patrol', { r: 8, c: 1 }, 'E'),
  ];
}

function newGame(): GameState {
  return createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleetA(), fleetA()] });
}

describe('game flow', () => {
  test('miss then hit, phases advance', () => {
    let g = newGame();
    expect(g.phase).toBe('fire');
    const miss = fire(g, { r: 9, c: 9 });
    expect(miss.result.result).toBe('miss');
    g = miss.state;
    expect(g.phase).toBe('maneuver');
    expect(() => fire(g, { r: 0, c: 0 })).toThrow();
    g = endTurn(g);
    expect(g.current).toBe(1);
    expect(g.phase).toBe('fire');
    expect(g.turn).toBe(1);

    const hit = fire(g, { r: 8, c: 1 });
    expect(hit.result).toMatchObject({ result: 'hit', shipId: 'patrol', alreadyDamaged: false });
    expect(hit.state.players[0].ships.find((s) => s.id === 'patrol')?.hits).toEqual([true, false]);
  });

  test('sinking a ship reports it and shooting a damaged segment is flagged', () => {
    let g = newGame();
    g = endTurn(fire(g, { r: 8, c: 1 }).state);
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    const again = fire(g, { r: 8, c: 1 });
    expect(again.result.alreadyDamaged).toBe(true);
    g = endTurn(again.state);
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    const sink = fire(g, { r: 8, c: 0 });
    expect(sink.result.sunk).toMatchObject({ classId: 'patrol' });
    expect(sink.result.sunk?.cells).toEqual([
      { r: 8, c: 1 },
      { r: 8, c: 0 },
    ]);
  });

  test('damage travels with a ship when it moves', () => {
    let g = newGame();
    g = endTurn(fire(g, { r: 8, c: 1 }).state); // A hits B's patrol bow
    // B's turn: fire, then move the patrol boat ahead 2 (heading E).
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 2 });
    const patrol = g.players[1].ships.find((s) => s.id === 'patrol')!;
    expect(patrol.bow).toEqual({ r: 8, c: 3 });
    expect(patrol.hits).toEqual([true, false]);
    expect(patrol.cooldown).toBe(2); // class cooldown 1 + 1 damage
    // A shoots the old spot: now empty water.
    g = endTurn(g);
    const shot = fire(g, { r: 8, c: 1 });
    expect(shot.result.result).toBe('miss');
    // The damaged bow is now at c=3.
    const shot2 = fire(endTurn(fire(endTurn(shot.state), { r: 9, c: 8 }).state), { r: 8, c: 3 });
    expect(shot2.result).toMatchObject({ result: 'hit', alreadyDamaged: true });
  });

  test('only one manoeuvre per turn', () => {
    let g = newGame();
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
    expect(() => maneuver(g, 'destroyer', { kind: 'ahead', distance: 1 })).toThrow();
  });

  test('manoeuvre creates a splash for the opponent in the new quadrant, which expires after they see it', () => {
    let g = newGame();
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 2 }); // patrol now at row 8, cols 2-3 -> SW
    expect(g.players[1].splashes).toEqual([{ quadrant: 'SW', turn: 0 }]);
    expect(g.players[0].splashes).toEqual([]);
    g = endTurn(g);
    expect(g.players[1].splashes).toHaveLength(1); // visible during B's turn
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    expect(g.players[1].splashes).toHaveLength(0); // gone once B's turn ends
  });

  test('cooldown ticks down at the end of each of the owner’s turns', () => {
    let g = newGame();
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'destroyer', { kind: 'ahead', distance: 1 });
    const cd = (s: GameState) => s.players[0].ships.find((x) => x.id === 'destroyer')!.cooldown;
    expect(cd(g)).toBe(2);
    g = endTurn(g); // A ends turn – the ship that moved does not tick this turn
    expect(cd(g)).toBe(2);
    g = endTurn(fire(g, { r: 9, c: 9 }).state); // B
    g = fire(g, { r: 9, c: 8 }).state; // A again: still on cooldown
    expect(() => maneuver(g, 'destroyer', { kind: 'ahead', distance: 1 })).toThrow(/Ready in 2/);
    g = endTurn(g);
    expect(cd(g)).toBe(1);
    g = endTurn(fire(g, { r: 9, c: 9 }).state); // B
    g = endTurn(fire(g, { r: 9, c: 7 }).state); // A
    expect(cd(g)).toBe(0);
    g = endTurn(fire(g, { r: 9, c: 9 }).state); // B
    g = fire(g, { r: 9, c: 6 }).state; // A: ready again
    expect(() => maneuver(g, 'destroyer', { kind: 'ahead', distance: 1 })).not.toThrow();
  });

  test('game ends when the whole fleet is sunk', () => {
    const tiny: Ship[] = fleetA();
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [tiny, fleetA()] });
    const targets = fleetA().flatMap((s) => {
      const cells = [];
      for (let i = 0; i < s.length; i++) cells.push({ r: s.bow.r, c: s.bow.c - i });
      return cells;
    });
    let over = false;
    for (const t of targets) {
      const res = fire(g, t);
      g = res.state;
      if (res.result.gameOver) {
        over = true;
        expect(g.phase).toBe('over');
        expect(g.winner).toBe(0);
        break;
      }
      g = endTurn(g);
      g = endTurn(fire(g, { r: 9, c: 9 }).state);
    }
    expect(over).toBe(true);
  });

  test('random fleets are valid and deterministic for a seed', () => {
    const a = randomFleet(seededRng(42));
    const b = randomFleet(seededRng(42));
    expect(a).toEqual(b);
    expect(() => createGame({ mode: 'ai', names: ['A', 'B'], fleets: [a, randomFleet(seededRng(7))] })).not.toThrow();
  });
});

describe('splash placement and incoming-shot snapshots', () => {
  /** Patrol at (8,4) heading E occupies (8,4),(8,3) – the south-west quadrant. */
  function crossingFleet(): Ship[] {
    return [
      makeShip('carrier', { r: 0, c: 4 }, 'E'),
      makeShip('battleship', { r: 2, c: 3 }, 'E'),
      makeShip('destroyer', { r: 4, c: 2 }, 'E'),
      makeShip('submarine', { r: 6, c: 2 }, 'E'),
      makeShip('patrol', { r: 8, c: 4 }, 'E'),
    ];
  }

  test('the splash names the quadrant the ship ended up in, not the one it left', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [crossingFleet(), fleetA()] });
    expect(quadrantOf({ r: 8, c: 4 })).toBe('SW'); // where it starts
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 2 }); // -> (8,6),(8,5)
    expect(g.players[0].ships.find((s) => s.id === 'patrol')?.bow).toEqual({ r: 8, c: 6 });
    expect(quadrantOf({ r: 8, c: 6 })).toBe('SE'); // where it arrived
    expect(g.players[1].splashes.map((s) => s.quadrant)).toEqual(['SE']);
  });

  test('a splash is visible for exactly the observer\'s next turn', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [crossingFleet(), fleetA()] });
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
    const splash = g.players[1].splashes[0];
    expect(splash.turn).toBe(0);
    g = endTurn(g); // A's turn ends; B has not looked yet
    expect(g.players[1].splashes).toHaveLength(1);
    g = endTurn(fire(g, { r: 9, c: 9 }).state); // B has now had its turn
    expect(g.turn - splash.turn).toBe(2 * SPLASH_VISIBLE_TURNS);
    expect(g.players[1].splashes).toHaveLength(0);
  });

  test('SPLASH_VISIBLE_TURNS is a live knob: raising it buys another turn of intel', () => {
    // The constant used to be counted in half-turns, where expiry is only ever
    // evaluated at even ages, so half its values were indistinguishable. Every
    // value must now change behaviour.
    jest.isolateModules(() => {
      jest.doMock('../src/engine/constants', () => ({
        ...jest.requireActual('../src/engine/constants'),
        SPLASH_VISIBLE_TURNS: 2,
      }));
      /* eslint-disable @typescript-eslint/no-var-requires */
      const engine = require('../src/engine/game');
      const ships = require('../src/engine/ships');
      const mk = (c: string, r: number, col: number, h: string) => ships.makeShip(c, { r, c: col }, h);
      const fleet = () => [
        mk('carrier', 0, 4, 'E'),
        mk('battleship', 2, 3, 'E'),
        mk('destroyer', 4, 2, 'E'),
        mk('submarine', 6, 2, 'E'),
        mk('patrol', 8, 4, 'E'),
      ];
      let g = engine.createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
      g = engine.fire(g, { r: 9, c: 9 }).state;
      g = engine.maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
      g = engine.endTurn(g); // A's turn ends
      expect(g.players[1].splashes).toHaveLength(1);
      // At the shipped value of 1 the splash would be gone here; at 2 it survives.
      g = engine.endTurn(engine.fire(g, { r: 9, c: 9 }).state);
      expect(g.players[1].splashes).toHaveLength(1);
      // And it does eventually expire, rather than living forever.
      g = engine.endTurn(engine.fire(g, { r: 9, c: 8 }).state); // A
      g = engine.endTurn(engine.fire(g, { r: 9, c: 7 }).state); // B
      expect(g.players[1].splashes).toHaveLength(0);
    });
  });

  test('a defender remembers what was hit even after evading with that ship', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleetA(), crossingFleet()] });
    g = endTurn(fire(g, { r: 8, c: 4 }).state); // A hits B's patrol bow
    const incoming = g.players[1].lastIncoming;
    expect(incoming).toMatchObject({ r: 8, c: 4, result: 'hit', classId: 'patrol', sunk: false, turn: 0 });

    // B evades with the very ship that was hit.
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 2 });
    // Nothing is at the impact point any more, so re-deriving the banner from
    // live hulls would lose the ship's identity. The snapshot must survive.
    expect(shipAt(g.players[1].ships, { r: 8, c: 4 })).toBeUndefined();
    expect(g.players[1].lastIncoming).toMatchObject({ classId: 'patrol', sunk: false });
  });

  test('a miss is recorded on the defender too, and a sinking is flagged', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleetA(), crossingFleet()] });
    g = endTurn(fire(g, { r: 9, c: 0 }).state);
    expect(g.players[1].lastIncoming).toMatchObject({ result: 'miss', sunk: false });
    expect(g.players[1].lastIncoming?.classId).toBeUndefined();

    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    g = endTurn(fire(g, { r: 8, c: 4 }).state);
    g = endTurn(fire(g, { r: 9, c: 8 }).state);
    const sink = fire(g, { r: 8, c: 3 });
    expect(sink.result.sunk).toBeDefined();
    expect(sink.state.players[1].lastIncoming).toMatchObject({ classId: 'patrol', sunk: true });
  });

  test('the manoeuvre log is grammatical for every player name and every move', () => {
    const kinds = [
      { m: { kind: 'ahead' as const, distance: 2 }, text: 'ahead 2' },
      { m: { kind: 'astern' as const, distance: 1 }, text: 'astern 1' },
      { m: { kind: 'port' as const }, text: 'one cell to port' },
      { m: { kind: 'starboard' as const }, text: 'one cell to starboard' },
      { m: { kind: 'rotateCW' as const }, text: '90\u00b0 clockwise' },
      { m: { kind: 'rotateCCW' as const }, text: '90\u00b0 counter-clockwise' },
    ];
    // The destroyer sits in open water so all six manoeuvres are legal.
    const openFleet = (): Ship[] => [
      makeShip('carrier', { r: 0, c: 4 }, 'E'),
      makeShip('battleship', { r: 2, c: 3 }, 'E'),
      makeShip('destroyer', { r: 5, c: 5 }, 'E'),
      makeShip('submarine', { r: 8, c: 2 }, 'E'),
      makeShip('patrol', { r: 9, c: 9 }, 'E'),
    ];
    for (const { m, text } of kinds) {
      // "You" is the human's actual name in vs-Computer mode, so a possessive
      // here produced "You's Patrol Boat".
      let g = createGame({ mode: 'ai', names: ['You', 'AI'], fleets: [openFleet(), fleetA()], aiPlayer: 1 });
      g = fire(g, { r: 9, c: 9 }).state;
      g = maneuver(g, 'destroyer', m);
      const entry = g.log.filter((e) => e.kind === 'move').pop()!;
      expect(entry.text).toContain(`You moved the Destroyer ${text}`);
      expect(entry.text).not.toContain("You's");
      expect(entry.text).toMatch(/\(splash in the (north|south)-(east|west)\)\.$/);
    }
  });
});
