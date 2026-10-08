// The website, end to end: the built site (scripts/build-web.mjs --base /battleshiple) served
// under that sub-path by e2e/serve.mjs, which answers with the headers public/_headers writes and
// the 404s public/_redirects writes, and the game played in Chromium under them.
//
// It fails on any Content-Security-Policy, Trusted Types or Permissions-Policy report (the page's
// own securitypolicyviolation events and the console's messages), any page error, any console
// error, and any request outside the site's sub-path, and it plays the game: the menu and the
// rules, the settings (the browser's Vibration row, a theme, Reset's confirmation, About and its
// source link), a battle against the computer (deploy, fire, manoeuvre, the computer's reply), a
// reload that resumes it, the winning shot and the after-action report, and the Pass & Play
// handoff. Then what the host does around the game: the headers off every response, the policy
// enforced rather than only sent, the not-found page, the repository's own files refused,
// framing refused, the page as GitHub Pages serves it (no headers, the <meta> alone), and the
// safety net: a bundle that does not load, one that throws, one that draws nothing, and no
// JavaScript at all.
//
//   npm run test:e2e        builds the site, then runs this
//   node e2e/run.mjs        runs this against the dist-web/ already built
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { headersFor, parseHeaders, serveSite } from './serve.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(path.join(root, 'package.json'));
const BASE = '/battleshiple';
const SITE = path.join(root, 'dist-web');
const NOT_FOUND = 'That page isn’t here';
const BOOT_FAILED = 'Battleshiple could not start.';

/** A constant's string value, read out of the TypeScript source the bundle was built from. */
function constant(file, name) {
  const m = new RegExp(`export const ${name} =\\s*'([^']+)'`).exec(fs.readFileSync(path.join(root, file), 'utf8'));
  assert.ok(m, `${file} exports ${name}`);
  return m[1];
}
const SOURCE_URL = constant('src/about.ts', 'SOURCE_URL');
const WEB_VIBRATION_HINT = constant('src/ui/screens/SettingsScreen.tsx', 'WEB_VIBRATION_HINT');
const SAVE_KEY = 'battleshiple:savegame:v1';
const SETTINGS_KEY = 'battleshiple.settings.v1';
const VERSION = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8')).expo.version;
/** How long after load public/guard.js gives the game to draw before it says it could not start. */
const GRACE_MS = Number(/const GRACE_MS = (\d+);/.exec(fs.readFileSync(path.join(root, 'public', 'guard.js'), 'utf8'))?.[1]);
assert.ok(GRACE_MS > 0, 'public/guard.js states its GRACE_MS');

// Playwright is a devDependency. Missing, this fails rather than skips: a skipped browser suite
// reads as a passed one.
const { chromium } = require('playwright');

if (!fs.existsSync(path.join(SITE, 'index.html'))) {
  console.error(`e2e: no site in ${path.relative(root, SITE)}; run npm run test:e2e, which builds it first`);
  process.exit(1);
}
const index = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
assert.ok(index.includes(`src="${BASE}/_expo/static/js/web/`), `the site was built for ${BASE}: run node scripts/build-web.mjs --base ${BASE}`);
const bundlePath = /src="\/battleshiple(\/_expo\/static\/js\/web\/[^"]+\.js)"/.exec(index)[1];

const headerRules = parseHeaders(fs.readFileSync(path.join(SITE, '_headers'), 'utf8'));
const pageHeaders = headersFor(headerRules, '/').headers;
const policy = pageHeaders.get('content-security-policy');

/** Responses the suite stages in place of a file, keyed by the path inside the site. */
const staged = new Map();
const site = await serveSite({ root: SITE, base: BASE, override: (p) => staged.get(p) });
// The full Chromium build, not the headless shell: only the full browser fetches the favicon,
// which is what showed that the policy needs img-src.
const browser = await chromium.launch({ channel: 'chromium' });
const problems = [];
/** Every path inside the site a response in the browser came from. */
const seen = new Set();

/**
 * A page watched for everything this suite fails on. `expected` lists the page errors and
 * console errors a scenario causes on purpose; nothing excuses a policy report or a request
 * outside the site. `site` is the host the page is meant to stay inside.
 */
async function watched(context, label, { expected = [], host = site, checkHeaders = true } = {}) {
  const page = await context.newPage();
  const allowed = (text) => expected.some((re) => re.test(text));
  await page.exposeBinding('__e2eViolation', (_source, report) => problems.push(`${label}: policy violation: ${report}`));
  await page.addInitScript(() => {
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__e2eViolation(`${e.violatedDirective} blocked ${e.blockedURI || '(inline)'} at ${e.sourceFile}:${e.lineNumber} ${e.sample}`);
    });
  });
  page.on('console', (m) => {
    const text = m.text();
    if (/Content.Security.Policy|Trusted.Type|Permissions.Policy|Feature.Policy/i.test(text) || (m.type() === 'error' && !allowed(text))) {
      problems.push(`${label}: console.${m.type()}: ${text}`);
    }
  });
  page.on('pageerror', (e) => {
    if (!allowed(e.message)) problems.push(`${label}: page error: ${e.message}`);
  });
  page.on('request', (r) => {
    const url = r.url();
    if (!url.startsWith(host.url) && url !== `${host.origin}${BASE}`) problems.push(`${label}: request outside the site: ${url}`);
  });
  if (checkHeaders) {
    page.on('response', (r) => {
      const url = new URL(r.url());
      if (!url.pathname.startsWith(`${BASE}/`)) return;
      // Every response carries exactly what _headers gives its path. Strict-Transport-Security
      // is checked off the browser instead (below): a browser drops it from a plain-HTTP origin.
      const sitePath = decodeURIComponent(url.pathname.slice(BASE.length));
      seen.add(sitePath);
      const got = r.headers();
      for (const [name, value] of headersFor(headerRules, sitePath).headers) {
        if (name !== 'strict-transport-security' && got[name] !== value) problems.push(`${label}: ${url.pathname} answered ${name}: ${got[name]}, not ${value}`);
      }
    });
  }
  page.setDefaultTimeout(15000);
  return page;
}

/** Seeded Math.random, so the fleets and the computer's choices are the same on every run. */
const seeded = (seed) => {
  let a = seed >>> 0;
  Math.random = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const button = (page, name) => page.getByRole('button', { name, exact: true });
const press = (page, name) => button(page, name).click();
/** A board cell by its coordinate, whatever its label says after it ("E5" or "E5, miss"). */
const cell = (page, coord) => page.getByLabel(new RegExp(`^${coord}(,|$)`)).first();
const stored = (page, key) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), key);

/** The background colour of the screen behind the top-left corner, as rgb(). */
const screenColour = (page) =>
  page.evaluate(() => {
    for (let el = document.elementFromPoint(2, 2); el; el = el.parentElement) {
      const bg = getComputedStyle(el).backgroundColor;
      if (bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent') return bg;
    }
    return null;
  });

/**
 * A vs-Computer save one shot from victory: every enemy hull sunk but the patrol boat's bow at
 * B9. The shapes are src/engine/types.ts's, and src/storage.ts accepts it; resuming it and
 * firing at B9 reaches the after-action report, which a real game takes eighty turns to reach.
 */
function nearlyWonSave() {
  const ship = (classId, r, c, length, hits) => ({ id: classId, classId, bow: { r, c }, heading: 'E', length, hits, cooldown: 0 });
  const fleet = (sunk) => [
    ship('carrier', 0, 4, 5, Array(5).fill(sunk)),
    ship('battleship', 2, 3, 4, Array(4).fill(sunk)),
    ship('destroyer', 4, 2, 3, Array(3).fill(sunk)),
    ship('submarine', 6, 2, 3, Array(3).fill(sunk)),
    ship('patrol', 8, 1, 2, sunk ? [false, true] : [false, false]),
  ];
  const player = (index, name, isAI, ships) => ({ index, name, isAI, ships, shots: [], splashes: [] });
  return JSON.stringify({
    version: 1,
    savedAt: Date.now(),
    difficulty: 'normal',
    state: { mode: 'ai', players: [player(0, 'You', false, fleet(false)), player(1, 'Capt. Varga', true, fleet(true))], current: 0, phase: 'fire', turn: 40, log: [] },
  });
}

/**
 * What each probe in probePolicy comes to when the policy is in force: refused, and reported
 * against the directive that refused it. A probe that is merely stopped some other way (the
 * suite's own route that keeps the machine off the network, an image that is not there) has no
 * report, so it cannot pass for the policy.
 */
const PROBES_REFUSED = [
  'html refused by require-trusted-types-for',
  'fetch refused by connect-src',
  'image refused by img-src',
  'inline script refused by require-trusted-types-for',
];

/** Things the game never does, each tried in the page; returns what became of each, and why. */
async function probePolicy(page) {
  return page.evaluate(async () => {
    let reports = [];
    document.addEventListener('securitypolicyviolation', (e) => reports.push(e.effectiveDirective));
    const settle = () => new Promise((resolve) => setTimeout(resolve, 100));
    const out = [];
    const record = async (outcome) => {
      await settle();
      out.push(`${outcome} by ${[...new Set(reports)].join(', ') || 'nothing'}`);
      reports = [];
    };
    try {
      document.createElement('div').innerHTML = '<b>written from a string</b>';
      await record('html written');
    } catch {
      await record('html refused');
    }
    try {
      await fetch('https://example.com/');
      await record('fetch answered');
    } catch {
      await record('fetch refused');
    }
    await record(
      await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve('image loaded');
        img.onerror = () => resolve('image refused');
        img.src = 'https://example.com/pixel.png';
      }),
    );
    window.__inline = false;
    try {
      const script = document.createElement('script');
      script.text = 'window.__inline = true';
      document.head.append(script);
    } catch {
      // Trusted Types refuses the text itself.
    }
    await record(window.__inline ? 'inline script ran' : 'inline script refused');
    return out;
  });
}

let current = 'setup';
async function step(name, fn) {
  current = name;
  await fn();
  console.log(`ok - ${name}`);
}

try {
  await step('the built page carries the header policy as a <meta>, and the referrer policy too', async () => {
    const metas = [...index.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/g)].map((m) => m[1]);
    assert.deepEqual(metas, [policy.split('; ').filter((d) => !d.startsWith('frame-ancestors')).join('; ')]);
    const firstScript = index.search(/<script\b[^>]*\bsrc=/);
    assert.ok(firstScript !== -1 && index.indexOf('http-equiv="Content-Security-Policy"') < firstScript, 'the policy comes before every script');
    const referrer = /<meta name="referrer" content="([^"]+)" \/>/.exec(index);
    assert.equal(referrer?.[1], pageHeaders.get('referrer-policy'));
  });

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'light' });
  await context.addInitScript(seeded, 20261008);
  // The About card's source link is the one address the game hands out. It opens in a new tab;
  // here that tab's request is recorded and stopped, so nothing leaves the machine.
  const followed = [];
  await context.route(/^https?:\/\/(?!127\.0\.0\.1[:/])/, (route) => {
    followed.push(route.request().url());
    return route.abort();
  });
  const page = await watched(context, 'game');

  await step('the menu loads under the policy', async () => {
    const response = await page.goto(site.url);
    assert.equal(response.status(), 200);
    assert.equal(response.headers()['content-security-policy'], policy);
    assert.equal(await page.title(), 'Battleshiple');
    await button(page, 'Play vs Computer').waitFor();
    assert.equal(await page.locator('#boot-failed').isHidden(), true, 'the safety net stays out of sight when the game starts');
  });

  await step('the rules open and close', async () => {
    await press(page, 'How to play');
    await page.getByText('Every turn', { exact: true }).waitFor();
    await press(page, 'Hide rules');
    await page.getByText('Every turn', { exact: true }).waitFor({ state: 'detached' });
  });

  await step('the settings work, and the Vibration row says what a browser cannot do', async () => {
    await press(page, 'Settings');
    await page.getByText(WEB_VIBRATION_HINT).waitFor();
    const vibration = page.getByRole('switch', { name: 'Vibration' });
    assert.equal(await vibration.isDisabled(), true, 'the Vibration switch cannot be pressed in a browser');
    assert.equal(await vibration.isChecked(), false, 'and is drawn off, since nothing vibrates');
    assert.equal(await screenColour(page), 'rgb(245, 240, 230)', 'System follows the browser, light here');
    await page.getByRole('radio', { name: 'Dark' }).click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) ?? '{}').theme === 'dark', SETTINGS_KEY);
    assert.equal(await screenColour(page), 'rgb(25, 35, 45)', 'Dark draws the deep-ink palette');
  });

  await step('Reset to defaults asks first, through the browser’s own dialog', async () => {
    const asked = [];
    page.once('dialog', (dialog) => {
      asked.push(dialog.message());
      return dialog.accept();
    });
    await press(page, 'Reset to defaults');
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key) ?? '{}').theme === 'system', SETTINGS_KEY);
    assert.equal(asked.length, 1);
    assert.match(asked[0], /^Reset settings\?/);
    assert.equal(await screenColour(page), 'rgb(245, 240, 230)');
  });

  await step('About names the version, and its source link opens the repository in a new tab', async () => {
    await page.getByText(`Battleshiple ${VERSION}`, { exact: true }).waitFor();
    await page.getByText('Nothing leaves your device.', { exact: true }).waitFor();
    const [tab] = await Promise.all([context.waitForEvent('page'), page.getByRole('link', { name: /MIT licence/ }).click()]);
    for (let waited = 0; followed.length === 0 && waited < 10000; waited += 100) await new Promise((resolve) => setTimeout(resolve, 100));
    assert.deepEqual(followed, [SOURCE_URL]);
    await tab.close();
    await press(page, 'Back to menu');
  });

  await step('a battle against the computer: deploy, fire, manoeuvre, and the computer replies', async () => {
    await press(page, 'Play vs Computer');
    await press(page, 'Random');
    await press(page, 'Start battle');
    await button(page, 'Choose a target in enemy waters').waitFor();
    await cell(page, 'E5').click();
    await press(page, 'FIRE at E5');
    // Your turn's manoeuvre: the patrol boat, by its roster chip, and the first legal move.
    await page.getByText('Patrol Boat').first().click();
    let picked = '';
    for (const label of ['Ahead 1', 'Ahead 2', 'Astern 1', 'Port', 'Starboard', 'Turn CW', 'Turn CCW']) {
      const control = page.getByLabel(label, { exact: true }).first();
      if ((await control.count()) && (await control.isEnabled())) {
        await control.click();
        picked = label;
        break;
      }
    }
    assert.ok(picked, 'the patrol boat has a legal manoeuvre');
    await page.getByRole('button', { name: /^Confirm: / }).click();
    await press(page, 'End turn');
    // The computer fires and may manoeuvre; then it is your turn to aim again.
    await button(page, 'Choose a target in enemy waters').waitFor({ timeout: 20000 });
    await press(page, 'Log');
    await page.getByText(/^Capt\. Varga fired at [A-J]\d+/).first().waitFor();
    await press(page, 'Close');
  });

  await step('the battle is saved, and a reload offers it back', async () => {
    const save = await stored(page, SAVE_KEY);
    assert.equal(save?.state?.mode, 'ai');
    await page.reload();
    await press(page, 'Resume game');
    await button(page, 'Choose a target in enemy waters').waitFor();
    await press(page, 'Quit to menu');
    await button(page, 'Resume game').waitFor();
  });

  await step('the winning shot ends the battle with the after-action report', async () => {
    await page.evaluate(([key, save]) => localStorage.setItem(key, save), [SAVE_KEY, nearlyWonSave()]);
    await page.reload();
    await press(page, 'Resume game');
    await cell(page, 'B9').click();
    await press(page, 'FIRE at B9');
    await page.getByText('After-action report', { exact: true }).waitFor();
    await page.getByText('Victory', { exact: true }).waitFor();
    await press(page, 'Main menu');
    await button(page, 'Play vs Computer').waitFor();
    assert.equal(await stored(page, SAVE_KEY), null, 'a finished battle leaves no save behind');
  });

  await step('Pass & Play covers the board between the two admirals', async () => {
    await press(page, 'Pass & Play (2 players)');
    await press(page, 'Random');
    await press(page, 'Start battle');
    await page.getByText('Pass the device to', { exact: true }).waitFor();
    await page.getByRole('button', { name: /– ready$/ }).waitFor();
  });

  await step('the safety net stays out of sight in a game that started, past its grace period', async () => {
    const sinceLoad = await page.evaluate(() => performance.now() - performance.timing.loadEventEnd + performance.timing.navigationStart);
    if (sinceLoad < GRACE_MS + 1000) await page.waitForTimeout(GRACE_MS + 1000 - sinceLoad);
    assert.equal(await page.locator('#boot-failed').isHidden(), true);
  });

  await step('every response carried the headers _headers gives its path, and no header twice', async () => {
    for (const p of ['/', '/guard.js', '/site.css', bundlePath]) assert.ok(seen.has(p), `the browser loaded ${p}`);
    assert.deepEqual(site.twice, []);
    // Off the browser, which keeps Strict-Transport-Security from a plain-HTTP origin out of sight,
    // and fetches the favicon for itself, where the page's response events do not see it.
    for (const p of [...seen, '/favicon.ico', '/404.html', '/robots.txt', '/.well-known/security.txt']) {
      const response = await fetch(`${site.origin}${BASE}${p}`);
      assert.equal(response.status, 200, `${p} is part of the site`);
      for (const [name, value] of headersFor(headerRules, p).headers) assert.equal(response.headers.get(name), value, `${p}: ${name}`);
    }
  });

  await step('the policy is enforced, not only sent', async () => {
    // Each probe is something the game never does: write HTML from a string, fetch, load an
    // image from elsewhere, run an inline script. Under the policy every one is refused, and
    // reported; this page is not watched, since the reports are the point.
    const probe = await context.newPage();
    await probe.goto(site.url);
    await button(probe, 'Play vs Computer').waitFor();
    assert.deepEqual(await probePolicy(probe), PROBES_REFUSED);
    await probe.close();
  });

  await step('a missing address answers the not-found page, styled, with the way back', async () => {
    const lost = await watched(context, 'not found', { expected: [/404 \(Not Found\)/] });
    const response = await lost.goto(`${site.url}no/such/page`);
    assert.equal(response.status(), 404);
    await lost.getByRole('heading', { name: NOT_FOUND }).waitFor();
    assert.equal(await lost.title(), 'Page not found · Battleshiple');
    assert.equal(await screenColour(lost), 'rgb(245, 240, 230)', 'the not-found page loads its stylesheet from the site');
    await lost.getByRole('link', { name: 'Open Battleshiple' }).click();
    await button(lost, 'Play vs Computer').waitFor();
    assert.equal(new URL(lost.url()).pathname, `${BASE}/`);
    await lost.close();
  });

  await step("the repository's own files and the hosts' configurations answer the not-found page", async () => {
    // A copy of the site with what a mistaken upload of the checkout would add beside it.
    const copy = fs.mkdtempSync(path.join(os.tmpdir(), 'battleshiple-site-'));
    try {
      fs.cpSync(SITE, copy, { recursive: true });
      const planted = ['README.md', 'metadata.json', '.git/config', '.git/HEAD', 'deploy/nginx.conf', '.env', 'package.json', 'src/storage.ts'];
      for (const file of planted) {
        fs.mkdirSync(path.dirname(path.join(copy, file)), { recursive: true });
        fs.writeFileSync(path.join(copy, file), 'not part of the site');
      }
      const host = await serveSite({ root: copy, base: BASE });
      try {
        for (const file of [...planted, '_headers', '_redirects', '.htaccess']) {
          const response = await fetch(`${host.url}${file}`);
          const body = await response.text();
          assert.equal(response.status, 404, `${file} is refused`);
          assert.ok(body.includes(NOT_FOUND), `${file} answers the not-found page`);
        }
        // ...and what the site is made of is still served.
        for (const file of ['', 'guard.js', 'robots.txt', '.well-known/security.txt']) assert.equal((await fetch(`${host.url}${file}`)).status, 200, file);
      } finally {
        host.server.close();
      }
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });

  await step('another site cannot frame the game', async () => {
    // A second loopback server, as a page elsewhere would be: frame-ancestors is checked against
    // the framing page's origin, which needs a real one.
    const framer = http.createServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }).end(`<!DOCTYPE html><iframe src="${site.url}" width="390" height="600"></iframe>`);
    });
    await new Promise((resolve) => framer.listen(0, '127.0.0.1', resolve));
    const outer = await context.newPage();
    const refused = [];
    outer.on('console', (m) => {
      if (/frame-ancestors/.test(m.text())) refused.push(m.text());
    });
    try {
      await outer.goto(`http://127.0.0.1:${framer.address().port}/`);
      await outer.waitForTimeout(1500);
      const frame = outer.frames().find((f) => f !== outer.mainFrame());
      const drew = frame ? await frame.evaluate(() => !!document.getElementById('root')).catch(() => false) : false;
      assert.equal(drew, false, 'the game did not draw inside the frame');
      assert.equal(refused.length > 0, true, 'Chromium reports the frame-ancestors refusal');
    } finally {
      await outer.close();
      framer.close();
    }
  });

  await step('served with no headers at all, as GitHub Pages serves it, the <meta> holds the game to the policy', async () => {
    const bare = await serveSite({ root: SITE, base: BASE, headers: false });
    try {
      const pagesContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
      const pagesPage = await watched(pagesContext, 'no headers', { host: bare, checkHeaders: false });
      const response = await pagesPage.goto(bare.url);
      assert.equal(response.headers()['content-security-policy'], undefined);
      await press(pagesPage, 'Play vs Computer');
      await press(pagesPage, 'Random');
      await press(pagesPage, 'Start battle');
      await cell(pagesPage, 'A1').click();
      await press(pagesPage, 'FIRE at A1');
      const probe = await pagesContext.newPage();
      await probe.goto(bare.url);
      await button(probe, 'Play vs Computer').waitFor();
      assert.deepEqual(await probePolicy(probe), PROBES_REFUSED);
      await pagesContext.close();
    } finally {
      bare.server.close();
    }
  });

  /**
   * Stages `body` in place of the bundle and waits for the safety net's note. `within` is how
   * long after the page's load event it may take: a failure the browser reports shows the note
   * at once, well inside the grace period, so each path is tested on its own and not by the
   * timer that would catch it anyway.
   */
  const safetyNet = async (label, body, expected, within) => {
    staged.set(bundlePath, body);
    const netContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    try {
      const net = await watched(netContext, label, { expected });
      await net.goto(site.url);
      await net.getByText(BOOT_FAILED).waitFor({ timeout: within });
      assert.equal(await net.locator('#root').evaluate((el) => el.childElementCount), 0);
      await net.getByRole('link', { name: 'Reload the page' }).waitFor();
    } finally {
      staged.delete(bundlePath);
      await netContext.close();
    }
  };

  await step('the safety net: a bundle that does not load', async () => {
    // What a host answers for a file that is not there: the not-found page, as HTML, which the
    // browser refuses to run as a script (nosniff) as well as reporting the 404.
    const missing = { status: 404, body: fs.readFileSync(path.join(SITE, '404.html')), type: 'text/html; charset=utf-8' };
    await safetyNet('no bundle', missing, [/404 \(Not Found\)/, /Refused to execute script from .* because its MIME type \('text\/html'\)/], GRACE_MS / 2);
  });

  await step('the safety net: a bundle that throws while starting', async () => {
    await safetyNet('bundle throws', { status: 200, body: 'throw new Error("staged failure");', type: 'text/javascript; charset=utf-8' }, [/staged failure/], GRACE_MS / 2);
  });

  await step('the safety net: a bundle that runs and draws nothing', async () => {
    await safetyNet('bundle draws nothing', { status: 200, body: 'void 0;', type: 'text/javascript; charset=utf-8' }, [], GRACE_MS + 3000);
  });

  await step('with JavaScript off, the page says the game needs it', async () => {
    const off = await browser.newContext({ javaScriptEnabled: false });
    try {
      const quiet = await watched(off, 'no JavaScript');
      await quiet.goto(site.url);
      // Playwright's text locators skip what is inside <noscript>, so the note is found by CSS.
      const note = quiet.locator('noscript .site-note strong');
      assert.equal(await note.isVisible(), true, 'the note is drawn');
      assert.equal(await note.textContent(), 'Battleshiple needs JavaScript.');
      assert.equal(await quiet.locator('#boot-failed').isHidden(), true);
    } finally {
      await off.close();
    }
  });

  await context.close();
  assert.deepEqual(site.outside, [], 'no request left the site');
} catch (error) {
  problems.push(`${current}: ${error.stack ?? error}`);
} finally {
  await browser.close();
  site.server.close();
}

if (problems.length) {
  console.error(`\n${problems.length} problem(s):\n${problems.map((p) => `  - ${p}`).join('\n')}`);
  process.exit(1);
}
console.log('\nThe website works under its own policy.');
