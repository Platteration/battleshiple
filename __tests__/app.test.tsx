import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import App from '../App';
import { headingArrow } from '../src/engine/geometry';
import { seededRng } from '../src/engine/random';
import { randomFleet } from '../src/engine/ships';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn().mockResolvedValue(undefined),
  impactAsync: jest.fn().mockResolvedValue(undefined),
  notificationAsync: jest.fn().mockResolvedValue(undefined),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

jest.mock('react-native-safe-area-context', () => {
  const inset = { top: 0, right: 0, bottom: 0, left: 0 };
  return {
    SafeAreaProvider: ({ children }: { children: React.ReactNode }) => children,
    useSafeAreaInsets: () => inset,
  };
});

function matchingTexts(root: ReactTestInstance, text: string): ReactTestInstance[] {
  return root.findAll(
    (n) => String(n.type) === 'Text' && n.children.length > 0 && n.children.map((c) => String(c)).join('').includes(text),
  );
}

function findByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const matches = matchingTexts(root, text);
  if (matches.length === 0) throw new Error(`No text node containing "${text}"`);
  return matches[0];
}

function hasText(root: ReactTestInstance, text: string): boolean {
  return matchingTexts(root, text).length > 0;
}

function enabledPressable(node: ReactTestInstance): ReactTestInstance | null {
  let cur: ReactTestInstance | null = node;
  while (cur) {
    if (typeof cur.props.onPress === 'function' && !cur.props.disabled) return cur;
    cur = cur.parent;
  }
  return null;
}

/**
 * Press the control whose label contains `text`. The same words can appear in a
 * status banner and on a button, so every match is tried before giving up.
 */
function pressText(root: ReactTestInstance, text: string) {
  for (const node of matchingTexts(root, text)) {
    const target = enabledPressable(node);
    if (target) {
      act(() => {
        target.props.onPress();
      });
      return;
    }
  }
  throw new Error(`No enabled pressable for text "${text}"`);
}

function pressCell(root: ReactTestInstance, label: string) {
  const cell = root.find((n) => n.props.accessibilityLabel === label && typeof n.props.onPress === 'function');
  act(() => {
    cell.props.onPress();
  });
}

describe('App', () => {
  let renderer: ReactTestRenderer;

  async function flush() {
    await act(async () => {
      await Promise.resolve();
    });
  }

  beforeEach(async () => {
    await AsyncStorage.clear();
    jest.useFakeTimers();
    await act(async () => {
      renderer = create(<App />);
    });
    await flush();
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
    // Player 2 deployed last, so the device is in their hands: the board must NOT
    // appear until it has been handed back to player 1.
    expect(hasText(root, 'Pass the device to')).toBe(true);
    expect(hasText(root, 'Enemy waters')).toBe(false);
    pressText(root, 'ready');
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

  test('difficulty can be chosen and describes itself', () => {
    const root = renderer.root;
    expect(hasText(root, 'Hunts methodically')).toBe(true);
    pressText(root, 'Hard');
    expect(hasText(root, 'Reads your splashes')).toBe(true);
    pressText(root, 'Easy');
    expect(hasText(root, 'rarely repositions')).toBe(true);
  });

  test('an interrupted game is autosaved and can be resumed from the menu', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    await flush();

    // The board state reached AsyncStorage.
    const saved = await AsyncStorage.getItem('battleshiple:savegame:v1');
    expect(saved).not.toBeNull();
    expect(JSON.parse(saved as string).state.players[0].shots).toHaveLength(1);

    pressText(root, 'Quit to menu');
    expect(hasText(root, 'Unfinished battle')).toBe(true);
    expect(hasText(root, 'vs Computer')).toBe(true);

    pressText(root, 'Resume game');
    // Back in the same match, with the shot already on the board.
    expect(hasText(root, 'B3:')).toBe(true);
    expect(hasText(root, 'Unfinished battle')).toBe(false);
  });

  test('a saved game found at launch is offered, and can be discarded', async () => {
    // Leave a save behind, then remount as if the app had been reopened.
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'C4');
    pressText(root, 'FIRE at C4');
    await flush();
    act(() => {
      renderer.unmount();
    });

    let fresh: ReactTestRenderer;
    await act(async () => {
      fresh = create(<App />);
    });
    await flush();
    expect(hasText(fresh!.root, 'Unfinished battle')).toBe(true);
    pressText(fresh!.root, 'Discard');
    await flush();
    expect(hasText(fresh!.root, 'Unfinished battle')).toBe(false);
    expect(await AsyncStorage.getItem('battleshiple:savegame:v1')).toBeNull();
    act(() => {
      fresh!.unmount();
    });
  });

  test('a game quit during the computer\'s pause resumes playable, not deadlocked', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'D4');
    pressText(root, 'FIRE at D4');
    pressText(root, 'Hold position');
    // The AI now owns the turn but its 900 ms timer has not fired yet.
    expect(hasText(root, 'is taking their turn')).toBe(true);
    pressText(root, 'Quit to menu');
    await flush();

    // The save was taken while it was the computer's move.
    const raw = await AsyncStorage.getItem('battleshiple:savegame:v1');
    expect(JSON.parse(raw as string).state.current).toBe(1);

    pressText(root, 'Resume game');
    // Resuming must restart the computer's turn; otherwise the board is dead.
    act(() => {
      jest.advanceTimersByTime(2000);
    });
    expect(hasText(root, 'Admiral Byte fired at')).toBe(true);
    expect(hasText(root, 'Choose a target')).toBe(true);
    // And the human can actually act again.
    pressCell(root, 'F6');
    expect(hasText(root, 'FIRE at F6')).toBe(true);
  });

  test('resuming a pass-and-play game always hands off before showing a board', async () => {
    const root = renderer.root;
    pressText(root, 'Pass & Play');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressText(root, 'ready');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressText(root, 'ready');
    // Player 1 fires, leaving the game in the manoeuvre phase mid-turn.
    pressCell(root, 'A1');
    pressText(root, 'FIRE at A1');
    expect(hasText(root, 'Hold position')).toBe(true);
    pressText(root, 'Quit to menu');
    await flush();

    pressText(root, 'Resume game');
    // Whoever picks the device up must not be shown the board straight away.
    expect(hasText(root, 'Pass the device to')).toBe(true);
    expect(hasText(root, 'Enemy waters')).toBe(false);
    pressText(root, 'ready');
    expect(hasText(root, 'Enemy waters')).toBe(true);
  });

  test('illegal manoeuvres are not offered: mobility gates the controls', () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'J10');
    pressText(root, 'FIRE at J10');

    // The carrier has mobility 1, so it must never offer a two-cell run.
    pressText(root, 'Carrier');
    expect(hasText(root, 'Ahead 1')).toBe(true);
    expect(hasText(root, 'Ahead 2')).toBe(false);
    // The patrol boat has mobility 2, so it must.
    pressText(root, 'Patrol Boat');
    expect(hasText(root, 'Ahead 2')).toBe(true);
  });

  test('only one ship may manoeuvre per turn', () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressCell(root, 'E1');
    pressCell(root, 'E2');
    pressCell(root, 'E3');
    pressCell(root, 'E4');
    pressCell(root, 'B5');
    pressText(root, 'Start battle');
    pressCell(root, 'J10');
    pressText(root, 'FIRE at J10');

    pressText(root, 'Patrol Boat');
    pressText(root, 'Ahead 2');
    pressText(root, 'Confirm: ahead 2');
    // The panel is gone; a second manoeuvre must be impossible this turn.
    expect(hasText(root, 'Manoeuvre complete')).toBe(true);
    expect(hasText(root, 'Ahead 2')).toBe(false);
    expect(() => pressText(root, 'Carrier')).toThrow();
  });

  test('the incoming banner keeps naming the ship after you evade with it', () => {
    const root = renderer.root;
    // Both admirals deploy identically, so the coordinates are known.
    const place = () => {
      for (const cell of ['E1', 'E2', 'E3', 'E4', 'B5']) pressCell(root, cell);
      pressText(root, 'Start battle');
    };
    pressText(root, 'Pass & Play');
    place();
    pressText(root, 'ready');
    place();
    pressText(root, 'ready');

    // Player 1 hits player 2's patrol boat (bow at B5).
    pressCell(root, 'B5');
    pressText(root, 'FIRE at B5');
    expect(hasText(root, 'B5: HIT')).toBe(true);
    pressText(root, 'Hold position');
    pressText(root, 'ready');

    // Player 2 is told exactly what was hit.
    expect(hasText(root, 'Player 1 fired at B5 and hit your Patrol Boat!')).toBe(true);

    // Player 2 fires, then evades with that very ship.
    pressCell(root, 'J10');
    pressText(root, 'FIRE at J10');
    pressText(root, 'Patrol Boat');
    pressText(root, 'Ahead 2');
    pressText(root, 'Confirm: ahead 2');

    // Nothing sits at B5 any more, so a banner re-derived from live hulls would
    // lose the ship's name. The snapshot must keep it.
    expect(hasText(root, 'Player 1 fired at B5 and hit your Patrol Boat!')).toBe(true);
    expect(hasText(root, 'hit your ship')).toBe(false);
  });

  test('after Random, the Rotate control follows the selected ship, not a stale heading', () => {
    // Random gives every hull its own heading. The control used to keep showing
    // (and rotating from) whatever heading was last used for a manual drop.
    const SEED = 1;
    const gen = seededRng(SEED);
    const spy = jest.spyOn(Math, 'random').mockImplementation(() => gen());
    try {
      const root = renderer.root;
      pressText(root, 'Play vs Computer');
      pressText(root, 'Random');

      const carrier = randomFleet(seededRng(SEED)).find((s) => s.classId === 'carrier')!;
      expect(carrier.heading).not.toBe('E'); // otherwise this asserts nothing
      // The Carrier is the selected ship, so the button must show ITS heading.
      expect(hasText(root, `Rotate ${headingArrow(carrier.heading)}`)).toBe(true);
      expect(hasText(root, `Rotate ${headingArrow('E')}`)).toBe(false);
    } finally {
      spy.mockRestore();
    }
  });
});
