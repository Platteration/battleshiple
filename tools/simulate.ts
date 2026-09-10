/**
 * Balance simulation harness.
 *
 * The engine under src/engine is pure — no React, no Expo, no I/O — so a rules
 * change can be measured over thousands of games instead of argued about. Every
 * balance claim in the README comes from this file.
 *
 * Usage:
 *   npm run sim                    # the standard suite
 *   npm run sim -- --games 2000    # more games per row
 *   npm run sim -- --suite mobility
 *   npm run sim -- --suite difficulty --seed 99
 *
 * Suites:
 *   length      turns per side, by difficulty        (is the game the right size?)
 *   mobility    evade vs never-move win rates        (does manoeuvring pay?)
 *   difficulty  head-to-head skill separation        (do the tiers mean anything?)
 *   kills       shots spent on the 1st..5th kill     (where does the time go?)
 */
import { aiChooseManeuver, aiChooseShot, Difficulty } from '../src/engine/ai';
import { createGame, endTurn, fire, maneuver } from '../src/engine/game';
import { Rng, seededRng } from '../src/engine/random';
import { isSunk, randomFleet } from '../src/engine/ships';
import { GameState, PlayerIndex } from '../src/engine/types';
import { SHIP_CLASSES } from '../src/engine/constants';

const DIFFICULTIES: Difficulty[] = ['easy', 'normal', 'hard'];
/** A game that has not ended by here is pathological; it is reported, never hidden. */
const MAX_HALF_TURNS = 6000;

interface Options {
  games: number;
  seed: number;
  suite: string;
}

interface Outcome {
  winner?: PlayerIndex;
  /** Whole turns taken by each side. */
  turns: number;
  finished: boolean;
  /** Cumulative shots by the winner when they sank the Nth enemy ship. */
  killShots: number[];
  maneuvers: number;
}

/** `moves` decides, per player, whether that side is allowed to manoeuvre at all. */
function playGame(seed: number, level: [Difficulty, Difficulty], moves: [boolean, boolean]): Outcome {
  const rng = seededRng(seed);
  let g: GameState = createGame({
    mode: 'ai',
    names: ['A', 'B'],
    fleets: [randomFleet(rng), randomFleet(rng)],
    aiPlayer: 1,
  });

  const sunkAt: Record<string, number> = {};
  let maneuvers = 0;
  let guard = 0;

  while (g.phase !== 'over' && guard++ < MAX_HALF_TURNS) {
    const side = g.current;
    g = fire(g, aiChooseShot(g, side, rng, level[side])).state;

    // Record when player 0 finishes off each of player 1's ships.
    if (side === 0) {
      for (const s of g.players[1].ships) {
        if (isSunk(s) && sunkAt[s.classId] === undefined) sunkAt[s.classId] = g.players[0].shots.length;
      }
    }
    if (g.phase === 'over') break;

    if (moves[side]) {
      const mv = aiChooseManeuver(g, side, rng, level[side]);
      if (mv) {
        g = maneuver(g, mv.shipId, mv.maneuver);
        maneuvers += 1;
      }
    }
    g = endTurn(g);
  }

  return {
    winner: g.winner,
    turns: Math.floor(g.turn / 2) + 1,
    finished: g.phase === 'over',
    killShots: Object.values(sunkAt).sort((a, b) => a - b),
    maneuvers,
  };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return NaN;
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
}

function stats(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    mean: s.reduce((a, b) => a + b, 0) / (s.length || 1),
    median: percentile(s, 0.5),
    p90: percentile(s, 0.9),
    max: s[s.length - 1],
  };
}

function run(opts: Options, level: [Difficulty, Difficulty], moves: [boolean, boolean]): Outcome[] {
  return Array.from({ length: opts.games }, (_, i) => playGame(opts.seed + i, level, moves));
}

function winRate(rows: Outcome[], side: PlayerIndex): number {
  const done = rows.filter((r) => r.finished);
  if (done.length === 0) return NaN;
  return (done.filter((r) => r.winner === side).length / done.length) * 100;
}

function warnUnfinished(label: string, rows: Outcome[]) {
  const stuck = rows.filter((r) => !r.finished).length;
  if (stuck > 0) console.log(`    !! ${stuck}/${rows.length} games hit the turn cap in "${label}"`);
}

// ---------------------------------------------------------------- suites

function suiteLength(opts: Options) {
  console.log('\nGame length, both sides at the same skill (turns per side)\n');
  console.log('  matchup            n     mean  median   p90    max');
  for (const d of DIFFICULTIES) {
    const rows = run(opts, [d, d], [true, true]);
    warnUnfinished(d, rows);
    const t = stats(rows.filter((r) => r.finished).map((r) => r.turns));
    console.log(
      `  ${`${d} vs ${d}`.padEnd(18)} ${String(t.n).padStart(4)}  ${t.mean.toFixed(1).padStart(6)}  ` +
        `${String(t.median).padStart(6)} ${String(t.p90).padStart(5)}  ${String(t.max).padStart(5)}`,
    );
  }
}

function suiteMobility(opts: Options) {
  console.log('\nDoes manoeuvring pay? Player A vs an opponent that always manoeuvres\n');
  console.log('  skill     A never moves    A manoeuvres     gap');
  for (const d of DIFFICULTIES) {
    const still = run(opts, [d, d], [false, true]);
    const moving = run(opts, [d, d], [true, true]);
    warnUnfinished(`${d} still`, still);
    const a = winRate(still, 0);
    const b = winRate(moving, 0);
    console.log(
      `  ${d.padEnd(8)} ${`${a.toFixed(1)}%`.padStart(13)} ${`${b.toFixed(1)}%`.padStart(15)}  ` +
        `${`${(b - a).toFixed(1)} pts`.padStart(9)}`,
    );
  }
  console.log('\n  A gap far above zero means movement is load-bearing, which is the design.');
}

function suiteDifficulty(opts: Options) {
  console.log('\nSkill separation, head to head (win rate for the first named)\n');
  const pairs: [Difficulty, Difficulty][] = [
    ['easy', 'hard'],
    ['normal', 'hard'],
    ['easy', 'normal'],
    ['hard', 'hard'],
  ];
  for (const [a, b] of pairs) {
    const rows = run(opts, [a, b], [true, true]);
    warnUnfinished(`${a} vs ${b}`, rows);
    console.log(`  ${`${a} vs ${b}`.padEnd(20)} ${winRate(rows, 0).toFixed(1)}%`);
  }
}

function suiteKills(opts: Options) {
  console.log('\nWhere the time goes: winner shots spent reaching each kill\n');
  for (const d of DIFFICULTIES) {
    const rows = run(opts, [d, d], [true, true]).filter((r) => r.finished && r.winner === 0);
    const nth: number[][] = [[], [], [], [], []];
    for (const r of rows) r.killShots.forEach((t, i) => i < 5 && nth[i].push(t));
    const med = nth.map((a) => stats(a).median);
    const spent = med.map((v, i) => (i === 0 ? v : v - med[i - 1]));
    // Report the endgame drag rather than asserting there isn't one: the last
    // hull is a small, mobile target on an empty board and costs measurably more.
    const earlier = stats(spent.slice(0, spent.length - 1)).median;
    const last = spent[spent.length - 1];
    const ratio = earlier > 0 ? last / earlier : NaN;
    console.log(`  ${d.padEnd(7)} cumulative: ${med.map((v, i) => `${i + 1}:${v}`).join('  ')}`);
    console.log(`  ${''.padEnd(7)} per kill:   ${spent.map((v, i) => `${i + 1}:${v}`).join('  ')}`);
    console.log(`  ${''.padEnd(7)} last kill costs ${ratio.toFixed(2)}x the median of the earlier ones`);
  }
  const roster = Object.values(SHIP_CLASSES);
  const cells = roster.reduce((n, c) => n + c.length, 0);
  console.log(`\n  ${roster.length} ships, ${cells} hull cells.`);
  console.log('  A ratio near 1.0 means no endgame drag; well above 1.0 means the last');
  console.log('  hull is disproportionately hard to corner, and is a balance lever.');
}

const SUITES: Record<string, (o: Options) => void> = {
  length: suiteLength,
  mobility: suiteMobility,
  difficulty: suiteDifficulty,
  kills: suiteKills,
};

function parseArgs(argv: string[]): Options {
  const opts: Options = { games: 300, seed: 1, suite: 'all' };
  for (let i = 0; i < argv.length; i++) {
    const next = argv[i + 1];
    if (argv[i] === '--games' && next) opts.games = Number(next);
    if (argv[i] === '--seed' && next) opts.seed = Number(next);
    if (argv[i] === '--suite' && next) opts.suite = next;
  }
  if (!Number.isFinite(opts.games) || opts.games < 1) throw new Error('--games must be a positive number');
  if (opts.suite !== 'all' && !SUITES[opts.suite]) {
    throw new Error(`unknown suite "${opts.suite}" — pick one of: ${Object.keys(SUITES).join(', ')}`);
  }
  return opts;
}

const opts = parseArgs(process.argv.slice(2));
const chosen = opts.suite === 'all' ? Object.keys(SUITES) : [opts.suite];
console.log(`Battleshiple simulation — ${opts.games} games per row, base seed ${opts.seed}`);
const started = Date.now();
for (const name of chosen) SUITES[name](opts);
console.log(`\nDone in ${((Date.now() - started) / 1000).toFixed(1)}s`);
