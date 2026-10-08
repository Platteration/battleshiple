import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Dimensions, StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { makeShip } from '../src/engine/ships';
import { GameState, Ship } from '../src/engine/types';
import { toPlayerView } from '../src/engine/view';
import { loadGame, saveGame, STORAGE_KEYS } from '../src/storage';
import { Board } from '../src/ui/components/Board';
import { BottomReserve, gameLayout } from '../src/ui/layout';
import { GameScreen } from '../src/ui/screens/GameScreen';
import { spacing, ThemeProvider } from '../src/ui/theme';

const SAVE_KEY = STORAGE_KEYS.savegame;

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

function fleet(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 4, c: 2 }, 'E'),
    makeShip('submarine', { r: 6, c: 2 }, 'E'),
    makeShip('patrol', { r: 8, c: 1 }, 'E'),
  ];
}

const texts = (root: ReactTestInstance) =>
  root.findAll((n) => String(n.type) === 'Text' && n.children.length > 0).map((n) => n.children.map(String).join(''));
const byLabel = (root: ReactTestInstance, label: string) =>
  root.findAll((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function' && typeof n.type !== 'string');
const press = (node: ReactTestInstance) => act(() => node.props.onPress());
/** The pressable that holds the text, as a finger finds it. */
function pressText(root: ReactTestInstance, text: string) {
  let n: ReactTestInstance | null = root.find((x) => String(x.type) === 'Text' && x.children.join('') === text);
  while (n && typeof n.props.onPress !== 'function') n = n.parent;
  press(n!);
}
const hulls = (root: ReactTestInstance) =>
  root.findAll((n) => typeof n.type === 'string' && /^hull-footprint-/.test(n.props.testID ?? '')).length;

describe('GameScreen', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  function render(state: GameState, viewer: 0 | 1) {
    act(() => {
      renderer = create(
        <ThemeProvider theme="light">
          <GameScreen view={toPlayerView(state, viewer)} onFire={() => {}} onManeuver={() => {}} onEndTurn={() => {}} onQuit={() => {}} />
        </ThemeProvider>,
      );
    });
    return renderer.root;
  }

  test('the mini-map peeks at the other board and back, and is the only control for it', () => {
    const root = render(createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] }), 0);
    // Firing: the large board is enemy waters, where nothing of ours is drawn.
    // The mini-map draws our five hulls small, not as Hull components.
    expect(hulls(root)).toBe(0);
    const [show] = byLabel(root, 'Show your fleet');
    expect(show!.props.accessibilityRole).toBe('button');
    press(show!);
    expect(hulls(root)).toBe(5);
    expect(texts(root)).toContain('Your fleet · tap the plot to return');
    press(byLabel(root, 'Show enemy waters')[0]!);
    expect(hulls(root)).toBe(0);
  });

  test('the mini-map adds no cell controls: every coordinate is still exactly one cell', () => {
    const root = render(createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] }), 0);
    for (const label of ['A1', 'E5', 'J10']) expect(byLabel(root, label)).toHaveLength(1);
  });

  test("the signal log lists the viewer's log newest first, and never the opponent's manoeuvre", () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    g = fire(g, { r: 9, c: 9 }).state; // A misses
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 }); // A moves
    g = endTurn(g);
    g = fire(g, { r: 9, c: 8 }).state; // B misses
    const root = render(g, 1);
    const before = texts(root);
    pressText(root, 'Log');
    const after = texts(root);
    const sheet = after.slice(after.indexOf('Signal log') + 1, after.indexOf('Close'));
    // Newest first: B's shot, then A's shot. A's manoeuvre is the opponent's, and not in B's log.
    expect(sheet).toEqual(['B fired at I10: miss.', 'A fired at J10: miss.']);
    // The splash report ("Something moved in the …") is B's to see; the log line naming the ship is not.
    expect(after.some((t) => /A moved the/.test(t))).toBe(false);
    // Positive control: the line exists, in the mover's own log.
    expect(toPlayerView(g, 0).log.some((e) => /A moved the/.test(e.text))).toBe(true);
    expect(before).not.toContain('Signal log');
  });

  test('the action bar is outside the scroll view, so it is never scrolled away', () => {
    // Every target phone fits without scrolling (tools/screenshots.js measures it);
    // this is what still holds when a large system font makes the screen scroll.
    const root = render(createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] }), 0);
    let n: ReactTestInstance | null = root.find((x) => String(x.type) === 'Text' && x.children.join('') === 'Choose a target in enemy waters');
    const ancestors: string[] = [];
    for (; n; n = n.parent) ancestors.push(typeof n.type === 'string' ? n.type : (n.type as { displayName?: string; name?: string }).displayName ?? (n.type as { name?: string }).name ?? '');
    expect(ancestors.some((t) => /ScrollView/.test(t))).toBe(false);
    // ...and the board is inside it, so a long screen scrolls the content, not the action.
    let cell: ReactTestInstance | null = byLabel(root, 'E5')[0]!;
    let inScroll = false;
    for (; cell; cell = cell.parent) if (/ScrollView/.test(typeof cell.type === 'string' ? cell.type : ((cell.type as { displayName?: string }).displayName ?? ''))) inScroll = true;
    expect(inScroll).toBe(true);
  });

  test('the action bar holds the one action the turn needs', () => {
    let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    let root = render(g, 0);
    expect(texts(root)).toContain('Choose a target in enemy waters');
    g = fire(g, { r: 9, c: 9 }).state;
    act(() => renderer.unmount());
    root = render(g, 0);
    expect(texts(root)).toContain('Hold position & end turn');
    expect(texts(root)).not.toContain('Choose a target in enemy waters');
  });

  // The report strip indexes SHIP_CLASSES with the class your last incoming shot
  // names, and the board reads the poses off your own manoeuvre's record. Neither
  // re-checks: the save validator is what stands in front of them, and before it
  // looked at either field a save naming a class there is not, or holding a null
  // pose, threw here on every Resume and the battle was set aside.
  test('a save whose report line and move record do not hold up still draws, through the validator', async () => {
    let g = createGame({ mode: 'ai', names: ['You', 'AI'], fleets: [fleet(), fleet()], aiPlayer: 1 });
    g = endTurn(fire(g, { r: 9, c: 9 }).state);
    g = endTurn(fire(g, { r: 0, c: 4 }).state); // the computer hits your carrier
    g = fire(g, { r: 9, c: 9 }).state;
    g = maneuver(g, 'patrol', { kind: 'ahead', distance: 1 });
    // Both are drawn from this state as play leaves it: the line, and the move.
    expect(texts(render(g, 0))).toContain('AI fired at E1 and hit your Carrier!');
    act(() => renderer.unmount());

    await saveGame(g, 'normal');
    const payload = JSON.parse((await AsyncStorage.getItem(SAVE_KEY)) as string);
    payload.state.players[0].lastIncoming.classId = 'frigate';
    payload.state.log.find((e: { kind: string }) => e.kind === 'move').move.from = null;
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    const loaded = await loadGame();
    expect(loaded).not.toBeNull();

    const root = render(loaded!.state, 0);
    expect(texts(root).some((t) => /fired at E1/.test(t))).toBe(false);
    expect(texts(root)).toContain('You');
    expect(byLabel(root, 'E5')).toHaveLength(1);
  });

  // In Pass & Play the second seat's strip reads its own report line on its own turn.
  test("the second seat's report line that does not hold up still draws, through the validator", async () => {
    const g = endTurn(fire(createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] }), { r: 0, c: 4 }).state);
    expect(texts(render(g, 1))).toContain('A fired at E1 and hit your Carrier!');
    act(() => renderer.unmount());

    await saveGame(g, 'normal');
    const payload = JSON.parse((await AsyncStorage.getItem(SAVE_KEY)) as string);
    payload.state.players[1].lastIncoming.classId = 'frigate';
    await AsyncStorage.setItem(SAVE_KEY, JSON.stringify(payload));
    const loaded = await loadGame();
    expect(loaded).not.toBeNull();

    const root = render(loaded!.state, 1);
    // The strip falls back to the log's own line for the shot; the report's line about the hull is gone.
    expect(texts(root).some((t) => /hit your/.test(t))).toBe(false);
    expect(texts(root)).toContain('A fired at E1: hit!');
    expect(byLabel(root, 'E5')).toHaveLength(1);
  });

  // The storage note is drawn over the bottom of the window while the store
  // refuses to save; its height comes out of the board, never out of the action bar.
  test('the height kept clear for the storage note comes out of the board', () => {
    const g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
    const boardWidth = (root: ReactTestInstance) => root.findByType(Board).props.width as number;
    const window = Dimensions.get('window');
    const reserve = 600;
    const free = boardWidth(render(g, 0));
    act(() => renderer.unmount());
    act(() => {
      renderer = create(
        <ThemeProvider theme="light">
          <BottomReserve.Provider value={reserve}>
            <GameScreen view={toPlayerView(g, 0)} onFire={() => {}} onManeuver={() => {}} onEndTurn={() => {}} onQuit={() => {}} />
          </BottomReserve.Provider>
        </ThemeProvider>,
      );
    });
    const kept = boardWidth(renderer.root);
    expect(free).toBe(gameLayout(window, { top: 0, right: 0, bottom: 0, left: 0 }).boardWidth);
    expect(kept).toBe(gameLayout(window, { top: 0, right: 0, bottom: reserve, left: 0 }).boardWidth);
    expect(kept).toBeLessThan(free);
    // ...and the screen pads its bottom by it, so the pinned action bar sits above the note.
    const padded = renderer.root.findAll((n) => typeof n.type === 'string' && StyleSheet.flatten(n.props.style)?.paddingBottom === reserve + spacing.lg);
    expect(padded.length).toBeGreaterThan(0);
  });
});
