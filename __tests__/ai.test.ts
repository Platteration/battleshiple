import { aiChooseManeuver, aiChooseShot } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { coordKey } from '../src/engine/geometry';
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

describe('ai target mode is bounded by the board, not by the history', () => {
  /** Hits on three cells, the first of them recorded `repeats` times over. */
  function stateWithRepeatedHits(repeats: number): GameState {
    const rng = seededRng(21);
    const g = createGame({ mode: 'ai', names: ['A', 'AI'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
    const hit = (r: number, c: number) => ({ r, c, result: 'hit' as const, turn: 0 });
    const shots = [...Array.from({ length: repeats }, () => hit(5, 5)), hit(5, 6), hit(6, 6)];
    return { ...g, current: 1, players: [g.players[0], { ...g.players[1], shots }] };
  }

  /** The four cells that extend the line through one of the two adjacent pairs. */
  const extensions = ['5,7', '5,4', '7,6', '4,6'];

  // A hull drifting back over a cell can be hit there again and again, and a
  // restored save can claim a history no game played. Either way the same cell
  // must count once: the pair loop is quadratic in what it is handed.
  test('a cell hit a hundred times over does not crowd out the other follow-ups', () => {
    const g = stateWithRepeatedHits(100);
    const rng = seededRng(4);
    const counts = new Map<string, number>();
    for (let i = 0; i < 200; i++) {
      const key = coordKey(aiChooseShot(g, 1, rng, 'hard'));
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect([...counts.keys()].sort()).toEqual([...extensions].sort());
    // Each line is chosen about a quarter of the time; weighted by the repeats,
    // the two through (6,6) would come up in well under one draw in a hundred.
    for (const cell of extensions) expect(counts.get(cell)).toBeGreaterThan(200 / extensions.length / 2);
  });

  // Measured on the unbounded loop: 2000 hits took 2.2 s and 101 MB, 4000 took
  // 9.4 s and 337 MB, 20000 exhausted a 512 MB heap. On a phone that is the app
  // being killed on Resume rather than taking a slow turn.
  test('a history no game could fire is still answered at once', () => {
    const g = stateWithRepeatedHits(4000);
    const rng = seededRng(6);
    const started = Date.now();
    const shot = aiChooseShot(g, 1, rng, 'hard');
    expect(Date.now() - started).toBeLessThan(1000);
    expect(extensions).toContain(coordKey(shot));
  });
});
