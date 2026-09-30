import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { Splash } from '../src/engine/types';
import { useReduceMotion } from '../src/motion';
import { SettingsProvider } from '../src/settings';
import { STORAGE_KEYS } from '../src/storage';
import { SplashOverlay } from '../src/ui/components/SplashOverlay';
import { dark, ThemeProvider } from '../src/ui/theme';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The hook has its own tests; here it answers what each case needs, so the
// overlay's response to the answer is what is under test.
jest.mock('../src/motion', () => ({ useReduceMotion: jest.fn(() => false) }));
const reduce = useReduceMotion as jest.Mock;

/** Each test uses its own turns: a report's ripple plays once per app run, by design. */
let turn = 100;
const splash = (quadrant: Splash['quadrant']): Splash => ({ quadrant, turn: (turn += 2) });

const host = (root: ReactTestInstance, id: string) => root.findAll((n) => n.props.testID === id && typeof n.type === 'string');

/** The quadrants drawn as intel, in the order drawn. */
const sectors = (root: ReactTestInstance) =>
  root
    .findAll((n) => typeof n.type === 'string' && /^intel-(NW|NE|SW|SE)$/.test(n.props.testID ?? ''))
    .map((n) => (n.props.testID as string).slice(6));

describe('SplashOverlay', () => {
  let timing: jest.SpyInstance;
  let loop: jest.SpyInstance;
  let renderer: ReactTestRenderer;

  const render = (splashes: Splash[], size = 240) =>
    create(
      <ThemeProvider theme="dark">
        <SplashOverlay size={size} splashes={splashes} />
      </ThemeProvider>,
    );

  beforeEach(async () => {
    await AsyncStorage.clear();
    reduce.mockClear();
    timing = jest.spyOn(Animated, 'timing');
    loop = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
    timing.mockRestore();
    loop.mockRestore();
  });

  test('the reported sector is hatched and outlined, in exactly the reported quadrants', () => {
    reduce.mockReturnValue(false);
    act(() => {
      renderer = render([splash('NE'), splash('SW')]);
    });
    expect(sectors(renderer.root).sort()).toEqual(['NE', 'SW']);
    const ne = StyleSheet.flatten(host(renderer.root, 'intel-NE')[0]!.props.style);
    expect(ne).toMatchObject({ left: 120, top: 0, width: 120, height: 120, borderWidth: 2, borderColor: dark.intel.stroke });
    const sw = StyleSheet.flatten(host(renderer.root, 'intel-SW')[0]!.props.style);
    expect(sw).toMatchObject({ left: 0, top: 120 });
    // Hatched, inside each reported sector.
    for (const q of ['NE', 'SW']) {
      expect(host(host(renderer.root, `intel-${q}`)[0]!, 'intel-hatch').length).toBeGreaterThan(5);
    }
    // No text: a label beneath the cells is overdrawn by any mark in its corner.
    expect(renderer.root.findAll((n) => String(n.type) === 'Text')).toHaveLength(0);
  });

  test('with motion, a new report plays one ripple, never a loop', () => {
    reduce.mockReturnValue(false);
    act(() => {
      renderer = render([splash('NE')]);
    });
    expect(timing).toHaveBeenCalledTimes(1);
    expect(loop).not.toHaveBeenCalled();
    expect(host(renderer.root, 'intel-ripple')).toHaveLength(1);
  });

  test('the same report is not replayed by a re-render or a remount', () => {
    reduce.mockReturnValue(false);
    const s = splash('SE');
    act(() => {
      renderer = render([s]);
    });
    expect(timing).toHaveBeenCalledTimes(1);
    // Re-render with the same report, as every turn update does.
    act(() => {
      renderer.update(
        <ThemeProvider theme="dark">
          <SplashOverlay size={240} splashes={[{ ...s }]} />
        </ThemeProvider>,
      );
    });
    // Switching tabs remounts the board.
    act(() => renderer.unmount());
    act(() => {
      renderer = render([{ ...s }]);
    });
    expect(timing).toHaveBeenCalledTimes(1);
    expect(host(renderer.root, 'intel-ripple')).toHaveLength(0);
    // The sector itself is still there: the report lasts, only the ripple is one-off.
    expect(sectors(renderer.root)).toEqual(['SE']);
    // A new report in the same quadrant does ripple.
    act(() => renderer.unmount());
    act(() => {
      renderer = render([splash('SE')]);
    });
    expect(timing).toHaveBeenCalledTimes(2);
  });

  test('with reduced motion, nothing animates and the intel is all still drawn', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = render([splash('NE'), splash('SW')]);
    });
    expect(timing).not.toHaveBeenCalled();
    expect(loop).not.toHaveBeenCalled();
    expect(host(renderer.root, 'intel-ripple')).toHaveLength(0);
    // The splash is information: reduced motion drops the ripple, never the report.
    expect(sectors(renderer.root).sort()).toEqual(['NE', 'SW']);
    expect(host(renderer.root, 'intel-hatch').length).toBeGreaterThan(10);
  });

  test('two reports in one quadrant draw one sector, the latest', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = render([splash('NW'), splash('NW')]);
    });
    expect(sectors(renderer.root)).toEqual(['NW']);
  });

  test('a report list that is empty draws nothing', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = render([]);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  test("asks the hook with the player's stored setting", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ reduceMotion: 'on' }));
    await act(async () => {
      renderer = create(
        <SettingsProvider>
          <SplashOverlay size={240} splashes={[splash('NE')]} />
        </SettingsProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(reduce).toHaveBeenLastCalledWith('on');
  });
});
