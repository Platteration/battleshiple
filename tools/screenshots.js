/**
 * Drive the web build in Chromium and capture screenshots of the real UI.
 *
 * There is no iOS or Android simulator in CI-like environments, but the app
 * runs on react-native-web, so this is the only way to actually SEE a change.
 * It caught a preview colour that collided with a hull colour, a Confirm button
 * sitting below the fold on a 390x844 phone, and a possessive that rendered as
 * "You's Patrol Boat".
 *
 * Usage:
 *   npm i -D playwright            # not a repo dependency: keeps CI lean
 *   npx expo export --platform web --output-dir /tmp/web
 *   (cd /tmp/web && python3 -m http.server 8099 &)
 *   node tools/screenshots.js /tmp/shots
 *
 * Set CHROME to override the browser binary.
 */
const path = require('path');
const { chromium } = require('playwright');

const OUT = process.argv[2] || '/tmp/battleshiple-shots';
const URL = process.env.URL || 'http://127.0.0.1:8099/';
const CHROME = process.env.CHROME || undefined;
const VIEWPORT = { width: 390, height: 844 }; // iPhone 14-ish; the app is portrait-only

async function tap(page, text, timeout = 8000) {
  const el = page.getByText(text, { exact: false }).first();
  await el.waitFor({ state: 'visible', timeout });
  await el.click();
  await page.waitForTimeout(240);
}

async function cell(page, label) {
  await page.getByLabel(label, { exact: true }).first().click();
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

(async () => {
  const browser = await chromium.launch(CHROME ? { executablePath: CHROME } : {});
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 2 });
  const errors = [];
  page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });

  await page.goto(URL, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const shot = async (n) => {
    await page.screenshot({ path: path.join(OUT, n + '.png') });
    console.log('  shot', n);
  };

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

  await cell(page, 'E5');
  await tap(page, 'FIRE at E5');
  await tap(page, 'Patrol Boat');
  console.log('  previewed:', await pickManeuver(page));
  await shot('05-maneuver-preview');

  // Play on until the enemy manoeuvres and a splash lands on our board.
  const letters = 'ABCDEFGHIJ';
  let splashed = false;
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

    if (await page.getByText('Splash!', { exact: false }).count()) {
      splashed = true;
      await page.waitForTimeout(420); // catch the ripples mid-animation
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

  if (!splashed) console.log('  note: no splash observed in 24 turns');
  console.log(errors.length ? 'CONSOLE ERRORS:\n' + errors.slice(0, 10).join('\n') : 'no console errors');
  await browser.close();
  process.exit(errors.length ? 1 : 0);
})().catch((e) => {
  console.error('FAILED:', e.message);
  process.exit(1);
});
