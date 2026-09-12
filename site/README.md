# evopet-site

The EvoPet project site: what EvoPet is, the docs, the guides, the library page
and the links to the four repositories. Astro, static output, no runtime dependency
beyond the browser reading the library's public index.

## Routes

Four routes, no trailing slash, in-page navigation by anchor:

| Route | What it is |
|---|---|
| `/` | the landing page |
| `/docs` | one page, four groups, anchored: getting started, mechanics, library & publishing, reference |
| `/guides` | five task guides, one card each, one anchored section each |
| `/library` | published pets, read live from the library service's public index |

## Commands

```bash
npm install
npm run dev      # astro dev
npm run build    # astro build -> dist/
npm run preview  # serve dist/
```

Node 22.12 or newer (Astro 7 requires it).

## Configuration

Nothing here is a secret: the library's public index needs no credentials and
this site holds no key. See `.env.example`.

| Variable | Meaning |
|---|---|
| `EVOPET_SITE_URL` | canonical origin, used for the absolute `canonical` and `og:url` links. Default `https://evopet.askaconsult.com`. |
| `EVOPET_LIBRARY_API` | base URL of the library service. A separate value from the site origin even though it defaults to the same decided host. |
| `EVOPET_LIBRARY_LOCAL_PROXY=1` | development only: fetch same-origin `/api/...` and let the dev server proxy it to `EVOPET_LIBRARY_API`. |

## Design tokens

`src/styles/global.css` holds one palette (indigo and plum surfaces, tangerine
CTAs, mint/sky/rose/lemon/amber accents, and the five stage tints) and one rhythm
scale: `--space-1..9` = 4/8/12/16/24/32/48/64/96px, `--section-gap` between
sections, and `--pad-card` / `--pad-card-lg` / `--grid-gap` inside them. Page
markup carries no spacing of its own — sections are `.section` plus a `.tint--*`,
and no `style` attribute sets spacing.

## Talking to the library

`/library` reads `GET {EVOPET_LIBRARY_API}/api/manifest` in the browser: the
service's public index, approved pets only, no auth. The endpoint is injected
into both the server-rendered page and the browser bundle as a public constant,
so there is one source of truth for it.

The library service sends no CORS headers, so a deployed site must either live
on the same origin as the service or the service must be given an allowlist.
That decision is still open, and the page says so in its error state rather than
showing an empty grid.

## The logo

`public/evopet-logo.png` is the user-supplied mark, resized from
`/Users/kethuda/Documents/OpenSource/EvoPet/resources/EvoPet.jpg` (2048×2048) to
256×256. The source file is not modified. To regenerate it:

```bash
sips -Z 256 -s format png <source>/EvoPet.jpg --out public/evopet-logo.png
```

It is drawn at 24px in the header (decorative there: the `EvoPet` wordmark is
the link's accessible name) and at 44px in the footer, where it stands alone and
so carries its own alt text. Each instance is clipped at `border-radius: 22%`
inside its own black container, because the PNG's field is opaque black and a
light or tinted plate would show it as a box. `public/favicon.svg` is unchanged
and still the older sprite mark.

## Deploy

Served by GitHub Pages at `https://www.evopet.askaconsult.com` (repository
`ahrazzle/EvoPet-site`). That origin is the canonical origin for every page.
Pushing to `main` triggers `.github/workflows/deploy.yml`, which runs `npm ci`,
`npm run build`, and deploys the built `dist/` with the official Pages actions.
`public/CNAME` carries the custom domain into the artifact.

The library service is configured separately: `EVOPET_LIBRARY_API` (default
`https://evopet.askaconsult.com`) is the service origin, not the site origin.

## Verifying a build

```bash
npm run build
ls dist/index.html dist/docs/index.html dist/guides/index.html dist/library/index.html
ls dist/evopet-logo.png
grep -o 'data-endpoint="[^"]*"' dist/library/index.html   # the baked endpoint
```
