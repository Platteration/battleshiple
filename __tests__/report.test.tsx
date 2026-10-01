import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { afterActionReport } from '../src/engine/report';
import { cellsOf, makeShip } from '../src/engine/ships';
import { GameState, Ship } from '../src/engine/types';
import { GameOverScreen } from '../src/ui/screens/GameOverScreen';
import { ThemeProvider } from '../src/ui/theme';

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

/**
 * A whole scripted battle: A moves its patrol boat once, then rakes B's fleet
 * cell by cell while B fires into one empty corner. Returns the state at each
 * step so a test can look before and after the end.
 */
function battle(): { midway: GameState; over: GameState } {
  let g = createGame({ mode: 'local', names: ['Alice', 'Bob'], fleets: [fleet(), fleet()] });
  const targets = fleet().flatMap(cellsOf);
  let midway: GameState | null = null;
  targets.forEach((t, i) => {
    g = fire(g, t).state;
    if (g.phase === 'over') return;
    if (i === 0) g = maneuver(g, 'patrol', { kind: 'starboard' });
    g = endTurn(g);
    g = fire(g, { r: 9, c: 9 }).state;
    g = endTurn(g);
    if (i === 3) midway = g;
  });
  return { midway: midway!, over: g };
}

describe('afterActionReport', () => {
  const { midway, over } = battle();

  test('refuses a battle still in play: it is no way round the PlayerView', () => {
    expect(midway.phase).not.toBe('over');
    expect(() => afterActionReport(midway)).toThrow(/not over/);
  });

  test('counts each side from the record', () => {
    const r = afterActionReport(over);
    expect(r.winner).toBe(0);
    const [a, b] = r.sides;
    expect(a).toMatchObject({ name: 'Alice', shots: 17, hits: 17, hitRate: 1, manoeuvres: 1, afloat: 5 });
    expect(b).toMatchObject({ name: 'Bob', shots: 16, hits: 0, hitRate: 0, manoeuvres: 0, afloat: 0 });
    expect(r.turns).toBe(Math.floor(over.turn / 2) + 1);
  });

  test("carries both final fleets, A's patrol boat where it moved to, as copies", () => {
    const r = afterActionReport(over);
    expect(r.sides[0].fleet.find((s) => s.id === 'patrol')!.bow).toEqual({ r: 9, c: 1 });
    expect(r.sides[1].fleet.every((s) => s.hits.every(Boolean))).toBe(true);
    r.sides[0].fleet[0]!.bow.r = 5;
    expect(over.players[0].ships[0]!.bow.r).toBe(0);
  });
});

describe('GameOverScreen', () => {
  let renderer: ReactTestRenderer;
  afterEach(() => act(() => renderer.unmount()));

  const texts = (root: ReactTestInstance) =>
    root.findAll((n) => String(n.type) === 'Text' && n.children.length > 0).map((n) => n.children.map(String).join(''));

  test('reads as a report: who won, the table for both sides, and both fleets revealed', () => {
    act(() => {
      renderer = create(
        <ThemeProvider theme="dark">
          <GameOverScreen report={afterActionReport(battle().over)} onRematch={() => {}} onHome={() => {}} />
        </ThemeProvider>,
      );
    });
    const t = texts(renderer.root);
    expect(t).toContain('Alice wins!');
    expect(t).toContain('After-action report');
    for (const row of ['Shots fired', 'Hits', 'Hit rate', 'Manoeuvres', 'Ships afloat']) expect(t).toContain(row);
    expect(t).toContain('100%');
    expect(t.filter((x) => x === 'Alice' || x === 'Bob').length).toBeGreaterThanOrEqual(2);
    // The reveal: one picture per fleet, a picture and not a button.
    const plots = renderer.root.findAll((n) => typeof n.type === 'string' && /fleet at the end$/.test(n.props.accessibilityLabel ?? ''));
    expect(plots.map((n) => n.props.accessibilityLabel)).toEqual(["Alice's fleet at the end", "Bob's fleet at the end"]);
    for (const p of plots) expect(p.props.accessibilityRole).toBe('image');
  });
});
