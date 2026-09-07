import { aiChooseManeuver, aiChooseShot } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { cellsOf, makeShip, randomFleet } from '../src/engine/ships';
import { GameState } from '../src/engine/types';

describe('ai', () => {
  test('a full AI vs AI game finishes', () => {
    const rng = seededRng(1234);
    let g: GameState = createGame({
      mode: 'ai',
      names: ['Red', 'Blue'],
      fleets: [randomFleet(rng), randomFleet(rng)],
      aiPlayer: 1,
    });
    let guard = 0;
    while (g.phase !== 'over' && guard++ < 2000) {
      const shot = aiChooseShot(g, g.current, rng);
      const res = fire(g, shot);
      g = res.state;
      if (g.phase === 'over') break;
      const mv = aiChooseManeuver(g, g.current, rng);
      if (mv) g = maneuver(g, mv.shipId, mv.maneuver);
      g = endTurn(g);
    }
    expect(g.phase).toBe('over');
    expect(g.winner).toBeDefined();
    expect(guard).toBeLessThan(2000);
  });

  test('ai chases a fresh hit with an adjacent shot', () => {
    const rng = seededRng(9);
    let g = createGame({ mode: 'ai', names: ['A', 'AI'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    // Force a hit for the AI on one of A's ships.
    const target = g.players[0].ships[0];
    const res = fire(g, target.bow);
    expect(res.result.result).toBe('hit');
    g = endTurn(res.state);
    g = endTurn(fire(g, { r: 9, c: 8 }).state);
    const next = aiChooseShot(g, 1, rng);
    const dist = Math.abs(next.r - target.bow.r) + Math.abs(next.c - target.bow.c);
    expect(dist).toBe(1);
  });

  test('ai moves a damaged ship when it can', () => {
    const rng = seededRng(3);
    let g = createGame({ mode: 'ai', names: ['A', 'AI'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
    const victim = g.players[1].ships[4]; // patrol boat
    g = endTurn(fire(g, victim.bow).state);
    g = fire(g, { r: 9, c: 9 }).state;
    const choice = aiChooseManeuver(g, 1, rng);
    expect(choice?.shipId).toBe(victim.id);
  });
});

describe('ai difficulty and splash intel', () => {
  /** Player 0 moves its patrol boat into the south-west, splashing for player 1. */
  function stateWithSwSplash() {
    const rng = seededRng(11);
    let g = createGame({
      mode: 'ai',
      names: ['A', 'AI'],
      fleets: [
        [
          makeShip('carrier', { r: 0, c: 4 }, 'E'),
          makeShip('battleship', { r: 2, c: 3 }, 'E'),
          makeShip('destroyer', { r: 4, c: 2 }, 'E'),
          makeShip('submarine', { r: 6, c: 2 }, 'E'),
          makeShip('patrol', { r: 8, c: 1 }, 'E'),
        ],
        randomFleet(rng),
      ],
      aiPlayer: 1,
    });
    g = fire(g, { r: 0, c: 0 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 2 });
    return endTurn(g);
  }

  const inSouthWest = (c: { r: number; c: number }) => c.r >= 5 && c.c < 5;

  test('a hard AI hunts the quadrant the splash revealed', () => {
    const g = stateWithSwSplash();
    expect(g.players[1].splashes.map((s) => s.quadrant)).toEqual(['SW']);
    const rng = seededRng(5);
    const shots = Array.from({ length: 40 }, () => aiChooseShot(g, 1, rng, 'hard'));
    expect(shots.every(inSouthWest)).toBe(true);
  });

  test('a normal AI cannot read splashes and sweeps the whole board', () => {
    const g = stateWithSwSplash();
    const rng = seededRng(5);
    const shots = Array.from({ length: 40 }, () => aiChooseShot(g, 1, rng, 'normal'));
    expect(shots.some((c) => !inSouthWest(c))).toBe(true);
  });

  test('every difficulty returns a legal cell on an empty board', () => {
    const rng = seededRng(2);
    const g = createGame({ mode: 'ai', names: ['A', 'AI'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
    for (const d of ['easy', 'normal', 'hard'] as const) {
      for (let i = 0; i < 50; i++) {
        const c = aiChooseShot(g, 1, rng, d);
        expect(c.r).toBeGreaterThanOrEqual(0);
        expect(c.r).toBeLessThan(10);
        expect(c.c).toBeGreaterThanOrEqual(0);
        expect(c.c).toBeLessThan(10);
      }
    }
  });

  test('a hard AI still fires legally once every ship is sunk but one', () => {
    const rng = seededRng(8);
    let g = createGame({ mode: 'ai', names: ['A', 'AI'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
    // Sink everything of A's except the patrol boat, from the AI's side.
    for (const ship of g.players[0].ships) {
      if (ship.classId === 'patrol') continue;
      for (const cell of cellsOf(ship)) {
        g = endTurn(fire({ ...g, current: 1, phase: 'fire' }, cell).state);
      }
    }
    const shot = aiChooseShot({ ...g, current: 1, phase: 'fire' }, 1, rng, 'hard');
    expect(shot).toBeDefined();
    expect(shot.r).toBeLessThan(10);
  });
});
