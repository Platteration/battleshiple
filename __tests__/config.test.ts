import app from '../app.json';

/**
 * The Android build is assembled from more than this repository: expo pulls in
 * expo-file-system, which is autolinked into every Android build and whose own
 * manifest declares READ_/WRITE_EXTERNAL_STORAGE. Nothing here imports it – the
 * app has no files and no network – and the manifest merger keeps whatever a
 * library asks for unless the app says otherwise.
 */
describe('android configuration', () => {
  test('permissions no code here uses are blocked out of the merged manifest', () => {
    expect(app.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining(['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']),
    );
  });

  // The save is a JSON snapshot of one game and is worth nothing off the device,
  // while `adb backup` / `adb restore` of a backup-enabled app is exactly how a
  // save the validator has to refuse gets written in the first place.
  test('the savegame is not round-tripped through device backups', () => {
    expect(app.expo.android.allowBackup).toBe(false);
  });
});
