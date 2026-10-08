import AsyncStorage from '@react-native-async-storage/async-storage';
import { clearGame, loadGame, onStorageRefusedChange, saveGame, saveJSON, storageRefused } from '../src/storage';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
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

  async function savedPayload(): Promise<Record<string, any>> {
    await saveGame(game(), 'normal');
    return JSON.parse((await AsyncStorage.getItem(KEY)) as string);
  }

  async function loadAfter(mutate: (p: Record<string, any>) => void) {
    const payload = await savedPayload();
    mutate(payload);
    await AsyncStorage.setItem(KEY, JSON.stringify(payload));
    return loadGame();
  }

  async function expectRejected(mutate: (p: Record<string, any>) => void) {
    expect(await loadAfter(mutate)).toBeNull();
    // ...and dropped, so the same crash is not offered again on the next launch.
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
  }

  async function expectAccepted(mutate: (p: Record<string, any>) => void) {
    expect(await loadAfter(mutate)).not.toBeNull();
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

    // Fields that are each valid on their own and wrong only together. The app
    // cannot write any of these: a computer's turn is fired, manoeuvred and
    // ended in one synchronous block, `createGame` deals the roles, and a
    // finished game is cleared rather than saved. Each of them leaves the app
    // with a turn it cannot play – a throw inside the AI's timer, where the
    // error boundary never sees it, or a board nobody is able to move.
    test('the computer to move outside the firing phase', () =>
      expectRejected((p) => {
        p.state.current = 1;
        p.state.phase = 'maneuver';
      }));
    test('a computer playing in a pass & play match', () => expectRejected((p) => (p.state.mode = 'local')));

    // A vs-Computer match has exactly one computer in it, and it is player 1:
    // with none, the human is never shown the board of the side to move and
    // nothing advances the game; with the roles swapped or doubled, the same.
    test('a vs-Computer match with no computer in it', () =>
      expectRejected((p) => (p.state.players[1].isAI = false)));
    test('a vs-Computer match that is computers all the way down', () =>
      expectRejected((p) => (p.state.players[0].isAI = true)));
    test('a vs-Computer match with the computer in the human\'s seat', () =>
      expectRejected((p) => {
        p.state.players[0].isAI = true;
        p.state.players[1].isAI = false;
      }));

    // `maneuver` throws 'Only one ship may move per turn' when it is handed a
    // state that already names a moved ship – and on the computer's turn that
    // throw lands in the timer, after its fire() has already been allowed.
    test('a ship recorded as moved outside the manoeuvre phase', () =>
      expectRejected((p) => (p.state.maneuveredShipId = 'carrier')));
    test('a ship recorded as moved that the player to move does not have', () =>
      expectRejected((p) => {
        p.state.phase = 'maneuver';
        p.state.maneuveredShipId = 'dreadnought';
      }));

    // The shot that sinks the last hull ends the game, and a finished game is
    // cleared rather than saved, so neither of these can be a game in progress.
    test('a winner in a game that is still being played', () => expectRejected((p) => (p.state.winner = 0)));
    test('a winner that is not a player at all', () => expectRejected((p) => (p.state.winner = 'me')));
    test('a fleet already sunk in a game that is not over', () =>
      expectRejected((p) =>
        p.state.players[1].ships.forEach((ship: Record<string, any>) => (ship.hits = ship.hits.map(() => true))),
      ));

    // ...while the same fields in the combinations play produces are ordinary
    // pauses, and have to survive.
    test('a human mid-manoeuvre still loads', () =>
      expectAccepted((p) => {
        p.state.current = 0;
        p.state.phase = 'maneuver';
      }));
    test('a human who has already manoeuvred still loads', () =>
      expectAccepted((p) => {
        p.state.phase = 'maneuver';
        p.state.maneuveredShipId = 'carrier';
      }));
    test('a pass & play save with no computer in it still loads', async () => {
      await saveGame(createGame({ mode: 'local', names: ['P1', 'P2'], fleets: [fleet(), fleet()] }), 'normal');
      expect(await loadGame()).not.toBeNull();
    });

    // Shape is not size for a single field either: both of these are drawn.
    test('a log line no screen could draw', () =>
      expectRejected((p) => (p.state.log = [{ turn: 0, by: 0, kind: 'system', text: 'x'.repeat(5 * 1024 * 1024) }])));
    test('a player name no header could draw', () =>
      expectRejected((p) => (p.state.players[0].name = 'x'.repeat(2 * 1024 * 1024))));
    test('the longest line the engine actually writes still loads', async () => {
      // Derived from play rather than from the ceiling: fire, manoeuvre and end
      // the turn, then keep the longest line the engine wrote doing it.
      let g = game();
      g = fire(g, { r: 8, c: 1 }).state;
      g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
      const longest = g.log.map((e) => e.text).sort((a, b) => b.length - a.length)[0]!;
      expect(longest.length).toBeGreaterThan(40);
      await expectAccepted((p) => (p.state.log = [{ turn: 0, by: 0, kind: 'move', text: longest }]));
    });

    // A sunk hull is reported with exactly the cells of its class.
    test('a sunk report with more cells than the hull has', () =>
      expectRejected((p) => {
        p.state.lastShot = {
          coord: { r: 1, c: 1 },
          result: 'hit',
          alreadyDamaged: false,
          gameOver: false,
          by: 0,
          sunk: { shipId: 'patrol', classId: 'patrol', cells: Array.from({ length: 100000 }, () => ({ r: 0, c: 0 })) },
        };
      }));
    test('a sunk report of the right length still loads', () =>
      expectAccepted((p) => {
        p.state.lastShot = {
          coord: { r: 1, c: 1 },
          result: 'hit',
          alreadyDamaged: false,
          gameOver: false,
          by: 0,
          sunk: { shipId: 'patrol', classId: 'patrol', cells: [{ r: 0, c: 0 }, { r: 0, c: 1 }] },
        };
      }));
  });

  // Shape is not size. Every element below is exactly what the validator asks
  // for; only the count is impossible. It matters because the AI pairs each
  // recent hit with every other one (quadratic in the history it is handed),
  // `visibleLog` filters the whole log on every render of the game screen, and
  // `incomingReport` writes a line per splash – the log itself is drawn four
  // entries at a time, however long it is.
  //
  // Each ceiling is pinned from below as well as above, because the only way a
  // player meets one is at the end of a very long game: a ceiling set too low
  // would throw away ordinary saves, and every test here would still pass.
  describe('a save of the right shape and an impossible size is clipped, not thrown away', () => {
    const shot = (i: number) => ({ r: 0, c: i % 2, result: 'hit', turn: i });
    const line = () => ({ turn: 0, by: 0, kind: 'system', text: 'x' });
    const splash = () => ({ quadrant: 'NE', turn: 0 });

    // A count above the ceiling costs the player their oldest markers. It used
    // to cost them the match: `saveGame` has no turn limit to stop it writing
    // one of these, and the answer to reading one was to delete the save.
    test('a shot history no game could fire keeps the most recent 2000', async () => {
      const loaded = await loadAfter((p) => (p.state.players[1].shots = Array.from({ length: 20000 }, (_, i) => shot(i))));
      expect(loaded!.state.players[1].shots).toHaveLength(2000);
      expect(loaded!.state.players[1].shots[1999]!.turn).toBe(19999);
      expect(loaded!.state.players[1].shots[0]!.turn).toBe(18000);
      // ...and the match itself survives: the save is still on the disk.
      expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
    });

    test('more splashes than the opponent could leave keeps 4', async () => {
      const loaded = await loadAfter((p) => (p.state.players[0].splashes = Array.from({ length: 5000 }, splash)));
      expect(loaded!.state.players[0].splashes).toHaveLength(4);
    });

    test('a log no game could write keeps the most recent 8000', async () => {
      const loaded = await loadAfter((p) => (p.state.log = Array.from({ length: 20000 }, line)));
      expect(loaded!.state.log).toHaveLength(8000);
    });

    // The other half of every bound. A save AT the ceiling is a game somebody
    // played to the end of it, and none of it may be thrown away.
    test('a save at the ceilings loads with everything still in it', async () => {
      const loaded = await loadAfter((p) => {
        p.state.players[0].shots = Array.from({ length: 2000 }, (_, i) => shot(i));
        p.state.players[0].splashes = Array.from({ length: 4 }, splash);
        p.state.log = Array.from({ length: 8000 }, line);
      });
      expect(loaded!.state.players[0].shots).toHaveLength(2000);
      expect(loaded!.state.players[0].splashes).toHaveLength(4);
      expect(loaded!.state.log).toHaveLength(8000);
    });

    // The commonest non-zero splash count there is, and no test built one: the
    // opponent manoeuvred, and the save was taken before the splash expired.
    test('the one splash an ordinary turn leaves still loads', async () => {
      let g = game();
      g = fire(g, { r: 9, c: 9 }).state;
      g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
      g = endTurn(g);
      expect(g.players[1].splashes).toHaveLength(1);
      await saveGame(g, 'normal');
      const loaded = await loadGame();
      expect(loaded!.state.players[1].splashes).toHaveLength(1);
    });

    // The README measures a median of 108 turns a side, so a save twice that
    // long is a real game and has to survive untouched.
    test('a game far longer than the median still loads', async () => {
      const loaded = await loadAfter((p) => {
        p.state.players[0].shots = Array.from({ length: 216 }, (_, i) => ({ ...shot(i), result: 'miss' }));
        p.state.log = Array.from({ length: 650 }, () => ({ turn: 0, by: 0, kind: 'shot', text: 'Player 1 fired at A1: miss.' }));
      });
      expect(loaded!.state.players[0].shots).toHaveLength(216);
      expect(loaded!.state.log).toHaveLength(650);
    });

    // A hull too many is a wrong shape rather than a long game: there is no
    // honest way to choose which ship to drop, so the save is still refused.
    test('more hulls than the fleet is dealt', () =>
      expectRejected((p) => p.state.players[0].ships.push(JSON.parse(JSON.stringify(p.state.players[1].ships[4])))));
  });

  // Two fields only the screens read, and only for show: the report strip's line
  // about the opponent's last shot, and the record that lets the board play your
  // own manoeuvre out once. Neither is in a save older than the feature, so a
  // state without them is one every screen already draws; one that does not hold
  // up is dropped, and the match kept. Kept, the game screen indexed SHIP_CLASSES
  // with whatever the field named and read a pose off null, and every Resume of
  // the battle ended in "Signal lost".
  describe('a field only the screens read is dropped when it does not hold up, and the match kept', () => {
    // A hit on player 0's carrier by the computer, from play: the computer's turn
    // is fired and ended in one block, so the save is player 0 to fire again.
    function hitByComputer(): GameState {
      let g = game();
      g = endTurn(fire(g, { r: 9, c: 9 }).state);
      g = endTurn(fire(g, { r: 0, c: 4 }).state);
      expect(g.players[0].lastIncoming).toEqual({ r: 0, c: 4, result: 'hit', turn: 1, classId: 'carrier', sunk: false });
      return g;
    }

    async function loadPlayed(g: GameState, mutate: (p: Record<string, any>) => void = () => {}) {
      await saveGame(g, 'normal');
      const payload = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
      mutate(payload);
      await AsyncStorage.setItem(KEY, JSON.stringify(payload));
      const loaded = await loadGame();
      // The match itself is never what pays: it loads, and it is still on the disk.
      expect(loaded).not.toBeNull();
      expect(await AsyncStorage.getItem(KEY)).not.toBeNull();
      return loaded!;
    }

    test('the last incoming shot play writes is kept as it was', async () => {
      const g = hitByComputer();
      const loaded = await loadPlayed(g);
      expect(loaded.state.players[0].lastIncoming).toEqual(g.players[0].lastIncoming);
    });

    test('a last incoming shot naming a class there is not', async () => {
      const g = hitByComputer();
      const loaded = await loadPlayed(g, (p) => (p.state.players[0].lastIncoming.classId = 'frigate'));
      expect(loaded.state.players[0].lastIncoming).toBeUndefined();
      // Only the line goes: the hit itself is in the hull, where it always was.
      expect(loaded.state.players[0].ships.find((s) => s.id === 'carrier')?.hits).toEqual([true, false, false, false, false]);
      expect(loaded.state.turn).toBe(g.turn);
    });

    // Walked rather than listed, so a name nobody thought of is covered too.
    test.each(Object.getOwnPropertyNames(Object.prototype))('a last incoming shot naming %s, which only Object.prototype has', async (name) => {
      const loaded = await loadPlayed(hitByComputer(), (p) => (p.state.players[0].lastIncoming.classId = name));
      expect(loaded.state.players[0].lastIncoming).toBeUndefined();
    });

    test.each([
      ['off the board', (i: Record<string, any>) => (i.r = 10)],
      ['with no turn', (i: Record<string, any>) => delete i.turn],
      ['with neither hit nor miss', (i: Record<string, any>) => (i.result = 'graze')],
      ['with no sunk flag', (i: Record<string, any>) => delete i.sunk],
      ['that is not a record at all', (_i: Record<string, any>, p: Record<string, any>) => (p.state.players[0].lastIncoming = 'hit')],
    ])('a last incoming shot %s', async (_label, mutate) => {
      const loaded = await loadPlayed(hitByComputer(), (p) => mutate(p.state.players[0].lastIncoming, p));
      expect(loaded.state.players[0].lastIncoming).toBeUndefined();
    });

    // Your own manoeuvre this turn, still to be played out on the board.
    function movedThisTurn(): GameState {
      let g = fire(game(), { r: 9, c: 9 }).state;
      g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
      expect(g.log.at(-1)?.move?.shipId).toBe('patrol');
      return g;
    }
    const moveEntry = (s: GameState) => s.log.find((e) => e.kind === 'move')!;

    test('the manoeuvre record play writes is kept as it was', async () => {
      const g = movedThisTurn();
      const loaded = await loadPlayed(g);
      expect(moveEntry(loaded.state).move).toEqual(JSON.parse(JSON.stringify(moveEntry(g).move)));
    });

    test.each([
      ['a pose it left that is null', (m: Record<string, any>) => (m.from = null)],
      ['a pose it reached with no bow', (m: Record<string, any>) => delete m.to.bow],
      ['a bow off the board', (m: Record<string, any>) => (m.from.bow = { r: 0, c: 12 })],
      ['a heading that is not one', (m: Record<string, any>) => (m.from.heading = 'NE')],
      ['a heading only Object.prototype has', (m: Record<string, any>) => (m.to.heading = 'constructor')],
      ['no ship named', (m: Record<string, any>) => delete m.shipId],
    ])('a manoeuvre record with %s is dropped, and its log line kept', async (_label, mutate) => {
      const g = movedThisTurn();
      const loaded = await loadPlayed(g, (p) => mutate(p.state.log.find((e: Record<string, any>) => e.kind === 'move').move));
      const entry = moveEntry(loaded.state);
      expect(entry.move).toBeUndefined();
      expect(entry.text).toBe(moveEntry(g).text);
      expect(loaded.state.maneuveredShipId).toBe('patrol');
    });
  });

  // The writer is bounded too, so that the reader is not left to clip a save
  // the app itself wrote. Nothing in the game ends it – no draw, no stalemate,
  // no turn limit – so a long enough match crosses the log ceiling in play.
  test('saveGame trims a log too long to keep rather than writing one', async () => {
    const g = game();
    const long = { ...g, log: Array.from({ length: 8001 }, () => ({ turn: 0, by: 0 as const, kind: 'shot' as const, text: 'x' })) };
    await saveGame(long, 'normal');

    const written = JSON.parse((await AsyncStorage.getItem(KEY)) as string);
    expect(written.state.log).toHaveLength(8000);
    // The game being played is not trimmed with it; only the snapshot is.
    expect(long.log).toHaveLength(8001);

    const loaded = await loadGame();
    expect(loaded!.state.log).toHaveLength(8000);
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

// On the web the store is the origin's localStorage, and on GitHub Pages every
// app the account publishes shares that origin and its few megabytes: another app
// that fills it makes every write here throw. Measured in Chromium, a battle was
// then played with nothing stored and nothing said, and a reload offered nothing.
describe('a write the store refuses is said, and written again once there is room', () => {
  const SETTINGS = 'battleshiple.settings.v1';
  const real = AsyncStorage.setItem;
  /** Keys the store refuses to write, as a full store would; `'*'` is every key. */
  let full = new Set<string>();
  /** A value whose write takes effect at once, as the web's does, but whose promise is held open. */
  let held: { value: string; release: () => void } | null = null;

  const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

  beforeEach(async () => {
    full = new Set();
    held = null;
    AsyncStorage.setItem = jest.fn((key: string, value: string) => {
      if (full.has('*') || full.has(key)) return Promise.reject(new Error('QuotaExceededError'));
      const done = real(key, value);
      if (held && held.value === value) {
        const gate = held;
        return new Promise<void>((resolve) => (gate.release = () => void done.then(() => resolve())));
      }
      return done;
    });
    await AsyncStorage.clear();
    // Whatever an earlier test left refused is cleared by an accepted write to it.
    await clearGame();
    await saveJSON(SETTINGS, {});
    await AsyncStorage.clear();
    await flush();
    expect(storageRefused()).toBe(false);
  });

  afterEach(() => {
    AsyncStorage.setItem = real;
  });

  test('a refused autosave is reported, never thrown, and the next accepted write puts it back', async () => {
    const changed = jest.fn();
    const stop = onStorageRefusedChange(changed);
    try {
      full.add('*');
      const g = endTurn(fire(game(), { r: 8, c: 1 }).state);
      await expect(saveGame(g, 'normal')).resolves.toBeUndefined();
      expect(storageRefused()).toBe(true);
      expect(changed).toHaveBeenCalledTimes(1);
      expect(await AsyncStorage.getItem(KEY)).toBeNull();

      // Room again. Any write the store accepts – here a settings change –
      // brings the battle back with it.
      full.clear();
      expect(await saveJSON(SETTINGS, { theme: 'dark' })).toBe(true);
      await flush();
      expect(storageRefused()).toBe(false);
      expect(changed).toHaveBeenCalledTimes(2);
      expect((await loadGame())!.state.turn).toBe(g.turn);
    } finally {
      stop();
    }
  });

  test('a settings change the store refused is written by the next autosave', async () => {
    full.add(SETTINGS);
    expect(await saveJSON(SETTINGS, { theme: 'dark' })).toBe(false);
    expect(storageRefused()).toBe(true);
    full.clear();
    await saveGame(game(), 'normal');
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(SETTINGS)) as string)).toEqual({ theme: 'dark' });
    expect(storageRefused()).toBe(false);
  });

  test('a refused value is never written back over a newer one', async () => {
    full.add(SETTINGS);
    expect(await saveJSON(SETTINGS, { theme: 'dark' })).toBe(false);
    full.clear();
    // The newer value is in the store the moment it is asked for, as on the web,
    // and its write has not finished when another write gets through.
    held = { value: JSON.stringify({ theme: 'light' }), release: () => {} };
    const newer = saveJSON(SETTINGS, { theme: 'light' });
    await saveGame(game(), 'normal');
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem(SETTINGS)) as string)).toEqual({ theme: 'light' });
    held.release();
    expect(await newer).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem(SETTINGS)) as string)).toEqual({ theme: 'light' });
    expect(storageRefused()).toBe(false);
  });

  test('a battle that ended after its save was refused is not written back', async () => {
    full.add('*');
    await saveGame(game(), 'normal');
    expect(storageRefused()).toBe(true);
    full.clear();
    // The battle ends: the save is cleared, and that is the newest word on it.
    await clearGame();
    await saveJSON(SETTINGS, { theme: 'dark' });
    await flush();
    expect(await AsyncStorage.getItem(KEY)).toBeNull();
    expect(storageRefused()).toBe(false);
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
