# battleshiple — security audit (2026-09-11)

A dedicated security pass, separate from and later than the review in `REVIEW.md`. Specialist reviewers read the repository through a combined lens (L13), each required to *demonstrate* a finding rather than argue for it.

**3 findings** — 2 low, 1 info. 2 of 3 were reproduced with command output; the other is reasoned from the code.

## Status

Every finding below was fixed on `claude/repo-review-security-baiyud` in 1d266ad, each with a regression test that was checked by reverting the fix and confirming the test fails. The findings are kept as written so the reasoning behind each change stays with it.

## Findings

### L13-1 · low — Save validator bounds every field's shape but not any array's length; the AI's target loop is quadratic in shot history, so a 763 KiB save OOM-kills the app on Resume

`src/storage.ts`:142 · CWE-770 · reproduced

**Who.** Someone who can write the app's AsyncStorage record once: a person with the unlocked phone and USB debugging on an Android 11-or-older device (minSdkVersion is 24, and Expo's default is android:allowBackup="true", so `adb backup` / `adb restore` of com.platteration.battleshiple round-trips the RKStorage SQLite database), a rooted/jailbroken device, or a restored cloud backup. Also reachable without any attacker at all: the validator exists precisely so that a save written by a *different build* of this app cannot crash the renderer, and a size-unbounded field defeats that.

**How.** 1. Take any legitimate save (the real one on disk will do). 2. Replace players[<the computer>].shots with 20,000 records of the exact shape the validator demands - {r:0,c:0|1,result:'hit',turn:<state.turn>} - and set current to the computer with phase 'fire'. Every element passes isShot(); only the count is abnormal. 3. Write it back under 'battleshiple:savegame:v1' (763 KiB of JSON, inside AsyncStorage's ~2 MB Android CursorWindow row limit and unbounded on iOS). 4. Launch the app; loadGame() validates and accepts it, the menu offers 'Unfinished battle'. 5. Tap Resume. App.tsx:188-192 sees players[current].isAI and calls scheduleAiTurn; 900 ms later aiChooseShot runs the target-mode loop at src/engine/ai.ts:144-154, which is `for (const a of hot) for (const b of hot)` over all 20,000 recent hits and pushes a new {r,c} object for every adjacent ordered pair.

**Why it matters.** Denial of service on the app, and a sticky one: ~4x10^8 iterations and multi-gigabyte allocation on the JS thread. The app freezes and is killed by the OS (or Hermes OOMs). Nothing clears the save - loadGame() accepted it, and App.tsx:234-237 writes the same state back on quit - so the crash repeats on every launch until the user finds 'Discard'. No data is disclosed; there is nothing in this app to disclose. The same missing bound has two other manifestations with the same root cause: 200,000 splashes are accepted and GameScreen.incomingReport (src/ui/screens/GameScreen.tsx:57-59) renders one <Text> per splash while Board gets a 200,000-element splashes prop; a 200,000-entry log is accepted and visibleLog's .filter runs over all of it on every re-render.

**Evidence.**

src/storage.ts:139-145 - shape is checked element-by-element, count never:
      Array.isArray(v.ships) &&
      v.ships.length > 0 &&
      v.ships.every(isShip) &&
      Array.isArray(v.shots) &&
      v.shots.every(isShot) &&
      Array.isArray(v.splashes) &&
      v.splashes.every(isSplash)

src/engine/ai.ts:141-154 - the quadratic sink (no cap on `hot`, a fresh object per pair):
    if (hot.length > 0) {
      const candidates: Coord[] = [];
      for (const a of hot) {
        for (const b of hot) {
          if (a === b) continue;
          const dr = b.r - a.r;
          const dc = b.c - a.c;
          if ((Math.abs(dr) === 1 && dc === 0) || (Math.abs(dc) === 1 && dr === 0)) {
            const beyond = { r: b.r + dr, c: b.c + dc };
            if (isEligible(beyond)) candidates.push(beyond);

Measured, running the REAL loadGame() validator then the REAL aiChooseShot (node 22, x86 laptop-class CPU - a phone is slower):
  shots=200:   aiChooseShot took 80 ms (heap 6 MB)
  shots=500:   aiChooseShot took 126 ms (heap 12 MB)
  shots=1000:  aiChooseShot took 321 ms (heap 32 MB)
  shots=2000:  aiChooseShot took 2201 ms (heap 101 MB)
  shots=4000:  aiChooseShot took 9410 ms (heap 337 MB)
  shots=8000:  aiChooseShot took 22007 ms (heap 1518 MB)

At 20,000 shots under a 512 MB heap (a realistic RN/Hermes budget):
  shots=20000: validator ACCEPTED; calling aiChooseShot ...
  <--- Last few GCs --->
  1: 0xe42d60 node::OOMErrorHandler(...) [node]
  ...FATAL ERROR: JavaScript heap out of memory

Acceptance and payload size, through the real validator:
  shots=10: loadGame() -> ACCEPTED (shots kept: 10)
  shots=1000: loadGame() -> ACCEPTED (shots kept: 1000)
  shots=20000: loadGame() -> ACCEPTED (shots kept: 20000)
  shots=20000: save is 763 KiB of JSON
  shots=50000: save is 1906 KiB of JSON
  players[0].splashes = 200000 entries               -> ACCEPTED
  log = 200000 entries                               -> ACCEPTED
  players[0].ships = 5000 entries                    -> ACCEPTED

Normal play cannot reach this: one shot is appended per half-turn and the hot window is 6-10 half-turns (src/engine/ai.ts:37,47,58), so a genuine 108-turn game never puts more than a handful of records into `hot`. The blowup requires a hand-written file.

**Fix.** Two independent changes; do both. (1) In src/storage.ts, bound cardinality alongside shape - the engine's own limits give non-arbitrary numbers: `v.ships.length >= 1 && v.ships.length <= FLEET.length`, `v.shots.length <= BOARD_SIZE * BOARD_SIZE * <max turns you will resume>` (or simply a flat cap such as 5000), `v.splashes.length <= 2 * SPLASH_TTL`, and `v.log.length <= 20000`; reject rather than truncate, so the existing 'discard a save we cannot read' path (storage.ts:178-181) handles it, and add the four cases to the `a wrong-shaped save is refused rather than replayed` block in __tests__/storage.test.ts. (2) Make src/engine/ai.ts:141-154 independent of history length regardless: dedupe `hot` by coordKey before the pair loop (there are at most 100 distinct cells, so the loop is bounded by 100x100 by construction) and early-return once `candidates` has a handful of entries. As defence in depth against the delivery vector, set `"android": { "allowBackup": false }` in app.json - Expo defaults it to true (@expo/config-plugins/src/android/AllowBackup.ts: `config.android?.allowBackup ?? true`) and the save has nothing in it worth restoring across devices.


### L13-2 · low — Validator checks each field alone, never the combination: a save with the computer to move in the manoeuvre phase throws inside the AI's setTimeout, which no error boundary can catch

`src/storage.ts`:154 · CWE-248 · reproduced

**Who.** Same as L13-1 - whoever can write the AsyncStorage record once (unlocked device + adb backup/restore on Android <= 11, root, or a restored backup), or a future build of this app whose state shape drifts.

**How.** 1. Take a legitimate vs-Computer save. 2. Set state.phase = 'maneuver' and state.current = 1 (the player whose isAI is true). Every individual field is valid: 'maneuver' is one of the two resumable phases (storage.ts:154), 1 is a valid PlayerIndex (storage.ts:152), isAI is a boolean (storage.ts:138). No check relates them. 3. Write it back and launch; loadGame() accepts it and the menu offers 'Unfinished battle'. 4. Tap Resume -> App.tsx:188-192 fires scheduleAiTurn because players[1].isAI is true, and 900 ms later App.tsx:164 calls `fire(s, ...)`, whose first line is `if (state.phase !== 'fire') throw new Error('Not the firing phase')` (src/engine/game.ts:86).

**Why it matters.** An uncaught exception on the JS thread. React error boundaries only see throws from render/lifecycle, so the ErrorBoundary added at App.tsx:334 for exactly this purpose does not see it: React Native collects the timer error and rethrows it out of JSTimers.callTimers (node_modules/react-native/Libraries/Core/Timers/JSTimers.js:380), where it reaches the global handler installed in setUpErrorHandling.js as a fatal exception - a redbox in development, a process kill in release. Because loadGame() accepted the payload it is never cleared, and the throw happens before any state change, so the poisoned save survives: every launch offers Resume and every Resume kills the app. The only escape is noticing 'Discard'. This defeats the stated design of both the validator ('every field the two of them touch is checked here before it is handed over', storage.ts:41-50) and the boundary ('rather than let a bad one take the process with it', ErrorBoundary.tsx:17-22). It is also the one state combination the app itself can never write, since scheduleAiTurn does fire -> maneuver -> endTurn in a single synchronous block and calls setGame once.

**Evidence.**

src/storage.ts:149-161 - every predicate is single-field:
  if (v.mode !== 'ai' && v.mode !== 'local') return false;
  if (!isPlayerIndex(v.current)) return false;
  // A finished game is cleared rather than saved, so 'over' is not resumable.
  if (v.phase !== 'fire' && v.phase !== 'maneuver') return false;

App.tsx:188-192 - the driver trusts the pair:
  useEffect(() => {
    if (screen.name !== 'game' || !game || game.phase === 'over') return;
    if (aiBusy || !game.players[game.current].isAI) return;
    scheduleAiTurn(game, difficulty);

App.tsx:160-175 - the throw site is inside a timer, and the try only has a `finally`:
    aiTimer.current = setTimeout(() => {
      let s = g;
      try {
        const ai = s.current;
        const res = fire(s, aiChooseShot(s, ai, defaultRng, level));
        ...
      } finally {
        setAiBusy(false);
      }

node_modules/react-native/Libraries/Core/Timers/JSTimers.js:366-381 - the error leaves the timer:
    const errorCount = errors.length;
    if (errorCount > 0) { ... throw errors[0]; }

Run against the real validator and the real engine (the body of the timer callback, verbatim):
  loadGame() -> ACCEPTED
  players[1].isAI = true | phase = maneuver | current = 1
  THREW inside the AI timer callback: Error: Not the firing phase

__tests__/app.test.tsx:294-322 covers only a throw during *render*; nothing exercises a throw out of the AI timer.

**Fix.** Close it at both ends. (1) In isGameState (src/storage.ts:149), add the cross-field rules the engine assumes: `if (v.phase === 'maneuver' && (v.players as any[])[v.current as number].isAI) return false;` - more generally, reject any save where the current player is an AI and the phase is not 'fire', and reject `mode === 'local'` together with any `isAI === true` (a local game has no computer, and today such a save makes the AI silently play a human's turn). Add both to the `a wrong-shaped save is refused rather than replayed` block in __tests__/storage.test.ts. (2) Make the driver defensive independently: give scheduleAiTurn's callback a real `catch` that routes to the same recovery as the boundary (`recoverToHome()` at App.tsx:248, which drops the in-hand state and re-reads disk through the validator), so no future inconsistency can take the process down from a timer; and guard the effect with `game.phase === 'fire'` as well as `isAI`.


### L13-3 · info — The Android build declares READ_/WRITE_EXTERNAL_STORAGE and INTERNET, inherited from autolinked expo-file-system, for an app with no files and no network

`app.json`:19 · CWE-250 · reasoned

**Who.** Not directly exploitable by anyone; this is a blast-radius and user-consent issue. It matters to whoever later finds a code-execution or path-handling bug in the app, and to the user reading the Play listing, who sees an offline battleship game asking for photos/media/files.

**How.** Nothing to execute. The mechanism: expo@57.0.20 depends on expo-file-system, which `expo-modules-autolinking resolve -p android` confirms is linked into every Android build of this project; its library manifest declares <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32"/>, the matching READ_EXTERNAL_STORAGE, and INTERNET. AGP merges library <uses-permission> entries into the application manifest, and app.json declares no `android.blockedPermissions` to strip them. The app never imports expo-file-system (grep over App.tsx and src/ finds no import, no fetch/XHR/WebSocket, no file API), so none of the three is ever exercised.

**Why it matters.** Over-declared privilege on a fully offline app. Practically bounded: on minSdkVersion 24 the two storage permissions are runtime-gated and this app never calls requestPermissions, so they are declared but never granted; INTERNET is a normal permission and *is* granted at install, which means an app whose README says it never touches the network ships a process that can open sockets. The real costs are a wider blast radius for any future compromise and a store listing that over-asks. Listing it as info rather than low precisely because there is no attack path today.

**Evidence.**

app.json:19-27 - the android block sets no blockedPermissions:
    "android": {
      "package": "com.platteration.battleshiple",
      "adaptiveIcon": { ... },
      "predictiveBackGestureEnabled": false
    },

$ npx --no-install expo-modules-autolinking resolve -p android --json
  ...{"packageName":"expo-file-system","projects":[{"name":"expo-file-system",
  "sourceDir":"/home/user/battleshiple/node_modules/expo/node_modules/expo-file-system/android", ...

$ cat node_modules/expo/node_modules/expo-file-system/android/src/main/AndroidManifest.xml
  <uses-permission android:name="android.permission.INTERNET"/>
  <uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
  <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />

$ node -e "..." package.json -> no expo-file-system, expo-linking, expo-updates or any network dependency is declared by this project; it arrives through expo's own dependency list.

$ grep -rn "expo-file-system|fetch\(|XMLHttpRequest|WebSocket" App.tsx src/   ->  no matches

Support for the fix exists in the installed toolchain:
  node_modules/@expo/config-plugins/build/android/Permissions.js:64
    if (config.android?.blockedPermissions?.length) {

**Fix.** Add to app.json's android block:
  "blockedPermissions": [
    "android.permission.READ_EXTERNAL_STORAGE",
    "android.permission.WRITE_EXTERNAL_STORAGE"
  ]
which makes @expo/config-plugins emit tools:node="remove" for each at prebuild. Leave INTERNET alone unless you also drop Expo Go / dev-client support - removing it breaks Metro and any future crash reporting for no real gain. Then confirm the result rather than assuming it: run `npx expo prebuild -p android --clean` in a scratch directory and read android/app/src/main/AndroidManifest.xml, or unzip the APK and check with `aapt dump permissions`. While in the same block, consider `"allowBackup": false` (see L13-1) - Expo defaults it to true and the save is both worthless to steal and the delivery vector for L13-1 and L13-2.


## Checked and sound

What the reviewers tried and could not break. Recorded so it is not re-raised, and so a future change that undoes one of these is recognisable as a regression.

- The attack surface really is this small, and saying so is the honest headline. There is exactly one byte-stream entering this process from outside: AsyncStorage key 'battleshiple:savegame:v1', read at src/storage.ts:175. `grep -rn "eval(|new Function|dangerouslySetInnerHTML|Linking|WebView|fetch(|XMLHttpRequest|WebSocket|require("` over App.tsx, index.ts and src/ returns nothing. No network code, no file import, no clipboard, no share link, no message passing, no dynamic code. The other two inputs are useWindowDimensions and AppState, both from the OS.
- No deep-link handler exists to attack. app.json declares no `scheme`, no `intentFilters`, no `associatedDomains`; package.json has no expo-linking, expo-router, expo-web-browser or expo-updates; `expo-modules-autolinking resolve -p ios` lists only dom-webview, log-box, expo, asset, constants, file-system, font, haptics, keep-awake, modules-core and modules-jsi. Nothing registers a URL type, so no crafted link reaches any code in this repo.
- Every whitelist lookup is prototype-safe, and I tried to break each one through the real loadGame(). isKeyOf uses Object.prototype.hasOwnProperty.call (storage.ts:58-60); AI_PROFILES, SHIP_CLASSES and QUADRANT_NAMES are never indexed with an unchecked string. Rejected: difficulty = 'constructor' / '__proto__' / 'toString', ship.classId = 'constructor', ship.heading = 'constructor', splash.quadrant = 'constructor', lastShot.sunk.classId = '__proto__'.
- A save cannot pollute Object.prototype. Fed a payload with a literal "__proto__" key past the validator, then spread it the way withPlayer/log/endTurn do: `({}).polluted` stayed undefined and the spread result's prototype was still Object.prototype - JSON.parse creates an own data property and object spread uses CreateDataProperty, so neither writes through to a prototype.
- Every grid[r][c] sink is covered by an upstream bound. paintShips (boardView.ts:50), paintShots (boardView.ts:76) and buildTrackingView's target write (boardView.ts:104) index without checking, but isShip ends with `cellsOf(v).every(inBounds)` (storage.ts:89), isShot composes isCell, and isLastShot checks coord and every sunk cell. Rejected through the real validator: a ship whose bow puts the hull off the board, a shot at r=10, a lastShot with no coord, hits[] whose length disagrees with the class roster. paintPreview is the one that does bounds-check, and its input comes from the live UI, not from disk.
- state.winner is never validated and I could not reach it. A crafted `winner: "constructor"` is accepted and survives a non-terminal fire(), but GameOverScreen - the only reader, at GameOverScreen.tsx:22-24 - is reachable only from App.tsx:178 and App.tsx:205, both guarded by `phase === 'over'`, which only game.ts:130 sets, and that line assigns `winner: shooter` in the same expression. Worth pinning with a validator line anyway, but it is not a live crash site.
- Normal play cannot grow a save into the L13-1 blowup. shots and log gain one entry per half-turn, splashes are pruned by endTurn (game.ts:182) against SPLASH_TTL, and the AI's hot window is 6-10 half-turns, so `hot` holds a handful of records even in the README's 108-turn games. I checked this before rating L13-1 so the finding would not rest on an accident of long play.
- A device backup exposes nothing worth having. AsyncStorage 2.2 persists to the app-private sandbox (Android: databases/RKStorage, confirmed at ReactDatabaseSupplier.java:25; iOS: Documents/RCTAsyncLocalStorage_V1), both captured by default backups because Expo leaves android:allowBackup at its `?? true` default. The captured content is one key: ship coordinates, hit flags, cooldowns and log strings like 'You fired at C7'. No PII, credentials, tokens, analytics, device identifiers or free-text the user typed - there is no text input anywhere in the UI. The backup path matters only as the write vector in L13-1/L13-2, not as a disclosure.
- No secrets ship or leak. No API keys, tokens or `extra` block in app.json or eas.json; no .env in the tree; .gitignore covers `.env*` plus *.jks, *.p8, *.p12, *.key, *.mobileprovision and *.pem. eas.json holds only build profiles - credentials stay with Expo. Nothing is logged: there is no console.* call in App.tsx or src/.
- Pass-and-play information hiding holds across the resume path, which is where it was broken before. onResume (App.tsx:263-267) now routes every mode === 'local' save through the handoff screen with no phase condition; visibleLog (game.ts:78) drops the opponent's move entries; buildTrackingView paints only sunk enemy ships (boardView.ts:99-102); incomingReport names a quadrant, never the ship (GameScreen.tsx:57-59). I tried a crafted local save in the manoeuvre phase and it still lands on the handoff screen first.
- The computer opponent reads only what a human opponent can see. aiChooseShot touches players[ai].shots, players[ai].splashes and the enemy's isSunk flags; aiChooseManeuver adds the enemy's shot list. Neither reads enemy ship positions or hits, so a crafted save cannot be used to make the AI leak the other fleet - it has no path to it.
- The ErrorBoundary does contain the render-path half of the problem. A state that throws inside GameScreen/Board unmounts into 'Signal lost', and recoverToHome (App.tsx:248-255) drops the in-hand state rather than saving it back and rebuilds the offer through loadGame(), which discards a payload it cannot validate - so a render crash cannot loop forever. Only the timer path (L13-2) escapes it.
- Load failure handling is correct: JSON.parse is inside try/catch (storage.ts:177-185), an invalid payload is removed from disk before returning null (storage.ts:178-181), saveGame swallows write failures so autosave can never interrupt play (storage.ts:34-38), and a finished game is cleared rather than saved (storage.ts:29-32). __tests__/storage.test.ts:58-135 already pins all of this plus fourteen wrong-shape cases.
- CI posture is clean and I could not find a way for a fork to influence it: .github/workflows/ci.yml declares `permissions: contents: read`, pins actions/checkout and actions/setup-node to 40-hex SHAs, installs with `npm ci`, uses no secrets, and has no pull_request_target. Dependabot covers both npm and github-actions weekly.
- tools/generate-icons.py is a maintainer-run build script with no untrusted input - stdlib only (math, struct, zlib), reads nothing, writes PNGs to an argv-named directory. It is not shipped and not reachable from the app.

