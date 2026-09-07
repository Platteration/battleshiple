import { aiChooseManeuver, aiChooseShot } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { randomFleet } from '../src/engine/ships';
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
