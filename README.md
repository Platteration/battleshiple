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

When a ship moves, its opponent sees animated ripples in the quadrant
(NW / NE / SW / SE) containing the ship's new midpoint, for the duration of
their next turn. The mover's own log records the full manoeuvre; the opponent
only ever sees the splash.

### Shot markers

Because ships move, you may fire at the same cell more than once. The tracking
board shows the latest result for each cell and fades older markers, so a stale
hit is a hint rather than a certainty.

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

## Saved games

A match is autosaved after every change and when the app is backgrounded, so a
phone call will not cost you a game. Quitting to the menu keeps the game, and
the menu offers to resume or discard it. Finishing a game clears the save.

## Balance

Numbers from simulated games in `npm test` territory, 300-600 games per row.
They are the reason the design is shaped the way it is.

Manoeuvring is not optional. A fleet that never moves almost never wins:

| Player A's policy | A's win rate vs a normal-moving opponent |
|-------------------|------------------------------------------|
| Never moves       | 2.8% (easy and normal), 10.8% (hard)     |
| Manoeuvres        | ~50% at every level                      |

Evading with a damaged ship is the single most valuable skill, because a hit
segment stays hit and a stationary wounded hull is simply finished off. Staying
put does better against a hard opponent precisely because that opponent reads
the splash you would have given away.

Skill levels separate as intended, measured head to head:

| Matchup          | Win rate for the first named |
|------------------|------------------------------|
| Easy vs Hard     | 11%                          |
| Normal vs Hard   | 29%                          |
| Hard vs Hard     | 51%                          |

Games are long: a median of 80 turns per side at hard and 108 at normal, versus
roughly 45 for classic Battleship. Moving targets defeat the usual hunt-and-sink
shortcut, and the cost is spread evenly across the match at about 15 shots per
kill rather than concentrated in a slow endgame. Shrinking the board or the
fleet would be the lever to pull if that proves too long in play.

## Running the app

Requires Node 22 and the Expo tooling.

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on iOS or Android, or press `i` / `a` to open
a simulator / emulator.

### Native builds

The project uses [EAS Build](https://docs.expo.dev/build/introduction/):

```bash
npm install -g eas-cli
eas build -p ios --profile preview
eas build -p android --profile preview
```

## Development

```bash
npm run typecheck   # TypeScript
npm test            # Jest (engine unit tests + UI smoke tests)
```

### Project layout

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
src/storage.ts           autosave / resume on AsyncStorage
src/ui/                  React Native components and screens
__tests__/               Jest suites
```

The engine is deliberately free of React and of any Expo import, so the rules
can be simulated by the thousand in a plain Node script. It is also free of
randomness except where an `Rng` is passed in, which is what makes the balance
numbers above reproducible.
