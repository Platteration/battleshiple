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

  test('a storage failure never propagates to the caller', async () => {
    const spy = jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('disk full'));
    await expect(saveGame(game(), 'normal')).resolves.toBeUndefined();
    spy.mockRestore();
  });
});
