import { aiChooseManeuver, aiChooseShot } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver, visibleLog } from '../src/engine/game';
import { seededRng } from '../src/engine/random';
import { cellsOf, makeShip, randomFleet } from '../src/engine/ships';
import { GameState, PlayerIndex, Ship } from '../src/engine/types';

/** The patrol boat sits in open water, so every manoeuvre kind is legal. */
function openWaterFleet(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 8, c: 2 }, 'E'),
    makeShip('submarine', { r: 9, c: 2 }, 'E'),
    makeShip('patrol', { r: 5, c: 5 }, 'E'),
  ];
}

function playToEnd(seed: number): GameState {
  const rng = seededRng(seed);
  let g = createGame({
    mode: 'ai',
    names: ['A', 'B'],
    fleets: [randomFleet(rng), randomFleet(rng)],
    aiPlayer: 1,
  });
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 4000) {
    const side = g.current;
    g = fire(g, aiChooseShot(g, side, rng, 'hard')).state;
    if (g.phase === 'over') break;
    const mv = aiChooseManeuver(g, side, rng, 'hard');
    if (mv) g = maneuver(g, mv.shipId, mv.maneuver);
    g = endTurn(g);
  }
  return g;
}

/**
 * Rebuild both fleets from the opening snapshot plus the recorded shots and
 * structured moves — using only what a replay would legitimately have, and
 * never parsing log prose.
 */
function reconstruct(state: GameState): [Ship[], Ship[]] {
  const fleets: [Ship[], Ship[]] = [
    state.opening![0].map((s) => ({ ...s, bow: { ...s.bow }, hits: [...s.hits] })),
    state.opening![1].map((s) => ({ ...s, bow: { ...s.bow }, hits: [...s.hits] })),
  ];

  const lastTurn = Math.max(
    ...state.players.flatMap((p) => p.shots.map((s) => s.turn)),
    ...state.log.map((e) => e.turn),
    0,
  );

  for (let turn = 0; turn <= lastTurn; turn++) {
    // Turns strictly alternate and player 0 opens, so the mover is turn % 2.
    const side = (turn % 2) as PlayerIndex;
    const defender = (1 - side) as PlayerIndex;

    for (const shot of state.players[side].shots.filter((s) => s.turn === turn)) {
      for (const ship of fleets[defender]) {
        const idx = cellsOf(ship).findIndex((c) => c.r === shot.r && c.c === shot.c);
        if (idx >= 0) ship.hits[idx] = true;
      }
    }

    for (const entry of state.log) {
      if (entry.turn !== turn || entry.kind !== 'move' || !entry.move) continue;
      const ship = fleets[entry.by].find((s) => s.id === entry.move!.shipId)!;
      ship.bow = { ...entry.move.to.bow };
      ship.heading = entry.move.to.heading;
    }
  }
  return fleets;
}

/** Positions and damage are what a replay renders; cooldown is not drawn. */
function visibleShape(ships: readonly Ship[]) {
  return [...ships]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((s) => ({ id: s.id, bow: s.bow, heading: s.heading, hits: s.hits }));
}

describe('replay data sufficiency', () => {
  test('createGame records the opening fleets', () => {
    const rng = seededRng(3);
    const g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [randomFleet(rng), randomFleet(rng)] });
    expect(g.opening).toBeDefined();
    expect(visibleShape(g.opening![0])).toEqual(visibleShape(g.players[0].ships));
    expect(visibleShape(g.opening![1])).toEqual(visibleShape(g.players[1].ships));
  });

  test('the opening snapshot is a copy, not a live reference', () => {
    const rng = seededRng(4);
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [randomFleet(rng), randomFleet(rng)] });
    const before = visibleShape(g.opening![1]);
    g = endTurn(fire(g, g.players[1].ships[0].bow).state); // damage player 1
    expect(visibleShape(g.opening![1])).toEqual(before);
    expect(visibleShape(g.players[1].ships)).not.toEqual(before);
  });

  test('every manoeuvre records a structured payload beside the prose', () => {
    const rng = seededRng(5);
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [openWaterFleet(), randomFleet(rng)] });
    g = fire(g, { r: 0, c: 0 }).state;
    const before = g.players[0].ships.find((s) => s.id === 'patrol')!;
    const mv = { kind: 'rotateCW' as const };
    g = maneuver(g, 'patrol', mv);

    const entry = g.log.find((e) => e.kind === 'move')!;
    expect(entry.move).toMatchObject({
      shipId: 'patrol',
      classId: 'patrol',
      kind: 'rotateCW',
      from: { bow: before.bow, heading: before.heading },
    });
    const after = g.players[0].ships.find((s) => s.id === 'patrol')!;
    expect(entry.move!.to).toEqual({ bow: after.bow, heading: after.heading });
    expect(entry.move!.quadrant).toEqual(g.players[1].splashes[0].quadrant);
  });

  test('a full game reconstructs exactly, over many seeds', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = playToEnd(seed);
      expect(g.phase).toBe('over');
      const [a, b] = reconstruct(g);
      expect(visibleShape(a)).toEqual(visibleShape(g.players[0].ships));
      expect(visibleShape(b)).toEqual(visibleShape(g.players[1].ships));
    }
  });

  test('the structured payload stays hidden from the opponent', () => {
    // The payload names the ship and where it went, so it must inherit exactly
    // the secrecy the prose entry already had.
    const rng = seededRng(9);
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [openWaterFleet(), randomFleet(rng)] });
    g = fire(g, { r: 0, c: 0 }).state;
    g = maneuver(g, 'patrol', { kind: 'rotateCW' });

    expect(visibleLog(g, 0).some((e) => e.move)).toBe(true);
    expect(visibleLog(g, 1).some((e) => e.move)).toBe(false);
  });
});
