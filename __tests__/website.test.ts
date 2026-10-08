/**
 * The website's hosting layer, read out of every file it is written in. The policy and the other
 * response headers are written four times over (public/_headers for Netlify and Cloudflare Pages,
 * public/.htaccess for Apache, deploy/nginx.conf for nginx, and a <meta> in each page for a host
 * that sends no headers of its own, such as GitHub Pages), and a value changed in one and not the
 * others is a site that is safe on one host and not on the next. Nothing here can run a host, so
 * each file's rules are parsed and asked the same questions: which headers a path gets, how long
 * it may be cached, and which paths are refused. e2e/run.mjs then plays the built game under
 * _headers in Chromium, which is where each value was measured.
 */
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
// Plain CommonJS, which is all a config file is.
import appConfigWithBase from '../app.config.js';
import { dark, light } from '../src/ui/theme/palettes';
import { contrast, GRAPHIC_MIN, TEXT_MIN } from '../src/ui/theme/contrast';

const root = path.join(__dirname, '..');
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

/** _headers as Netlify and Cloudflare Pages read it: a path line, then its indented headers. */
function headerRules(text: string): { pattern: string; headers: [string, string][] }[] {
  const rules: { pattern: string; headers: [string, string][] }[] = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const colon = line.indexOf(':');
    const rule = rules[rules.length - 1];
    if (!rule || colon === -1) throw new Error(`_headers: ${line}`);
    rule.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules;
}
/** A Netlify path pattern: `*` at the end matches the rest of the path. */
const netlifyMatch = (pattern: string, p: string) => (pattern.endsWith('*') ? p.startsWith(pattern.slice(0, -1)) : pattern === p);

const HEADERS = headerRules(read('public/_headers'));
const HTACCESS = read('public/.htaccess');
const NGINX = read('deploy/nginx.conf');
const REDIRECTS = read('public/_redirects');

/** The headers _headers gives a path. A header two rules both set is an error on these hosts. */
const fromHeadersFile = (p: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const rule of HEADERS.filter((r) => netlifyMatch(r.pattern, p))) {
    for (const [name, value] of rule.headers) {
      if (Object.hasOwn(out, name)) throw new Error(`${p}: two _headers rules set ${name}, which both hosts would join into one value`);
      out[name] = value;
    }
  }
  return out;
};
/** The headers .htaccess gives a path: every `Header always set`, and Cache-Control by its <If>. */
const fromHtaccess = (p: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const [plain, conditional] = HTACCESS.split(/^\s*<If /m);
  for (const m of (plain ?? '').matchAll(/^\s*Header always set (\S+) "([^"]*)"/gm)) out[m[1]!] = m[2]!; // both groups are required by the pattern
  const cond = /^"%\{REQUEST_URI\} =~ m#(.+)#">\s*\n\s*Header always set Cache-Control "([^"]*)"\s*\n\s*<\/If>\s*\n\s*<Else>\s*\n\s*Header always set Cache-Control "([^"]*)"/.exec(conditional ?? '');
  if (!cond) throw new Error('.htaccess: the Cache-Control <If>/<Else> pair is not where this test reads it');
  out['Cache-Control'] = new RegExp(cond[1]!).test(p) ? cond[2]! : cond[3]!; // all three groups are required by the pattern
  return out;
};
/** The headers nginx.conf gives a path: the server block's add_header lines, Cache-Control by its map. */
const fromNginx = (p: string): Record<string, string> => {
  const out: Record<string, string> = {};
  const map = /map \$uri \$(\w+) \{([\s\S]*?)\n\}/.exec(NGINX);
  if (!map) throw new Error('nginx.conf: no Cache-Control map');
  // A map tries its regular expressions in the order they are written; the first match wins.
  const entries = [...map[2]!.matchAll(/^\s*(\S+)\s+"([^"]*)";$/gm)].map((m) => [m[1]!, m[2]!] as const); // groups required by the patterns
  const cache = entries.find(([key]) => key.startsWith('~') && new RegExp(key.slice(1)).test(p))?.[1] ?? entries.find(([key]) => key === 'default')?.[1];
  for (const m of NGINX.matchAll(/^\s*add_header (\S+) (?:"([^"]*)"|(\$\w+)) always;/gm)) {
    out[m[1]!] = m[3] === `$${map[1]}` ? (cache ?? '') : m[2]!; // the name group is required; the value is one of the two
  }
  return out;
};

/** The policy a page carries as a <meta>, or undefined. */
const metaPolicyOf = (html: string) => /<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/.exec(html)?.[1];
/** A policy as a <meta> can carry it: frame-ancestors is ignored there. */
const asMeta = (policy: string) =>
  policy
    .split('; ')
    .filter((d) => !d.startsWith('frame-ancestors'))
    .join('; ');

/** The bundle's address has a hash in it; this one stands for any. */
const BUNDLE = '/_expo/static/js/web/index-0123456789abcdef0123456789abcdef.js';
/** Every path the site is made of, as the browser asks for it. */
const SITE_PATHS = ['/', '/index.html', '/404.html', '/guard.js', '/site.css', '/favicon.ico', '/robots.txt', '/.well-known/security.txt', BUNDLE];
/** What a host must refuse: its own configurations, and the repository's files beside the site. */
const REFUSED = ['/_headers', '/_redirects', '/.htaccess', '/.git/config', '/.git/HEAD', '/.env', '/metadata.json', '/README.md', '/package.json', '/deploy/nginx.conf', '/src/storage.ts'];

/** Measured in Chromium with the game played end to end under each one (see public/_headers). */
const POLICY = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU='",
  "img-src 'self'",
  "connect-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
  "require-trusted-types-for 'script'",
  "trusted-types 'none'",
];

describe('the response headers', () => {
  it('are the same in _headers, .htaccess and nginx.conf, on every path of the site', () => {
    for (const p of SITE_PATHS) {
      const netlify = fromHeadersFile(p);
      expect([p, fromHtaccess(p)]).toEqual([p, netlify]);
      expect([p, fromNginx(p)]).toEqual([p, netlify]);
    }
  });

  it('are the whole set, on every path', () => {
    for (const p of SITE_PATHS) {
      expect([p, Object.keys(fromHeadersFile(p)).sort()]).toEqual([
        p,
        [
          'Cache-Control',
          'Content-Security-Policy',
          'Cross-Origin-Opener-Policy',
          'Cross-Origin-Resource-Policy',
          'Permissions-Policy',
          'Referrer-Policy',
          'Strict-Transport-Security',
          'X-Content-Type-Options',
          'X-Frame-Options',
        ],
      ]);
    }
    const headers = fromHeadersFile('/');
    expect(headers['X-Content-Type-Options']).toBe('nosniff');
    expect(headers['Cross-Origin-Opener-Policy']).toBe('same-origin');
    expect(headers['Cross-Origin-Resource-Policy']).toBe('same-origin');
    expect(headers['Strict-Transport-Security']).toBe('max-age=31536000; includeSubDomains');
    // Apache sends HSTS over HTTPS alone, where a browser reads it.
    expect(HTACCESS).toMatch(/^\s*Header always set Strict-Transport-Security "[^"]+" env=HTTPS$/m);
  });

  it('keep the hashed bundle a year, and revalidate everything else', () => {
    expect(fromHeadersFile(BUNDLE)['Cache-Control']).toBe('public, max-age=31536000, immutable');
    for (const p of SITE_PATHS.filter((s) => s !== BUNDLE)) expect([p, fromHeadersFile(p)['Cache-Control']]).toEqual([p, 'no-cache']);
  });

  it('give every file public/ publishes a cache rule of its own', () => {
    // A file without one falls through to whatever the host defaults to; one under two rules
    // gets both values joined, which fromHeadersFile refuses.
    const published = (dir: string): string[] =>
      fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? published(path.join(dir, e.name)) : [path.join(dir, e.name)]));
    const served = published('public')
      .map((f) => `/${path.relative(path.join(root, 'public'), path.join(root, f)).split(path.sep).join('/')}`)
      .filter((p) => !REFUSED.includes(p));
    expect(served.length).toBeGreaterThan(5);
    for (const p of served) expect([p, fromHeadersFile(p)['Cache-Control']]).toEqual([p, 'no-cache']);
  });

  it('are set in the nginx server block, never in a location, which would drop the rest', () => {
    // A location that has an add_header of its own inherits none of the server block's.
    let depth = 0;
    let inLocation = 0;
    for (const line of NGINX.split('\n').map((l) => l.replace(/#.*/, ''))) {
      if (/^\s*location\b/.test(line)) inLocation = depth + 1;
      if (/\badd_header\b/.test(line)) expect([line.trim(), inLocation > 0 && depth >= inLocation]).toEqual([line.trim(), false]);
      depth += (line.match(/\{/g) ?? []).length - (line.match(/\}/g) ?? []).length;
      if (inLocation && depth < inLocation) inLocation = 0;
    }
    expect((NGINX.match(/^\s*add_header /gm) ?? []).length).toBe(9);
  });

  it('deny every feature a page can ask for: the game uses none of them', () => {
    const features = fromHeadersFile('/')['Permissions-Policy']!.split(', '); // the whole set is checked above
    expect(features.length).toBeGreaterThan(30);
    for (const f of features) expect(f).toMatch(/^[a-z-]+=\(\)$/);
    // The ones a browser game could plausibly reach for, so a later trim cannot drop them.
    for (const f of ['camera', 'microphone', 'geolocation', 'autoplay', 'clipboard-read', 'clipboard-write', 'fullscreen', 'payment', 'usb']) {
      expect(features).toContain(`${f}=()`);
    }
  });

  it('send the origin alone with a link out, and the pages say the same', () => {
    expect(fromHeadersFile('/')['Referrer-Policy']).toBe('strict-origin-when-cross-origin');
    for (const page of ['public/index.html', 'public/404.html']) {
      expect([page, /<meta name="referrer" content="([^"]+)" \/>/.exec(read(page))?.[1]]).toEqual([page, 'strict-origin-when-cross-origin']);
    }
  });

  it('refuse to be framed, by both spellings', () => {
    expect(fromHeadersFile('/')['Content-Security-Policy']).toContain("frame-ancestors 'none'");
    expect(fromHeadersFile('/')['X-Frame-Options']).toBe('DENY');
  });
});

describe('the Content-Security-Policy', () => {
  const policy = fromHeadersFile('/')['Content-Security-Policy']!; // every path's set is checked above

  it('is exactly what the game was measured to need, starting from nothing', () => {
    expect(policy.split('; ')).toEqual(POLICY);
    expect(policy).not.toMatch(/'unsafe-inline'|'unsafe-eval'|'unsafe-hashes'|\*|data:|blob:|https?:/);
  });

  it("allows one style hash: the empty string's, for the <style> element react-native-web fills through the CSSOM", () => {
    const empty = `'sha256-${createHash('sha256').update('').digest('base64')}'`;
    expect(policy).toContain(`style-src 'self' ${empty}`);
  });

  it('is the one 404.html carries as a <meta>, less frame-ancestors, which a meta cannot set', () => {
    expect(metaPolicyOf(read('public/404.html'))).toBe(asMeta(policy));
  });

  it('is not in the page template, which the development server serves as well', () => {
    // scripts/build-web.mjs writes it into the built page; `expo start --web` needs a WebSocket.
    expect(metaPolicyOf(read('public/index.html'))).toBeUndefined();
    expect(read('public/index.html').replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/http-equiv/i);
  });

  it('needs no hash for the pages themselves: no inline script, style or handler in either', () => {
    for (const page of ['public/index.html', 'public/404.html']) {
      const markup = read(page).replace(/<!--[\s\S]*?-->/g, '');
      for (const tag of markup.match(/<script\b[^>]*>/g) ?? []) expect([page, tag]).toEqual([page, expect.stringMatching(/ src="[^"]+"/)]);
      expect([page, markup.match(/<script\b[^>]*>[^<]+<\/script>/g)]).toEqual([page, null]);
      expect([page, markup.match(/<style\b|\sstyle=|\son[a-z]+=|javascript:/gi)]).toEqual([page, null]);
    }
    expect(read('public/404.html').replace(/<!--[\s\S]*?-->/g, '')).not.toMatch(/<script\b/);
  });
});

describe("what the hosts refuse: the repository's own files and the hosts' configurations", () => {
  /** nginx: every `location ~ <regex> { return 404; }`, tried against the path. */
  const nginxRefuses = (p: string) =>
    [...NGINX.matchAll(/^\s*location ~ (\S+) \{ return 404; \}$/gm)].some((m) => new RegExp(m[1]!).test(p)); // the group is required
  /** Apache: every `RewriteRule <regex> - [R=404,L]` with no condition before it, against the path less its slash. */
  const apacheRefuses = (p: string) => {
    const lines = HTACCESS.split('\n');
    return lines.some((line, i) => {
      const m = /^\s*RewriteRule (\S+) - \[R=404,L\]$/.exec(line);
      return !!m && !/^\s*RewriteCond/.test(lines[i - 1] ?? '') && new RegExp(m[1]!).test(p.slice(1)); // the group is required
    });
  };
  /** Netlify: the forced 404 rules of _redirects. */
  const netlifyRefuses = (p: string) =>
    REDIRECTS.split('\n')
      .filter((l) => l.trim() && !l.trimStart().startsWith('#'))
      .map((l) => l.trim().split(/\s+/))
      .some(([from, to, status]) => to === '/404.html' && status === '404!' && netlifyMatch(from!, p)); // a rule line has a from

  it.each(REFUSED)('%s is refused by every host', (p) => {
    expect([nginxRefuses(p), apacheRefuses(p), netlifyRefuses(p)]).toEqual([true, true, true]);
  });

  it.each(SITE_PATHS)('%s is served by every host', (p) => {
    expect([nginxRefuses(p), apacheRefuses(p), netlifyRefuses(p)]).toEqual([false, false, false]);
  });

  it('answer a missing page, and a folder, with the site’s own not-found page', () => {
    expect(NGINX).toMatch(/^\s*error_page 404 \/404\.html;$/m);
    expect(NGINX).toMatch(/^\s*error_page 403 =404 \/404\.html;$/m);
    expect(NGINX).toMatch(/^\s*location = \/404\.html \{ internal; \}$/m);
    expect(NGINX).toMatch(/^\s*autoindex off;$/m);
    expect(NGINX).toMatch(/^\s*server_tokens off;$/m);
    expect(NGINX).toMatch(/^\s*return 301 https:\/\/\$host\$request_uri;$/m);
    expect(HTACCESS).toMatch(/^ErrorDocument 404 \/404\.html\nErrorDocument 403 \/404\.html$/m);
    expect(HTACCESS).toMatch(/^Options -Indexes$/m);
    expect(HTACCESS).toMatch(/^ServerSignature Off$/m);
    expect(HTACCESS).toMatch(/^\s*RewriteRule \^ https:\/\/%\{HTTP_HOST\}%\{REQUEST_URI\} \[R=301,L\]$/m);
  });
});

describe('the files a site carries', () => {
  it('has a security.txt that names a contact, has not expired, and is renewed a year at a time', () => {
    const fields = Object.fromEntries(
      read('public/.well-known/security.txt')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'))
        .map((l) => [l.slice(0, l.indexOf(':')), l.slice(l.indexOf(':') + 1).trim()]),
    );
    expect(fields).toEqual({
      Contact: 'https://github.com/Platteration/battleshiple/issues',
      Expires: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$/),
      'Preferred-Languages': 'en',
      Policy: 'https://github.com/Platteration/battleshiple/blob/HEAD/SECURITY.md',
    });
    const left = Date.parse(fields.Expires ?? '') - Date.now(); // its presence is checked just above
    expect(left).toBeGreaterThan(0); // renew it: a year from the day it is written
    expect(left).toBeLessThanOrEqual(366 * 24 * 3600 * 1000);
  });

  it('lets robots read the one page', () => {
    expect(read('public/robots.txt').split('\n').filter((l) => l && !l.startsWith('#'))).toEqual(['User-agent: *', 'Allow: /']);
  });

  it('loads the safety net before the game, as a file of its own, and says when JavaScript is off', () => {
    const markup = read('public/index.html').replace(/<!--[\s\S]*?-->/g, '');
    const scripts = markup.match(/<script\b[^>]*>/g);
    // The exporter appends the bundle's <script defer> after this; the safety net is first, and
    // synchronous, so it is listening when the bundle loads.
    expect(scripts).toEqual(['<script src="guard.js">']);
    expect(markup.indexOf('<script src="guard.js">')).toBeLessThan(markup.indexOf('<link rel="stylesheet" href="site.css" />'));
    expect(markup).toMatch(/<div id="boot-failed" class="site-note" role="alert" hidden>/);
    expect(markup).toMatch(/<noscript>[\s\S]*Battleshiple needs JavaScript\.[\s\S]*<\/noscript>/);
    expect(read('public/guard.js')).toContain("document.getElementById('boot-failed')");
  });

  it('draws the page around the game in the game’s own palettes, every pairing at WCAG AA', () => {
    const css = read('public/site.css').replace(/\/\*[\s\S]*?\*\//g, '');
    const lightAt = css.indexOf('@media (prefers-color-scheme: light) {');
    expect(lightAt).toBeGreaterThan(0);
    /** selector -> declarations, for the rules in one stretch of the stylesheet. */
    const rules = (text: string) => {
      const out = new Map<string, Record<string, string>>();
      for (const m of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const decls = Object.fromEntries(
          m[2]! // required group
            .split(';')
            .map((d) => d.trim())
            .filter(Boolean)
            .map((d) => [d.slice(0, d.indexOf(':')).trim(), d.slice(d.indexOf(':') + 1).trim()]),
        );
        for (const sel of m[1]!.split(',').map((s) => s.trim())) out.set(sel, { ...out.get(sel), ...decls }); // required group
      }
      return out;
    };
    const base = rules(css.slice(0, lightAt));
    const over = rules(css.slice(lightAt + '@media (prefers-color-scheme: light) {'.length));
    const scheme = (overrides: boolean) => (sel: string, prop: string) => {
      const value = (overrides ? over.get(sel)?.[prop] : undefined) ?? base.get(sel)?.[prop];
      if (!value) throw new Error(`site.css: no ${prop} for ${sel}`);
      return value.split(' ').find((w) => w.startsWith('#')) ?? value;
    };
    // The focus ring is drawn by `outline` in the dark stylesheet and recoloured by `outline-color`
    // in the light one.
    for (const [name, palette, get, ring] of [
      ['dark', dark, scheme(false), 'outline'],
      ['light', light, scheme(true), 'outline-color'],
    ] as const) {
      const card = get('.not-found-card', 'background');
      const pairs: [string, string, string, number][] = [
        ['page text', get('body', 'color'), get('body', 'background'), TEXT_MIN],
        ['note text', get('.site-note', 'color'), get('.site-note', 'background'), TEXT_MIN],
        ['note link', get('.site-note a', 'color'), get('.site-note', 'background'), TEXT_MIN],
        ['heading', get('.not-found-card h1', 'color'), card, TEXT_MIN],
        ['paragraph', get('.not-found-card p', 'color'), card, TEXT_MIN],
        ['link', get('.not-found-card a', 'color'), card, TEXT_MIN],
        ['button', get('a.not-found-button', 'color'), get('a.not-found-button', 'background'), TEXT_MIN],
        ['focus ring', get('a:focus-visible', ring), card, GRAPHIC_MIN],
      ];
      for (const [what, fg, bg, min] of pairs) expect([name, what, contrast(fg, bg) >= min]).toEqual([name, what, true]);
      // Every colour is one the game's palette draws with.
      const colours = new Set(JSON.stringify(palette).match(/#[0-9a-f]{6}/gi));
      for (const [what, fg, bg] of pairs) expect([name, what, colours.has(fg), colours.has(bg)]).toEqual([name, what, true, true]);
    }
  });
});

describe('the build', () => {
  const withBase = appConfigWithBase as (env: { config: Record<string, unknown> }) => Record<string, unknown>;
  const saved = process.env.WEB_BASE_URL;
  afterEach(() => {
    if (saved === undefined) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = saved;
  });

  it('leaves app.json as it is unless a base path is asked for', () => {
    delete process.env.WEB_BASE_URL;
    const config = { name: 'Battleshiple', experiments: { typedRoutes: false } };
    expect(withBase({ config })).toBe(config);
    process.env.WEB_BASE_URL = '/battleshiple';
    expect(withBase({ config })).toEqual({ ...config, experiments: { typedRoutes: false, baseUrl: '/battleshiple' } });
  });

  it.each(['battleshiple', '/', '/battleshiple/', '//example.com', '/..', '/a/../b', '/./a', '/a b', '/a?b', '/a#b'])('refuses %j as a base path', (base) => {
    process.env.WEB_BASE_URL = base;
    expect(() => withBase({ config: {} })).toThrow(/WEB_BASE_URL must be a path/);
  });

  /**
   * scripts/build-web.mjs in a sandbox of its own, with a stand-in for `expo export` that records
   * how it was called and writes what the real one writes (public/ copied, the page from the
   * template with the bundle's script, metadata.json) but deletes nothing. The real exporter
   * empties its output folder before it writes, so a guard that let `--out src` through, tried
   * against the checkout itself, would take the source with it; here the worst a broken guard
   * can do is run the stand-in.
   */
  function sandbox(extra = '') {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'battleshiple-build-'));
    const repo = path.join(dir, 'repo');
    fs.mkdirSync(path.join(repo, 'scripts'), { recursive: true });
    fs.copyFileSync(path.join(root, 'scripts', 'build-web.mjs'), path.join(repo, 'scripts', 'build-web.mjs'));
    fs.cpSync(path.join(root, 'public'), path.join(repo, 'public'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'package.json'), '{"name":"sandbox","private":true}');
    const expo = path.join(repo, 'node_modules', 'expo');
    fs.mkdirSync(path.join(expo, 'bin'), { recursive: true });
    fs.writeFileSync(path.join(expo, 'package.json'), '{"name":"expo","version":"0.0.0"}');
    fs.writeFileSync(
      path.join(expo, 'bin', 'cli'),
      [
        "const fs = require('fs');",
        "const path = require('path');",
        "const out = process.argv[process.argv.indexOf('--output-dir') + 1];",
        "fs.writeFileSync(path.join(process.cwd(), 'exporter-ran.json'), JSON.stringify({ args: process.argv.slice(2), base: process.env.WEB_BASE_URL ?? null }));",
        "fs.cpSync(path.join(process.cwd(), 'public'), out, { recursive: true });",
        "const base = process.env.WEB_BASE_URL ?? '';",
        "const page = fs.readFileSync(path.join(process.cwd(), 'public', 'index.html'), 'utf8').replace('%LANG_ISO_CODE%', 'en').replace('%WEB_TITLE%', 'Battleshiple');",
        "fs.writeFileSync(path.join(out, 'index.html'), page.replace('</body>', `<script src=\"${base}/_expo/static/js/web/index-0.js\" defer></script>\\n</body>`));",
        "fs.writeFileSync(path.join(out, 'metadata.json'), '{}');",
        extra,
      ].join('\n'),
    );
    const run = (...args: string[]) => {
      try {
        execFileSync(process.execPath, [path.join(repo, 'scripts', 'build-web.mjs'), ...args], { cwd: repo, stdio: ['ignore', 'pipe', 'pipe'] });
        return { status: 0, stderr: '' };
      } catch (e) {
        const error = e as { status: number; stderr: Buffer };
        return { status: error.status, stderr: String(error.stderr) };
      }
    };
    const exporter = (): { args: string[]; base: string | null } | null => {
      const file = path.join(repo, 'exporter-ran.json');
      return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
    };
    const done = () => fs.rmSync(dir, { recursive: true, force: true });
    return { repo, run, exporter, done };
  }

  it.each([
    ['--out', 'src'],
    ['--out', 'scripts'],
    ['--out', 'public'],
    ['--out', '.'],
    ['--out', '..'],
    ['--base', '/../x'],
    ['--base', 'battleshiple'],
    ['--bogus', 'x'],
  ])('refuses %s %s before the exporter runs', (flag, value) => {
    const box = sandbox();
    try {
      const result = box.run(flag, value);
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/^build-web: /);
      expect(box.exporter()).toBeNull();
    } finally {
      box.done();
    }
  });

  it('builds a site under a base path: the exporter told, 404.html and .htaccess moved under it, metadata.json gone', () => {
    const box = sandbox();
    try {
      expect(box.run('--base', '/battleshiple', '--out', 'dist-web')).toEqual({ status: 0, stderr: '' });
      const out = path.join(box.repo, 'dist-web');
      expect(box.exporter()).toEqual({ args: ['export', '--platform', 'web', '--output-dir', out], base: '/battleshiple' });
      expect(fs.existsSync(path.join(out, 'metadata.json'))).toBe(false);
      const notFound = fs.readFileSync(path.join(out, '404.html'), 'utf8');
      expect(notFound.match(/(?:href|src)="[^"]*"/g)).toEqual(['href="/battleshiple/favicon.ico"', 'href="/battleshiple/site.css"', 'href="/battleshiple/"']);
      expect(fs.readFileSync(path.join(out, '.htaccess'), 'utf8')).toMatch(/^ErrorDocument 404 \/battleshiple\/404\.html\nErrorDocument 403 \/battleshiple\/404\.html$/m);
    } finally {
      box.done();
    }
  });

  it("writes _headers' policy into the built page, after the charset and ahead of every script and stylesheet", () => {
    const box = sandbox();
    try {
      expect(box.run()).toEqual({ status: 0, stderr: '' });
      const html = fs.readFileSync(path.join(box.repo, 'dist-web', 'index.html'), 'utf8');
      expect([...html.matchAll(/<meta http-equiv="Content-Security-Policy" content="([^"]+)" \/>/g)].map((m) => m[1])).toEqual([
        asMeta(fromHeadersFile('/')['Content-Security-Policy']!), // checked above
      ]);
      const markup = html.replace(/<!--[\s\S]*?-->/g, '');
      const policyAt = markup.indexOf('http-equiv="Content-Security-Policy"');
      expect(policyAt).toBeGreaterThan(markup.indexOf('<meta charset="utf-8" />'));
      expect(policyAt).toBeLessThan(markup.indexOf('<script'));
      expect(policyAt).toBeLessThan(markup.indexOf('<link'));
    } finally {
      box.done();
    }
  });

  it('builds a site at the root of its domain with the addresses as they are written', () => {
    const box = sandbox();
    try {
      expect(box.run()).toEqual({ status: 0, stderr: '' });
      expect(box.exporter()?.base).toBeNull();
      const out = path.join(box.repo, 'dist-web');
      expect(fs.readFileSync(path.join(out, '404.html'), 'utf8')).toBe(read('public/404.html'));
      expect(fs.readFileSync(path.join(out, '.htaccess'), 'utf8')).toBe(read('public/.htaccess'));
    } finally {
      box.done();
    }
  });

  it('refuses a page that is not the template, whose policy and safety net would be missing', () => {
    // What a later SDK that stopped reading public/index.html would export.
    const box = sandbox("fs.writeFileSync(path.join(out, 'index.html'), '<!DOCTYPE html><html><head><meta charset=\"utf-8\" /></head><body><div id=\"root\"></div></body></html>');");
    try {
      const result = box.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/is not the page public\/index\.html describes/);
    } finally {
      box.done();
    }
  });

  it('refuses a template that carries a policy of its own, which would keep a stale copy beside the one written in', () => {
    const box = sandbox(
      "fs.writeFileSync(path.join(out, 'index.html'), fs.readFileSync(path.join(out, 'index.html'), 'utf8').replace('<meta charset=\"utf-8\" />', '<meta charset=\"utf-8\" />\\n<meta http-equiv=\"Content-Security-Policy\" content=\"default-src *\" />'));",
    );
    try {
      const result = box.run();
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/already carries a policy/);
    } finally {
      box.done();
    }
  });
});
