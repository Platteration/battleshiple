# Battleshiple

Battleship for iOS and Android, with one twist: the fleets don't sit still.

After every shot you may manoeuvre **one** ship. Every manoeuvre makes a splash
on your opponent's screen in the quadrant where the ship ended up, so they know
something moved there but not what.

## Rules

Each turn:

1. **Fire** one shot into enemy waters.
2. **Manoeuvre** one ship (optional):
   - **Ahead / Astern** – steam up to the ship's *mobility* along its heading.
   - **Port / Starboard** – shift one cell sideways.
   - **Turn CW / CCW** – rotate 90° pivoting on the bow.
   A ship can't leave the board or pass through a fleet-mate's final position.
3. **End turn.**

Damage travels with a ship. A hit segment stays hit wherever the hull goes,
and a ship is sunk when every segment is hit. Sunk ships never move.

### Mobility and cooldown

After manoeuvring, a ship must sit out a number of its owner's turns. Smaller
hulls are nimbler. Every point of damage a ship carries adds one turn to its
cooldown, so wounded ships are slow to escape.

| Ship        | Size | Mobility (cells per move) | Cooldown (turns) |
|-------------|------|---------------------------|------------------|
| Carrier     | 5    | 1                         | 4                |
| Battleship  | 4    | 2                         | 3                |
| Destroyer   | 3    | 2                         | 2                |
| Submarine   | 3    | 2                         | 2                |
| Patrol Boat | 2    | 2                         | 1                |

### Splashes

Both boards are divided into the four quadrants, labelled NW, NE, SW and SE.
When a ship moves, its opponent sees the quadrant containing the ship's new
midpoint outlined and hatched, for the duration of their next turn: something
moved somewhere in there. A ripple plays once as the report arrives (not with
Reduce motion on). The mover's own log records the full manoeuvre; the opponent
only ever sees the splash.

### Shot markers

Because ships move, you may fire at the same cell more than once. The tracking
board shows the latest result for each cell, and a marker older than your last
two turns turns grey, so a stale hit is a hint rather than a certainty.

## Modes

- **Play vs Computer** at three skill levels.
- **Pass & Play** – two admirals on one device, with a handoff screen between
  turns so nobody peeks.

### Computer skill

| Level  | Behaviour |
|--------|-----------|
| Easy   | Fires loosely, often at random, and rarely repositions. |
| Normal | Parity hunt plus a target chase after each hit. Cannot read splashes. |
| Hard   | Reads your splashes and hunts the quadrant you moved into. Moves threatened ships, not just damaged ones. |

Only the hard opponent uses splash intelligence, so manoeuvring is nearly free
against easy and normal, and a genuine trade-off against hard.

## Settings

From the menu: **Theme** (system, light or dark), **Vibration** on or off, **Reduce
motion** (system, on or off — drops the splash ripple; the reported quadrant stays marked),
**Reset to defaults**, and an About card with the version and licence. The computer skill you pick on the menu is kept
between launches. Nothing leaves your device: the app has no network code.

## Saved games

A match is autosaved after every change and when the app is backgrounded, so a
phone call will not cost you a game. Quitting to the menu keeps the game, and
the menu offers to resume or discard it. Finishing a game clears the save.

The save lives on the device. On Android it is deliberately kept out of cloud
backup and device-to-device transfer, so a reinstall or a new phone starts with
an empty menu rather than with an unfinished battle; on iOS it travels only as
part of a full device backup. There is one save slot, and starting a new battle
spends it — the app asks first.

A marathon match — thousands of turns, far beyond any finished game — keeps its
oldest log lines and shot markers only up to a generous ceiling. The match
itself is never thrown away for being too long, and a battle the app fails to
play is set aside rather than deleted.

## Balance

Every number here comes from `npm run sim`, 500 games per row at base seed 1.
Reproduce them with:

```bash
npm run sim -- --games 500          # everything below
npm run sim -- --suite mobility     # just one section
```

They are the reason the design is shaped the way it is. Re-run them after any
rule change; the engine is pure, so measuring beats arguing.

**Manoeuvring is not optional.** A fleet that never moves almost never wins:

| Skill  | A never moves | A manoeuvres | Gap      |
|--------|---------------|--------------|----------|
| Easy   | 1.2%          | 52.2%        | 51.0 pts |
| Normal | 0.6%          | 51.2%        | 50.6 pts |
| Hard   | 11.4%         | 51.2%        | 39.8 pts |

Evading with a damaged ship is the single most valuable skill, because a hit
segment stays hit and a stationary wounded hull is simply finished off. Staying
put does markedly better against a hard opponent — the only one that reads
splashes — precisely because that opponent can use the splash you did not give
away. That is the trade the game is built on, and it is worth ~12 points.

**Skill levels separate**, measured head to head:

| Matchup        | Win rate for the first named |
|----------------|------------------------------|
| Easy vs Hard   | 13.4%                        |
| Normal vs Hard | 28.2%                        |
| Easy vs Normal | 24.4%                        |
| Hard vs Hard   | 51.2% (sanity check)         |

**Games are long**, in turns per side:

| Matchup          | Median | p90 | Max |
|------------------|--------|-----|-----|
| Easy vs Easy     | 151    | 217 | 305 |
| Normal vs Normal | 113    | 160 | 233 |
| Hard vs Hard     | 83     | 118 | 184 |

Classic Battleship is roughly 45. Moving targets defeat the usual hunt-and-sink
shortcut. There is also a real endgame drag: the last hull costs **1.5x** the
median of the earlier kills at both normal and hard, because a small, mobile,
undamaged ship on an open board is the hardest thing in the game to corner.
Shrinking the board, or raising the size of the *smallest* ship, are the levers.

## Look

Battleshiple follows the shared illustrated-tabletop language in
[VISUAL_STYLE.md](VISUAL_STYLE.md): warm ivory or deep ink behind opaque
panels, muted sea-glass and amber accents, the platform sans-serif, and shallow
depth — a crisp outline, a short lower edge and a small upper-left highlight on
each hull. Every ship is one continuous silhouette with a rounded bow, and its
deck tells the class apart without relying on colour: the carrier's island, the
battleship's three turrets, the destroyer's two, the submarine's sail and the
patrol boat's cabin. The Theme setting picks Light, Dark, or System, which follows the
device (and is dark on one that reports no preference).

Colours live in semantic roles in `src/ui/theme/`, never in components; a test
fails if a colour literal appears anywhere else. Every pairing the UI draws is
checked against WCAG — 4.5:1 for text, 3:1 for marks, lines and outlines — in
both appearances, and ship hulls must stand out from the water they sit on.

## Running it

Requires Node 22 and the Expo tooling.

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on iOS or Android, or press `i` / `a` to open
a simulator / emulator.

Web is not a target platform and has no dependencies in the project, but it is
the only way to *see* the UI without a simulator, which is how several layout and
copy defects were caught. Install the web renderer without saving it, then start:

```bash
npm install --no-save react-native-web@~0.21.0 react-dom@19.2.3 @expo/metro-runtime@~57.0.15
npm run web
```

Haptics are inert there.

### Native builds

The project uses [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas build -p ios --profile preview
eas build -p android --profile preview
```

## Development

```bash
npm run lint               # ESLint (Expo's preset)
npm run typecheck          # TypeScript
npm test                   # Jest (engine unit tests + UI smoke tests)
npm run test:conventions   # the conventions shared with the sibling repositories
npm run check              # all of the above: the gate before a push
npm run sim                # the balance simulation behind the numbers above
```

CI runs the same steps one at a time, then bundles the app for Android and iOS
with `expo export`; a separate job runs `npm audit --omit=dev --audit-level=high`
against the lockfile.

### Seeing the UI

There is no simulator in most automated environments, so `tools/screenshots.js`
drives the web build in Chromium. Each run covers three phone sizes (390x844,
360x640, 430x932) in light and dark, with and without reduced motion, and reaches
the game-over screen by resuming a planted near-finished save. It seeds
`Math.random`, so runs are repeatable, and fails on any console error. Neither
Playwright nor the web renderer is a repo dependency, to keep CI from pulling
browser binaries.

```bash
npm install --no-save playwright react-native-web@~0.21.0 react-dom@19.2.3 @expo/metro-runtime@~57.0.15
npx expo export --platform web --output-dir /tmp/web
(cd /tmp/web && python3 -m http.server 8099 &)
node tools/screenshots.js /tmp/shots              # full matrix
python3 tools/pngdiff.py /tmp/before /tmp/after   # prove a refactor changed nothing
```

It has found a manoeuvre preview tinted the same green as the Destroyer, a
Confirm button below the fold, and two player-name bugs — "You's Patrol Boat"
and "You wins!" — none of which a unit test would have noticed.

### Regenerating the icons

`tools/generate-icons.py` renders every icon slot from signed distance fields and
writes the PNGs directly, with no image-library dependency:

```bash
python3 tools/generate-icons.py assets
```

## Project layout

```
App.tsx                  screen state machine (home → setup → game → over)
src/engine/              pure TypeScript rules, no React
  types.ts               data model
  constants.ts           fleet roster, cooldown / mobility table
  geometry.ts            headings, ship footprints, quadrants
  ships.ts               placement, collisions, random fleets
  maneuver.ts            move / shift / rotate validation and cooldowns
  game.ts                fire, manoeuvre, end turn, splashes, win detection
  ai.ts                  computer opponent and difficulty profiles
  view.ts                one player's redacted view of a match
src/storage.ts           autosave / resume on AsyncStorage, and every storage key
src/settings.tsx         preferences (theme, vibration, reduce motion, computer skill)
src/validate.ts          clamps the stored preferences to values the app knows
src/motion.ts            reduce-motion resolution (setting, device, web)
src/about.ts             what the About card says, free of React Native
src/confirm.ts           a confirmation that works on the web as well as a device
src/ui/theme/            palettes, type scale, contrast checks, ThemeProvider
src/ui/                  React Native components and screens
tools/                   simulation, screenshots, icon generator, PNG diff
__tests__/               Jest suites
```

The engine is deliberately free of React and of any Expo import, so the rules
can be simulated by the thousand in a plain Node script. It is also free of
randomness except where an `Rng` is passed in, which is what makes the balance
numbers above reproducible.
