@AGENTS.md

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
- A screen that shows a match gets `toPlayerView(state, viewer)` from
  `src/engine/view.ts`, never the `GameState`: the view carries the viewer's own
  fleet and only the public facts about the other one, and is built
  default-deny, so a new state field stays private until someone decides it is
  public. `__tests__/view.test.ts` pins the key set and proves each redaction.
- Colours live in semantic roles in `src/ui/theme/` — two palettes, light and
  dark, following `VISUAL_STYLE.md` — and never in a component:
  `__tests__/theme.test.ts` fails on a colour literal anywhere else and measures
  every pairing the UI draws against WCAG in both palettes.
- `npm test` runs the jest-expo unit tests, `npm run typecheck` runs tsc, and
  `npm run check` is the gate before a push. `npm run test:e2e` builds the website and plays
  it in Chromium (see Website below); CI runs it after the export.
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
  refuse a later build's legitimate save for no failure prevented. Two fields
  only the screens read, and only for show — a player's `lastIncoming` (the
  report strip indexes `SHIP_CLASSES` with its class) and a log entry's `move`
  (the board plays your own manoeuvre out from its poses) — are checked for what
  the renderer reads of them and dropped, not refused, when they do not hold up
  (`dropUnreadable`): a save without them is one every screen already draws.
- A write the store refuses is never silent. `src/storage.ts` keeps each refused
  write by key, with what the store held when it refused, and tries it again
  (`retryRefused`) after the next write the store accepts, on the web's `storage`
  event (another page on the origin changed the store, which is how room comes
  back there) and on every `AppState` change (hidden or shown), listening only
  while something is refused. It writes a value back only while it is still the
  newest asked of its key here *and* the store still holds what it held at the
  refusal: on the web a write lands when it is called, and every tab of the game
  shares the store but not this module's memory, so a battle refused in one tab
  was written back over a newer one another tab had saved. One another tab has
  overwritten is let go and no longer reported. `clearGame` goes through the same
  path, so a finished battle is never written back.
  `StorageNoteFrame` (`src/ui/components/StorageNote.tsx`, around every screen in
  `App.tsx`) says so across the bottom of the window while any write is refused,
  and its height is `BottomReserve`, which `useScreenInsets` in `src/ui/layout.ts`
  adds to the bottom inset that `Screen` pads by and the game board is sized
  from. On GitHub Pages the origin's storage is shared with every app the account
  publishes, and one that filled it stopped this game saving with nothing said.
- Exact versioned Expo docs: https://docs.expo.dev/versions/v57.0.0/

## Native configuration

The native config is pinned by `__tests__/appConfig.test.ts`, which runs `expo config --type introspect` and reads the merged Android manifest and resources rather than app.json alone, so app.json states every key the test pins even at its default and the two say the same thing. SDK 57 dropped the top-level `splash` block and `expo-splash-screen`'s plugin no-ops without props, so a stray top-level block is silently ignored rather than deprecated: the splash lives in `plugins`, ivory with a deep-ink `dark` variant. `userInterfaceStyle: "automatic"` reaches Android only through `expo-system-ui`, which is why it is a dependency nothing imports. The app has no network code, so `android.permission.INTERNET` is blocked along with the storage and media permissions and SYSTEM_ALERT_WINDOW (the template and expo-file-system declare the first, the template and react-native's debug manifest the last; a shipped game draws over nothing), leaving VIBRATE as the only permission granted, and `plugins/withDebugInternet.js` adds INTERNET back to `android/app/src/debug/AndroidManifest.xml` alone so a dev client can still fetch its bundle — the template's debug source set re-declares SYSTEM_ALERT_WINDOW there itself. The test drives that plugin against the SDK 57 template's debug manifest verbatim, and scans every AndroidManifest.xml under node_modules with no exceptions, so a dependency that declares a new permission fails the suite until it is blocked or added to `USED` with its reason. `allowBackup` is false because the records are one in-progress game (`battleshiple:savegame:v1`) and four preferences (`battleshiple.settings.v1`), worth nothing off the device. `newArchEnabled` and `android.edgeToEdgeEnabled` are gone on SDK 57 (nothing reads them; prebuild warns on the latter) and the test keeps them out. The web build is a website (see Website below): react-native-web, react-dom and @expo/metro-runtime are dependencies at the pins `expo/bundledNativeModules.json` names, and `web.bundler` is what that export uses. `app.config.js` returns app.json's config untouched unless `WEB_BASE_URL` is set, so the introspection this test runs sees app.json as written. `tsconfig` includes the `node` types so the test can read the file system; `@types/node` is a devDependency for that reason only, pinned to the Node 22 line CI runs.

## Settings

Preferences are one record under `battleshiple.settings.v1`: `haptics`, `reduceMotion`
(`system | on | off`), `difficulty`, the computer skill the menu shows, kept so the choice
survives a restart, and `theme` (`system | light | dark`), where `system` follows the device
and a device that reports no scheme gets dark (`resolveTheme` in `src/ui/theme`). `STORAGE_KEYS` in `src/storage.ts` names every key the app writes; the
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
and sets the module flag in `src/ui/feedback.ts` that gates every haptic call (on the web
`feedback.ts` sends nothing, so the Vibration row is drawn off and disabled there, with
`WEB_VIBRATION_HINT` saying why, and the stored value is left alone for the phone app). `update()`
decides whether to write, and writes, at the moment it is called — not inside the state
updater, where React runs it: a second update outside an event is deferred to the render,
and a read completing in between wrote the merged record and then had a stale one written
over it. `__tests__/settings-provider.test.tsx` holds the read open and pins all three.
The menu draws before the read completes, so `HomeScreen` renders the computer-skill
control only once `loaded`, rather than show Normal for a frame to a player who chose
otherwise. `reset()` restores the settings record alone — the saved game is not a
preference, and there is no first-run flag to keep (if one is added it belongs in this record
and is the one field a reset preserves).

The screen (`src/ui/screens/SettingsScreen.tsx`, reached from the menu) has five rows:
Theme, Vibration, Reduce motion, Reset to defaults and About. There is no Sound row because the
app makes no sound. The Theme row exists because there are two palettes;
`__tests__/appearance.test.ts` pins that, with `userInterfaceStyle: "automatic"`.
Reduce motion resolves through `useReduceMotion` in `src/motion.ts`: `on`/`off` are the
player's word, `system` asks `AccessibilityInfo` and follows `reduceMotionChanged`, a native
call that rejects (no module behind it) means false, and on the web a page without
`matchMedia` means false too, because react-native-web resolves *true* there. The only
motion is `SplashOverlay`'s one ripple when a splash report first arrives (never looped,
never replayed for the same `quadrant:turn`); the report itself is a hatched, outlined
quadrant that reduce motion keeps whole, because the splash is information. Anything that spends what the app cannot restore is
confirmed through `confirmAction` in `src/confirm.ts` — `window.confirm` on the web,
`Alert.alert` elsewhere — because react-native-web's `Alert.alert` is an empty static, and
the "Start a new battle?" prompt was a silent no-op there: with a saved battle the start
buttons did nothing at all. Reset is confirmed the same way. The About card's text lives in
`src/about.ts`, free of React Native and pinned by the contract test; its version is
`appVersion(Constants.expoConfig?.version)` — `expo-constants` is a direct dependency since it
is read here (nested under `expo/node_modules` it resolved only by accident) and the value is
the `version` in `app.json`, which the contract test keeps `package.json` in step with.
"Nothing leaves your device" is true and `appConfig.test.ts` keeps it so: it scans `src/`,
`App.tsx`, `index.ts` and the website's `public/guard.js` for `fetch`, `XMLHttpRequest`, `WebSocket`, `expo-updates` and any
URL but `SOURCE_URL`, and pins `Linking.openURL(SOURCE_URL)` — handed to the browser with a
`.catch`, since Android rejects when nothing answers the intent — as the only `openURL` in the
tree. On the board, the locked target cell is exposed as `selected`, so a screen reader is
told which cell FIRE will act on; the game screen shows one large board, the one the turn acts on, and the other as a mini-map that is a single button named for the board it shows ("Show your fleet"), never a grid of cells, so a cell label stays unique; the shared `Segmented`
is a named `radiogroup`. `__tests__/splash.test.tsx` pins that reduce motion drops only the ripple, never
the reported quadrant.

## Website

The web build is also a website, the art-app model: the game stays in the browser (nothing moves
to a server, and it makes no request once loaded), and the host does the rest — headers, cache
rules, the not-found page, refusing every file that is not part of the site. `npm run build:web`
(`scripts/build-web.mjs`) runs `expo export --platform web`, which copies `public/` beside the
bundle (SDK 57 copies it whole, `.well-known/` and `.htaccess` included) and reads
`public/index.html` as the page template; then it removes `metadata.json`, moves 404.html's and
.htaccess's root-absolute addresses under `--base` when there is one (the bundle's go through
`app.config.js`'s `WEB_BASE_URL` → `experiments.baseUrl`), keeps only the configuration the
`--host` reads from the folder (`HOSTS`: `_headers` and `_redirects` for Netlify, `_headers` for
Cloudflare Pages, `.htaccess` for Apache, none for nginx or GitHub Pages, which serves every file it
is given; all three without `--host`), writes the policy into the built page as a `<meta>` taken
from `public/_headers`, and refuses a page that is not the template. Inside the checkout it writes
only to `dist-web` or `dist` (`OUT_FOLDERS`), the folders `.gitignore` and the shared
`eslint.config.js` both ignore. The policy is
not in the template because `expo start --web` serves it too, and the dev server needs a WebSocket
and its overlay's `innerHTML`; `npm run web` was checked by hand to draw the game with the template.

One policy, written in four places — `public/_headers` (Netlify, Cloudflare Pages),
`public/.htaccess` (Apache), `deploy/nginx.conf`, and the `<meta>` in `public/404.html` and the
built index.html (less frame-ancestors) — and `__tests__/website.test.ts` holds them identical on
every path of the site, pins the directive list, the hosts' refusals (their own configs and
`metadata.json` on all three, which is all a published folder can hold that is not the site, and
dotfiles but `/.well-known/` on Apache and nginx), the not-found handling, security.txt's expiry
(the suite fails once it lapses: renew it a year at a time), the template's lack of inline script
and style, `guard.js` parsed as ES5, and `site.css`'s colours against the palettes at WCAG AA; it
also drives `build-web.mjs` in a sandbox with a stand-in exporter. Netlify and Apache read their
rules from the published folder, so in a checkout published by mistake (their files then sit in
`public/`) no rule of theirs fires; nginx's configuration lives outside the folder and is an
allow-list of the site's paths (`location = /`, one regular expression, and `location /` answering
404), so the test runs every file `git ls-files` lists through it and requires a 404 for each. Its
`listen 443 ssl http2` is the form nginx 1.22 and 1.24 load (`http2 on;` is 1.25.1 and later), and
Apache's `.htaccess` needs `AllowOverride All` and leaves `ServerTokens Prod` to the server
configuration, which README and the file's header both say and the test holds. Every value was measured in
Chromium with the policy sent as a response header: without `img-src 'self'` the favicon is
refused; without the empty string's hash in `style-src` react-native-web's `<style>` element is
refused and the game draws unstyled (it fills that element through `insertRule`, which CSP does
not govern, so `'unsafe-inline'` is not needed); Trusted Types (`trusted-types 'none'`) hold over
the whole flow; nothing else is loaded. Permissions-Policy lists only names Chromium recognises,
since each unknown one is a console warning the suite fails on. Referrer-Policy is
`strict-origin-when-cross-origin`: the game's one address carries nothing private.

`e2e/run.mjs` (after `build-web --base /battleshiple`) serves `dist-web/` through `e2e/serve.mjs`,
which answers with `_headers` and `_redirects` as Netlify reads them, and fails on any policy
report, page or console error, or request outside the sub-path while it plays the game. It also
probes that the policy is enforced (HTML from a string, a fetch, an outside image and an inline
script are each refused by the directive meant to refuse them), with headers and with the `<meta>`
alone, frames the game from a second loopback origin, fills the origin's storage as another app on
it would (the note shows, the board and action bar stay above it, and the refused battle and
settings are written once there is room: with the next move, and with no move at all when another
page frees it), opens two tabs of the game on that storage (a battle refused in the first is not
written back over the newer one the second saved), checks every file of the real build is either
served by the hosts and by nginx's allow-list or the one host's configuration (`npm run test:e2e`
builds `--host netlify`), plants what else a published folder can hold (`metadata.json`,
`.htaccess`) beside the site, and stages the safety net (`public/guard.js`, ES5 so the old
browsers it is for can parse it, loaded first and synchronously: a bundle that 404s, one that
throws, one that draws nothing within four seconds of load; and `<noscript>`).
`appConfig.test.ts`'s no-network scan reads `guard.js` as well. Playwright is a devDependency
pinned to the version whose Chromium CI installs.

## Conventions

This repository follows `CONVENTIONS.md`, which is identical in every platteration
repository and pinned by the conventions test (`npm run test:conventions`, or
`tests/test_conventions.py` in a Python repository): the script set (`test`,
`typecheck`, `lint`, `check`, `test:e2e`, `test:all`), Node 22 via `.nvmrc`, one
`.editorconfig`, ESLint per stack, the `ci.yml` shape, the documents every repository
carries and the README skeleton. The repository's check command (`npm run check`, or
`ruff check .` then `pytest -q` in a Python repository) is the gate before a push. To
change a convention, change it in every repository in one pass and update the hashes in
the test.
