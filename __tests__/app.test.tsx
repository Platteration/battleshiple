import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import App from '../App';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary';

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

function findByText(root: ReactTestInstance, text: string): ReactTestInstance {
  const matches = root.findAll(
    (n) => String(n.type) === 'Text' && n.children.length > 0 && n.children.map((c) => String(c)).join('').includes(text),
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
    // Player 2 is still holding the device: the board only appears after a handoff.
    expect(hasText(root, 'Pass the device to')).toBe(true);
    expect(hasText(root, 'Choose a target')).toBe(false);
    pressText(root, 'ready');
    expect(hasText(root, 'Player 1')).toBe(true);
    expect(hasText(root, 'Choose a target')).toBe(true);
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

  test('a game quit during the computer\'s turn keeps playing when resumed', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    pressText(root, 'Hold position');
    expect(hasText(root, 'is taking their turn')).toBe(true);

    // Quitting mid-think saves a state with the computer to move.
    pressText(root, 'Quit to menu');
    await flush();
    expect(hasText(root, 'Unfinished battle')).toBe(true);

    pressText(root, 'Resume game');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    // The computer takes the turn it owed instead of leaving a dead board.
    expect(hasText(root, 'Admiral Byte fired at')).toBe(true);
    expect(hasText(root, 'is taking their turn')).toBe(false);
  });

  test('a resumed pass & play game goes behind a handoff first', async () => {
    const root = renderer.root;
    pressText(root, 'Pass & Play');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressText(root, 'ready');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressText(root, 'ready');
    pressCell(root, 'A1');
    pressText(root, 'FIRE at A1');
    await flush();

    // Quitting mid-turn: the device may well change hands before the resume.
    pressText(root, 'Quit to menu');
    pressText(root, 'Resume game');
    expect(hasText(root, 'Pass the device to')).toBe(true);
    pressText(root, 'ready');
    expect(hasText(root, 'A1:')).toBe(true);
  });

  test('starting a new battle asks first, because it will spend the saved one', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    await flush();
    pressText(root, 'Quit to menu');
    expect(hasText(root, 'Unfinished battle')).toBe(true);

    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      pressText(root, 'Pass & Play');
      expect(alert).toHaveBeenCalled();
      // Nothing has happened yet: still on the menu, saved battle still offered.
      expect(hasText(root, 'deploy your fleet')).toBe(false);
      expect(hasText(root, 'Unfinished battle')).toBe(true);

      const buttons = (alert.mock.calls[0][2] ?? []) as { text: string; onPress?: () => void }[];
      expect(buttons.map((b) => b.text)).toContain('Cancel');
      const confirm = buttons.find((b) => b.text === 'Discard and start');
      expect(confirm?.onPress).toBeDefined();
      act(() => {
        confirm!.onPress!();
      });
      expect(hasText(root, 'deploy your fleet')).toBe(true);
    } finally {
      alert.mockRestore();
    }
  });

  test('with nothing saved, a new battle starts without a prompt', () => {
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      pressText(renderer.root, 'Play vs Computer');
      expect(alert).not.toHaveBeenCalled();
      expect(hasText(renderer.root, 'deploy your fleet')).toBe(true);
    } finally {
      alert.mockRestore();
    }
  });

  test('a screen that throws while rendering offers a way back instead of dying', () => {
    let explode = true;
    const Maybe = (): React.ReactElement => {
      if (explode) throw new Error('could not draw the battle');
      return <Text>calm waters</Text>;
    };
    const onReset = jest.fn(() => {
      explode = false;
    });
    // React logs the caught error itself; the test does not need to see it.
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    let boundary: ReactTestRenderer;
    try {
      act(() => {
        boundary = create(
          <ErrorBoundary onReset={onReset}>
            <Maybe />
          </ErrorBoundary>,
        );
      });
      expect(hasText(boundary!.root, 'Signal lost')).toBe(true);
      pressText(boundary!.root, 'Back to the menu');
      expect(onReset).toHaveBeenCalledTimes(1);
      // The boundary clears its own error, so the recovered tree renders again.
      expect(hasText(boundary!.root, 'calm waters')).toBe(true);
    } finally {
      quiet.mockRestore();
      act(() => {
        boundary!.unmount();
      });
    }
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
});
