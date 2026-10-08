// app.json is the configuration; this adds the one thing it cannot hold, the path the website is
// served under. A site at a domain of its own is served from / and needs nothing. A GitHub Pages
// project site, or the browser suite's test host, serves it at /<name>/, so that export needs
// every address the bundle writes prefixed with the path. scripts/build-web.mjs sets
// WEB_BASE_URL for the one export that asks for it; the dev server, the native builds, a plain
// `expo export` and `expo config` (which __tests__/appConfig.test.ts introspects) see app.json
// exactly as it is written.
module.exports = ({ config }) => {
  const baseUrl = process.env.WEB_BASE_URL;
  if (!baseUrl) return config;
  // One or more path segments, none of them `.` or `..`, which a browser would resolve away.
  if (!/^(\/(?!\.\.?(?:\/|$))[A-Za-z0-9._~-]+)+$/.test(baseUrl)) {
    throw new Error(`WEB_BASE_URL must be a path such as /battleshiple, not ${JSON.stringify(baseUrl)}`);
  }
  return { ...config, experiments: { ...config.experiments, baseUrl } };
};
