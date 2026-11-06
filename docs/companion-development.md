# Companion development

EvoPet has two source trees. This repository owns the native shell, hook transport
and static workbench. [TamaHermes](https://github.com/ahrazzle/TamaHermes) owns the
combined ledger, XP awards, care rules and sprite compiler. The shell reads
progress; it does not create another progression ledger.

## Capability record

Stable identity: **`evopet.shared-companion`**. Human purpose: one companion grows
from a person's work across agents, with understandable progress and one
authoritative mechanics implementation. This identity is independent of the
current filenames and desktop toolkit.

Responsibilities and peers:

- TamaHermes owns XP, care, replay suppression, active-pet buckets and rendered
  evolution. It must accept a terminal event even when transport batches split.
- The native shell owns authenticated event transport and presentation. It sends
  turn boundaries, keeps tools separate from completed turns, and reads the
  recognized ledger without repairing or rewriting it.
- The workbench owns progression exploration and snapshot inspection. It keeps
  sample progress separate, discards arbitrary imported metadata, and identifies
  incompatible curve versions instead of silently converting them.

Observed on the November 2026 baseline: the bundled OpenCode V1 plugin omitted
turn phases; the shell had care controls but no shared-ledger progress window;
the drain lost the outcome if its state and stop messages were consumed in
different batches. The adaptation adds self-contained terminal outcomes,
read-only progress views and an explicitly offline native test mode.

Peer response: delegated agents independently reviewed components they did not
author. The reader review required an explicit curve contract and unambiguous
active pet; the workbench review required snapshot/export gate consistency; the
drain review checked legacy fallback, source separation and replay. These
corrections were incorporated. All reviewers used `gpt-6.1-sol`; this is local
agent review, not an upstream maintainer decision or cross-model approval.

Composition evidence for this implementation:

- Actual plugin payloads, including ten tool calls, produce 63 XP for four
  prompts, three successful turns and one failed turn across every batch split.
- A compiled native shell in an isolated offline fixture accepts authenticated
  events, rejects unauthenticated requests with 401, and feeds the real drain and
  sprite compiler. Two completed turns produce 36 XP. Replaying all 22 messages
  under fresh filenames adds zero XP and leaves the mirror unchanged.
- Firefox renders that generated ledger as level 2 and 36 XP with matching care
  stats. Snapshot mode disables simulation; forgetting it returns to the
  sandbox. Desktop controls, invalid gates and the 390-pixel layout were checked.
- Local checks passed: 582 root tests, 303 native tests and 183 EvoPet-specific
  pet tests; TypeScript, five-route Astro build and Biome with zero errors.
  Existing Biome warnings remain. Native panel appearance is not yet visually
  accepted; compiled UI analysis and the native transport flow are narrower
  evidence.

Retained lessons: a terminal event must describe its own outcome; a separate
process home does not isolate the macOS Keychain; whole-ledger imports need
explicit projection and version checks. These lessons are encoded in the
terminal-outcome tests, `PETDEX_OFFLINE` guard and snapshot validators.

Next action: review the paired source changes, visually accept the native
progress panel, and verify a fresh-machine install with the matching pet-half
update. Signed distribution, OpenCode V2 and the community library remain
separate milestones. Current status is **locally implemented and composed**;
installed activation, merge and production release are not implied.

## Run the browser workbench

```sh
cd site
bun install --no-save
bun run dev
```

Open `/companion` on the printed local URL. The workbench needs no database,
authentication, API keys or library service. A completed preview turn earns 18 XP
and a failed preview turn earns 9 XP. Creator gates support one to four increasing
integer levels from 1 to 999, including a first gate at level 1.

Choose a copy of `~/.evopet/state.json` to inspect real progress. Imports stay in
memory, are limited to 4 MiB, and project only supported numbers and anonymous
source totals. Arbitrary ledger metadata, profile names, paths and cursors are
discarded. The selected pet's XP is distinct from historical combined XP.
Snapshot controls are read-only; returning to the sandbox forgets the snapshot.
An older 99-level ledger is refused rather than recalculated against a new curve.

```sh
# From the repository root
bun test site/tests
cd site
bun run build
```

The workbench displays the existing idle artwork. Stage-specific artwork still
comes from the pet compiler; the preview does not invent missing stage atlases.

## Build the native shell

Use Zig **0.16.0** and the same Native SDK revision as desktop CI:
`c0b10d027efa490fc99a3bc7f1cf88b015999d45` from
`https://github.com/Railly/native.git`. A current globally installed Zig or Native
CLI is not a substitute for those pins.

Clone the SDK into a dedicated build directory, check out that revision, and set
`NATIVE_SDK_PATH` to its absolute path. Add the directory containing Zig 0.16.0
to `PATH`. From this repository:

```sh
scripts/patch-native-sdk.sh
(cd "$NATIVE_SDK_PATH" && zig build cli)
export NATIVE_CLI="$NATIVE_SDK_PATH/zig-out/bin/native"
cd packages/petdex-desktop-native
"$NATIVE_CLI" test .
"$NATIVE_CLI" build -Dautomation
```

The binary is `packages/petdex-desktop-native/zig-out/bin/petdex-desktop-native`.
Build/test alone does not replace an installed application. Run integration
checks with a disposable process home, fixture pet and `PETDEX_OFFLINE=1`.
The explicit offline flag skips Keychain access, cloud authentication/library
requests, updates, remote setup and managed hook changes while retaining the
loopback hook server and local rendering. An isolated home alone does not isolate
the macOS Keychain. Also point agent-specific home overrides at the fixture or
remove them from the child environment. Port 7777 must be
free; do not stop another user's running shell to run a test.

Open **EvoPet Progress** from the pet menu (automation command
`evopet.progress`). The floating window reads `~/.evopet/state.json`, refreshes
while open, and shows the active pet's level, XP, next evolution, optional care
stats and ledger update timestamp. Missing or invalid data is shown as
unavailable. Clean, Feed and Play enqueue the existing care events. They take
effect when the pet drain runs, and do not optimistically change displayed XP.

## Connect the pet half

Install and select the pet using the TamaHermes repository's installer. Its
combined drain absorbs Hermes profile ledgers through route A and foreign hook
events through route B. Hermes events in the foreign spool are ignored, so the
same work cannot enter both routes.

From the pet checkout, inspect the planned drain without writing:

```sh
python3 -m tamahermes.evopet_drain --no-mirror
```

For an intentionally configured installation, `--apply` commits the ledger and
consumes events. The pet tree's `launchd/install.sh` manages the macOS periodic
drain. These are installation operations; building this shell or opening the
workbench does not run them.

Both readers consume a schema-1 combined ledger with the 999-level curve. The
curve uses `10*u² + floor((u⁶ + 500000000)/1000000000)`, where `u = level - 1`.
Level 999 begins at 998,019,880 XP. When `pets` contains buckets, `activePetId`
identifies the bucket to display. Shared care stats may be absent, in which case
they are unknown rather than filled with sample values.

## OpenCode completion contract

The bundled plugin implements OpenCode's **V1** plugin interface. `chat.message`
emits `user-prompt`; tool hooks emit `pre`/`post`; a turn's first idle or error
event emits `stop`. Tools do not award XP. The state and bubble requests share an
event ID; distinct legitimate turns remain distinct, while exact event replay
can be deduplicated by the drain.

Stop bubbles include a terminal `agent_state` (`jumping` for success, `failed`
for failure). The corresponding TamaHermes drain change recognizes that outcome
even when it consumes the two HTTP messages in separate batches. Older drains
can consume normal batches, but cannot guarantee completion XP across a split.
Deploy the matching pet-half update with this shell integration.

OpenCode V2 needs a separate adapter migration, as documented in the
[OpenCode V1 migration guide](https://dev.opencode.ai/docs/build/plugins/migrate-v1).
This change makes no V2 compatibility claim. Reinstall the bundled hook integration through the shell's
existing integration settings after updating; changing source does not rewrite
an already installed plugin.

```sh
# Fast plugin regression, with an isolated process home
node --test packages/petdex-desktop-native/tests/opencode_plugin_test.mjs

# Exercise actual plugin payloads against a matching pet checkout
TAMAHERMES_REFERENCE=/absolute/path/to/TamaHermes \
  bun test --env-file=.env.mock
```

The integration fixture checks repeated turns, ten intervening tool calls,
error followed by idle, replay, every two-batch split and individual-message
draining. Four prompts, three successes and one failure must always total 63 XP.

## Privacy and release boundaries

The numeric projection shown by the workbench and native panel is not a copy of
the full input file. The local hook spool can contain session titles and source
paths before the drain consumes it. Do not describe that transient spool as
numbers-only. The drain's persisted progression is tested to exclude raw prompt,
title and source-path text; operational cursors and attribution still exist.

The community library requires its own database, storage, hosting and CORS
configuration. A source build and local test run do not establish that service,
a production site deployment, an installed update, a notarized macOS release,
or Windows/Linux runtime acceptance. Those remain separate release checks.
