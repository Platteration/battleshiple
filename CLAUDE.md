# battleshiple

Expo (React Native + TypeScript) app: Battleship where the fleets move. After
every shot one ship may manoeuvre, and its opponent sees only a splash in the
quadrant it ended up in. See README.md for the rules, the balance numbers and
the layout.

- Engine lives in `src/engine` and must stay free of React/React Native imports,
  and of randomness except through an `Rng` passed in: that is what lets the
  rules be simulated by the thousand and keeps the README's balance numbers
  reproducible. `src/ui` holds the components and screens, `App.tsx` the screen
  state machine, `src/storage.ts` the autosave.
- `npm test` runs the jest-expo unit tests, `npm run typecheck` runs tsc, and
  `npm run check` is the gate before a push.
- A save is untrusted input, and its counts are part of its shape. Everything
  read from AsyncStorage goes through a validator before the engine or the
  renderer indexes into it — the save through `src/storage.ts`, the settings
  through `src/validate.ts` (see Settings below) — and the validator bounds how many
  as well as what kind: a save right element by element but carrying 20,000
  shots killed the app on Resume, because the AI paired every recent hit
  against every other. A count over its ceiling is clipped on the way in, never
  a reason to discard the match — a ceiling on the absurd must not eat the
  player's own marathon game — and a save the app then fails to play is set
  aside and not re-offered, not deleted. Its cross-field rules are engine
  invariants (one computer, in seat 1, in a vs-Computer match; no winner;
  neither fleet sunk), each checked against real play before it was added; a
  combination the renderer survives is left accepted, since refusing it would
  refuse a later build's legitimate save for no failure prevented.
- Exact versioned Expo docs: https://docs.expo.dev/versions/v57.0.0/

## Native configuration

The native config is pinned by `__tests__/appConfig.test.ts`, which runs `expo config --type introspect` and reads the merged Android manifest and resources rather than app.json alone, so app.json states every key the test pins even at its default and the two say the same thing. SDK 57 dropped the top-level `splash` block and `expo-splash-screen`'s plugin no-ops without props, so a stray top-level block is silently ignored rather than deprecated: the splash lives in `plugins`. `userInterfaceStyle: "dark"` reaches Android only through `expo-system-ui`, which is why it is a dependency nothing imports. The app has no network code, so `android.permission.INTERNET` is blocked along with the storage and media permissions and SYSTEM_ALERT_WINDOW (the template and expo-file-system declare the first, the template and react-native's debug manifest the last; a shipped game draws over nothing), leaving VIBRATE as the only permission granted, and `plugins/withDebugInternet.js` adds INTERNET back to `android/app/src/debug/AndroidManifest.xml` alone so a dev client can still fetch its bundle — the template's debug source set re-declares SYSTEM_ALERT_WINDOW there itself. The test drives that plugin against the SDK 57 template's debug manifest verbatim, and scans every AndroidManifest.xml under node_modules with no exceptions, so a dependency that declares a new permission fails the suite until it is blocked or added to `USED` with its reason. `allowBackup` is false because the records are one in-progress game (`battleshiple:savegame:v1`) and three preferences (`battleshiple.settings.v1`), worth nothing off the device. `newArchEnabled` and `android.edgeToEdgeEnabled` are gone on SDK 57 (nothing reads them; prebuild warns on the latter) and the test keeps them out. Web is not a shipping target — there are no web dependencies — so `web.bundler` is stated for the favicon build only, and `npx expo export --platform web` needs react-native-web, react-dom and @expo/metro-runtime installed first. `tsconfig` includes the `node` types so the test can read the file system; `@types/node` is a devDependency for that reason only, pinned to the Node 22 line CI runs.

## Settings

Preferences are one record under `battleshiple.settings.v1`: `haptics`, `reduceMotion`
(`system | on | off`) and `difficulty`, the computer skill the menu shows, kept so the choice
survives a restart. `STORAGE_KEYS` in `src/storage.ts` names every key the app writes; the
savegame keeps its older colon-form key because renaming it for spelling would put every
player's unfinished battle through a migration for nothing, and
`__tests__/settings-contract.test.ts` pins both strings, the field list, the row list and the
enum tables as literals. The record is read only through `cleanSettings` in
`src/validate.ts`, which is free of React Native and the DOM so it is tested bare: the tables
are `Record<Union, true>` so a new member fails `tsc` before it fails a player, lookups are
own-property only (`has`; `'constructor' in TABLE` is true on any plain object), and each
field falls back to the default on its own, never the record as a whole. `src/settings.tsx`
is the provider: it loads through the validator, merges a change made before the read came
back under what was stored rather than over it, writes nothing until the read completes,
and sets the module flag in `src/ui/feedback.ts` that gates every haptic call. `update()`
decides whether to write, and writes, at the moment it is called — not inside the state
updater, where React runs it: a second update outside an event is deferred to the render,
and a read completing in between wrote the merged record and then had a stale one written
over it. `__tests__/settings-provider.test.tsx` holds the read open and pins all three.
The menu draws before the read completes, so `HomeScreen` renders the computer-skill
control only once `loaded`, rather than show Normal for a frame to a player who chose
otherwise. `reset()` restores the settings record alone — the saved game is not a
preference, and there is no first-run flag to keep (if one is added it belongs in this record
and is the one field a reset preserves).

The screen (`src/ui/screens/SettingsScreen.tsx`, reached from the menu) has four rows:
Vibration, Reduce motion, Reset to defaults and About. There is no Sound row because the app
makes no sound, and no Theme row because it has one palette — `__tests__/appearance.test.ts`
pins `userInterfaceStyle: "dark"` and says a theme row appears only with a second palette.
Reduce motion resolves through `useReduceMotion` in `src/motion.ts`: `on`/`off` are the
player's word, `system` asks `AccessibilityInfo` and follows `reduceMotionChanged`, a native
call that rejects (no module behind it) means false, and on the web a page without
`matchMedia` means false too, because react-native-web resolves *true* there. The only
decorative motion is `SplashOverlay`, which holds its ripples still rather than dropping
them: the splash is information. Anything that spends what the app cannot restore is
confirmed through `confirmAction` in `src/confirm.ts` — `window.confirm` on the web,
`Alert.alert` elsewhere — because react-native-web's `Alert.alert` is an empty static, and
the "Start a new battle?" prompt was a silent no-op there: with a saved battle the start
buttons did nothing at all. Reset is confirmed the same way. The About card's version is
`Constants.expoConfig?.version` from `expo-constants` (a direct dependency since it is read
here; nested under `expo/node_modules` it resolved only by accident), which is the `version`
in `app.json`; the contract test keeps `package.json` in step with it. "Nothing leaves your
device" is true: the app has no network code, and the source link is handed to the browser
with `Linking.openURL`.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. `npm run check` is the gate before a push. To change a
convention, change it in every repository in one pass and update the hashes in the test.
