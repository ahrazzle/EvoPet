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

### Tap option C — be inside the pipeline: the real answer

Every agent's event, without exception, passes through the app's hook server. Patch
`hook_server.zig`'s POST handlers for `/state` and `/bubble` to append the raw request body
to our own append-only spool. One file, two call sites, and it catches **all** agents by
construction — including opencode, which never touches the binary and would be missed by
patching the hook runner instead.

This requires building our own app from this fork, which is the point of forking it.

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

## Open decisions

- **C or D.** Own the build and patch the hook server (robust, full fidelity, costs the
  Native SDK toolchain and a locally signed app), or keep the stock app and take the
  wrapper path (no toolchain, doubled events to verify).
- Whether the combined ledger makes the per-profile pets read the same state (one pet
  everywhere) or keeps per-profile rendering with an aggregate driving the desktop pet.
- Package format for an evolving pet: multiple atlases (one per stage/form) plus a stage
  map, since `pet.json` references exactly one spritesheet.
