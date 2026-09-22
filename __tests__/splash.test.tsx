import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Animated, StyleSheet } from 'react-native';
import { act, create, ReactTestInstance, ReactTestRenderer } from 'react-test-renderer';
import { useReduceMotion } from '../src/motion';
import { SettingsProvider } from '../src/settings';
import { STORAGE_KEYS } from '../src/storage';
import { SplashOverlay } from '../src/ui/components/SplashOverlay';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// The hook has its own tests; here it answers what each case needs, so the
// overlay's response to the answer is what is under test.
jest.mock('../src/motion', () => ({ useReduceMotion: jest.fn(() => false) }));
const reduce = useReduceMotion as jest.Mock;

/** Every ripple's opacity as the host view received it. Animated.View hands its host resolved numbers. */
function rippleOpacities(root: ReactTestInstance): number[] {
  return root
    .findAll((n) => String(n.type) === 'View')
    .map((n) => StyleSheet.flatten(n.props.style) as { opacity?: unknown; borderRadius?: unknown })
    .filter((s) => typeof s.opacity === 'number' && typeof s.borderRadius === 'number')
    .map((s) => s.opacity as number);
}

describe('SplashOverlay', () => {
  let loop: jest.SpyInstance;
  let renderer: ReactTestRenderer;

  beforeEach(async () => {
    await AsyncStorage.clear();
    reduce.mockClear();
    loop = jest.spyOn(Animated, 'loop');
  });

  afterEach(() => {
    act(() => {
      renderer.unmount();
    });
    loop.mockRestore();
  });

  test('with motion, every ripple runs its loop', () => {
    reduce.mockReturnValue(false);
    act(() => {
      renderer = create(<SplashOverlay size={240} quadrants={['NE']} />);
    });
    // Three ripples per quadrant, each on its own loop.
    expect(loop).toHaveBeenCalledTimes(3);
    expect(rippleOpacities(renderer.root)).toHaveLength(3);
  });

  test('with reduced motion, no loop starts and the ring is held where it can be seen', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = create(<SplashOverlay size={240} quadrants={['NE', 'SW']} />);
    });
    expect(loop).not.toHaveBeenCalled();
    // The splash is information: a still ripple is still drawn, not hidden.
    // A ripple left at its starting point would be invisible (opacity 0).
    const opacities = rippleOpacities(renderer.root);
    expect(opacities).toHaveLength(6);
    for (const o of opacities) expect(o).toBeGreaterThan(0.5);
  });

  test('a quadrant list that is empty draws nothing', () => {
    reduce.mockReturnValue(true);
    act(() => {
      renderer = create(<SplashOverlay size={240} quadrants={[]} />);
    });
    expect(renderer.toJSON()).toBeNull();
  });

  test("asks the hook with the player's stored setting", async () => {
    await AsyncStorage.setItem(STORAGE_KEYS.settings, JSON.stringify({ reduceMotion: 'on' }));
    await act(async () => {
      renderer = create(
        <SettingsProvider>
          <SplashOverlay size={240} quadrants={['NE']} />
        </SettingsProvider>,
      );
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(reduce).toHaveBeenLastCalledWith('on');
  });
});
