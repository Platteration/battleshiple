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

  test('finishing a game clears the save that was already there', async () => {
    // Save a real in-progress game first, otherwise this assertion holds
    // vacuously whether or not saveGame clears anything.
    let g = game();
    g = endTurn(fire(g, { r: 8, c: 1 }).state);
    await saveGame(g, 'normal');
    expect(await loadGame()).not.toBeNull();

    await saveGame({ ...g, phase: 'over', winner: 0 }, 'normal');
    expect(await loadGame()).toBeNull();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
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

  test('a storage failure never propagates to the caller', async () => {
    // `setItem` is already a jest.fn from the module mock, so spying on it and
    // calling mockRestore leaves behind an inert stub rather than the original —
    // which silently breaks writes for every test that runs after this one.
    // Swap the implementation and put the real one back by hand instead.
    const real = AsyncStorage.setItem;
    AsyncStorage.setItem = jest.fn().mockRejectedValueOnce(new Error('disk full'));
    try {
      await expect(saveGame(game(), 'normal')).resolves.toBeUndefined();
    } finally {
      AsyncStorage.setItem = real;
    }
    // Prove the store still works afterwards, so the next test can rely on it.
    await AsyncStorage.setItem(KEY, 'probe');
    expect(await AsyncStorage.getItem(KEY)).toBe('probe');
  });
});

describe('backward compatibility', () => {
  beforeEach(async () => {
    jest.restoreAllMocks();
    await AsyncStorage.clear();
  });

  test('a save written before the replay fields existed still loads and plays', async () => {
    // `opening` and `LogEntry.move` were added after v1 saves were already in
    // the wild. They are optional precisely so those saves keep working; such a
    // game simply has no replay.
    let g = game();
    g = endTurn(fire(g, { r: 8, c: 1 }).state);
    const legacy = JSON.parse(JSON.stringify(g)) as GameState & { opening?: unknown };
    delete legacy.opening;
    legacy.log = legacy.log.map((e) => {
      const { move, ...rest } = e as typeof e & { move?: unknown };
      return rest as typeof e;
    });

    await AsyncStorage.setItem(
      KEY,
      JSON.stringify({ version: 1, savedAt: 1, difficulty: 'normal', state: legacy }),
    );
    const loaded = await loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.state.opening).toBeUndefined();
    expect(loaded!.state.players[1].ships.find((s) => s.id === 'patrol')?.hits).toEqual([true, false]);

    // And the engine still advances it.
    const resumed = fire(loaded!.state, { r: 9, c: 9 });
    expect(resumed.result.result).toBe('miss');
  });
});
