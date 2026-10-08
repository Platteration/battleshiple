// The test host for the built site. It serves the folder under a sub-path, the way a GitHub Pages
// project site is served, and answers the way Netlify and Cloudflare Pages read the site's own
// _headers and _redirects, so the browser suite plays the game under the headers exactly as that
// file writes them. Test tooling only: it is never published, and it listens on loopback alone.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.txt': 'text/plain; charset=utf-8',
  '.json': 'application/json',
};

/** _headers as Netlify and Cloudflare Pages read it: a path line, then its indented headers. */
export function parseHeaders(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      rules.push({ pattern: line.trim(), headers: [] });
      continue;
    }
    const rule = rules.at(-1);
    const colon = line.indexOf(':');
    if (!rule || colon === -1) throw new Error(`_headers: a header outside a rule, or with no value: ${JSON.stringify(line)}`);
    rule.headers.push([line.slice(0, colon).trim(), line.slice(colon + 1).trim()]);
  }
  return rules;
}

/** The 404 rules of _redirects, the only kind this site writes; anything else is an error here. */
export function parseRedirects(text) {
  const rules = [];
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const [from, to, status, ...rest] = line.trim().split(/\s+/);
    if (rest.length || !/^404!?$/.test(status ?? '')) throw new Error(`_redirects: a rule this host does not read: ${JSON.stringify(line)}`);
    rules.push({ from, to, force: status.endsWith('!') });
  }
  return rules;
}

/** A Netlify path pattern against a path: a trailing `*` (a splat) matches the rest, whatever it holds. */
export function matches(pattern, p) {
  if (pattern.endsWith('*')) return p.startsWith(pattern.slice(0, -1));
  return pattern === p;
}

/**
 * The headers every matching rule sets. Both hosts join a header that two rules set into one
 * comma-separated value, which is never what either rule meant (`no-cache, public,
 * max-age=31536000` caches nothing for a year), so `twice` names each one that happens.
 */
export function headersFor(rules, p) {
  const out = new Map();
  const twice = [];
  for (const rule of rules) {
    if (!matches(rule.pattern, p)) continue;
    for (const [name, value] of rule.headers) {
      const key = name.toLowerCase();
      if (out.has(key)) {
        twice.push(name);
        out.set(key, `${out.get(key)}, ${value}`);
      } else {
        out.set(key, value);
      }
    }
  }
  return { headers: out, twice };
}

/**
 * Serves `root` at http://127.0.0.1:<port><base>/. Every request is recorded in `requests`; one
 * outside the base also lands in `outside`, and a path two header rules both set a header for in
 * `twice`. With `headers: false` it sends nothing from _headers, as GitHub Pages sends nothing.
 * `override(sitePath)` may answer a path instead of the folder (the suite stages a broken bundle
 * that way): it returns `{ status, body, type }` or nothing.
 */
export function serveSite({ root, base, headers: sendHeaders = true, override = () => undefined }) {
  const site = path.resolve(root);
  const headerRules = parseHeaders(fs.readFileSync(path.join(site, '_headers'), 'utf8'));
  const redirectRules = parseRedirects(fs.readFileSync(path.join(site, '_redirects'), 'utf8'));
  const outside = [];
  const twice = [];
  const requests = [];

  const send = (res, sitePath, status, body, type) => {
    const { headers, twice: doubled } = headersFor(sendHeaders ? headerRules : [], sitePath);
    if (doubled.length) twice.push(`${sitePath}: ${doubled.join(', ')}`);
    for (const [name, value] of headers) res.setHeader(name, value);
    res.setHeader('Content-Type', type);
    res.statusCode = status;
    res.end(body);
  };
  const notFound = (res, sitePath) => send(res, sitePath, 404, fs.readFileSync(path.join(site, '404.html')), TYPES['.html']);

  const server = http.createServer((req, res) => {
    const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
    requests.push(pathname);
    if (pathname === base) {
      res.writeHead(301, { Location: `${base}/` }).end();
      return;
    }
    if (!pathname.startsWith(`${base}/`)) {
      outside.push(pathname);
      res.writeHead(404, { 'Content-Type': 'text/plain' }).end('outside the site');
      return;
    }
    let sitePath;
    try {
      sitePath = decodeURIComponent(pathname.slice(base.length));
    } catch {
      res.writeHead(400).end();
      return;
    }
    if (sitePath.includes('\0') || sitePath.split('/').some((s) => s === '..')) {
      res.writeHead(400).end();
      return;
    }
    const staged = override(sitePath);
    if (staged) return send(res, sitePath, staged.status, staged.body, staged.type);
    if (redirectRules.some((r) => r.force && matches(r.from, sitePath))) return notFound(res, sitePath);
    const file = path.join(site, sitePath.endsWith('/') ? `${sitePath}index.html` : sitePath);
    const fromSite = path.relative(site, file);
    if (fromSite.startsWith('..') || path.isAbsolute(fromSite) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      return notFound(res, sitePath);
    }
    send(res, sitePath, 200, fs.readFileSync(file), TYPES[path.extname(file)] ?? 'application/octet-stream');
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({ server, origin: `http://127.0.0.1:${port}`, url: `http://127.0.0.1:${port}${base}/`, outside, twice, requests });
    });
  });
}
