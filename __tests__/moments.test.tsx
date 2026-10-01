import React from 'react';
import { Animated } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { makeShip } from '../src/engine/ships';
import { GameState, Ship } from '../src/engine/types';
import { toPlayerView } from '../src/engine/view';
import { useReduceMotion } from '../src/motion';
import { emptyGrid, hullOf, paintShips } from '../src/ui/boardView';
import { Board } from '../src/ui/components/Board';
import { TWEEN_MS } from '../src/ui/components/Hull';
import { GameScreen } from '../src/ui/screens/GameScreen';
import { ThemeProvider } from '../src/ui/theme';

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
jest.mock('../src/motion', () => ({ useReduceMotion: jest.fn(() => false) }));
const reduce = useReduceMotion as jest.Mock;

function fleet(): Ship[] {
  return [
    makeShip('carrier', { r: 0, c: 4 }, 'E'),
    makeShip('battleship', { r: 2, c: 3 }, 'E'),
    makeShip('destroyer', { r: 4, c: 2 }, 'E'),
    makeShip('submarine', { r: 6, c: 2 }, 'E'),
    makeShip('patrol', { r: 8, c: 1 }, 'E'),
  ];
}

/** A moved its patrol boat this turn; the game is still in A's manoeuvre phase. */
/**
 * Each test uses a manoeuvre no other test uses: a moment plays once per app
 * run, keyed by turn, ship and destination, and a test that reused another's
 * key would pass whatever the code did.
 */
function aMoved(kind: 'starboard' | 'port' | 'rotateCW', firstShot = { r: 9, c: 9 }): GameState {
  let g = createGame({ mode: 'local', names: ['A', 'B'], fleets: [fleet(), fleet()] });
  g = fire(g, firstShot).state;
  return maneuver(g, 'patrol', { kind });
}

let timing: jest.SpyInstance;
let renderer: ReactTestRenderer;
const tweens = () => timing.mock.calls.filter((c) => (c[1] as { duration?: number }).duration === TWEEN_MS).length;

beforeEach(() => {
  reduce.mockReset();
  reduce.mockReturnValue(false);
  timing = jest.spyOn(Animated, 'timing');
});
afterEach(() => {
  act(() => renderer.unmount());
  timing.mockRestore();
});

function screen(state: GameState, viewer: 0 | 1) {
  return (
    <ThemeProvider theme="light">
      <GameScreen view={toPlayerView(state, viewer)} onFire={() => {}} onManeuver={() => {}} onEndTurn={() => {}} onQuit={() => {}} />
    </ThemeProvider>
  );
}

describe('your own manoeuvre plays out once', () => {
  test('a slide, from the old footprint to the new one, once however often it is drawn', () => {
    const g = aMoved('starboard', { r: 9, c: 8 });
    act(() => {
      renderer = create(screen(g, 0));
    });
    expect(tweens()).toBe(1);
    act(() => renderer.update(screen(g, 0)));
    act(() => renderer.unmount());
    act(() => {
      renderer = create(screen(g, 0));
    });
    expect(tweens()).toBe(1);
  });

  test('a turn about the bow fades the old outline out instead of sliding', () => {
    act(() => {
      renderer = create(screen(aMoved('rotateCW', { r: 9, c: 7 }), 0));
    });
    expect(tweens()).toBe(1);
    expect(renderer.root.findAll((n) => n.props.testID === 'hull-ghost-patrol' && typeof n.type === 'string')).toHaveLength(1);
  });

  test("the opponent's view of the same manoeuvre animates nothing: it is not in their log", () => {
    let g = aMoved('starboard', { r: 9, c: 6 });
    g = endTurn(g);
    act(() => {
      renderer = create(screen(g, 1));
    });
    // B peeks at their own fleet too, where a tween would have to be drawn.
    const peek = renderer.root.find((n) => n.props.accessibilityLabel === 'Show your fleet' && typeof n.props.onPress === 'function');
    act(() => peek.props.onPress());
    expect(tweens()).toBe(0);
    // Positive control: A's own view of that turn has the entry the tween reads.
    expect(toPlayerView(g, 0).log.some((e) => e.kind === 'move')).toBe(true);
  });

  test('with reduced motion the hull is simply where it ended up', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = create(screen(aMoved('port', { r: 9, c: 5 }), 0));
    });
    expect(tweens()).toBe(0);
  });
});

describe('a wreck is badged SUNK, once, instead of a mark on every section', () => {
  const crosses = (root: ReactTestInstance) => root.findAll((n) => String(n.type) === 'Text' && n.children.join('') === '✕').length;

  function board(ships: Ship[]) {
    const grid = emptyGrid();
    paintShips(grid, ships);
    return (
      <ThemeProvider theme="dark">
        <Board grid={grid} hulls={ships.map((s) => hullOf(s))} width={330} />
      </ThemeProvider>
    );
  }

  test('no ✕ on a wreck; a damaged ship afloat keeps its marks', () => {
    const wreck = { ...makeShip('destroyer', { r: 4, c: 2 }, 'E'), hits: [true, true, true] };
    const damaged = { ...makeShip('battleship', { r: 2, c: 3 }, 'E'), hits: [false, true, true, false] };
    act(() => {
      renderer = create(board([wreck, damaged]));
    });
    expect(crosses(renderer.root)).toBe(2);
    const badges = renderer.root.findAll((n) => String(n.type) === 'Text' && n.children.join('') === 'Sunk');
    expect(badges).toHaveLength(1);
  });

  test('the badge fades in the first time that wreck is drawn, and is simply there after', () => {
    const wreck = { ...makeShip('patrol', { r: 7, c: 7 }, 'N'), hits: [true, true] };
    const fades = () => timing.mock.calls.filter((c) => (c[1] as { duration?: number }).duration === 300).length;
    act(() => {
      renderer = create(board([wreck]));
    });
    expect(fades()).toBe(1);
    act(() => renderer.unmount());
    act(() => {
      renderer = create(board([wreck]));
    });
    expect(fades()).toBe(1);
  });
});
