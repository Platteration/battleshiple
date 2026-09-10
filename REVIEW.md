# Battleshiple — security & upgrade review (2026-09-09)

Two independent reviewers read every first-party file in this repository; a third then re-read each security or bug claim against the code and tried to refute it. Only claims that survived that check are listed as findings; the ones that did not are recorded at the end so they are not re-raised.

## Status — what has been fixed

All of the following are fixed on `claude/repo-review-security-baiyud`, each with a regression test that was checked by reverting the fix.

**First pass** — every critical and high finding, plus the medium ones that were quick:

`BUG-1`, `PLAY-1`

**Second pass** — the remaining medium findings and the low-severity ones that were trivial or small:

`REL-1`, `SAVE-1`, `GIT-1`

Deliberately not done: `BUG-2`, `CI-1`. Each was either already covered by an earlier pass, or judged churn or too risky to make without a device or a measurement. The reasoning is in the commit that touched it.

An independent reviewer then read each commit and tried to find what was wrong with it, and a second reviewer tried to refute every objection raised. What survived that was fixed in a follow-up commit.

Repository hardening applied here as well: every GitHub Action is pinned to a commit rather than a floating tag, each workflow declares a least-privilege `permissions` block, and a Dependabot config, a licence and a security policy are in place.

The rest of this document is the review as written. Fixed items are left in place so the reasoning behind each change stays with it.

## Summary

Battleshiple is a polished single-repo Expo SDK 57 / RN 0.86 / React 19 mobile game: Battleship where you may manoeuvre one ship after every shot, which paints a quadrant splash on the opponent's board. The architecture is genuinely good — src/engine is pure, React-free, deterministic TypeScript (seeded mulberry32 PRNG) with real unit tests, and src/ui is a thin presentation layer over it; the README documents measured balance numbers and the icon set is generated procedurally by a stdlib-only Python script. Maturity is 'feature-complete v1.0.0, never shipped': three commits, no LICENSE/SECURITY.md/CHANGELOG, no lint tooling of any kind, no Dependabot, unpinned GitHub Actions, and app.json/eas.json are not actually wired to an EAS project (no extra.eas.projectId, no expo-updates, no appVersionSource). The headline recommendations are: (1) fix the resume deadlock — an AI-mode game saved while it is the computer's turn can never be resumed because scheduleAiTurn is only ever called from onEndTurn; (2) add ESLint + expo-doctor + a bundle-export check to CI and pin the actions; (3) close the accessibility gap — board cells announce only 'A1' with no state, tabs/fleet cards/setup chips have no accessible name, and the splash ripple loops forever with no reduced-motion escape; (4) commit the balance simulation harness the README quotes numbers from, since nothing in the repo reproduces them.

## Attack surface

Battleshiple is a fully offline, single-device Expo/React Native game with no network code at all: the source contains no fetch/XHR/WebSocket, no WebView, no deep links, and no expo-updates module, so no remote code or data is ever loaded. It exposes no listeners or routes. The only persisted data is one AsyncStorage key ('battleshiple:savegame:v1') holding a JSON snapshot of the engine state (ship positions, shots, log lines such as 'You fired at C7'), which lives in the app's private sandbox and never leaves the device; no PII, tokens, or analytics exist. Native permissions are limited to Android VIBRATE, added automatically by expo-haptics; app.json declares no plugins, permissions, or usage descriptions. Users are the device owner and, in Pass & Play, a second person holding the same phone, so the only 'adversary' in the game model is the other local player peeking. The real external surface is the build pipeline: 732 npm packages (all from registry.npmjs.org with integrity hashes, only fsevents has an install script), EAS Build (credentials held by Expo, none in the repo), and a GitHub Actions workflow that runs typecheck and tests on every push and pull request with unpinned action tags and default GITHUB_TOKEN permissions.

## Already done well

- Engine is pure, immutable and self-validating: fire() rejects wrong phase and off-board shots (src/engine/game.ts:86-87), maneuver() re-runs checkManeuver() on every move (game.ts:146-147) and forbids a second move per turn (game.ts:141), and createGame() validates both fleets for completeness and overlap (game.ts:25-31). The UI only ever calls these after pre-validating (GameScreen.tsx:117-122, ManeuverPanel.tsx:82-92), so no engine throw is reachable from normal play.
- Pass-and-play information hiding is done properly: visibleLog() hides the opponent's move entries (src/engine/game.ts:77-79), the tracking board paints only sunk enemy ships (src/ui/boardView.ts:97-105), incomingReport() is phrased without leaking the moved ship (src/ui/screens/GameScreen.tsx:41-61), and a handoff screen is shown on every turn change (App.tsx:194) and after player 1's setup (App.tsx:122).
- The AI does not cheat: aiChooseShot()/aiChooseManeuver() read only the AI's own shot memory, its own received splashes, incoming enemy shots and the sunk state of enemy ships, all of which a human opponent also knows (src/engine/ai.ts:100-102, 117, 228). Only the hard profile uses splash intel, matching the README (ai.ts:51-60).
- Save handling is defensive: versioned key and payload (src/storage.ts:4, 22), JSON.parse wrapped in try/catch with unrecognised payloads deleted (storage.ts:44-57), autosave failures swallowed so play is never interrupted (storage.ts:23-27), and finished games cleared instead of saved (storage.ts:18-21). Tests cover round-trip, corrupt payloads and storage failure (__tests__/storage.test.ts:33-75).
- Resource hygiene: AI and game-over timers are cleared on unmount and on quit (App.tsx:76-82, 199-200), the AppState subscription is removed (App.tsx:94), the setup bad-preview timer is cleaned up (SetupScreen.tsx:41-45), and every Animated.loop is stopped in its effect cleanup (SplashOverlay.tsx:29-31).
- Haptics wrapper is web-safe and never produces an unhandled rejection (src/ui/feedback.ts:8-11).
- Supply chain is tight: package-lock.json is lockfileVersion 3, all 732 packages resolve to registry.npmjs.org with integrity hashes, only fsevents (optional, macOS) has an install script, CI uses npm ci (.github/workflows/ci.yml:15), no git-sourced dependencies, and no expo-updates so no over-the-air code. No secrets in the tree or git history; .gitignore already excludes keystores, certificates and .env files.
- Deterministic RNG injection (src/engine/random.ts) keeps the engine free of hidden randomness, which is what makes the AI tests and the README balance figures reproducible (__tests__/ai.test.ts:8-29, game.test.ts:138-143).
- UI smoke tests exercise the real flows, including autosave/resume/discard across a remount (__tests__/app.test.tsx:176-226) and the AI turn timer (app.test.tsx:95-120).

## Findings (9)

| # | Severity | Category | Title | Where | Effort | Status |
|---|---|---|---|---|---|---|
| BUG-1 | Medium | bug | Resuming a vs-Computer game saved during the AI's turn soft-locks the match | `App.tsx:215` | small | confirmed |
| PLAY-1 | Medium | bug | Pass & Play opens Player 1's board while Player 2 is still holding the phone: no handoff between the second setup and the first turn | `App.tsx:126` | trivial | found by second reviewer |
| BUG-2 | Low | bug | Pass & Play resume skips the handoff screen when the save is in the manoeuvre phase | `App.tsx:218` | trivial | confirmed |
| REL-1 | Low | reliability | Shallow save validation plus no error boundary: a malformed or newer-shaped save crashes the app on every Resume | `src/storage.ts:30` | small | confirmed |
| CI-1 | Low | ci-cd | CI workflow runs with default token permissions and unpinned action tags on every push and pull request | `.github/workflows/ci.yml:12` | trivial | confirmed |
| SAVE-1 | Low | bug | Starting a new game silently destroys the unfinished match the same menu is offering to resume | `App.tsx:99` | trivial | found by second reviewer |
| GIT-1 | Low | supply-chain | .gitignore ignores .env*.local but not .env, contrary to the audit's stated strength | `.gitignore:34` | trivial | found by second reviewer |
| SUP-1 | Info | supply-chain | No automated dependency update mechanism while transitive advisories accumulate | `package.json:14` | trivial | confirmed, severity lowered |
| INFO-1 | Info | supply-chain | No LICENSE file: default 'all rights reserved' contradicts a public portfolio repo | `README.md:1` | trivial | confirmed |

### BUG-1 · Resuming a vs-Computer game saved during the AI's turn soft-locks the match

**Severity:** Medium · **Category:** bug · **Effort:** small · **Where:** `App.tsx:215`

scheduleAiTurn() is invoked only from onEndTurn() (App.tsx:192). When the human ends a turn, setGame(next) stores a state with current=1/phase='fire' and the autosave effect (App.tsx:85-88) writes that state to disk immediately, 900 ms before the AI timer fires. goHome() (App.tsx:203-205) and the AppState listener (App.tsx:92) save that same state if the player taps 'Quit to menu' or the app is backgrounded during the AI's think time; if the OS kills the app in that window the on-disk save is likewise the AI-to-move state. onResume() (App.tsx:211-222) then restores the state and shows GameScreen but never schedules the AI. Because myTurn = state.current === viewer && !busy (GameScreen.tsx:67) and busy is false, the board is disabled, no Fire button renders, the status line misleadingly says 'Choose a target in enemy waters', and nothing will ever advance the game. The only way out is 'Discard', losing the match, which is precisely the failure the README's 'a phone call will not cost you a game' promise is meant to prevent.

Evidence:

```
App.tsx:187-196
  const next = endTurn(game);
  setGame(next);
  if (next.mode === 'ai') {
    scheduleAiTurn(next, difficulty);

App.tsx:85-88
  useEffect(() => {
    if (!game || game.phase === 'over') return;
    void saveGame(game, difficulty);
  }, [game, difficulty]);

App.tsx:211-222 (onResume)
  setGame(saved.state);
  setSaved(null);
  setScreen(... : { name: 'game' });   // no scheduleAiTurn

src/ui/screens/GameScreen.tsx:67
  const myTurn = state.current === viewer && !busy;
```

**Recommendation.** The proposed effect is sound for this codebase - I checked that the guard it relies on survives the round trip: `isAI` is a real field of PlayerState (src/engine/types.ts:88), is set by createGame (src/engine/game.ts:39) and is plain JSON, so `game.players[game.current].isAI` is correct after `JSON.parse` in loadGame. Two refinements: (a) also require `screen.name === 'game'` as written *and* that the state is not already over, otherwise the effect will re-fire while the 700 ms `overTimer` window is open; (b) keep the `try/finally` from the current body - the effect version must still call `setGame` outside the `finally`, or a throw from a corrupted state (see REL-1) leaves `aiBusy` false with the AI to move, reproducing this same soft-lock.

### PLAY-1 · Pass & Play opens Player 1's board while Player 2 is still holding the phone: no handoff between the second setup and the first turn

**Severity:** Medium · **Category:** bug · **Effort:** trivial · **Where:** `App.tsx:126`

The handoff screen is inserted before Player 2 deploys (App.tsx:120-122) but not after. When Player 2 taps 'Start battle', `onSetupReady` calls `beginGame` directly, which sets the screen to 'game' with no detour (App.tsx:106-111). `createGame` starts with `current: 0` (src/engine/game.ts:47), and GameScreen's viewer for a local game is `game.current` (App.tsx:265), so the device in Player 2's hands immediately renders Player 1's screen - header 'Player 1', and a 'Your fleet' tab one tap away that paints Player 1's entire fleet: every hull position, heading, and hit state (GameScreen.tsx:175 -> buildFleetView -> paintShips, boardView.ts:83-94). This is the same missing-handoff defect as BUG-2, but on the guaranteed path rather than an edge case: it happens at the start of every single pass-and-play match, whereas BUG-2 needs a quit-and-resume with the device changing hands. The app's own README (line 54-55) sells 'a handoff screen between turns so nobody peeks', and HandoffScreen.tsx:13 documents that purpose. The current behaviour is baked into the test suite, which asserts that 'Player 1' is on screen immediately after Player 2's 'Start battle' with no 'Pass the device to' in between, so this will not regress into view on its own.

Evidence:

```
App.tsx:120-127 (handoff before player 2's setup, none after)
      if (screen.player === 0) {
        setFleets([ships, null]);
        setScreen({ name: 'handoff', player: 1, reason: 'setup' });
      } else {
        const f0 = fleets[0];
        if (!f0) return;
        beginGame(f0, ships, mode);
      }

App.tsx:106-111
  const beginGame = useCallback((f0: Ship[], f1: Ship[], m: GameMode) => {
    const g = createGame({ mode: m, names: playerNames(m), fleets: [f0, f1], aiPlayer: m === 'ai' ? 1 : undefined });
    setSaved(null);
    setGame(g);
    setScreen({ name: 'game' });

src/engine/game.ts:44-51  ->  returns { ..., current: 0, phase: 'fire', ... }
App.tsx:265
  viewer={game.mode === 'ai' ? 0 : game.current}
src/ui/screens/GameScreen.tsx:175
  <Board grid={fleetGrid} width={width} onPressCell={onPressFleetCell} disabled={!myTurn || phase !== 'maneuver'} />

__tests__/app.test.tsx:128-131 (the leak is asserted as expected behaviour)
    pressText(root, 'ready');
    pressText(root, 'Random');
    pressText(root, 'Start battle');
    expect(hasText(root, 'Player 1')).toBe(true);
```

**Recommendation.** Route the start of a local match through the handoff screen, exactly as every turn change already does (App.tsx:194): in `onSetupReady`, for mode 'local' and screen.player === 1, call `beginGame` and then `setScreen({ name: 'handoff', player: 0, reason: 'turn' })` - or have `beginGame` take the target screen. Fixing BUG-2 by dropping the `phase === 'fire'` condition in `onResume` and fixing this together makes 'a local game is never shown without a handoff in front of it' a single invariant. Update __tests__/app.test.tsx:128-131 to expect 'Pass the device to' + 'ready' before 'Player 1' appears; that assertion is what pins the invariant in place.

### BUG-2 · Pass & Play resume skips the handoff screen when the save is in the manoeuvre phase

**Severity:** Low · **Category:** bug · **Effort:** trivial · **Where:** `App.tsx:218`

onResume routes a local-mode save through HandoffScreen only when phase === 'fire'. A game quit after firing but before ending the turn (phase 'maneuver') resumes straight into GameScreen with viewer = game.current, so whichever player taps 'Resume game' immediately sees the current player's full fleet, positions, cooldowns and manoeuvre panel. The handoff screen exists precisely so 'nobody peeks' (README, HandoffScreen.tsx:13); this path bypasses it.

Evidence:

```
App.tsx:217-221
  setScreen(
    saved.state.mode === 'local' && saved.state.phase === 'fire'
      ? { name: 'handoff', player: saved.state.current, reason: 'turn' }
      : { name: 'game' },
  );
```

**Recommendation.** Drop the phase condition so every local-mode resume goes through the handoff screen:

saved.state.mode === 'local'
  ? { name: 'handoff', player: saved.state.current, reason: 'turn' }
  : { name: 'game' }

Optionally tailor the handoff message for the manoeuvre phase ('You have already fired this turn').

### REL-1 · Shallow save validation plus no error boundary: a malformed or newer-shaped save crashes the app on every Resume

**Severity:** Low · **Category:** reliability · **Effort:** small · **Where:** `src/storage.ts:30`

isValid() only checks that players is a 2-element array whose entries have ships/shots/splashes arrays, turn is a number and phase is fire|maneuver. It does not check mode, current (must be 0|1), log (an array), difficulty, or any ship/shot shape. A payload that passes but is otherwise wrong (a future build that alters the state shape without bumping version, a restored device backup from a different build, or any hand-edited file on a rooted device) is offered as 'Unfinished battle' and, on Resume, throws during render: AI_PROFILES[difficulty] is undefined so profile.blunderChance throws in aiChooseShot (ai.ts:99,112); grid[cell.r][cell.c].ship throws for an off-board ship (boardView.ts:50) or shot (boardView.ts:76); visibleLog() calls state.log.filter (game.ts:78). There is no React error boundary anywhere, so this is a fatal JS exception that takes down the whole app; the save is not cleared, so the crash repeats on every Resume until the user thinks to press Discard. The security angle is negligible (the file is app-private), but the reliability gap is real for a project that already has a versioned save format and will ship updates.

Evidence:

```
src/storage.ts:33-41
  if (v.version !== 1 || !v.state) return false;
  const s = v.state;
  return (
    Array.isArray(s.players) &&
    s.players.length === 2 &&
    s.players.every((p) => Array.isArray(p.ships) && Array.isArray(p.shots) && Array.isArray(p.splashes)) &&
    typeof s.turn === 'number' &&
    (s.phase === 'fire' || s.phase === 'maneuver')
  );

src/engine/ai.ts:99
  const profile = AI_PROFILES[difficulty];

src/ui/boardView.ts:50
  grid[cell.r][cell.c].ship = {
```

**Recommendation.** Same two layers, with one correction: `validateFleet` (src/engine/game.ts:25) is module-private and *throws* rather than returning a boolean, so 'export validateFleet' as written would give isValid a throwing dependency inside a predicate. Either export a boolean `fleetIsPlaceable(ships)` wrapper, or simply wrap the existing call in try/catch inside isValid. Skip zod/valibot: this repo currently ships zero runtime dependencies beyond Expo's own, and the whole check is ~20 lines of hand-written predicates over an engine that already exports `inBounds`, `cellsOf`, `SHIP_CLASSES` and `HEADINGS`. Cheapest high-value subset if effort is limited: validate `difficulty in AI_PROFILES`, `current === 0 || current === 1`, `Array.isArray(log)`, and `cellsOf(ship).every(inBounds)` for every ship plus `inBounds` for every shot - that alone closes all four crash sites listed above.

### CI-1 · CI workflow runs with default token permissions and unpinned action tags on every push and pull request

**Severity:** Low · **Category:** ci-cd · **Effort:** trivial · **Where:** `.github/workflows/ci.yml:12`

The workflow has no top-level permissions: block, so GITHUB_TOKEN gets the repository default (often contents: write for repositories created before the 2023 default change), and actions/checkout and actions/setup-node are referenced by mutable major tags rather than commit SHAs. It triggers on push to all branches and on pull_request. No secrets are used and the job only runs typecheck and tests, so the realistic impact is limited to a compromised or hijacked action tag exfiltrating a token that could push to this repository or tamper with CI output; that is a low-probability event but the fix is two lines.

Evidence:

```
.github/workflows/ci.yml:3-6
  on:
    push:
      branches: ['**']
    pull_request:

.github/workflows/ci.yml:12-13
  - uses: actions/checkout@v4
  - uses: actions/setup-node@v4
```

**Recommendation.** Add at the top of the job (or workflow):

permissions:
  contents: read

and pin both actions to full commit SHAs with the version in a comment, e.g. actions/checkout@<40-hex-sha> # v4.2.2 and actions/setup-node@<40-hex-sha> # v4.1.0. Add .github/dependabot.yml with package-ecosystem: github-actions (weekly) so the SHAs are kept current automatically.

### SAVE-1 · Starting a new game silently destroys the unfinished match the same menu is offering to resume

**Severity:** Low · **Category:** bug · **Effort:** trivial · **Where:** `App.tsx:99`

HomeScreen presents 'Resume game' / 'Discard' for the saved match directly above 'Play vs Computer' and 'Pass & Play' (HomeScreen.tsx:38-51). Tapping either start button calls `startSetup`, which clears `game` but leaves both the on-disk save and the `saved` offer untouched and gives no warning. The save is then destroyed at the first autosave of the new match: `beginGame` calls `setSaved(null)` (App.tsx:108) and the autosave effect immediately overwrites the single fixed key (src/storage.ts:4, App.tsx:85-88). There is no confirmation and no undo - the discard the user explicitly did not choose happens anyway, and only once the new fleet is deployed, so the mis-tap is not recoverable by backing out of setup. Given the README's promise that 'Quitting to the menu keeps the game' (README.md:71) and that games run 80-108 turns a side (README.md:99), losing one to a mis-tap is a real cost. Severity is low only because it needs a user mistake rather than a code path firing on its own.

Evidence:

```
App.tsx:99-104 (no warning, `saved` left in place)
  const startSetup = useCallback((m: GameMode) => {
    setMode(m);
    setFleets([null, null]);
    setGame(null);
    setScreen({ name: 'setup', player: 0 });
  }, []);

App.tsx:106-110 (the point of no return)
    const g = createGame({ ... });
    setSaved(null);
    setGame(g);

App.tsx:85-88 + src/storage.ts:4 (one fixed key, overwritten in place)
    void saveGame(game, difficulty);
  const KEY = 'battleshiple:savegame:v1';

src/ui/screens/HomeScreen.tsx:38-51 (Resume/Discard sit immediately above the start buttons)
      {resume && ( ... <Button title="Resume game" .../> <Button title="Discard" .../> )}
      <Button title="Play vs Computer" onPress={() => onStart('ai')} />
```

**Recommendation.** In `startSetup`, when `saved` is non-null, confirm before proceeding - React Native's built-in `Alert.alert` with 'Resume instead' / 'Start new (discards saved battle)' is the idiomatic call here and needs no dependency. A lighter alternative that costs no dialog: relabel the start buttons to 'New battle (discards saved game)' while `saved` is set. Either way keep the destructive write where it is; the gap is the missing consent, not the overwrite.

### GIT-1 · .gitignore ignores .env*.local but not .env, contrary to the audit's stated strength

**Severity:** Low · **Category:** supply-chain · **Effort:** trivial · **Where:** `.gitignore:34`

The first auditor's strengths list asserts '.gitignore already excludes keystores, certificates and .env files'. The first two hold (*.jks, *.p8, *.p12, *.key, *.mobileprovision, *.pem at .gitignore:16-19,31), but the env rule is the stock Expo template line `.env*.local`, which matches `.env.local` and `.env.production.local` only. A plain `.env` or `.env.production` is fully tracked. Nothing is exposed today - the app reads no environment at all (grep for process.env / EXPO_PUBLIC across every .ts/.tsx/.json returns nothing) and git history is three commits with no secret material - so this is latent rather than active. It matters because the natural next step for this project is EAS credentials or an analytics/store key, and the conventional place a solo dev puts those is `.env`, which this file will happily commit. I am listing it explicitly because the audit recorded the opposite as a strength, and a wrong strength is more dangerous than a missing finding.

Evidence:

```
$ git check-ignore -v .env        ->  (no output, exit=1)  # NOT ignored
$ git check-ignore -v .env.local  ->  .gitignore:34:.env*.local\t.env.local  (exit=0)

.gitignore:33-34
  # local env files
  .env*.local

grep -rn 'process.env|EXPO_PUBLIC' --include='*.ts' --include='*.tsx' --include='*.json' .  ->  no matches (no env usage today)
```

**Recommendation.** Broaden the rule to the pattern Expo now ships for new projects: replace `.env*.local` with `.env*` plus a `!.env.example` negation if a checked-in template is ever wanted. Also correct the audit note - keystores and certificates are covered, env files are not.

### SUP-1 · No automated dependency update mechanism while transitive advisories accumulate

**Severity:** Info (reported as low, adjusted after review) · **Category:** supply-chain · **Effort:** trivial · **Where:** `package.json:14`

The repo has no Dependabot or Renovate configuration. npm audit already reports 10 moderate advisories, all in the build-time chain uuid < 11.1.1 via xcode -> @expo/config-plugins -> expo, none reachable at runtime in the shipped app. Nothing is exploitable today, but with tilde-pinned Expo modules (~57.0.x) and no update automation, the next runtime-reachable advisory in react-native, async-storage or an Expo module will sit unnoticed for a solo maintainer.

Evidence:

```
package.json:14-21
  "dependencies": {
    "@react-native-async-storage/async-storage": "2.2.0",
    "expo": "~57.0.20",
    "expo-haptics": "~57.0.2",
    ...

(pre-computed) npm audit: 10 moderate, all transitive build-time (uuid <11.1.1 via xcode -> @expo/config-plugins -> expo)
```

**Recommendation.** Add .github/dependabot.yml with package-ecosystem: npm, schedule weekly, and a group for expo/react-native so SDK-aligned bumps arrive as one PR; CI already validates them with typecheck and tests. Prefer `npx expo install --fix` for Expo-managed packages so versions stay SDK-compatible. Do not override uuid in package.json overrides: the advisory is build-only and forcing uuid@11 under xcode risks breaking prebuild.

*Reviewer note (confirmed, severity lowered):* The verifiable core is true: `ls .github` shows only `workflows/`, so there is no dependabot.yml or renovate.json, and package.json:14-21 tilde-pins the Expo modules. I also confirmed the dependency the advisory hangs on: package-lock.json:9212-9221 pins uuid 7.0.3 (carrying npm's own deprecation notice) and it is reached only through xcode 3.0.1 (package-lock.json:9427-9435), a prebuild-time dependency of @expo/config-plugins - it is not in the shipped bundle. I could not re-run `npm audit` (read-only review, no install, no network), so the '10 moderate' count is the auditor's unverified pre-computed number, not something I confirmed. I am downgrading to info because the finding's own description concedes 'Nothing is exploitable today', the only cited advisories are build-time and unreachable, and this app has no network input surface whatsoever (no fetch/XHR/WebSocket/WebView/Linking/deep links anywhere in src - verified by grep), so even a future runtime advisory in react-native or async-storage would need local device access to reach. This is a maintenance-process recommendation, not a defect. The recommendation itself is good and still worth doing - particularly the warning against an `overrides` entry for uuid, which would risk breaking prebuild for zero runtime benefit.

### INFO-1 · No LICENSE file: default 'all rights reserved' contradicts a public portfolio repo

**Severity:** Info · **Category:** supply-chain · **Effort:** trivial · **Where:** `README.md:1`

The repository ships no LICENSE and the README states no terms. If the repo is public, anyone reading or forking it has no legal grant to use the code; if it is meant to be proprietary, that intent is not stated either. This is not a technical vulnerability but is the most common blocker for anyone (including future you, or a store reviewer asking about third-party code) reusing the engine.

Evidence:

```
git ls-files: no LICENSE, LICENSE.md, or COPYING; package.json has no "license" field (package.json:1-5 shows only name/version/main/private).
```

**Recommendation.** Add a LICENSE file (MIT or Apache-2.0 for a portfolio project) and the matching "license" field in package.json; if the code is intended to stay proprietary, add a one-line 'All rights reserved; not licensed for reuse' note to the README instead.

## Upgrades

| Value | Effort | Upgrade | Now | Move to |
|---|---|---|---|---|
| high | small | No linter or formatter at all | No eslint.config.js / .eslintrc / .prettierrc anywhere; package.json scripts are start/android/ios/web/test/typecheck only. CI runs typecheck + jest and nothing else. | Add `eslint` + `eslint-config-expo` (`npx expo lint` scaffolds it for SDK 57) and prettier, add `"lint": "expo lint"` to package.json, and add a `npm run lint` step to .github/workflows/ci.yml. Enable `react-hooks/exhaustive-deps` in particular — App.tsx has several hand-tuned useCallback/useEffect dependency arrays (the AppState effect at App.tsx:90 re-subscribes on every game object) that a linter would flag. |
| high | small | CI is missing lint, expo-doctor, bundle export and audit steps | .github/workflows/ci.yml: checkout, setup-node@22, npm ci, npm run typecheck, npm test -- --ci. | Add `npx expo-doctor` (catches dependency-version drift against SDK 57 and misconfigured app.json), `CI=1 npx expo export --platform ios --platform android` (the only thing that proves the app still bundles — typecheck+jest both pass on code Metro cannot resolve), `npm run lint`, and `npm audit --audit-level=high`. Sibling repos in this account already run an export check for exactly this reason. |
| high | small | Accessibility: the board is unusable with a screen reader | Board.tsx:121 sets `accessibilityLabel={`${COLS[c]}${r + 1}`}` — the coordinate only, identical on both the tracking board and the fleet board, with no accessibilityRole and no state. Nothing conveys hit / miss / your carrier / on cooldown / splash. | Give each cell `accessibilityRole="button"`, a label composed from the CellView it already receives (`"C7, miss"`, `"C7, your Destroyer, hit"`, `"C7, enemy waters, unfired"`), and `accessibilityState={{ disabled }}`. Add an `accessibilityLabel` prop to Board so the two boards announce which grid they are. |
| high | small | Accessibility: unlabelled interactive controls outside Button/Segmented | Only Button.tsx and Segmented.tsx set accessibilityRole/State. The Enemy waters / Your fleet tabs (GameScreen.tsx:164), the fleet cards (FleetStatus.tsx:29) and the setup ship chips (SetupScreen.tsx:120) are bare Pressables with no role, no accessible name beyond their child Text, and no selected/disabled state. | Add `accessibilityRole="tab"`/`"button"` plus `accessibilityState={{ selected, disabled }}` to all three. The FleetStatus card in particular renders its status as colour + tiny segment rectangles, so a composed label (`"Destroyer, 1 of 3 hit, ready in 2"`) is the only way that information reaches a screen reader. |
| high | small | EAS project is not actually wired up; no OTA updates or version strategy | eas.json has build profiles but no `cli.appVersionSource`. app.json has `version: "1.0.0"` with no `ios.buildNumber`, no `android.versionCode`, no `extra.eas.projectId`, no `updates` block, no `runtimeVersion`, and no `scheme`. expo-updates is not a dependency. `submit.production` is empty. | Run `eas init` to write `extra.eas.projectId`, add `"appVersionSource": "remote"` to eas.json's cli block so build numbers auto-increment, add a `scheme` (needed for dev-client deep links), and add expo-updates with `runtimeVersion: { policy: "appVersion" }` plus per-profile `channel` values. For a game this size OTA updates are the difference between a balance tweak shipping in an hour and in a week. |
| medium | trivial | GitHub Actions unpinned and workflow has no permissions block | `actions/checkout@v4` and `actions/setup-node@v4` referenced by moving tag; 0 of 2 actions pinned to a SHA. No top-level `permissions:` key, so the job inherits the repository default token scope. | Pin both to full commit SHAs with a version comment, and add `permissions: { contents: read }` at workflow level. Neither action needs write access here. |
| medium | trivial | No Dependabot / Renovate | No .github/dependabot.yml. The 10 moderate npm-audit findings (uuid <11.1.1 via xcode -> @expo/config-plugins -> expo) have no automated tracking. | Add .github/dependabot.yml with `npm` (weekly, grouped, ignoring `expo`/`react-native`/`react` majors so Expo SDK bumps stay manual) and `github-actions` ecosystems. The github-actions updater also keeps SHA pins current once they are pinned. |
| medium | small | `npm run web` cannot work — web dependencies are absent | package.json declares `"web": "expo start --web"` but react-dom, react-native-web and @expo/metro-runtime are not in dependencies and are not in package-lock.json. app.json declares `web.favicon` with no `web.bundler`. | Either add the three web dependencies via `npx expo install react-dom react-native-web @expo/metro-runtime` and set `"web": { "bundler": "metro", "favicon": "./assets/favicon.png" }`, or delete the `web` script and the `web` block in app.json. Web is worth keeping as a test surface: it would let the existing __tests__ be complemented by a Playwright smoke test with no device. |
| medium | medium | react-test-renderer is undeclared and deprecated under React 19 | __tests__/app.test.tsx imports `react-test-renderer` directly, but it appears in package-lock.json only transitively (jest-expo 57.0.5 depends on react-test-renderer 19.2.3). package.json declares `@types/react-test-renderer` but not the runtime package. | Move to `@testing-library/react-native` (which jest-expo documents for SDK 57) and drop the hand-rolled `findByText`/`pressable`/`pressText` tree-walking helpers at __tests__/app.test.tsx:26-63. Its `getByRole` / `getByLabelText` queries would additionally force the accessibility work below to stay done, because a control with no accessible name becomes unqueryable. If the migration is deferred, at minimum add `react-test-renderer` to devDependencies so the import is not resolving by accident. |
| medium | small | Accessibility: no reduced-motion handling and no live region for turn state | SplashOverlay.tsx:22-31 starts an `Animated.loop` per ripple (three per splashed quadrant) that runs for the whole of the observer's turn with no way to stop it. GameScreen's status line (GameScreen.tsx:178) and the incoming report (GameScreen.tsx:152) change silently — the only non-visual feedback in the app is haptics. | Gate the loop on `AccessibilityInfo.isReduceMotionEnabled()` (and a user setting), falling back to a static ring. Add `accessibilityLiveRegion="polite"` / `AccessibilityInfo.announceForAccessibility` on the status line and report so 'HIT — enemy Carrier sunk!' and 'Splash in the south-west' are spoken. |
| medium | medium | TypeScript strictness stops at `strict: true` | tsconfig.json: `{ extends: expo/tsconfig.base, compilerOptions: { strict: true, types: ["jest"] } }`. | Add `noUncheckedIndexedAccess`, `noFallthroughCasesInSwitch`, `noImplicitOverride` and `exactOptionalPropertyTypes`. This codebase indexes arrays constantly on values the compiler cannot prove are in range — `grid[cell.r][cell.c]` (boardView.ts:50), `hot[0]` (ai.ts:156), `COLS[c.c]` (geometry.ts:66, which already needs a `?? '?'` guard), `cells[Math.floor((cells.length - 1) / 2)]` (game.ts:155) — and `noUncheckedIndexedAccess` turns exactly the corrupt-save crash described below into a compile error. Expect a one-off pass of ~20 fixes. |
| medium | trivial | app.json uses the legacy top-level `splash` key | app.json declares `splash: { image, resizeMode, backgroundColor }` at the root. Expo has moved splash configuration to the `expo-splash-screen` config plugin; the root key is legacy and does not support the newer per-platform / dark-mode options. | Move it to `plugins: [["expo-splash-screen", { image, resizeMode: "contain", backgroundColor: "#061a2b" }]]`. app.json currently declares no plugins at all, so this also establishes the plugins array that expo-updates and any future native module will need. Confirm with `npx expo-doctor` in CI (see above). |
| medium | medium | No error boundary and no opt-in crash reporting | App.tsx renders screens directly under SafeAreaProvider with no React error boundary. The engine throws on every illegal action (`fire` throws 'Not the firing phase', `maneuver` throws check.reason, `randomFleet` throws 'Could not place ...'), and the AI turn runs those throwing calls inside a `setTimeout` (App.tsx:136-156) where an exception escapes the `finally` and kills the turn silently. | Wrap `content` in an error boundary that offers 'return to menu' and preserves the autosave, and add opt-in `@sentry/react-native` (Expo's sentry config plugin) behind a first-run consent toggle so real-device crashes are visible. Given the app stores nothing personal, an explicit 'no analytics, crash reports only, off by default' line in the settings screen is honest and cheap. |
| medium | small | Board re-renders 100 Pressables on every state change | Board.tsx maps a 10x10 grid to 100 Pressables each containing a CellContent; neither is memoised. The grids are rebuilt with useMemo keyed on `me`/`enemy` (GameScreen.tsx:93-97), but those PlayerState objects get a new identity on every fire/maneuver/endTurn because game.ts rebuilds them immutably, so the memo never hits and all 100 cells re-render on every tap. | Wrap CellContent in `React.memo` and give each cell a stable `onPress` (a memoised callback taking r/c, or an index-keyed row component). Also memoise the `Row`. This is cheap and matters on the low-end Android devices where a 108-turn match is played. |
| medium | trivial | Missing LICENSE, SECURITY.md, CHANGELOG and CONTRIBUTING | None present. The repo has no default branch on the remote either — only the claude/... feature branch. | Add a LICENSE (MIT unless the intent is to keep the store listing exclusive), a SECURITY.md that states the audit position above and that the app makes no network calls and stores only a local savegame, and a CHANGELOG seeded from the three existing commits. Push a `main` branch and set it as default so CI's `push: branches: ['**']` and PRs have something to target. |
| low | trivial | npm audit: 10 moderate, all build-time transitive | uuid 7.0.3 (deprecated, `uuid@10 and below is no longer supported`) reached via xcode 3.0.1 -> @expo/config-plugins 57.0.9 -> expo 57.0.20. Only used by the iOS prebuild/config-plugin path, never bundled into the app. | Leave the tree alone (an `overrides` on uuid risks breaking `xcode`'s CommonJS require) but record the decision: add a SECURITY.md section stating these are build-time-only and not shipped, and let Dependabot re-evaluate when @expo/config-plugins updates xcode. Do not silence with `npm audit --production` alone — the finding is real for a build machine. |
| low | trivial | Node version is asserted in three places and pinned in none | README says 'Requires Node 22', CI hardcodes `node-version: 22`, package.json has no `engines` field and there is no .nvmrc. | Add `"engines": { "node": ">=22" }` to package.json and a `.nvmrc` containing `22`, then change CI to `node-version-file: .nvmrc` so the three cannot drift apart. |
| low | small | No coverage reporting or threshold | jest config in package.json sets only `preset` and `testMatch`. CI runs `npm test -- --ci` with no coverage. | Add `collectCoverageFrom: ["src/**/*.{ts,tsx}", "App.tsx"]` and a `coverageThreshold` on `src/engine` specifically (it is pure and should be near 100%), then run `npm test -- --ci --coverage` in CI. src/ui/boardView.ts currently has zero coverage despite being pure, testable logic. |
| low | large | All user-facing copy is inline English with no i18n layer | Strings are literals scattered through screens and the engine — the rules text in HomeScreen.tsx:56-94, the log sentences built in game.ts:124-131 and 162-166, describeManeuver in maneuver.ts:94-109, and QUADRANT_NAMES in geometry.ts:55-60. The engine composing English prose also couples the pure layer to presentation. | Move log generation out of the engine: have `fire`/`maneuver` emit structured LogEntry payloads (`{ kind: 'shot', coord, result, shipClass }`) and render them in the UI, then add `expo-localization` + a small message catalogue. This is a prerequisite for any non-English store listing and it also makes the engine's log assertions testable without string matching. |

- **No linter or formatter at all** (high value, small, `package.json`). undefined
- **CI is missing lint, expo-doctor, bundle export and audit steps** (high value, small, `.github/workflows/ci.yml`). undefined
- **Accessibility: the board is unusable with a screen reader** (high value, small, `src/ui/components/Board.tsx`). undefined
- **Accessibility: unlabelled interactive controls outside Button/Segmented** (high value, small, `src/ui/screens/GameScreen.tsx`). undefined
- **EAS project is not actually wired up; no OTA updates or version strategy** (high value, small, `eas.json`). undefined
- **GitHub Actions unpinned and workflow has no permissions block** (medium value, trivial, `.github/workflows/ci.yml`). undefined
- **No Dependabot / Renovate** (medium value, trivial, `.github/dependabot.yml`). undefined
- **`npm run web` cannot work — web dependencies are absent** (medium value, small, `package.json`). undefined
- **react-test-renderer is undeclared and deprecated under React 19** (medium value, medium, `__tests__/app.test.tsx`). undefined
- **Accessibility: no reduced-motion handling and no live region for turn state** (medium value, small, `src/ui/components/SplashOverlay.tsx`). undefined
- **TypeScript strictness stops at `strict: true`** (medium value, medium, `tsconfig.json`). undefined
- **app.json uses the legacy top-level `splash` key** (medium value, trivial, `app.json`). undefined
- **No error boundary and no opt-in crash reporting** (medium value, medium, `App.tsx`). undefined
- **Board re-renders 100 Pressables on every state change** (medium value, small, `src/ui/components/Board.tsx`). undefined
- **Missing LICENSE, SECURITY.md, CHANGELOG and CONTRIBUTING** (medium value, trivial, `README.md`). undefined
- **npm audit: 10 moderate, all build-time transitive** (low value, trivial, `package.json`). undefined
- **Node version is asserted in three places and pinned in none** (low value, trivial, `package.json`). undefined
- **No coverage reporting or threshold** (low value, small, `package.json`). undefined
- **All user-facing copy is inline English with no i18n layer** (low value, large, `src/engine/game.ts`). undefined

## Features worth adding

- **Commit the balance simulation harness the README already quotes** (high value, small). README.md's Balance section reports win rates over '300-600 games per row' and per-difficulty head-to-head numbers, but nothing in the repo reproduces them — there is no scripts/ directory. The engine is already pure and seeded, so add `scripts/simulate.ts` (run with `npx tsx`) that plays N games via createGame/aiChooseShot/aiChooseManeuver/fire/maneuver/endTurn under seededRng, with flags for difficulty matchup and a 'never manoeuvre' policy, printing win rate, median turns and shots-per-kill. Then add a fast `npm run simulate -- 200` and a CI-friendly regression assertion (e.g. hard beats easy by >2:1) so a tuning change to AI_PROFILES cannot silently invert the difficulty ladder.
- **Settings screen (haptics, sound, motion, colour-blind palette)** (high value, medium). There is no settings surface at all: haptics fire unconditionally through src/ui/feedback.ts, the splash animation loops unconditionally, and app.json locks userInterfaceStyle to dark. Add `src/settings.tsx` (a context provider persisted through a new `battleshiple:prefs:v1` key in src/storage.ts alongside the savegame), a gear button on HomeScreen, and consume it in feedback.ts (early-return when haptics off), SplashOverlay.tsx (static ring when reduced motion), and theme.ts (a colour-blind-safe variant of `shipColors`, whose five hues are currently distinguished by hue alone).
- **Career record and per-match stats** (high value, small). GameOverScreen already computes shots/hits/manoeuvres/ships-afloat per player from the log, and then throws them away. Persist a rolling record — wins and losses per difficulty, best (lowest) turn count, lifetime accuracy — under a new storage key, written at the two places the app already calls `clearGame()` on game over (App.tsx:153 and App.tsx:170). Surface it as a compact strip on HomeScreen under the difficulty selector and as 'personal best' context on GameOverScreen. This is the cheapest possible retention feature and all the inputs already exist.
- **Full battle log / after-action review** (high value, small). `visibleLog` (game.ts:77) already filters the log to what a given player may see, and GameScreen.tsx:100 shows only the last four entries reversed. Add a scrollable log sheet reachable from GameScreen, and on GameOverScreen reveal the *full* log including the opponent's move entries (the game is over, the information no longer needs hiding) so the player can see the manoeuvres they were guessing at. This turns the game's central hidden-information mechanic into something the player can learn from.
- **Board and fleet size as a game option (shorter matches)** (high value, large). README states the design problem outright: a median of 80-108 turns per side against ~45 for classic Battleship, and that 'shrinking the board or the fleet would be the lever to pull'. BOARD_SIZE is a module constant in constants.ts consumed by geometry.ts (inBounds, quadrantOf), ships.ts (randomFleet), ai.ts (the openCells sweep) and boardView.ts/Board.tsx. Thread it onto GameState as `boardSize` (with FLEET as a per-game roster), default 10, and offer a 'Skirmish' preset at 8x8 with four ships. Also unblocks the daily-challenge idea below and removes the hardcoded 'ABCDEFGHIJ' duplication.
- **Decoy manoeuvres and an adaptive top difficulty** (medium value, medium). aiChooseManeuver (ai.ts:213) only ever moves damaged ships, threatened ships (hard only), or a random ready ship at `restlessness` probability. Add a `decoyChance` to AiProfile and a fourth 'Admiral' tier that deliberately manoeuvres a healthy ship into a *quiet* quadrant to plant a misleading splash, plus adaptive scaling that nudges `blunderChance` from the running hit-rate differential. The splash is the game's whole bluffing dimension and the AI currently never bluffs with it.
- **Daily challenge with a shareable result** (medium value, medium). seededRng already makes fleets and AI behaviour reproducible for a seed (game.test.ts:138 asserts it). Derive today's seed from the UTC date, generate both fleets and drive a fixed-difficulty AI from it, then produce a spoiler-free share string (turns taken, accuracy, a small emoji grid of hit/miss like Wordle). Hooks into HomeScreen as a third start button and into App.tsx's beginGame with the seeded fleet instead of `randomFleet(defaultRng)`.
- **Saved fleet deployments** (medium value, small). SetupScreen offers Random / Clear / Rotate but nothing persists, so every match starts with re-placing five ships. Add 'Save this deployment' / a two- or three-slot preset picker persisted through src/storage.ts, applied in SetupScreen by setting `ships` directly. Cheap, and it removes the main friction on rematch — GameOverScreen's 'Rematch' currently drops the player straight back into a blank setup board.
- **Sound design** (medium value, medium). The app has haptics (src/ui/feedback.ts) and no audio whatsoever. Add expo-audio with a handful of short cues — fire, splash-miss, hull hit, sinking, and an ambient sonar ping when a splash appears on your board — wired into the same six `feedback` methods so the call sites in App.tsx do not change, and gated by the settings toggle above. On a turn-based game where the opponent's splash is the only information you get, an audio cue for it materially changes how the mechanic reads.
- **First-run interactive tutorial** (medium value, large). The rules are non-obvious (manoeuvre cooldowns scale with damage, damage travels with the hull, splashes reveal a quadrant) and are currently taught only by a collapsible wall of text on HomeScreen.tsx:54-95. Add a scripted three-turn scenario against a stubbed opponent — fire, take a hit, evade with the damaged ship, watch the splash appear — driven by the existing engine with a fixed seed and a coach-mark overlay on GameScreen. Trigger it from a first-run flag in prefs storage with a 'How to play' entry point to replay it.
- **Coordinate entry for targeting** (medium value, small). Firing requires tapping a 30-40px cell, which is below the recommended touch target and effectively impossible with a screen reader. Add a compact text/stepper entry ('J10') next to the FIRE button in GameScreen that sets `target` through the same setter as onPressEnemyCell. coordLabel/COLS in geometry.ts already define the parse format; add the inverse `parseCoordLabel` next to it and unit-test the round trip.
- **Spectate mode (AI vs AI)** (low value, small). __tests__/ai.test.ts:8 already runs a complete AI-vs-AI game in a loop. Expose it as a 'Watch a battle' option that renders both boards with full information and a speed control, reusing scheduleAiTurn for both sides. It doubles as a live balance-inspection tool and as attract-mode content, for roughly the cost of one screen.

## Code quality

- **Resuming an AI game saved on the computer's turn deadlocks permanently** (high value, small, `App.tsx`). `scheduleAiTurn` is called from exactly one place, `onEndTurn` (App.tsx:192). The autosave effect (App.tsx:85-88) fires on every state change, so the state written after `endTurn` — `current: 1, phase: 'fire'` — is on disk during the 900 ms AI_DELAY_MS window, and `goHome` (App.tsx:198) explicitly clears aiTimer and saves that state. `onResume` (App.tsx:211) restores it and sets the screen to 'game' without ever scheduling the AI. The result: it is the computer's turn, no timer exists, `myTurn` is false so the board is disabled, and the match is unrecoverable. Reproduce by ending a turn and immediately pressing 'Quit to menu', then 'Resume game'. Fix by adding an effect that schedules the AI whenever `game.mode === 'ai' && game.players[game.current].isAI && game.phase === 'fire' && !aiBusy`, which subsumes the explicit call in onEndTurn, and add a regression test in __tests__/app.test.tsx that quits mid-AI-turn and resumes.
- **SPLASH_TTL is off by one and inert — raising it from 2 to 3 changes nothing** (high value, small, `src/engine/game.ts`). constants.ts:20 documents SPLASH_TTL as 'Number of half-turns a splash stays visible', but game.ts:182 filters with `nextTurn - sp.turn < SPLASH_TTL - 1`. A splash created on the mover's turn T is evaluated at the observer's endTurn, where `nextTurn - sp.turn` is always 2, so TTL 2 and TTL 3 both drop it and only TTL >= 4 extends visibility by one turn. The one existing test (game.test.ts:81) asserts the observed TTL-2 behaviour, so it cannot catch this. Rewrite the predicate against the observer's own turns (`sp.turn + SPLASH_TTL > nextTurn`, or store a `expiresAtTurn` on Splash at creation) and add a test that sets SPLASH_TTL to 4 and asserts the splash survives exactly two of the observer's turns — derive the bound from something other than the expression under test.
- **The core information-hiding rule has no test** (high value, small, `src/engine/game.ts`). `visibleLog` (game.ts:77) is what stops a pass-and-play opponent from reading which ship moved and where — the single most security-relevant function in the game — and it is imported only by GameScreen.tsx:100. No test exercises it. Add __tests__/game.test.ts cases asserting that after both players manoeuvre, `visibleLog(state, 0)` contains player 0's move entry and none of player 1's, that shot entries are visible to both, and that no 'move' entry text ever reaches the non-mover. Pair it with a GameScreen-level test that the rendered log for a viewer never contains the opponent's ship class name.
- **src/ui/boardView.ts is pure, load-bearing and completely untested** (high value, small, `src/ui/boardView.ts`). buildFleetView / buildTrackingView / paintShips / paintShots / paintPreview decide what each player is allowed to see on screen — buildTrackingView deliberately paints only sunk enemy ships (boardView.ts:99-102), and paintShots collapses repeat shots on the same cell to the latest one, which is the mechanic the whole 'fading markers' design rests on. The module has no React or RN imports, so it is trivially testable, and there is no test file for it. Add __tests__/boardView.test.ts covering: a tracking view never exposes an afloat enemy ship; a repeat shot on one cell yields exactly one marker with the newer age; skipHitsOnShips suppresses the enemy's hit marker on your own hull so the ship's own damage shows instead.
- **Random shuffle uses an inconsistent comparator** (medium value, trivial, `src/engine/ai.ts`). ai.ts:243 does `[...pool].sort(() => rng() - 0.5)`. A comparator that returns a different answer for the same pair violates the sort contract, so the result is neither uniform nor stable across engines — and, because everything else in this engine is carefully seeded for reproducibility, it quietly makes AI behaviour dependent on V8's sort implementation rather than on the seed. Replace with a Fisher-Yates shuffle driven by `randomInt(rng, i + 1)` (random.ts already exports randomInt) and put it in random.ts next to `pick`, where the AI-vs-AI determinism test can cover it.
- **paintShips writes into the grid without bounds checking** (medium value, small, `src/ui/boardView.ts`). boardView.ts:50 does `grid[cell.r][cell.c].ship = ...` with no guard, while the sibling paintPreview (boardView.ts:66) does check. Ship coordinates come from GameState, which can come from AsyncStorage via loadGame, whose validator (storage.ts:30-42) checks only that `players` is a 2-element array with array-typed ships/shots/splashes. Any off-board or malformed ship in a corrupted save therefore throws a TypeError inside render, which — with no error boundary — is a white screen the user cannot escape without reinstalling. Either bounds-check in paintShips, or (better) deep-validate on load; the two together are cheap.
- **Savegame validation is shallow** (medium value, small, `src/storage.ts`). isValid (storage.ts:30) accepts any object whose players is a 2-element array of things with array-typed ships/shots/splashes, a numeric turn and a fire/maneuver phase. It never checks `classId` is a known key of SHIP_CLASSES (SHIP_CLASSES[ship.classId] is dereferenced unguarded in game.ts:125, game.ts:164 and ManeuverPanel.tsx:44), that `hits.length === length`, that `bow` is in bounds, that ship ids are unique, or that `current` is 0 or 1. Add a `sanitiseState` that rebuilds a GameState from validated primitives and returns null on anything unexpected, and extend the existing 'corrupt or foreign payloads' test (storage.test.ts:58) with an unknown classId, a hits array of the wrong length and an off-board bow.
- **The invariant that stops ships tunnelling through blockers is undocumented and untested** (medium value, small, `src/engine/maneuver.ts`). checkManeuver (maneuver.ts:56) validates only the *destination* footprint, never the swept path. That is safe today purely because every class has `mobility <= length` (constants.ts:10-14), so an ahead/astern move of distance d always leaves the new footprint covering the d cells crossed. Raise patrol's mobility to 3, or add a length-1 ship, and ships silently teleport through enemies and fleet-mates with no test failing. Document the coupling in constants.ts and add a maneuver test that asserts, for every class, `mobility <= length`, plus a case with a blocker one cell ahead of a two-cell move that must be rejected.
- **An exception inside the AI turn timer kills the game silently** (medium value, small, `App.tsx`). scheduleAiTurn (App.tsx:136-156) runs fire / aiChooseManeuver / maneuver / endTurn inside a setTimeout callback. The `try { ... } finally { setAiBusy(false) }` does not catch — it only resets the busy flag — so any throw from the engine (illegal manoeuvre, phase mismatch) propagates out of the timer, `setGame(s)` never runs, and the app is left with busy=false on the AI's turn: no controls, no error, no recovery. Change to catch, log, and fall back to a safe `endTurn(s)` or surface an error state; and note that the human path is inconsistent too — a human-won game waits 700 ms before showing GameOverScreen (App.tsx:172) while an AI-won game jumps immediately (App.tsx:154).
- **Autosave writes on every state transition and the log grows unbounded** (medium value, small, `App.tsx`). The autosave effect (App.tsx:85-88) JSON-stringifies and writes the whole GameState on every fire, manoeuvre and end-turn — three to four AsyncStorage writes per turn, against a state whose `log` (one entry per shot plus one per manoeuvre) and `shots` arrays only ever grow. At the README's own median of 80-108 turns per side that is 600+ writes of a several-hundred-entry structure. Separately, the AppState listener effect (App.tsx:90-95) tears down and re-subscribes on every `game` identity change. Debounce the save (or save only on phase transitions and on background), cap `log` to the last N entries with running counters for the totals GameOverScreen needs (it only uses the move count, GameOverScreen.tsx:17), and hold `game`/`difficulty` in a ref for the AppState listener so it subscribes once.
- **GameScreen mixes untestable presentation with testable prose logic** (medium value, small, `src/ui/screens/GameScreen.tsx`). At 254 lines it is the largest UI file and it embeds two pure functions worth testing behind React: `incomingReport` (GameScreen.tsx:42-61), which is the code that must never leak what the opponent moved, and the statusLine cascade (GameScreen.tsx:124-135). This account's sibling repos apply exactly this rule ('app logic worth testing goes in a React-Native-free module; the .tsx files then hold only rendering'). Extract both into `src/ui/report.ts` taking (state, viewer) and returning strings, and unit-test them — including the case where the opponent moved but did not shoot, and the case where the last enemy shot is older than one half-turn and must not be reported.
- **ManeuverPanel hardcodes the mobility-2 button grid** (medium value, trivial, `src/ui/components/ManeuverPanel.tsx`). The control rows at ManeuverPanel.tsx:46-63 enumerate 'Ahead 1 / Ahead 2 / Astern 1 / Astern 2' literally, then hide the distance-2 buttons when `d > mobility` by rendering an empty spacer View (line 81). A class with mobility 3 would be silently uncontrollable from the UI even though availableManeuvers (maneuver.ts:78) would offer the move and the AI could use it. Generate the ahead/astern rows from `mobilityOf(ship)`; the labels ('▲'.repeat(d)) fall out naturally.
- **Ship identity is the class id, capping every fleet at one ship per class** (medium value, small, `src/engine/ships.ts`). makeShip (ships.ts:6) sets `id: classId`. Everything downstream keys on that — occupiedKeys' ignoreId (ships.ts:32), the `s.id === ship.id` replacement in fire (game.ts:102), maneuveredShipId (game.ts:161), FleetStatus keys, SetupScreen's `ships.filter(s => s.classId !== classId)` (SetupScreen.tsx:58). A fleet with two destroyers would corrupt state silently rather than failing. Either generate unique ids (`${classId}-${n}`) now while the change is a dozen lines, or document the constraint explicitly in types.ts next to the `id` field so the next roster change does not walk into it.
- **The difficulty ladder the README quantifies is not asserted anywhere** (medium value, small, `src/engine/ai.ts`). AI_PROFILES (ai.ts:30-61) carries nine tuned numbers per difficulty and README.md publishes head-to-head win rates (Easy vs Hard 11%, Normal vs Hard 29%) derived from them. The tests only check that hard uses splash intel and normal does not (ai.test.ts:83-96). Nothing would fail if someone swapped the easy and hard profiles. With the simulation harness above committed, add a seeded, bounded regression test (e.g. 60 games at a fixed seed, assert hard wins clearly more than easy) so a tuning change has to be a deliberate one.
- **Column labels and board dimensions are duplicated and hardcoded to 10** (low value, trivial, `src/ui/components/Board.tsx`). `const COLS = 'ABCDEFGHIJ'` appears in both geometry.ts:62 and Board.tsx:17, and the second copy is used to build every cell's accessibilityLabel — so the label and the engine's coordLabel can drift. Both hardcode ten letters while BOARD_SIZE is a constant that the board-size feature above would want to vary. Export a single `columnLabel(c: number)` from geometry.ts (derived from BOARD_SIZE) and have Board and coordLabel both call it.
- **Dead code and duplicated test fixtures** (low value, trivial, `src/engine/game.ts`). `holdPosition` (game.ts:196) is exported through src/engine/index.ts and referenced nowhere — the UI calls onEndTurn directly. Delete it or use it. Separately, the same five-ship fixture is re-declared three times: `fleetA()` in __tests__/game.test.ts:6, `fleet()` in __tests__/storage.test.ts:13, and inline in __tests__/ai.test.ts:66-72 — identical coordinates in all three. Move it to a `__tests__/fixtures.ts` so a roster change updates one place.
- **Unexplained magic numbers in the presentation and AI heuristics** (low value, trivial, `src/ui/components/Board.tsx`). `ageOpacity` fades markers at `1 - age * 0.07` with a floor of 0.35 (Board.tsx:19-21), which encodes how long a stale marker stays trustworthy and should be stated in terms of the AI's staleMissTurns/staleHitTurns it is meant to mirror. Likewise ai.ts:249 prefers a long run `rng() < 0.7` of the time and ai.ts:228 treats enemy shots within 4 half-turns and Manhattan distance <= 1 as a threat, all unnamed. Hoist them to named constants beside the AiProfile fields they belong with, and say what each is calibrated against — the profiles above them are otherwise well documented, so these stand out.
- **randomFleet can throw into an unguarded UI callback** (low value, small, `src/engine/ships.ts`). randomFleet gives up after 500 placement attempts per ship and throws `Could not place ${classId}` (ships.ts:76). It is called from SetupScreen's Random button (SetupScreen.tsx:100) and, more importantly, from App.tsx:117 to build the computer's fleet at the start of every AI match — neither call site has a try/catch and there is no error boundary. With the current 10x10/five-ship roster the failure probability is negligible, but the board-size feature above would make it reachable. Return `Ship[] | null` or retry the whole fleet, and cover the crowded-board case in ships tests.

## Shared across all Platteration repositories

The same gaps recur in every repository; fixing them once as a template and copying it is cheaper than fixing them fourteen times.

### CI and supply chain

1. **No workflow sets `permissions:`** (except the two Pages deploy jobs). Add `permissions: { contents: read }` at the top of every workflow so the `GITHUB_TOKEN` handed to third-party actions cannot write to the repository.
2. **No action is pinned to a commit SHA** (0 of 50 `uses:` lines across the fourteen repositories). `actions/checkout@v4` follows a movable tag; pin to the full 40-character SHA with the version in a comment, and let Dependabot bump it.
3. **No repository has Dependabot or Renovate.** Add `.github/dependabot.yml` with `npm` (or `pip`) and `github-actions` ecosystems, weekly.
4. **No CI step runs `npm audit`** (two workflows pass `--no-audit` explicitly). Add `npm audit --audit-level=high` after `npm ci`; for the Expo apps the current transitive advisories are build-time only (`uuid` via `xcode` via `@expo/config-plugins`), so gate on `high` rather than `moderate` until Expo ships the fix.
5. **`tvsham` runs `npm ci || npm install` in CI and in its Dockerfile.** The fallback silently discards the lockfile guarantee; drop it and fix the lockfile instead.
6. **`selfreportle`, `simplacad` and `phonogeometry` have no lockfile** and install Playwright ad hoc in CI. Add a `package-lock.json` (even with devDependencies only) and use `npm ci`.
7. **Enable secret scanning and push protection** in each repository's settings; nothing is committed today, and this keeps it that way.

### Repository hygiene

8. **Ten repositories have no `LICENSE`** (battleshiple, collectcollect, drawdraw, multidcheckers, multidconnect4, notenote, randostats, selfreportle, simplacad, tvsham). Without one, nobody else may legally use or contribute to the code. The siblings that have one use MIT.
9. **Only `simplacad` has a `SECURITY.md`.** Copy it to the others with a private reporting address.
10. **No repository has a `main` branch.** In all fourteen the default branch is the original `claude/...` feature branch, so branch protection, Dependabot targets and the two GitHub Pages workflows (`abientnoiser`, `chesscheatser` both trigger on `main`/`master`) all point at a branch that does not exist; those deploys have never run. Create `main` from the current branch, make it the default, and protect it.
11. **`drawdraw` is the one repository still on Expo SDK 53** (the rest are on 57). Its eight high-severity `npm audit` findings (`image-size`, `metro`) disappear with the SDK upgrade; it is also the only app not written in TypeScript and the only one pinned to Node 20 in CI.
12. **`multidcheckers` and `multidconnect4` are near-identical copies** (same branch name, same 65-file layout, same dependencies). The timeline/multiverse engine, persistence and share code should live in one shared package so fixes land in both.

### A hardened workflow to copy

```yaml
name: CI
on:
  push:
    branches: ["**"]
  pull_request:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  check:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    steps:
      - uses: actions/checkout@<full-sha> # v4
      - uses: actions/setup-node@<full-sha> # v4
        with: { node-version-file: .nvmrc, cache: npm }
      - run: npm ci
      - run: npm audit --audit-level=high
      - run: npm run lint --if-present
      - run: npm run typecheck --if-present
      - run: npm test
```
