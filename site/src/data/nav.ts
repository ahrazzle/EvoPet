// The one place the site's routes, repositories, documentation map and API
// default are written down. Header, footer, docs, guides and library all read
// from here, so a link cannot be added in one place and forgotten in another.
//
// The route map is locked at four routes with no trailing slash (design
// handoff §1). Everything inside a route is an in-page anchor, which is why
// DOC_GROUPS and GUIDES carry `id`s rather than page slugs.
//
// The repository buttons are locked to four exact labels and destinations
// (user correction §4, 2026-09-11). The pet half's button keeps its generic
// label, `Pet repo`, and points at the TamaHermes tree; `TamaCodex` is the
// separate upstream/original-source link, added alongside it rather than
// replacing it. The earlier shell mirror is prose only.

export const SITE_NAME = 'EvoPet';

// Four trees, all four of them public. `PET_REPO` is the pet half (the
// TamaHermes tree, which continues TamaCodex on its own); `TOOLCHAIN_REPO` is
// that upstream original; `EVOPET_REPO` is this project's own, published
// 2026-09-11; `SHELL_REPO` is the shell lineage upstream.
export const PET_REPO = 'https://github.com/ahrazzle/TamaHermes';
export const TOOLCHAIN_REPO = 'https://github.com/Alichua/TamaCodex';
export const EVOPET_REPO = 'https://github.com/ahrazzle/EvoPet';
export const SHELL_REPO = 'https://github.com/crafter-station/petdex';

/** The shell lineage's earlier mirror. Prose only, and named as code, not linked. */
export const LEGACY_SHELL_REPO = 'ahrazzle/petdex';

export interface RepoLink {
  href: string;
  label: string;
  note: string;
  /** Whether this repository is public today. The footer's honesty note reads this. */
  live: boolean;
}

// Labelled exactly as the user's correction lists them, in that order. `live`
// is read off GitHub: TamaHermes, TamaCodex, Petdex and the EvoPet tree all
// answer 200 as public repositories (EvoPet published 2026-09-11).
export const REPOS: RepoLink[] = [
  { href: PET_REPO, label: 'Pet repo', note: 'the pet half', live: true },
  { href: TOOLCHAIN_REPO, label: 'TamaCodex', note: 'the upstream pet source', live: true },
  { href: EVOPET_REPO, label: 'EvoPet', note: 'this project', live: true },
  { href: SHELL_REPO, label: 'Petdex', note: 'the shell lineage', live: true },
];

/** True only when every linked repository is public. All four are public today. */
export const REPOS_PUBLIC = REPOS.every((repo) => repo.live);

// The library service. Its public index needs no credentials and sends no CORS
// headers, so a deployed site must share the service's origin (or the service
// must be given an allowlist). Overridden at build time; see .env.example.
export const LIBRARY_API_DEFAULT = 'https://evopet.askaconsult.com';

export interface RouteRef {
  href: string;
  label: string;
}

export const ROUTES: RouteRef[] = [
  { href: '/', label: 'Home' },
  { href: '/docs', label: 'Docs' },
  { href: '/guides', label: 'Guides' },
  { href: '/library', label: 'Library' },
];

export interface DocItem {
  id: string;
  label: string;
}

export interface DocGroup {
  id: string;
  label: string;
  summary: string;
  items: DocItem[];
  /** The input file this group was written from, named at the end of the group. */
  source: string;
}

export const DOC_GROUPS: DocGroup[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    summary: 'Install the pet, enable the plugin, and put it on the desktop.',
    items: [
      { id: 'install', label: 'Install the pet' },
      { id: 'enable', label: 'Enable the plugin' },
      { id: 'select', label: 'pets select' },
      { id: 'doctor', label: 'pets doctor' },
      { id: 'per-profile', label: 'Per-profile install' },
      { id: 'all-profiles', label: 'install-all-profiles.sh' },
      { id: 'flags', label: 'Installer flags' },
      { id: 'desktop', label: 'Float it on the desktop' },
      { id: 'environment', label: 'Environment' },
      { id: 'paths', label: 'What is kept, and where' },
      { id: 'shell', label: 'The desktop shell' },
    ],
    source: 'README.hermes.md, hermes/install-hermes.sh',
  },
  {
    id: 'mechanics',
    label: 'Mechanics',
    summary: 'The loop, the ladder, the gates, and the gauges that are watched.',
    items: [
      { id: 'loop', label: 'The loop' },
      { id: 'xp-events', label: 'XP events' },
      { id: 'ladder', label: 'The ladder' },
      { id: 'gates', label: 'Evolution gates' },
      { id: 'forms', label: 'Forms and branches' },
      { id: 'energy', label: 'Energy and dormancy' },
      { id: 'trackers', label: 'The five trackers' },
      { id: 'limitations', label: 'Known limitations' },
    ],
    source: 'tamahermes/levels.py, state.py, visual_state.py; MECHANICS.md',
  },
  {
    id: 'library',
    label: 'Library & publishing',
    summary: 'The public index, what makes a pet capable, and how publishing works.',
    items: [
      { id: 'endpoints', label: 'Endpoints' },
      { id: 'capability', label: 'Capability' },
      { id: 'package', label: 'Package requirements' },
      { id: 'auth', label: 'Auth v1' },
      { id: 'publication', label: 'Publication policy' },
      { id: 'deletion', label: 'Deletion and takedown' },
      { id: 'not-here', label: 'What this site does not do' },
    ],
    source: 'evopet-library/README.md, src/manifest.ts',
  },
  {
    id: 'reference',
    label: 'Reference',
    summary: 'Constants, functions and the files they live in.',
    items: [
      { id: 'constants', label: 'Constants' },
      { id: 'functions', label: 'Function list' },
      { id: 'code-map', label: 'Code map' },
    ],
    source: 'tamahermes/levels.py and the module list it names',
  },
];

export interface GuideRef {
  id: string;
  title: string;
  blurb: string;
  source: string;
}

export const GUIDES: GuideRef[] = [
  {
    id: 'choose-your-evolution-gates',
    title: 'Choose your evolution gates',
    blurb: 'Pick the levels your pet changes form at, and what that costs in turns.',
    source: 'docs/evopet/levels-and-evolution.md, tamahermes/levels.py',
  },
  {
    id: 'publish-a-pet',
    title: 'Publish a pet',
    blurb: 'Mint a key, publish a package, and know which status your pet lands in.',
    source: 'evopet-library/README.md',
  },
  {
    id: 'install-across-all-profiles',
    title: 'Install across all profiles',
    blurb: 'One command for the default profile and every named profile on the machine.',
    source: 'README.hermes.md, hermes/install-all-profiles.sh',
  },
  {
    id: 'float-the-pet-on-the-desktop',
    title: 'Float the pet on the desktop',
    blurb: 'Mirror the pet into the desktop shell, and know what the mirror does not do.',
    source: 'README.hermes.md, PROVENANCE.md',
  },
  {
    id: 'read-your-pets-state',
    title: 'Read your pet’s state',
    blurb: 'Where the ledger lives, what `status` reports, and what it will not tell you.',
    source: 'README.hermes.md, docs/evopet/W1-combined-ledger.md',
  },
];

/** Absolute URL for an in-page anchor on this site. */
export function anchor(route: string, id: string): string {
  return `${route}#${id}`;
}
