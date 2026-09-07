import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import App from '../App';

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

function findByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const matches = root.findAll(
    (n) => n.type === 'Text' && n.children.length > 0 && n.children.map((c) => String(c)).join('').includes(text),
  );
  if (matches.length === 0) throw new Error(`No text node containing "${text}"`);
  return matches[0];
}

function hasText(root: ReactTestInstance, text: string): boolean {
  try {
    findByText(root, text);
    return true;
  } catch {
    return false;
  }
}

function pressable(node: ReactTestInstance): ReactTestInstance {
  let cur: ReactTestInstance | null = node;
  while (cur) {
    if (typeof cur.props.onPress === 'function' && !cur.props.disabled) return cur;
    cur = cur.parent;
  }
  throw new Error('No enabled pressable ancestor');
}

function pressText(root: ReactTestInstance, text: string) {
  act(() => {
    pressable(findByText(root, text)).props.onPress();
  });
}

function pressCell(root: ReactTestInstance, label: string) {
  const cell = root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  act(() => {
    cell.props.onPress();
  });
}

describe('App', () => {
  let renderer: ReactTestRenderer;

  beforeEach(() => {
    jest.useFakeTimers();
    act(() => {
      renderer = create(<App />);
    });
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
    jest.useRealTimers();
  });

  test('renders the home screen', () => {
    expect(hasText(renderer.root, 'BATTLESHIPLE')).toBe(true);
    expect(hasText(renderer.root, 'Play vs Computer')).toBe(true);
  });

  test('vs computer: deploy, fire, manoeuvre, and let the AI answer', () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    expect(hasText(root, 'deploy your fleet')).toBe(true);

    pressText(root, 'Random');
    pressText(root, 'Start battle');
    expect(hasText(root, 'Choose a target')).toBe(true);

    pressCell(root, 'E5');
    expect(hasText(root, 'FIRE at E5')).toBe(true);
    pressText(root, 'FIRE at E5');
    expect(hasText(root, 'E5:')).toBe(true);

    // The manoeuvre panel appears with the fleet cards; hold position to end the turn.
    expect(hasText(root, 'Hold position')).toBe(true);
    pressText(root, 'Hold position');
    expect(hasText(root, 'is taking their turn')).toBe(true);

    act(() => {
      jest.advanceTimersByTime(1500);
    });
    // Back to the human with a report of what the AI did.
    expect(hasText(root, 'Admiral Byte fired at')).toBe(true);
    expect(hasText(root, 'Choose a target')).toBe(true);
  });

  test('pass and play: both players deploy, handoff screens appear between turns', () => {
    const root = renderer.root;
    pressText(root, 'Pass & Play');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    expect(hasText(root, 'Pass the device to')).toBe(true);
    pressText(root, 'ready');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    expect(hasText(root, 'Player 1')).toBe(true);
    pressCell(root, 'A1');
    pressText(root, 'FIRE at A1');
    pressText(root, 'Hold position');
    expect(hasText(root, 'Pass the device to')).toBe(true);
    pressText(root, 'ready');
    expect(hasText(root, 'Player 1 fired at A1')).toBe(true);
  });

  test('manual placement rejects overlaps and the manoeuvre preview/confirm flow works', () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    // Carrier heading E with bow at E1 occupies A1..E1.
    pressCell(root, 'E1');
    expect(hasText(root, 'Now place the Battleship')).toBe(true);
    // Overlap: battleship bow at H1 heading E would cover E1..H1, colliding with the carrier.
    pressCell(root, 'H1');
    expect(hasText(root, "doesn't fit")).toBe(true);
    pressCell(root, 'D2');
    pressCell(root, 'C3');
    pressCell(root, 'C4');
    pressCell(root, 'B5');
    expect(hasText(root, 'All ships placed')).toBe(true);
    pressText(root, 'Start battle');

    pressCell(root, 'J10');
    pressText(root, 'FIRE at J10');
    // Select the patrol boat (bow B5 heading E -> A5..B5) and move it ahead 2 -> C5..D5.
    pressText(root, 'Patrol Boat');
    pressText(root, 'Ahead 2');
    expect(hasText(root, 'Confirm: ahead 2')).toBe(true);
    pressText(root, 'Confirm: ahead 2');
    expect(hasText(root, 'Manoeuvre complete')).toBe(true);
    expect(hasText(root, 'End turn')).toBe(true);
  });
});
