# EvoPet — working notes

Working name: **EvoPet** (internal only; the public rename is deliberately the last step).
Repo: this fork of `crafter-station/petdex` (fork at `ahrazzle/petdex`, cloned to `~/EvoPet`,
`upstream` remote retained for manual merges of meaningful updates).

Goal, in two parts:

1. **Drop the Tamagotchi concept** — the pet floats on the desktop with a floating HUD,
   no device shell, no LCD. *Done: shipped as TamaHermes v1.2.0.*
2. **XP from every source** — the pet gains XP from all Hermes sessions across all
   profiles, plus every other agent Petdex already hooks (Claude Code, Codex, Gemini
   CLI, opencode).

Petdex has **no XP, evolution, stage or progression concept anywhere in its codebase**.
This is not an extension of an existing feature; it is a new data model. That is also why
a new gallery is needed: pet packages carry one spritesheet and no notion of stages, so a
"full evolution" pet cannot be expressed in the current format.

## Where the events are, and why the taps differ

Petdex hooks four agents into one pipeline. Two invocation styles exist:

| agent | how it reaches Petdex |
|---|---|
| claude-code, codex, gemini | config hook runs `~/.petdex/bin/petdex-hook bubble <phase> <agent>` with JSON on stdin; **2s timeout** |
| opencode | its plugin POSTs **HTTP directly** to `http://127.0.0.1:7777/state` + `/bubble` with an `x-petdex-update-token` header |
| hermes | same binary invocation, or our own plugin |

Everything funnels into the desktop app's hook server on `127.0.0.1:7777`.

### Tap option A — shim the hook binary: NOT VIABLE as conceived

`main.zig::refreshHookEntry()` runs **every boot** and does an unconditional
`plat.replaceSymlink(rp, link)`, re-pointing `~/.petdex/bin/petdex-hook` at the running
binary ("the hooks reference it, the app re-aims it every boot"). The result is discarded,
so there is no guard to exploit. A shim placed at that path is destroyed on every app
launch — not just on updates.

### Tap option B — read `~/.petdex/runtime/`: LOSSY, rejected

There is **no append-only event log**. `bubble.json` and `state.json` are overwrite-only
"current state" files, and `sessions/` holds one title record per session, not per event.
Measured: the counter advanced 2871 → 2914 while working (~43 events) and exactly one
survived. Any watcher would silently undercount XP. Rejected on honesty grounds.

### Tap option C — be inside the pipeline: IMPLEMENTED, VERIFIED

Every agent's event, without exception, passes through the app's hook server, so the tap
goes in `hook_server.zig`: accepted `/state` and `/bubble` bodies are written verbatim into
`runtime/evo-queue/`. One file, two call sites, and it catches **all** agents by
construction — including opencode, which never touches the binary and would have been
missed by patching the hook runner instead.

Verified end to end in an isolated `HOME` (nothing of the real pet touched):

- a real claude-code hook through the hook binary spooled both a `/state` and a `/bubble`;
- an opencode-style direct HTTP post spooled with `agent_source: opencode`;
- **an unauthenticated post returns 401 and is not spooled** — the tap sits after auth, so
  only genuine agent events enter the ledger.

The payloads are richer than `bubble.json` ever was: the hook client enriches them with
`agent_source`, `session_id`, `source_cwd`, `source_app` and `agent_state`.

## The blocker: the app build toolchain

The desktop app is not plain Zig. It builds through `native build` from `@native-sdk/cli`
(vercel-labs/native) against a **pinned SDK checkout** (`NATIVE_CLI`, `NATIVE_SDK_PATH`),
with a Petdex-owned macOS Mach-O headerpad patch applied by `scripts/patch-native-sdk.sh`
before compiling; the script fails if the SDK source stops matching the pinned patch.

Measured on this machine: `bun`, `native` and `zig` are all **absent**; only `node` exists.
macOS specifically cannot be built on CI — `desktop-release.yml` refuses it, because an
adhoc-signed bundle is rejected by Gatekeeper on every Mac but the one that built it, so
macOS builds are produced locally and notarized via `scripts/sign-macos.sh`.

So option C means standing up the Native SDK toolchain and shipping our own app. The
cheaper alternative, if we want to avoid owning a build:

### Tap option D — wrapper on a path the app does not manage

Leave `~/.petdex/bin/petdex-hook` alone (the app keeps it working) and point the agents'
hook commands at our own wrapper instead. The wrapper spools the raw payload, then execs
the app's real hook with the same argv and the same bytes on stdin — so Petdex behaves
identically and we get full fidelity. No toolchain, no rebuild.

The friction: `agent_hooks.zig` rewrites those configs and its dedup keys on the literal
path `~/.petdex/bin/petdex-hook`, so our commands are not recognised as "current". The app
would therefore add its own hook lines alongside ours and each event would fire twice —
visually doubled animations for Petdex, one clean copy for us. Needs verifying against the
merge logic before adopting; a doubled event is survivable but sloppy.

## Requirement: force-combine existing XP

When the universal feed lands, the combined state must be **seeded by force-combining the
existing aggregated XP from all nine profiles**, not started from zero. The pet has nine
per-profile ledgers today; the combined ledger is the new single source of truth. No
progress may be lost in the switch.

## Status

- Fork created, toolchain stood up, stock build reproducible: `zig 0.16.0` from Zig's own
  index + `Railly/native` @ `c0b10d02` + `scripts/patch-native-sdk.sh` -> `native build`.
  Scripts live in `.build/`; heavy artefacts are gitignored.
- Tap implemented in `hook_server.zig`; `native test .` = **263/263 pass** with it, and
  upstream's hook stdin regression still passes.
- Not yet done: the consumer that drains `evo-queue/` into the combined ledger; installing
  the patched app over the stock one; the force-combine seeding.

## Open decisions

- **Install our build or not.** The tap only operates in an app we built. Installing it
  over `/Applications/Petdex.app` is user-visible, and macOS distribution needs local
  notarization (`scripts/sign-macos.sh`).
- Whether the combined ledger makes the per-profile pets read the same state (one pet
  everywhere) or keeps per-profile rendering with an aggregate driving the desktop pet.
- Package format for an evolving pet: multiple atlases (one per stage/form) plus a stage
  map, since `pet.json` references exactly one spritesheet.
