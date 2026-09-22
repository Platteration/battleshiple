import React from 'react';
import { AccessibilityInfo, Platform, Text } from 'react-native';
import { act, create, ReactTestRenderer } from 'react-test-renderer';
import { systemReducesMotion, useReduceMotion } from '../src/motion';
import type { ReduceMotionSetting } from '../src/settings';

function Probe({ setting }: { setting: ReduceMotionSetting }) {
  return <Text>{useReduceMotion(setting) ? 'still' : 'moving'}</Text>;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function render(setting: ReduceMotionSetting): Promise<ReactTestRenderer> {
  let r: ReactTestRenderer;
  await act(async () => {
    r = create(<Probe setting={setting} />);
  });
  await settle();
  return r!;
}

const shown = (r: ReactTestRenderer) => r.root.findByType(Text).props.children;

// jest's AccessibilityInfo is a mock module: the query resolves false and the
// listener returns a removable subscription. Each case sets what it needs.
const query = AccessibilityInfo.isReduceMotionEnabled as jest.Mock;
const listen = AccessibilityInfo.addEventListener as jest.Mock;
type Handler = (on: boolean) => void;

describe('useReduceMotion', () => {
  const realOS = Platform.OS;
  const realMatchMedia = (window as unknown as { matchMedia?: unknown }).matchMedia;
  let remove: jest.Mock;

  beforeEach(() => {
    remove = jest.fn();
    query.mockReset().mockResolvedValue(false);
    listen.mockReset().mockImplementation(() => ({ remove }));
  });

  afterEach(() => {
    Platform.OS = realOS;
    (window as unknown as { matchMedia?: unknown }).matchMedia = realMatchMedia;
  });

  test("'on' and 'off' are the player's word and never ask the platform", async () => {
    query.mockResolvedValue(true);
    expect(shown(await render('off'))).toBe('moving');
    expect(shown(await render('on'))).toBe('still');
    expect(query).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
  });

  test("'system' follows the platform's answer", async () => {
    query.mockResolvedValue(true);
    expect(shown(await render('system'))).toBe('still');
    query.mockResolvedValue(false);
    expect(shown(await render('system'))).toBe('moving');
  });

  test('a native call that rejects — no module behind it — is false, not an error', async () => {
    query.mockRejectedValue(new Error('NativeAccessibilityManagerIOS is not available'));
    await expect(systemReducesMotion()).resolves.toBe(false);
    expect(shown(await render('system'))).toBe('moving');
  });

  test("the change event is followed while the setting is 'system', and dropped when it is not", async () => {
    const r = await render('system');
    expect(listen).toHaveBeenCalledWith('reduceMotionChanged', expect.any(Function));
    const handler = listen.mock.calls[0][1] as Handler;
    act(() => handler(true));
    expect(shown(r)).toBe('still');
    act(() => handler(false));
    expect(shown(r)).toBe('moving');

    await act(async () => {
      r.update(<Probe setting="on" />);
    });
    expect(remove).toHaveBeenCalledTimes(1);
    expect(shown(r)).toBe('still');
    // An event after the unsubscribe is nothing to it.
    act(() => handler(false));
    expect(shown(r)).toBe('still');
  });

  test('on the web, a page without matchMedia has no preference to follow', async () => {
    // react-native-web resolves *true* there (dist/exports/AccessibilityInfo/index.js:21);
    // the hook must not take that for an answer.
    Platform.OS = 'web';
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    query.mockResolvedValue(true);
    await expect(systemReducesMotion()).resolves.toBe(false);
    expect(shown(await render('system'))).toBe('moving');
    expect(query).not.toHaveBeenCalled();
    expect(listen).not.toHaveBeenCalled();
    // The player's own word still wins on that page.
    expect(shown(await render('on'))).toBe('still');
  });

  test("on the web with matchMedia, the platform's answer is used", async () => {
    Platform.OS = 'web';
    (window as unknown as { matchMedia: unknown }).matchMedia = () => ({ matches: true });
    query.mockResolvedValue(true);
    expect(shown(await render('system'))).toBe('still');
    expect(listen).toHaveBeenCalledTimes(1);
  });
});
