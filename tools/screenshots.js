/**
 * Drive the web build in Chromium and capture screenshots of the real UI.
 *
 * There is no iOS or Android simulator in CI-like environments, but the app
 * runs on react-native-web, so this is the only way to actually SEE a change.
 * It caught a preview colour that collided with a hull colour, a Confirm button
 * sitting below the fold on a 390x844 phone, and a possessive that rendered as
 * "You's Patrol Boat".
 *
 * Every run covers a matrix of phone sizes, colour schemes and motion settings,
 * because the layout has a compact mode for small phones and two palettes,
 * and a bug in either is invisible from a single configuration.
 *
 * Usage:
 *   # Neither is a repo dependency: CI stays lean and web is not a target.
 *   npm install --no-save playwright react-native-web@~0.21.0 react-dom@19.2.3 @expo/metro-runtime@~57.0.15
 *   npx expo export --platform web --output-dir /tmp/web
 *   (cd /tmp/web && python3 -m http.server 8099 &)
 *   node tools/screenshots.js /tmp/shots            # full matrix
 *   node tools/screenshots.js /tmp/shots quick      # 390x844 light only
 *
 * Set CHROME to override the browser binary, URL to point elsewhere.
 * Exits non-zero on any console error in any configuration.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/battleshiple-shots';
const QUICK = process.argv[3] === 'quick';
const URL = process.env.URL || 'http://127.0.0.1:8099/';
const CHROME = process.env.CHROME || undefined;

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 }, // iPhone 14-ish; the app is portrait-only
  { name: 'small', width: 360, height: 640 }, // small Android: exercises compact mode
  { name: 'large', width: 430, height: 932 }, // Pro Max class
];
const SCHEMES = ['light', 'dark'];
const MOTIONS = ['no-preference', 'reduce'];

/** The full matrix is 12 runs; the splash hunt only needs to happen once. */
function configurations() {
  if (QUICK) return [{ viewport: VIEWPORTS[0], scheme: 'light', motion: 'no-preference', hunt: true }];
  const out = [];
  for (const viewport of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      for (const motion of MOTIONS) {
        out.push({ viewport, scheme, motion, hunt: viewport.name === 'phone' && motion === 'no-preference' });
      }
    }
  }
  return out;
}

async function tap(page, text, timeout = 8000) {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
  await page.waitForTimeout(240);
}

/**
 * Board cells are labelled by coordinate, optionally followed by a description
 * ("E5" or "E5, your Destroyer, hit"). Match the coordinate exactly either way.
 */
async function cell(page, label) {
  await page.getByLabel(new RegExp(`^${label}(,|$)`)).first().click();
  await page.waitForTimeout(180);
}

/** Click the first manoeuvre that is actually legal for this layout. */
async function pickManeuver(page) {
  for (const label of ['Ahead 2', 'Ahead 1', 'Port', 'Starboard', 'Turn CW', 'Turn CCW']) {
    // By accessibility label: a compact screen draws the helm as glyphs only.
    const b = page.getByLabel(label, { exact: true }).first();
    if ((await b.count()) && (await b.isEnabled())) {
      await b.click();
      await page.waitForTimeout(280);
      return label;
    }
  }
  return null;
}

/**
 * Select one of your ships. The roster strip has a chip per ship; a compact
 * (short) screen has no roster, and there a player taps the hull itself, so
 * this clicks the middle of its silhouette. The hull layer takes no pointer
 * events, so the click lands on the cell above it, as a finger would.
 */
async function selectShip(page, classId, name) {
  const chip = page.getByText(name, { exact: false }).first();
  if (await chip.isVisible().catch(() => false)) {
    await chip.click();
  } else {
    await page.getByTestId(`hull-footprint-${classId}`).first().click({ force: true });
  }
  await page.waitForTimeout(250);
}

/** Either the current splash banner text or the contact-report test id. */
async function splashVisible(page) {
  if (await page.getByTestId('contact-movement').count()) return true;
  return (await page.getByText('Splash!', { exact: false }).count()) > 0;
}

/** Scrollable height beyond the viewport: anything > 0 means the layout overflows. */
async function overflow(page) {
  return page.evaluate(() => {
    const el = document.scrollingElement || document.documentElement;
    let max = el.scrollHeight - el.clientHeight;
    for (const node of document.querySelectorAll('div')) {
      const s = getComputedStyle(node);
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') {
        max = Math.max(max, node.scrollHeight - node.clientHeight);
      }
    }
    return max;
  });
}

/**
 * A saved vs-Computer game one shot from victory: every enemy hull is sunk
 * except the patrol boat's bow at B9. Resuming it and firing there reaches the
 * game-over screen, an end state a real 80-turn game would never let the
 * harness see. Shapes match src/engine/types.ts and pass src/storage.ts isValid.
 */
function nearlyWonSave() {
  const ship = (classId, r, c, length, hits, cooldown = 0) => ({
    id: classId, classId, bow: { r, c }, heading: 'E', length, hits, cooldown,
  });
  const fleet = (sunk) => [
    ship('carrier', 0, 4, 5, Array(5).fill(sunk)),
    ship('battleship', 2, 3, 4, Array(4).fill(sunk)),
    ship('destroyer', 4, 2, 3, Array(3).fill(sunk)),
    ship('submarine', 6, 2, 3, Array(3).fill(sunk)),
    // bow (8,1) = B9 still afloat; stern (8,0) already hit
    ship('patrol', 8, 1, 2, sunk ? [false, true] : [false, false]),
  ];
  // The human's fleet carries the states the matrix would otherwise never show:
  // a damaged hull (the battleship, hit twice) and one on cooldown (the destroyer).
  const own = () => [
    ship('carrier', 0, 4, 5, Array(5).fill(false)),
    ship('battleship', 2, 3, 4, [false, true, true, false]),
    ship('destroyer', 4, 2, 3, Array(3).fill(false), 2),
    ship('submarine', 6, 2, 3, Array(3).fill(false)),
    ship('patrol', 8, 1, 2, [false, false]),
  ];
  const player = (index, name, isAI, ships) => ({ index, name, isAI, ships, shots: [], splashes: [] });
  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    difficulty: 'normal',
    state: {
      mode: 'ai',
      players: [player(0, 'You', false, own()), player(1, 'Capt. Varga', true, fleet(true))],
      current: 0,
      phase: 'fire',
      turn: 40,
      log: [],
    },
  });
}

/**
 * The tallest the game screen gets, which normal play reaches only by chance:
 * the manoeuvre phase of a turn that opened with an incoming hit and a splash,
 * so the report carries both while the helm is up. The board must still fit.
 */
function worstTurnSave() {
  const save = JSON.parse(nearlyWonSave());
  const st = save.state;
  // The enemy fleet afloat, so the game is not one shot from over.
  st.players[1].ships = st.players[1].ships.map((s) => ({ ...s, hits: s.hits.map(() => false) }));
  st.phase = 'maneuver';
  st.lastShot = { by: 0, coord: { r: 9, c: 9 }, result: 'miss', alreadyDamaged: false, gameOver: false };
  st.players[0].lastIncoming = { r: 2, c: 4, result: 'hit', turn: st.turn - 1, classId: 'battleship', sunk: false };
  st.players[0].splashes = [{ quadrant: 'NW', turn: st.turn - 1 }];
  // A log as play writes it, including the computer's manoeuvre, which the
  // signal log must leave out (12-signal-log shows three lines, not four).
  st.log = [
    { turn: st.turn - 2, by: 0, kind: 'shot', text: 'You fired at C4: miss.' },
    { turn: st.turn - 1, by: 1, kind: 'shot', text: 'Capt. Varga fired at E3: hit!' },
    { turn: st.turn - 1, by: 1, kind: 'move', text: 'Capt. Varga moved the Destroyer ahead 2 (splash in the north-west).' },
    { turn: st.turn, by: 0, kind: 'shot', text: 'You fired at J10: miss.' },
  ];
  return JSON.stringify(save);
}

async function run(browser, cfg, errors) {
  const label = `${cfg.viewport.name}-${cfg.scheme}${cfg.motion === 'reduce' ? '-still' : ''}`;
  const dir = path.join(OUT, label);
  fs.mkdirSync(dir, { recursive: true });

  const context = await browser.newContext({
    viewport: { width: cfg.viewport.width, height: cfg.viewport.height },
    deviceScaleFactor: 2,
    colorScheme: cfg.scheme,
    reducedMotion: cfg.motion,
  });
  // Seed Math.random so fleets, AI choices and therefore every screenshot are
  // identical between runs. Without this a restyle cannot be proven
  // pixel-identical, because two runs never show the same board.
  await context.addInitScript((seed) => {
    let a = seed >>> 0;
    Math.random = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }, Number(process.env.SEED || 20260930));
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(`[${label}] PAGEERROR: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${label}] ${m.text()}`);
  });

  const shot = async (n) => {
    await page.screenshot({ path: path.join(dir, n + '.png') });
  };

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await shot('01-home');

  await tap(page, 'How to play');
  await shot('02-rules');
  await tap(page, 'Hide rules');

  await tap(page, 'Settings');
  await shot('08-settings');
  await tap(page, 'Back to menu');

  // Hard makes the computer reposition often, so a splash arrives sooner.
  await tap(page, 'Hard');
  await tap(page, 'Play vs Computer');
  await tap(page, 'Random');
  await shot('03-setup');
  await tap(page, 'Start battle');
  await shot('04-enemy-waters');
  const fireOverflow = await overflow(page);

  await cell(page, 'E5');
  await tap(page, 'FIRE at E5');
  await selectShip(page, 'patrol', 'Patrol Boat');
  const picked = await pickManeuver(page);
  await shot('05-maneuver-preview');
  const maneuverOverflow = await overflow(page);

  let splashed = false;
  if (cfg.hunt) {
    // Play on until the enemy manoeuvres and a splash lands on our board.
    const letters = 'ABCDEFGHIJ';
    for (let t = 0; t < 24 && !splashed; t++) {
      const confirm = page.getByText('Confirm:', { exact: false }).first();
      if (await confirm.count()) {
        await confirm.click();
        await page.waitForTimeout(200);
      }
      const end = page.getByText('End turn', { exact: false }).first();
      const hold = page.getByText('Hold position', { exact: false }).first();
      if (await end.count()) await end.click();
      else if (await hold.count()) await hold.click();
      await page.waitForTimeout(1500);

      if (await splashVisible(page)) {
        splashed = true;
        await page.waitForTimeout(420); // catch any arrival animation mid-flight
        await shot('06-splash');
        break;
      }
      const r = (t % 10) + 1;
      const c = letters[(t * 3 + 2) % 10];
      try {
        await cell(page, `${c}${r}`);
        await tap(page, `FIRE at ${c}${r}`, 3000);
      } catch {
        break;
      }
    }
  }

  // End state: resume a planted, nearly-won game and fire the winning shot.
  let reachedEnd = false;
  const endPage = await context.newPage();
  endPage.on('pageerror', (e) => errors.push(`[${label}] PAGEERROR (end): ${e.message}`));
  await endPage.goto(URL, { waitUntil: 'domcontentloaded' });
  await endPage.evaluate((save) => localStorage.setItem('battleshiple:savegame:v1', save), nearlyWonSave());
  await endPage.reload({ waitUntil: 'networkidle' });
  await endPage.waitForTimeout(600);
  try {
    await tap(endPage, 'Resume game');
    await endPage.waitForTimeout(300);
    await endPage.screenshot({ path: path.join(dir, '09-wrecks.png') });
    // The mini-map beside the header shows the other board; pressing it peeks.
    await endPage.getByLabel('Show your fleet', { exact: true }).click();
    await endPage.waitForTimeout(250);
    await endPage.screenshot({ path: path.join(dir, '10-fleet-damage.png') });
    await endPage.getByLabel('Show enemy waters', { exact: true }).click();
    await endPage.waitForTimeout(250);
    await cell(endPage, 'B9');
    await tap(endPage, 'FIRE at B9');
    await endPage.waitForTimeout(1200); // the win holds on the board briefly
    await endPage.screenshot({ path: path.join(dir, '07-game-over.png') });
    reachedEnd = true;
  } catch (e) {
    errors.push(`[${label}] could not reach game over: ${e.message}`);
  }

  // Worst turn: resume it, select a ship, pick a manoeuvre, measure.
  let worstOverflow = null;
  const worstPage = await context.newPage();
  worstPage.on('pageerror', (e) => errors.push(`[${label}] PAGEERROR (worst): ${e.message}`));
  await worstPage.goto(URL, { waitUntil: 'domcontentloaded' });
  await worstPage.evaluate((save) => localStorage.setItem('battleshiple:savegame:v1', save), worstTurnSave());
  await worstPage.reload({ waitUntil: 'networkidle' });
  await worstPage.waitForTimeout(600);
  try {
    await tap(worstPage, 'Resume game');
    await selectShip(worstPage, 'patrol', 'Patrol Boat');
    await pickManeuver(worstPage);
    await worstPage.screenshot({ path: path.join(dir, '11-worst-turn.png') });
    worstOverflow = await overflow(worstPage);
    // The signal log sheet, over the same turn.
    await tap(worstPage, 'Log');
    await worstPage.waitForTimeout(400);
    await worstPage.screenshot({ path: path.join(dir, '12-signal-log.png') });
  } catch (e) {
    errors.push(`[${label}] could not reach the worst turn: ${e.message}`);
  }

  await context.close();
  return { label, picked, splashed, hunted: cfg.hunt, fireOverflow, maneuverOverflow, worstOverflow, reachedEnd };
}

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const errors = [];
  const results = [];
  for (const cfg of configurations()) {
    try {
      results.push(await run(browser, cfg, errors));
    } catch (e) {
      errors.push(`[${cfg.viewport.name}-${cfg.scheme}-${cfg.motion}] FAILED: ${e.message}`);
    }
  }
  await browser.close();

  console.log('\n  config              manoeuvre     splash  end   overflow(fire/manoeuvre/worst turn)');
  for (const r of results) {
    const splash = r.hunted ? (r.splashed ? 'seen' : 'NONE') : '-';
    console.log(
      `  ${r.label.padEnd(20)}${String(r.picked).padEnd(14)}${splash.padEnd(8)}${(r.reachedEnd ? 'yes' : 'NO').padEnd(6)}${r.fireOverflow}px / ${r.maneuverOverflow}px / ${r.worstOverflow}px`,
    );
  }
  console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 20).join('\n') : '\nno console errors');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
