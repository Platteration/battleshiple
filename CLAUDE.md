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
  read from AsyncStorage goes through the validator in `src/storage.ts` before
  the engine or the renderer indexes into it, and the validator bounds how many
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

The native config is pinned by `__tests__/appConfig.test.ts`, which runs `expo config --type introspect` and reads the merged Android manifest and resources rather than app.json alone, so app.json states every key the test pins even at its default and the two say the same thing. SDK 57 dropped the top-level `splash` block and `expo-splash-screen`'s plugin no-ops without props, so a stray top-level block is silently ignored rather than deprecated: the splash lives in `plugins`. `userInterfaceStyle: "dark"` reaches Android only through `expo-system-ui`, which is why it is a dependency nothing imports. The app has no network code, so `android.permission.INTERNET` is blocked along with the storage and media permissions and SYSTEM_ALERT_WINDOW (the template and expo-file-system declare the first, the template and react-native's debug manifest the last; a shipped game draws over nothing), leaving VIBRATE as the only permission granted, and `plugins/withDebugInternet.js` adds INTERNET back to `android/app/src/debug/AndroidManifest.xml` alone so a dev client can still fetch its bundle — the template's debug source set re-declares SYSTEM_ALERT_WINDOW there itself. The test drives that plugin against the SDK 57 template's debug manifest verbatim, and scans every AndroidManifest.xml under node_modules with no exceptions, so a dependency that declares a new permission fails the suite until it is blocked or added to `USED` with its reason. `allowBackup` is false because the only record is one in-progress game (`battleshiple:savegame:v1`), worth nothing off the device. `newArchEnabled` and `android.edgeToEdgeEnabled` are gone on SDK 57 (nothing reads them; prebuild warns on the latter) and the test keeps them out. Web is not a shipping target — there are no web dependencies — so `web.bundler` is stated for the favicon build only, and `npx expo export --platform web` needs react-native-web, react-dom and @expo/metro-runtime installed first. `tsconfig` includes the `node` types so the test can read the file system; `@types/node` is a devDependency for that reason only, pinned to the Node 22 line CI runs.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. `npm run check` is the gate before a push. To change a
convention, change it in every repository in one pass and update the hashes in the test.
