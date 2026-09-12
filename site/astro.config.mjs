// The site is static. Pages are files, and nothing about the build talks to the
// network: `astro build` emits plain HTML/CSS/JS, and the only runtime fetch in
// the whole site is a browser asking the library service for its public index.
//
// The route map is locked at four routes with no trailing slash, so
// `trailingSlash: 'never'` is the setting that matches the design handoff.
//
// The library endpoint is *baked in as a public constant*: it is a URL, not a
// credential, and the library's public index is unauthenticated. It is injected
// with `vite.define` so the same string reaches the server-rendered page and the
// browser bundle.
//
// Local development against a local library service:
//   EVOPET_LIBRARY_LOCAL_PROXY=1 npm run dev
// makes the library page call same-origin `/api/...`, which this dev server
// proxies to EVOPET_LIBRARY_API (default http://127.0.0.1:4350). That is a
// development convenience only: the library service sends no CORS headers, so a
// deployed site must either live on the same origin as the service or the
// service must be given an allowlist. See README.md, "Talking to the library".
const localProxy = process.env.EVOPET_LIBRARY_LOCAL_PROXY === '1';
const libraryBase = (process.env.EVOPET_LIBRARY_API || 'https://evopet.askaconsult.com').replace(
  /\/+$/,
  '',
);
const apiTarget = process.env.EVOPET_LIBRARY_API || 'http://127.0.0.1:4350';
const libraryEndpoint = localProxy ? '/api' : libraryBase;

/** @type {import('astro').AstroUserConfig} */
export default {
  output: 'static',
  site: process.env.EVOPET_SITE_URL || 'https://www.evopet.askaconsult.com',
  trailingSlash: 'never',
  compressHTML: true,
  build: {
    inlineStylesheets: 'auto',
  },
  vite: {
    define: {
      __EVOPET_LIBRARY_ENDPOINT__: JSON.stringify(libraryEndpoint),
      __EVOPET_LIBRARY_PROXIED__: JSON.stringify(localProxy),
      // Same value under the Astro-public env name, so frontmatter and client
      // modules can both read it without a second source of truth.
      'import.meta.env.PUBLIC_EVOPET_LIBRARY_ENDPOINT': JSON.stringify(libraryEndpoint),
    },
    server: localProxy
      ? {
          proxy: {
            '/api': {
              target: apiTarget,
              changeOrigin: true,
            },
          },
        }
      : undefined,
  },
};
