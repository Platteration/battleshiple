import { Alert, Platform } from 'react-native';
import { confirmAction } from '../src/confirm';

const PROMPT = {
  title: 'Start a new battle?',
  message: 'The unfinished battle will be discarded once the new fleets are deployed.',
  cancelLabel: 'Cancel',
  confirmLabel: 'Discard and start',
};

type Confirming = Window & { confirm: (message?: string) => boolean };
const win = window as unknown as Confirming;

describe('confirmAction', () => {
  const realOS = Platform.OS;
  const realConfirm = win.confirm;
  let alert: jest.SpyInstance;

  beforeEach(() => {
    // react-native-web/dist/exports/Alert/index.js is, in full:
    // `class Alert { static alert() {} }`. Stood in here verbatim, since the
    // web renderer is not a dependency of this app.
    alert = jest.spyOn(Alert, 'alert').mockImplementation(function alert() {});
  });

  afterEach(() => {
    Platform.OS = realOS;
    win.confirm = realConfirm;
    alert.mockRestore();
  });

  test('the bug it exists for: on the web a bare Alert.alert confirm never calls back', () => {
    Platform.OS = 'web';
    const onConfirm = jest.fn();
    // What App.tsx used to do at the "Start a new battle?" prompt.
    Alert.alert(PROMPT.title, PROMPT.message, [
      { text: PROMPT.cancelLabel, style: 'cancel' },
      { text: PROMPT.confirmLabel, style: 'destructive', onPress: onConfirm },
    ]);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    // ...and nothing was ever going to: the stub keeps no buttons to press.
    expect(alert.mock.results[0].value).toBeUndefined();
  });

  test("on the web it asks the browser, and the answer decides", () => {
    Platform.OS = 'web';
    const onConfirm = jest.fn();
    win.confirm = jest.fn(() => true);
    confirmAction({ ...PROMPT, onConfirm });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(win.confirm).toHaveBeenCalledWith(`${PROMPT.title}\n\n${PROMPT.message}`);
    expect(alert).not.toHaveBeenCalled();

    win.confirm = jest.fn(() => false);
    confirmAction({ ...PROMPT, onConfirm });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  test('on a device it is two buttons: cancel first as the safe default, the destructive one named with its verb', () => {
    Platform.OS = 'ios';
    const onConfirm = jest.fn();
    win.confirm = jest.fn(() => true);
    confirmAction({ ...PROMPT, onConfirm });
    expect(win.confirm).not.toHaveBeenCalled();
    expect(alert).toHaveBeenCalledTimes(1);
    const [title, message, buttons] = alert.mock.calls[0] as [string, string, { text: string; style: string; onPress?: () => void }[]];
    expect(title).toBe(PROMPT.title);
    expect(message).toBe(PROMPT.message);
    expect(buttons.map((b) => [b.text, b.style])).toEqual([
      ['Cancel', 'cancel'],
      ['Discard and start', 'destructive'],
    ]);
    expect(buttons[0].onPress).toBeUndefined();
    expect(onConfirm).not.toHaveBeenCalled();
    buttons[1].onPress!();
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });
});
