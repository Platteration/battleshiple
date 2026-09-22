import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Alert, Platform, Text } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import App from '../App';
import { fire } from '../src/engine';
import { loadGame } from '../src/storage';
import { ErrorBoundary } from '../src/ui/components/ErrorBoundary';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The engine and the store stay real; these two are wrapped so that a single
// test can make the computer's turn fail, or hand the app a save no build of it
// would ever write.
jest.mock('../src/engine', () => {
  const actual = jest.requireActual('../src/engine');
  return { ...actual, fire: jest.fn(actual.fire) };
});

jest.mock('../src/storage', () => {
  const actual = jest.requireActual('../src/storage');
  return { ...actual, loadGame: jest.fn(actual.loadGame) };
});

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

  test('the setup chips, board cells, tabs and fleet cards carry roles and states for a screen reader', () => {
    const root = renderer.root;
    // A Pressable and the Views it renders all carry the props; the outermost node of each is counted once.
    const outer = (nodes: ReactTestInstance[]) =>
      nodes.filter(
        (n) =>
          !n.parent ||
          n.parent.props.accessibilityRole !== n.props.accessibilityRole ||
          n.parent.props.accessibilityLabel !== n.props.accessibilityLabel,
      );
    const labelled = (re: RegExp) => outer(root.findAll((n) => re.test(String(n.props.accessibilityLabel))));
    const selectedOf = (nodes: ReactTestInstance[]) => nodes.filter((n) => n.props.accessibilityState?.selected === true);

    pressText(root, 'Play vs Computer');
    const chips = labelled(/, (placed|not placed)$/);
    expect(chips).toHaveLength(5);
    for (const chip of chips) expect(chip.props.accessibilityRole).toBe('button');
    expect(selectedOf(chips)).toHaveLength(1);

    pressText(root, 'Random');
    pressText(root, 'Start battle');
    expect(root.findAll((n) => n.props.accessibilityRole === 'tablist').length).toBeGreaterThan(0);
    let tabs = outer(root.findAll((n) => n.props.accessibilityRole === 'tab'));
    expect(tabs).toHaveLength(2);
    expect(tabs.map((t) => t.props.accessibilityState.selected)).toEqual([true, false]);

    const cells = labelled(/^[A-J](10|[1-9])$/);
    expect(cells).toHaveLength(100);
    for (const cell of cells) expect(cell.props.accessibilityRole).toBe('button');
    expect(selectedOf(cells)).toHaveLength(0);
    // The locked target is the one cell FIRE will act on.
    pressCell(root, 'E5');
    const locked = selectedOf(labelled(/^[A-J](10|[1-9])$/));
    expect(locked.map((n) => n.props.accessibilityLabel)).toEqual(['E5']);

    pressText(root, 'FIRE at E5');
    // The manoeuvre phase switches to the fleet tab, whose cards are pressable.
    tabs = outer(root.findAll((n) => n.props.accessibilityRole === 'tab'));
    expect(tabs.map((t) => t.props.accessibilityState.selected)).toEqual([false, true]);
    const cards = labelled(/, (ready|sunk|ready in \d+)$/);
    expect(cards).toHaveLength(5);
    for (const card of cards) expect(card.props.accessibilityRole).toBe('button');
    expect(selectedOf(cards)).toHaveLength(0);
    pressText(root, 'Patrol Boat');
    expect(selectedOf(labelled(/, (ready|sunk|ready in \d+)$/)).map((n) => n.props.accessibilityLabel)).toEqual(['Patrol Boat, ready']);
  });

  test('difficulty can be chosen and describes itself', () => {
    const root = renderer.root;
    expect(hasText(root, 'Hunts methodically')).toBe(true);
    pressText(root, 'Hard');
    expect(hasText(root, 'Reads your splashes')).toBe(true);
    pressText(root, 'Easy');
    expect(hasText(root, 'rarely repositions')).toBe(true);
  });

  test('the chosen difficulty survives a restart', async () => {
    pressText(renderer.root, 'Hard');
    await flush();
    // It is a preference, so it lives in the settings record, not with the game.
    const stored = JSON.parse((await AsyncStorage.getItem('battleshiple.settings.v1')) as string);
    expect(stored.difficulty).toBe('hard');
    expect(await AsyncStorage.getItem('battleshiple:savegame:v1')).toBeNull();
    act(() => {
      renderer.unmount();
    });

    let fresh: ReactTestRenderer;
    await act(async () => {
      fresh = create(<App />);
    });
    await flush();
    expect(hasText(fresh!.root, 'Reads your splashes')).toBe(true);
    act(() => {
      fresh!.unmount();
    });
  });

  test('the skill control waits for the stored record rather than show Normal for a frame', async () => {
    act(() => {
      renderer.unmount();
    });
    await AsyncStorage.setItem('battleshiple.settings.v1', JSON.stringify({ difficulty: 'hard' }));
    // Hold the settings read open; the savegame read goes through as usual.
    // The store is already a jest.fn, so its implementation is swapped and
    // put back by hand: a spy's mockRestore would strip it for good.
    const getItem = AsyncStorage.getItem as jest.Mock;
    const original = getItem.getMockImplementation()!;
    let release: (raw: string | null) => void = () => {};
    const held = new Promise<string | null>((resolve) => {
      release = resolve;
    });
    getItem.mockImplementation((key: string) => (key === 'battleshiple.settings.v1' ? held : original(key)));
    let fresh: ReactTestRenderer;
    try {
      await act(async () => {
        fresh = create(<App />);
      });
      await flush();
      // The rest of the menu is up; the control that would say Normal is not.
      expect(hasText(fresh!.root, 'Play vs Computer')).toBe(true);
      expect(hasText(fresh!.root, 'Computer skill')).toBe(false);
      expect(hasText(fresh!.root, 'Hunts methodically')).toBe(false);

      await act(async () => {
        release(JSON.stringify({ difficulty: 'hard' }));
      });
      await flush();
      expect(hasText(fresh!.root, 'Computer skill')).toBe(true);
      expect(hasText(fresh!.root, 'Reads your splashes')).toBe(true);
      expect(hasText(fresh!.root, 'Hunts methodically')).toBe(false);
    } finally {
      getItem.mockImplementation(original);
      act(() => {
        fresh!.unmount();
      });
    }
  });

  test('a stored difficulty the engine has no profile for falls back rather than crashing the computer\'s turn', async () => {
    act(() => {
      renderer.unmount();
    });
    await AsyncStorage.setItem('battleshiple.settings.v1', '{"difficulty":"constructor","haptics":"on"}');
    let fresh: ReactTestRenderer;
    await act(async () => {
      fresh = create(<App />);
    });
    await flush();
    expect(hasText(fresh!.root, 'Hunts methodically')).toBe(true);
    act(() => {
      fresh!.unmount();
    });
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

  test('on the web the same prompt goes through the browser, and the answer decides', async () => {
    // react-native-web's Alert.alert is `static alert() {}`: with a saved
    // battle, the start buttons used to do nothing at all on that platform.
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    await flush();
    pressText(root, 'Quit to menu');
    expect(hasText(root, 'Unfinished battle')).toBe(true);

    const realOS = Platform.OS;
    const win = window as unknown as { confirm: (m?: string) => boolean };
    const realConfirm = win.confirm;
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(function alert() {});
    try {
      Platform.OS = 'web';
      win.confirm = jest.fn(() => false);
      pressText(root, 'Pass & Play');
      expect(win.confirm).toHaveBeenCalledTimes(1);
      expect(hasText(root, 'deploy your fleet')).toBe(false);
      expect(hasText(root, 'Unfinished battle')).toBe(true);

      win.confirm = jest.fn(() => true);
      pressText(root, 'Pass & Play');
      expect(hasText(root, 'deploy your fleet')).toBe(true);
      expect(alert).not.toHaveBeenCalled();
    } finally {
      Platform.OS = realOS;
      win.confirm = realConfirm;
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

  test('Settings is reached from the menu and leads back to it', async () => {
    const root = renderer.root;
    pressText(root, 'Settings');
    expect(hasText(root, 'Vibration')).toBe(true);
    expect(hasText(root, 'Reduce motion')).toBe(true);
    expect(hasText(root, 'Nothing leaves your device')).toBe(true);
    // A setting changed here is on the disk before the screen is left.
    pressText(root, 'Off');
    await flush();
    expect(JSON.parse((await AsyncStorage.getItem('battleshiple.settings.v1')) as string).reduceMotion).toBe('off');
    pressText(root, 'Back to menu');
    expect(hasText(root, 'BATTLESHIPLE')).toBe(true);
    expect(hasText(root, 'Play vs Computer')).toBe(true);
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

  // The computer's turn runs inside a timer. React error boundaries only see
  // throws from render, so one from here leaves the timer as a fatal exception
  // (JSTimers rethrows it) and takes the process with it.
  //
  // The state that failed is also the state on the disk – the autosave writes
  // whatever is on screen – and `loadGame` only deletes a save it *refuses*,
  // which this one is not. So the menu must not offer it straight back, or
  // Resume is a loop with the same failure at the end of it every time.
  test('a computer turn that throws goes back to the menu and is not offered again', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    pressText(root, 'Hold position');
    expect(hasText(root, 'is taking their turn')).toBe(true);

    const logged = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      (fire as jest.Mock).mockImplementationOnce(() => {
        throw new Error('the state could not be played');
      });
      act(() => {
        jest.advanceTimersByTime(1500);
      });
      await flush();

      // Back at the menu...
      expect(hasText(root, 'BATTLESHIPLE')).toBe(true);
      // ...told why, and without the offer that would walk straight back in.
      expect(hasText(root, 'could not be played')).toBe(true);
      expect(hasText(root, 'has not been deleted')).toBe(true);
      expect(hasText(root, 'Unfinished battle')).toBe(false);
      // The failure left a trace: 'it goes back to the menu sometimes' is not a
      // bug report anyone can act on.
      expect(logged).toHaveBeenCalled();
      expect(String(logged.mock.calls[0][1])).toContain('the state could not be played');
    } finally {
      logged.mockRestore();
    }

    // The battle is set aside, not deleted: it is still on the disk, and a new
    // one would still spend it, so starting one still asks first.
    expect(await AsyncStorage.getItem('battleshiple:savegame:v1')).not.toBeNull();
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
    try {
      pressText(root, 'Play vs Computer');
      expect(alert).toHaveBeenCalled();
    } finally {
      alert.mockRestore();
    }
  });

  test('the computer is never asked to take a turn it cannot take', async () => {
    const root = renderer.root;
    pressText(root, 'Play vs Computer');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    pressCell(root, 'B3');
    pressText(root, 'FIRE at B3');
    await flush();
    act(() => {
      renderer.unmount();
    });

    // A save with the computer to move in the manoeuvre phase: every field is
    // valid on its own, and the turn it would start with throws. The validator
    // refuses it, so it is forced past that here as a later build might.
    const poisoned = JSON.parse((await AsyncStorage.getItem('battleshiple:savegame:v1')) as string);
    poisoned.state.current = 1;
    poisoned.state.phase = 'maneuver';
    (loadGame as jest.Mock).mockResolvedValueOnce(poisoned);

    let fresh: ReactTestRenderer;
    await act(async () => {
      fresh = create(<App />);
    });
    await flush();
    expect(hasText(fresh!.root, 'Unfinished battle')).toBe(true);
    (fire as jest.Mock).mockClear();
    pressText(fresh!.root, 'Resume game');
    act(() => {
      jest.advanceTimersByTime(1500);
    });
    await flush();
    // The driver does not fire out of the firing phase...
    expect(fire).not.toHaveBeenCalled();
    // ...and does not leave the player on the board it has just decided it
    // cannot play either: the computer is to move, so nothing on that screen
    // advances anything. It gives up the way a failed turn does.
    expect(hasText(fresh!.root, 'BATTLESHIPLE')).toBe(true);
    expect(hasText(fresh!.root, 'Quit to menu')).toBe(false);
    // The save it came from is one the validator now refuses outright, so the
    // player is told that rather than promised it back on the next launch.
    expect(hasText(fresh!.root, 'could not be read back')).toBe(true);
    act(() => {
      fresh!.unmount();
    });
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
