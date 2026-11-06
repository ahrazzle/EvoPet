<div align="center">

<img src="site/public/evopet-logo.png" alt="EvoPet" width="120" />

<h1>EvoPet</h1>

<p>
  One pixel-art companion that lives on your desktop and in your agent's terminal,
  and grows from the work you actually do.
  <br />
  One pet, not one per tool: every profile, every group chat and every agent you run
  feeds the same creature.
</p>

<p>
  <a href="https://github.com/ahrazzle/EvoPet"><strong>EvoPet</strong></a>
  &nbsp;·&nbsp;
  <a href="https://github.com/ahrazzle/TamaHermes">TamaHermes</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/Alichua/TamaCodex">TamaCodex</a>
  &nbsp;·&nbsp;
  <a href="https://github.com/crafter-station/petdex">PetDex</a>
</p>

</div>

---

## What EvoPet is

EvoPet is a cross-agent desktop companion with two halves, built and maintained
separately, that only make sense together:

- **The pet** owns the mechanics: XP, the level ladder, the stats, the life stages and
  evolution. It draws the sprite atlas that every surface renders, so the terminal pet, the
  desktop pet and the preview can never drift apart. Python; it installs from its own tree.
- **The desktop shell** floats that creature above your other windows with a HUD, and taps
  the hook payload every hooked agent sends, so the ledger counts Claude Code, Codex,
  opencode and Gemini CLI alongside Hermes. A native build on a pinned SDK, and it lives in
  this repository.

The pet is the reason the project exists; the shell is the surface it appears on.

## Where EvoPet comes from

EvoPet brings a pet lineage and a desktop-shell lineage together. Being exact about the
debt is part of the project:

- **The pet half comes from TamaHermes, which continues TamaCodex.**
  [TamaCodex](https://github.com/Alichua/TamaCodex) is the original upstream/source project
  for the pet-creation lineage. [TamaHermes](https://github.com/ahrazzle/TamaHermes) is that
  lineage's maintained pet-half predecessor, and it is the tree EvoPet's pet half is built
  from. TamaHermes carries on in parallel; EvoPet does not replace it.
- **The shell half is PetDex-inspired.**
  [PetDex](https://github.com/crafter-station/petdex) is credited as the inspiration and
  homage behind EvoPet's desktop shell/app lineage: the floating companion, the hook
  pipeline, the sprite format, the gallery idea. An earlier mirror of that lineage was
  published as `ahrazzle/petdex`.

  **EvoPet is not a fork of PetDex, and it should not be described as one.** PetDex is a
  gallery and a desktop floater with no progression model anywhere in it; EvoPet's whole
  point is a progression model — shared XP, levels, stages and evolution — that PetDex has
  no concept of. The shell borrows a lineage and credits it; the pet is new work on the
  TamaCodex/TamaHermes line.

## One pet, shared XP

The defining requirement, and the reason the combined ledger exists: **one pet per person,
not one per tool.**

- Every Hermes profile you run feeds the same creature.
- Group chats feed the same creature.
- Every other hooked agent (Claude Code, Codex, opencode, Gemini CLI) feeds the same
  creature too.

Two routes lead into one combined ledger, each source counted on exactly one of them so
nothing is double-counted. Growth is read at turn boundaries only, so a turn in one agent
is worth a turn in another. The combined ledger is seeded by force-combining the existing
per-profile XP, so switching to it loses no progress.

Growth stays local. The ledger keeps XP, counters, stats and traits alongside operational
cursors, attribution and mirror configuration. The transient hook queue can contain session
titles and source paths before it is consumed. The progress views expose an allowlisted
projection, and the drain tests check that raw prompt, title and source-path text is not
copied into progression records. See the [data boundaries](docs/companion-development.md#privacy-and-release-boundaries).

## Use the companion

The static site's **Companion workbench** (`/companion`) works without an account or
service credentials. Explore the progression curve, change evolution gates, and inspect a
local combined-ledger snapshot. Preview XP stays in the browser; it does not change an
installed pet. Imported snapshots are read locally and are not uploaded.

In the source-built desktop app, open **EvoPet Progress** from the pet menu to see the
combined ledger's level, XP, next evolution and care stats. The panel reads the pet half's
state; the pet half remains the only writer of progression. Clean, Feed and Play use the
same event queue as the existing care menu.

The [companion development guide](docs/companion-development.md) gives the build, test
and integration commands, the data contract, and the remaining release work.

## Status

Source capabilities as of 6 November 2026:

- The mechanics, combined ledger, drain and sprite compiler live in the separate
  [TamaHermes tree](https://github.com/ahrazzle/TamaHermes). The current curve represents
  levels 1 through 999. A running older installation can still use the earlier curve;
  readers must not silently reinterpret it.
- The native shell is a local source build. The progress panel does not install the pet
  half, run the drain, or activate agent hooks by itself. macOS distribution still needs
  a signed and notarized release and fresh-machine acceptance.
- OpenCode's bundled V1 plugin emits prompt and completion boundaries, so tools do not
  inflate XP. This is the V1 plugin interface, not a claim of OpenCode V2 compatibility.
- The static workbench is independent of the community library. Library publication
  still needs a configured database, storage and service endpoint.

## Install and develop

The pet and the shell install separately, and the pet runs alone in the terminal with no
desktop app at all.

**The pet half.** From a checkout of [TamaHermes](https://github.com/ahrazzle/TamaHermes):

```sh
./hermes/install-hermes.sh --line toast --machine aurora
hermes plugins enable tamahermes
hermes pets select tamahermes
hermes pets doctor        # should report the pet ready
```

Hermes homes are profile-scoped, so install once per profile you actually use.
`install-all-profiles.sh` covers the default profile and every named profile on the machine
in one command. To float the pet on the desktop, mirror it into the shell's pet directory.

**The desktop shell.** Build with the pinned Native SDK and Zig 0.16.0 using the
[development guide](docs/companion-development.md). Building and testing do not require
the gallery's cloud services. A build is separate from installing or replacing an app.

**The project site.** `site/` is a static Astro site with no runtime dependency beyond the
browser reading the library's public index:

```sh
cd site
npm ci
npm run build      # -> site/dist
```

Node 22.12 or newer (Astro 7 requires it). Repository work uses Bun at the root —
`bun install`, then `bun run dev:docker` for a local full stack. See
[`CONTRIBUTING.md`](./CONTRIBUTING.md) and [`AGENTS.md`](./AGENTS.md).

## Repository layout

```text
EvoPet/
├── packages/
│   ├── petdex-desktop-native/   the desktop shell: native app, hook server, sprite renderer
│   ├── petdex-cli/              the catalog client CLI
│   └── discord-bot/             the community bot
├── site/                        the EvoPet project site (Astro, GitHub Pages)
├── src/                         the web app (Next.js) and its API routes
├── drizzle/                     Postgres schema migrations
├── docs/                        project notes
└── scripts/                     build, release and maintenance scripts
```

The pet tree is a separate checkout, not a directory in this repository.

## Licenses

The source code is [MIT](./LICENSE). Pet assets — sprites and other artwork — are owned by
their submitters under whatever license they declare.
