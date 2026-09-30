import { aiChooseManeuver, aiChooseShot } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver, opponentOf } from '../src/engine/game';
import { HEADINGS, coordKey } from '../src/engine/geometry';
import { seededRng } from '../src/engine/random';
import { cellsOf, footprintIsFree, makeShip, randomFleet } from '../src/engine/ships';
import { GameState, PlayerIndex, Ship } from '../src/engine/types';
import { toPlayerView } from '../src/engine/view';

/** Snapshots of a seeded AI-vs-AI game every few half-turns, to the end. */
function snapshots(seed: number, every = 7): GameState[] {
  const rng = seededRng(seed);
  let g = createGame({ mode: 'ai', names: ['A', 'B'], fleets: [randomFleet(rng), randomFleet(rng)], aiPlayer: 1 });
  const out: GameState[] = [];
  let guard = 0;
  while (g.phase !== 'over' && guard++ < 4000) {
    const side = g.current;
    g = fire(g, aiChooseShot(g, side, rng, 'hard')).state;
    if (g.phase !== 'over') {
      const mv = aiChooseManeuver(g, side, rng, 'hard');
      if (mv) g = maneuver(g, mv.shipId, mv.maneuver);
      // Capture mid-turn too, so maneuveredShipId and lastShot are populated.
      if (g.turn % every === 0) out.push(g);
      g = endTurn(g);
    }
    if (g.turn % every === 0) out.push(g);
  }
  out.push(g);
  return out;
}

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));

/**
 * Move one of `owner`'s undamaged, afloat ships to water the viewer has never
 * fired at. Nothing the viewer knows changes, so neither may their view.
 */
function relocateHiddenShip(state: GameState, owner: PlayerIndex): GameState | null {
  const viewerShots = new Set(state.players[opponentOf(owner)].shots.map(coordKey));
  const fleet = state.players[owner].ships;
  for (const ship of fleet) {
    if (ship.hits.some(Boolean)) continue;
    const others = fleet.filter((s) => s.id !== ship.id);
    for (let r = 0; r < 10; r++) {
      for (let c = 0; c < 10; c++) {
        for (const heading of HEADINGS) {
          if (r === ship.bow.r && c === ship.bow.c && heading === ship.heading) continue;
          const candidate: Ship = { ...ship, bow: { r, c }, heading };
          const cells = cellsOf(candidate);
          if (!footprintIsFree(cells, others)) continue;
          if (cells.some((cell) => viewerShots.has(coordKey(cell)))) continue;
          const next = clone(state);
          next.players[owner].ships = next.players[owner].ships.map((s) => (s.id === ship.id ? candidate : s));
          return next;
        }
      }
    }
  }
  return null;
}

/** Change every opponent-private field that is not a ship position. */
function scrambleHiddenFields(state: GameState, owner: PlayerIndex): GameState {
  const next = clone(state);
  const p = next.players[owner];
  p.ships = p.ships.map((s) => ({ ...s, cooldown: s.cooldown + 3 }));
  p.splashes = [{ quadrant: 'SE', turn: 999 }, { quadrant: 'NW', turn: 998 }];
  p.lastIncoming = { r: 4, c: 4, result: 'hit', turn: 997, classId: 'carrier', sunk: false };
  // The opponent's own manoeuvres, with their structured payloads.
  next.log = [
    ...next.log,
    {
      turn: next.turn,
      by: owner,
      kind: 'move',
      text: 'secret',
      move: {
        shipId: 'carrier',
        classId: 'carrier',
        kind: 'ahead',
        distance: 1,
        from: { bow: { r: 1, c: 1 }, heading: 'N' },
        to: { bow: { r: 0, c: 1 }, heading: 'N' },
        quadrant: 'NW',
      },
    },
  ];
  // Both fleets as first deployed: private until a replay after the game.
  if (next.opening) next.opening[owner] = next.opening[owner].map((s) => ({ ...s, bow: { r: 9, c: 9 } }));
  return next;
}

describe('toPlayerView does not depend on hidden information', () => {
  test('relocating an unseen enemy ship leaves the view byte-identical', () => {
    let compared = 0;
    for (let seed = 1; seed <= 12; seed++) {
      for (const state of snapshots(seed)) {
        for (const viewer of [0, 1] as const) {
          const owner = opponentOf(viewer);
          const moved = relocateHiddenShip(state, owner);
          if (!moved) continue;
          expect(JSON.stringify(toPlayerView(moved, viewer))).toBe(JSON.stringify(toPlayerView(state, viewer)));
          compared++;
        }
      }
    }
    // Guard against a vacuous pass: the helper must actually have found moves.
    expect(compared).toBeGreaterThan(100);
  });

  test("changing the opponent's cooldowns, splashes, intel, moves and opening changes nothing", () => {
    let compared = 0;
    for (let seed = 20; seed <= 26; seed++) {
      for (const state of snapshots(seed)) {
        for (const viewer of [0, 1] as const) {
          const scrambled = scrambleHiddenFields(state, opponentOf(viewer));
          expect(JSON.stringify(toPlayerView(scrambled, viewer))).toBe(JSON.stringify(toPlayerView(state, viewer)));
          compared++;
        }
      }
    }
    expect(compared).toBeGreaterThan(50);
  });

  test('positive control: changing what the viewer does know changes the view', () => {
    // Without this, a view that ignored its input entirely would pass the above.
    const state = snapshots(3)[2]!;
    const next = clone(state);
    next.players[0].ships[0]!.cooldown += 1;
    expect(JSON.stringify(toPlayerView(next, 0))).not.toBe(JSON.stringify(toPlayerView(state, 0)));
    const shot = clone(state);
    shot.players[1].shots.push({ r: 0, c: 0, result: 'miss', turn: 1 });
    expect(JSON.stringify(toPlayerView(shot, 0))).not.toBe(JSON.stringify(toPlayerView(state, 0)));
  });
});

describe('toPlayerView contents', () => {
  function fleet(): Ship[] {
    return [
      makeShip('carrier', { r: 0, c: 4 }, 'E'),
      makeShip('battleship', { r: 2, c: 3 }, 'E'),
      makeShip('destroyer', { r: 4, c: 2 }, 'E'),
      makeShip('submarine', { r: 6, c: 2 }, 'E'),
      makeShip('patrol', { r: 8, c: 1 }, 'E'),
    ];
  }

  test('the last shot never names the ship it hit', () => {
    // Ship ids are class ids, so `shipId` would reveal which un-sunk class was hit.
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    g = fire(g, { r: 0, c: 4 }).state; // hits the carrier, does not sink it
    expect(g.lastShot?.shipId).toBe('carrier');
    const view = toPlayerView(g, 0);
    expect(view.lastShot).toBeDefined();
    expect(Object.keys(view.lastShot!)).not.toContain('shipId');
    expect(JSON.stringify(view)).not.toMatch(/"shipId":"carrier"/);
  });

  test('afloat enemy ships expose only class and length; sunk ones their wreck', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    g = endTurn(fire(g, { r: 8, c: 1 }).state);
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    g = fire(g, { r: 8, c: 0 }).state; // sinks the patrol boat
    const { fleet: seen } = toPlayerView(g, 0).enemy;
    const patrol = seen.find((s) => s.classId === 'patrol')!;
    expect(patrol).toEqual({
      classId: 'patrol',
      length: 2,
      sunk: true,
      bow: { r: 8, c: 1 },
      heading: 'E',
      cells: [
        { r: 8, c: 1 },
        { r: 8, c: 0 },
      ],
    });
    for (const s of seen.filter((x) => x.classId !== 'patrol')) {
      expect(Object.keys(s).sort()).toEqual(['classId', 'length', 'sunk']);
    }
  });

  test('which ship moved this turn is only visible to the player whose turn it is', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
    expect(toPlayerView(g, 0).maneuveredShipId).toBe('patrol');
    expect(toPlayerView(g, 1).maneuveredShipId).toBeUndefined();
  });

  test('the view is a copy: mutating it cannot reach back into the game', () => {
    const g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    const view = toPlayerView(g, 0);
    view.me.ships[0]!.bow.r = 7;
    view.me.ships[0]!.hits[0] = true;
    expect(g.players[0].ships[0]!.bow.r).toBe(0);
    expect(g.players[0].ships[0]!.hits[0]).toBe(false);
  });
});

/**
 * Every key path a view can contain. A field added to GameState reaches the
 * view only if toPlayerView copies it, and this test then fails until the new
 * path is listed here — so publishing a field is always a deliberate decision.
 */
describe('toPlayerView key set', () => {
  function keyPaths(value: unknown, prefix = '', out = new Set<string>()): Set<string> {
    if (Array.isArray(value)) {
      for (const item of value) keyPaths(item, `${prefix}[]`, out);
    } else if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) {
        const path = prefix ? `${prefix}.${k}` : k;
        out.add(path);
        keyPaths(v, path, out);
      }
    }
    return out;
  }

  test('matches the published shape exactly', () => {
    const all = new Set<string>();
    for (let seed = 30; seed <= 34; seed++) {
      for (const state of snapshots(seed, 5)) {
        for (const viewer of [0, 1] as const) keyPaths(toPlayerView(state, viewer), '', all);
      }
    }
    expect([...all].sort()).toEqual(
      [
        'current',
        'enemy',
        'enemy.fleet',
        'enemy.fleet[].bow',
        'enemy.fleet[].bow.c',
        'enemy.fleet[].bow.r',
        'enemy.fleet[].cells',
        'enemy.fleet[].cells[].c',
        'enemy.fleet[].cells[].r',
        'enemy.fleet[].classId',
        'enemy.fleet[].heading',
        'enemy.fleet[].length',
        'enemy.fleet[].sunk',
        'enemy.index',
        'enemy.isAI',
        'enemy.name',
        'enemy.shots',
        'enemy.shots[].c',
        'enemy.shots[].r',
        'enemy.shots[].result',
        'enemy.shots[].turn',
        'lastShot',
        'lastShot.alreadyDamaged',
        'lastShot.by',
        'lastShot.coord',
        'lastShot.coord.c',
        'lastShot.coord.r',
        'lastShot.gameOver',
        'lastShot.result',
        'lastShot.sunk',
        'lastShot.sunk.cells',
        'lastShot.sunk.cells[].c',
        'lastShot.sunk.cells[].r',
        'lastShot.sunk.classId',
        'log',
        'log[].by',
        'log[].kind',
        'log[].move',
        'log[].move.classId',
        'log[].move.distance',
        'log[].move.from',
        'log[].move.from.bow',
        'log[].move.from.bow.c',
        'log[].move.from.bow.r',
        'log[].move.from.heading',
        'log[].move.kind',
        'log[].move.quadrant',
        'log[].move.shipId',
        'log[].move.to',
        'log[].move.to.bow',
        'log[].move.to.bow.c',
        'log[].move.to.bow.r',
        'log[].move.to.heading',
        'log[].text',
        'log[].turn',
        'maneuveredShipId',
        'me',
        'me.index',
        'me.isAI',
        'me.lastIncoming',
        'me.lastIncoming.c',
        'me.lastIncoming.classId',
        'me.lastIncoming.r',
        'me.lastIncoming.result',
        'me.lastIncoming.sunk',
        'me.lastIncoming.turn',
        'me.name',
        'me.shots',
        'me.shots[].c',
        'me.shots[].r',
        'me.shots[].result',
        'me.shots[].turn',
        'me.ships',
        'me.ships[].bow',
        'me.ships[].bow.c',
        'me.ships[].bow.r',
        'me.ships[].classId',
        'me.ships[].cooldown',
        'me.ships[].heading',
        'me.ships[].hits',
        'me.ships[].id',
        'me.ships[].length',
        'me.splashes',
        'me.splashes[].quadrant',
        'me.splashes[].turn',
        'mode',
        'phase',
        'turn',
        'viewer',
        'winner',
      ].sort(),
    );
  });
});
