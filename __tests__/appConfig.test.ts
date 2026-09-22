/**
 * What the app config asks the operating systems for, and what the build
 * tooling would silently fill in if app.json left it out. The config plugins
 * default anything absent, so an omission here becomes a permission in the
 * shipped build that nothing in the app ever uses, or a splash screen that is
 * never drawn — and the only place either shows up is a prebuild, which no
 * other suite runs. Every key this file pins is stated in app.json, even at
 * its default, so the file and the test say the same thing.
 */
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { SOURCE_URL } from '../src/about';

const root = path.join(__dirname, '..');
const appConfig = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo;
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const eas = JSON.parse(fs.readFileSync(path.join(root, 'eas.json'), 'utf8'));

/**
 * The config a prebuild would generate: `expo config --type introspect` runs
 * the same plugin chain, so `_internal.modResults` is the merged Android
 * manifest and resources rather than the app.json that feeds them. The
 * template's own permissions only exist here — app.json never mentions them.
 */
const introspected = JSON.parse(
  execFileSync('node', [require.resolve('expo/bin/cli'), 'config', '--type', 'introspect', '--json'], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
    env: { ...process.env, CI: '1', EXPO_NO_TELEMETRY: '1' },
  }),
);
const android = introspected._internal.modResults.android;
const manifest = android.manifest.manifest;

const INTERNET = 'android.permission.INTERNET';

/**
 * The only Android permissions this app has a use for. `tools:node="remove"`
 * on everything else is what keeps a module's own manifest from widening the
 * shipped build.
 */
const USED = [
  'android.permission.VIBRATE', // expo-haptics
];
// Not in USED: INTERNET. A development build needs it to load its bundle and
// nothing else here ever opens a socket, so it is blocked in the config and
// added back to the debug source set alone — see plugins/withDebugInternet.js
// and 'what leaves the device' below.

/**
 * Every AndroidManifest.xml under `dir`. `isDirectory()` is false for a
 * symlink, so a linked package — and any cycle through one — is left alone.
 */
const manifestsUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...manifestsUnder(full));
    else if (entry.isFile() && entry.name === 'AndroidManifest.xml') out.push(full);
  }
  return out;
};

/** The app's own code: everything under src/ that is not a test, plus the entry files. */
const appSource = (): string => {
  const sources: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '__tests__') walk(full);
      } else if (/\.tsx?$/.test(entry.name)) {
        sources.push(fs.readFileSync(full, 'utf8'));
      }
    }
  };
  walk(path.join(root, 'src'));
  for (const file of ['App.tsx', 'index.ts']) sources.push(fs.readFileSync(path.join(root, file), 'utf8'));
  return sources.join('\n');
};

type PluginEntry = string | [string, Record<string, unknown>?];

const pluginEntry = (name: string): PluginEntry | undefined =>
  (appConfig.plugins as PluginEntry[]).find((p) => (Array.isArray(p) ? p[0] : p) === name);

const pluginOptions = (name: string): Record<string, unknown> => {
  const entry = pluginEntry(name);
  expect(entry).toBeDefined();
  return Array.isArray(entry) ? entry[1] || {} : {};
};

const usesPermission = (name: string) =>
  manifest['uses-permission'].find((p: { $: Record<string, string> }) => p.$['android:name'] === name);

describe('splash screen', () => {
  it('is configured through the expo-splash-screen plugin, not the removed top-level block', () => {
    // SDK 57 dropped the top-level `splash` key from the schema, and the
    // plugin returns the config untouched when it is given no props
    // (plugin/build/withSplashScreen.js). A top-level block is therefore not
    // deprecated but silently ignored: the app boots to a white screen with
    // the bundled default logo, and nothing in the build warns.
    expect(appConfig.splash).toBeUndefined();
    expect(pkg.dependencies['expo-splash-screen']).toBeDefined();
    expect(pluginOptions('expo-splash-screen')).toEqual({
      image: './assets/splash-icon.png',
      imageWidth: 200,
      resizeMode: 'contain',
      backgroundColor: '#061a2b',
    });
  });

  it('reaches the generated Android resources', () => {
    // The props are only right if the plugin actually consumed them: the
    // colour lands in colors.xml, and the launch theme is the splash one.
    const colors = android.colors.resources.color.map((c: { $: { name: string }; _: string }) => [c.$.name, c._]);
    expect(colors).toContainEqual(['splashscreen_background', '#061a2b']);
    const activity = manifest.application[0].activity.find(
      (a: { $: Record<string, string> }) => a.$['android:name'] === '.MainActivity',
    );
    expect(activity.$['android:theme']).toBe('@style/Theme.App.SplashScreen');
  });
});

describe('appearance', () => {
  it('is dark only, and Android is told so through expo-system-ui', () => {
    // `userInterfaceStyle` needs expo-system-ui on Android
    // (@expo/config-types ExpoConfig.d.ts, the schema comment on the key);
    // without it the value is read for iOS alone. The app draws a single dark
    // palette, so a system-driven light mode would put dark text on a dark
    // board; a theme row is a later phase and would change this value, not
    // remove it.
    expect(appConfig.userInterfaceStyle).toBe('dark');
    expect(pkg.dependencies['expo-system-ui']).toBeDefined();
    const strings = android.strings.resources.string.map((s: { $: { name: string }; _: string }) => [s.$.name, s._]);
    expect(strings).toContainEqual(['expo_system_ui_user_interface_style', 'dark']);
  });

  it('states the keys the platforms would otherwise default', () => {
    // Each of these has a default the tooling fills in silently. Stating them
    // means the config and this test agree on what is shipped, and a change
    // to either is a diff someone reads.
    expect(appConfig.orientation).toBe('portrait');
    expect(appConfig.ios.supportsTablet).toBe(true);
    expect(appConfig.android.predictiveBackGestureEnabled).toBe(false);
    expect(manifest.application[0].$['android:enableOnBackInvokedCallback']).toBe('false');
    expect(appConfig.web.bundler).toBe('metro');
  });

  it('carries no key SDK 57 stopped reading', () => {
    // `newArchEnabled` has no reader anywhere in @expo/cli, config-plugins or
    // prebuild-config on SDK 57 (the new architecture is the only one), and
    // `android.edgeToEdgeEnabled` is gone from the schema: prebuild warns that
    // Android 16 makes edge-to-edge mandatory. A key that is read by nothing
    // is a promise the build does not keep.
    expect(appConfig).not.toHaveProperty('newArchEnabled');
    expect(appConfig.android).not.toHaveProperty('edgeToEdgeEnabled');
  });

  it('registers no URL scheme, and nothing links in', () => {
    // The About card hands one URL out (checked under 'what leaves the
    // device'); nothing reads one in, so there is no scheme to answer to.
    expect(appConfig).not.toHaveProperty('scheme');
    expect(appSource()).not.toMatch(/getInitialURL|addEventListener\(\s*['"]url['"]|expo-linking|useURL\(/);
  });

  it('ships all three adaptive icon layers', () => {
    // Android 13 draws the monochrome layer for a themed icon and, without
    // one, a tinted foreground that loses the ship's outline; without a
    // background image the launcher fills the colour itself. All three are
    // named so the launcher never has to improvise, and they exist.
    const icon = appConfig.android.adaptiveIcon;
    for (const key of ['foregroundImage', 'backgroundImage', 'monochromeImage']) {
      expect(typeof icon[key]).toBe('string');
      expect(fs.existsSync(path.join(root, icon[key]))).toBe(true);
    }
    expect(icon.backgroundColor).toBe('#061a2b');
  });
});

describe('permissions requested by the config plugins', () => {
  it('declares nothing in the generated manifest the app does not use', () => {
    // The prebuild template adds permissions of its own (legacy storage, the
    // 'display over other apps' overlay, INTERNET) that nothing here ever
    // asked for, and blockedPermissions is the only thing that takes one
    // back out. SYSTEM_ALERT_WINDOW goes too: a shipped game has no reason to
    // draw over other apps, and the development menu's overlay loses nothing
    // because the template's debug source set declares it again there.
    const declared = manifest['uses-permission']
      .filter((p: { $: Record<string, string> }) => p.$['tools:node'] !== 'remove')
      .map((p: { $: Record<string, string> }) => p.$['android:name']);
    expect(declared.length).toBeGreaterThan(0); // the introspection found a manifest at all
    expect(declared.filter((name: string) => !USED.includes(name))).toEqual([]);
    expect(usesPermission('android.permission.SYSTEM_ALERT_WINDOW').$['tools:node']).toBe('remove');
  });

  it('blocks the storage and media permissions no code here uses', () => {
    // The Android build is assembled from more than this repository: expo
    // pulls in expo-file-system, which is autolinked into every Android build
    // and whose own manifest declares READ_/WRITE_EXTERNAL_STORAGE. Nothing
    // here imports it — the app has no files and no network — and the
    // manifest merger keeps whatever a library asks for unless the app says
    // otherwise. The READ_MEDIA_* trio is what Android 13 splits the legacy
    // read into; no module here declares them today, and blocking them is
    // what keeps the one someone adds tomorrow from doing so quietly.
    expect(appConfig.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.READ_EXTERNAL_STORAGE',
        'android.permission.WRITE_EXTERNAL_STORAGE',
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_AUDIO',
      ]),
    );
    for (const name of ['android.permission.READ_EXTERNAL_STORAGE', 'android.permission.WRITE_EXTERNAL_STORAGE']) {
      expect(usesPermission(name).$['tools:node']).toBe('remove');
    }
  });

  it('blocks every permission a bundled native module merges in', () => {
    // The generated manifest is only half of it: each native module ships an
    // AndroidManifest.xml that Gradle folds in at build time, which no plugin
    // option touches and the introspection above never sees. Every manifest
    // under node_modules is read rather than the ones at a guessed path: a
    // scoped package is not a top-level directory name, and react-native
    // keeps its own under ReactAndroid/src/debug — so the module someone adds
    // tomorrow is the one this is for.
    const files = manifestsUnder(path.join(root, 'node_modules'));
    const declaredBy = new Map<string, string[]>(); // permission -> the manifests declaring it
    for (const file of files) {
      const xml = fs.readFileSync(file, 'utf8');
      for (const m of xml.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)) {
        declaredBy.set(m[1], [...(declaredBy.get(m[1]) || []), path.relative(root, file)]);
      }
    }

    // The scan found the module manifests, and reaches the kinds a name
    // filter would miss: a scoped package, and a source set that is not
    // src/main.
    const seen = files.map((f) => path.relative(path.join(root, 'node_modules'), f));
    expect(seen.length).toBeGreaterThan(10);
    expect(declaredBy.size).toBeGreaterThan(0);
    expect(seen.some((f) => f.startsWith('react-native/'))).toBe(true);
    expect(seen.some((f) => f.startsWith('@'))).toBe(true);
    expect(seen.some((f) => f.includes(`src${path.sep}debug${path.sep}`))).toBe(true);

    // Neither INTERNET nor SYSTEM_ALERT_WINDOW needs an exception here:
    // expo-file-system declares the one and react-native's debug source set
    // the other, and the blocked list is what takes both back out of the
    // shipped build.
    const blocked: string[] = appConfig.android.blockedPermissions || [];
    expect(blocked).toContain('android.permission.SYSTEM_ALERT_WINDOW');
    const unblocked = [...declaredBy]
      .filter(([name]) => !USED.includes(name) && !blocked.includes(name))
      .map(([name, where]) => `${name} (${where.join(', ')})`);
    expect(unblocked).toEqual([]);
  });
});

describe('what leaves the device', () => {
  it('does not ship network access', () => {
    // The app has no network code (the test below checks the source for it);
    // INTERNET in the shipped manifest is what turns a malicious dependency
    // or in-process code execution from 'reads the save' into 'sends it
    // somewhere'. The template and expo-file-system both declare it, so it
    // has to be blocked rather than merely not asked for.
    expect(appConfig.android.blockedPermissions).toContain(INTERNET);
    const internet = usesPermission(INTERNET);
    expect(internet).toBeDefined(); // it is in the merge, and being removed
    expect(internet.$['tools:node']).toBe('remove');
  });

  it('has no network code, which is why INTERNET can go', () => {
    // The reason for the block, checked against the source rather than
    // assumed. The About card hands the repository URL to the system
    // browser: another process with its own permission, opening no socket of
    // this app's own. So the only URL in the source is that one, and the only
    // thing it is handed to is Linking.openURL - which is also what keeps
    // "Nothing leaves your device" on that card true.
    const source = appSource();
    expect(source).not.toMatch(/\bfetch\(|axios|XMLHttpRequest|WebSocket|openBrowserAsync|expo-updates/);
    const urls = [...source.matchAll(/https?:\/\/[^\s'"`)]+/g)].map((m) => m[0]);
    expect([...new Set(urls)]).toEqual([SOURCE_URL]);
    expect(source.match(/\bopenURL\([^)]*\)/g)).toEqual(['openURL(SOURCE_URL)']);
  });

  it('gives a development build the network back, in the debug source set only', async () => {
    // Blocking it outright would stop a dev client loading its bundle. The
    // manifest merger gives a build-type source set higher priority than the
    // main manifest, so the permission is added to android/app/src/debug —
    // the same split React Native's own template uses for its debug-only
    // SYSTEM_ALERT_WINDOW. The release variant never reads that file.
    expect(appConfig.plugins).toContain('./plugins/withDebugInternet');

    const plugin = require('../plugins/withDebugInternet');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battleshiple-prebuild-'));
    try {
      // What expo-template-bare-minimum@57.0.26 puts there, verbatim.
      const template = [
        '<manifest xmlns:android="http://schemas.android.com/apk/res/android"',
        '    xmlns:tools="http://schemas.android.com/tools">',
        '',
        '    <uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"/>',
        '',
        '    <application android:usesCleartextTraffic="true" tools:targetApi="28" tools:ignore="GoogleAppIndexingWarning" tools:replace="android:usesCleartextTraffic" />',
        '</manifest>',
        '',
      ].join('\n');
      const file = path.join(dir, plugin.DEBUG_MANIFEST);
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, template);

      const config = plugin({ name: 'Battleshiple', slug: 'battleshiple' });
      expect(typeof config.mods.android.dangerous).toBe('function');
      await config.mods.android.dangerous({
        ...config,
        modRequest: { platformProjectRoot: dir },
      });

      const written = fs.readFileSync(file, 'utf8');
      expect(written).toMatch(/<uses-permission[^>]*android:name="android\.permission\.INTERNET"/);
      // ...without dropping what the template had there.
      expect(written).toContain('android.permission.SYSTEM_ALERT_WINDOW');
      expect(written).toContain('usesCleartextTraffic');
      expect(written).toContain('tools:replace="android:usesCleartextTraffic"');
      // ...and running it again changes nothing.
      expect(plugin.addInternetPermission(written)).toBe(written);
      // A project whose template wrote no debug manifest gets one.
      const fresh = path.join(dir, 'fresh');
      expect(fs.readFileSync(plugin.writeDebugManifest(fresh), 'utf8')).toContain('android.permission.INTERNET');
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it('keeps the savegame out of Android backup', () => {
    // @expo/config-plugins defaults allowBackup to true, writing over the bare
    // template's own false. The records this app keeps are one in-progress
    // game and three preferences (src/storage.ts, STORAGE_KEYS): JSON worth
    // nothing off the device, and `adb backup` / `adb restore` of a
    // backup-enabled app is exactly how a save the validator has to refuse
    // gets written in the first place. Nothing worth restoring, nothing that
    // should leave the device by default.
    expect(appConfig.android.allowBackup).toBe(false);
    expect(manifest.application[0].$['android:allowBackup']).toBe('false');
  });
});

describe('eas.json', () => {
  it('has the profile shape the sibling apps share', () => {
    // `appVersionSource: "remote"` with `autoIncrement` on production means
    // the build number lives on EAS and moves on every store build, so two
    // submissions can never carry the same one. The CLI floor is the one
    // that understands both keys.
    expect(eas.cli.version).toBe('>= 16.0.0');
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.development).toEqual({ developmentClient: true, distribution: 'internal' });
    expect(eas.build.preview.distribution).toBe('internal');
    expect(eas.build.preview.android).toEqual({ buildType: 'apk' });
    expect(eas.build.production.autoIncrement).toBe(true);
    expect(eas.submit.production).toEqual({});
  });
});
