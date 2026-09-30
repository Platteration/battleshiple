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
 * because the layout has a compact mode for small phones and a night palette,
 * and a bug in either is invisible from a single configuration.
 *
 * Usage:
 *   npm i -D playwright            # not a repo dependency: keeps CI lean
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
    const b = page.getByText(label, { exact: false }).first();
    if ((await b.count()) && (await b.isEnabled())) {
      await b.click();
      await page.waitForTimeout(280);
      return label;
    }
  }
  return null;
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
  await tap(page, 'Patrol Boat');
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

  await context.close();
  return { label, picked, splashed, hunted: cfg.hunt, fireOverflow, maneuverOverflow };
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

  console.log('\n  config              manoeuvre     splash  overflow(fire/manoeuvre)');
  for (const r of results) {
    const splash = r.hunted ? (r.splashed ? 'seen' : 'NONE') : '-';
    console.log(
      `  ${r.label.padEnd(20)}${String(r.picked).padEnd(14)}${splash.padEnd(8)}${r.fireOverflow}px / ${r.maneuverOverflow}px`,
    );
  }
  console.log(errors.length ? '\nERRORS:\n' + errors.slice(0, 20).join('\n') : '\nno console errors');
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
