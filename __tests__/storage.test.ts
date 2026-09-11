import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearGame, loadGame, saveGame } from '../src/storage';
import { createGame, endTurn, fire } from '../src/engine/game';
import { makeShip } from '../src/engine/ships';
import { GameState, Ship } from '../src/engine/types';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const KEY = 'battleshiple:savegame:v1';

function fleet(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 4, c: 2 }, 'E'),
    makeShip('submarine', { r: 6, c: 2 }, 'E'),
    makeShip('patrol', { r: 8, c: 1 }, 'E'),
  ];
}

function game(): GameState {
  return createGame({ mode: 'ai', names: ['You', 'AI'], fleets: [fleet(), fleet()], aiPlayer: 1 });
}

describe('storage', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.clearAllMocks();
  });

  test('round-trips a game in progress', async () => {
    let g = game();
    g = endTurn(fire(g, { r: 8, c: 1 }).state);
    await saveGame(g, 'hard');
    const loaded = await loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.difficulty).toBe('hard');
    expect(loaded!.state.turn).toBe(g.turn);
    expect(loaded!.state.players[1].ships.find((s) => s.id === 'patrol')?.hits).toEqual([true, false]);
    expect(typeof loaded!.savedAt).toBe('number');
  });

  test('finished games are cleared rather than saved', async () => {
    const g = { ...game(), phase: 'over' as const, winner: 0 as const };
    await saveGame(g, 'normal');
    expect(await loadGame()).toBeNull();
  });

  test('clearGame removes the save', async () => {
    await saveGame(game(), 'normal');
    expect(await loadGame()).not.toBeNull();
    await clearGame();
    expect(await loadGame()).toBeNull();
  });

  test('corrupt or foreign payloads are discarded, not thrown', async () => {
    await AsyncStorage.setItem(KEY, 'not json at all');
    expect(await loadGame()).toBeNull();

    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 99, state: {} }));
    expect(await loadGame()).toBeNull();

    await AsyncStorage.setItem(KEY, JSON.stringify({ version: 1, state: { players: [], turn: 0, phase: 'fire' } }));
    expect(await loadGame()).toBeNull();
    // The bad entry is dropped so it cannot be offered again.
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  });

  async function savedPayload(): Promise<Record<string, any>> {
    await saveGame(game(), 'normal');
    return JSON.parse((await AsyncStorage.getItem(KEY)) as string);
  }

  async function expectRejected(mutate: (p: Record<string, any>) => void) {
    const payload = await savedPayload();
    mutate(payload);
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    expect(await loadGame()).toBeNull();
    // ...and dropped, so the same crash is not offered again on the next launch.
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  }

  async function expectAccepted(mutate: (p: Record<string, any>) => void) {
    const payload = await savedPayload();
    mutate(payload);
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    expect(await loadGame()).not.toBeNull();
  }

  // A save is replayed straight into the engine and the renderer without either
  // re-checking it, so a payload of the wrong shape throws during render rather
  // than merely playing oddly. Each case below is a documented crash site.
  describe('a wrong-shaped save is refused rather than replayed', () => {
    // The unmutated payload must survive, or every case below passes vacuously.
    test('the untouched payload still loads', async () => {
      const payload = await savedPayload();
      await AsyncStorage.setItem(KEY, JSON.stringify(payload));
      expect(await loadGame()).not.toBeNull();
    });

    // AI_PROFILES[difficulty] is dereferenced without a fallback in aiChooseShot.
    test('an unknown difficulty', () => expectRejected((p) => (p.difficulty = 'nightmare')));
    test('a difficulty inherited from Object.prototype', () =>
      expectRejected((p) => (p.difficulty = 'constructor')));

    // state.log.filter in visibleLog.
    test('a missing log', () => expectRejected((p) => delete p.state.log));
    test('a malformed log entry', () => expectRejected((p) => (p.state.log = [{ turn: 0 }])));

    // players[current] indexes the pair directly.
    test('an out-of-range current player', () => expectRejected((p) => (p.state.current = 2)));

    // paintShips indexes grid[cell.r][cell.c] with no bounds check.
    test('a ship hanging off the board', () => expectRejected((p) => (p.state.players[0].ships[0].bow = { r: 0, c: 0 })));
    test('a ship with an unknown class', () => expectRejected((p) => (p.state.players[0].ships[0].classId = 'dreadnought')));
    test('a ship whose hits do not match its hull', () =>
      expectRejected((p) => (p.state.players[0].ships[0].hits = [])));

    // paintShots does the same for every recorded shot.
    test('a shot off the board', () =>
      expectRejected((p) => (p.state.players[0].shots = [{ r: 10, c: 0, result: 'miss', turn: 0 }])));

    // coordLabel(lastShot.coord) and SHIP_CLASSES[lastShot.sunk.classId] in the status line.
    test('a last shot with no coordinate', () =>
      expectRejected((p) => (p.state.lastShot = { result: 'miss', alreadyDamaged: false, gameOver: false, by: 0 })));
    test('a last shot sinking an unknown class', () =>
      expectRejected((p) => {
        p.state.lastShot = {
          coord: { r: 1, c: 1 },
          result: 'hit',
          alreadyDamaged: false,
          gameOver: false,
          by: 0,
          sunk: { shipId: 'x', classId: 'dreadnought', cells: [] },
        };
      }));

    // A finished game is cleared rather than saved, so it is never resumable.
    test('a phase that cannot be resumed', () => expectRejected((p) => (p.state.phase = 'over')));

    // Fields that are each valid on their own and wrong only together. The
    // computer's turn opens with fire(), which throws outside the firing phase –
    // and it throws inside the AI's timer, where the error boundary never sees
    // it. The app cannot write either pair: a computer's turn is fired,
    // manoeuvred and ended in one synchronous block, and a local match has no
    // computer in it at all.
    test('the computer to move outside the firing phase', () =>
      expectRejected((p) => {
        p.state.current = 1;
        p.state.phase = 'maneuver';
      }));
    test('a computer playing in a pass & play match', () => expectRejected((p) => (p.state.mode = 'local')));

    // ...while the same phase with the human to move is an ordinary pause.
    test('a human mid-manoeuvre still loads', () =>
      expectAccepted((p) => {
        p.state.current = 0;
        p.state.phase = 'maneuver';
      }));
    test('a pass & play save with no computer in it still loads', async () => {
      await saveGame(createGame({ mode: 'local', names: ['P1', 'P2'], fleets: [fleet(), fleet()] }), 'normal');
      expect(await loadGame()).not.toBeNull();
    });
  });

  // Shape is not size. Every element below is exactly what the validator asks
  // for; only the count is impossible. It matters because the AI pairs each
  // recent hit with every other one (quadratic in the history it is handed) and
  // the game screen draws a line per log entry and per splash, so a save of the
  // right shape and the wrong size freezes the app on Resume instead of playing.
  describe('a save of the right shape and an impossible size is refused', () => {
    const shot = (i: number) => ({ r: 0, c: i % 2, result: 'hit', turn: 0 });

    test('a shot history no game could fire', () =>
      expectRejected((p) => (p.state.players[1].shots = Array.from({ length: 20000 }, (_, i) => shot(i)))));

    test('more splashes than the opponent could leave', () =>
      expectRejected((p) => (p.state.players[0].splashes = Array.from({ length: 5000 }, () => ({ quadrant: 'NE', turn: 0 })))));

    test('a log no game could write', () =>
      expectRejected((p) =>
        (p.state.log = Array.from({ length: 20000 }, () => ({ turn: 0, by: 0, kind: 'system', text: 'x' }))),
      ));

    test('more hulls than the fleet is dealt', () =>
      expectRejected((p) => p.state.players[0].ships.push(JSON.parse(JSON.stringify(p.state.players[1].ships[4])))));

    // The other half of the bound: the README measures a median of 108 turns a
    // side, so a save twice that long is a real game and has to survive.
    test('a game far longer than the median still loads', () =>
      expectAccepted((p) => {
        p.state.players[0].shots = Array.from({ length: 216 }, (_, i) => ({ ...shot(i), result: 'miss' }));
        p.state.log = Array.from({ length: 650 }, () => ({ turn: 0, by: 0, kind: 'shot', text: 'Player 1 fired at A1: miss.' }));
      }));
  });

  test('a storage failure never propagates to the caller', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveGame(game(), 'normal')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
