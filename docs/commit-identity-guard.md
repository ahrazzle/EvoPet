# Commit identity guard

Every commit published here must be attributable to a public identity. An
internal agent or tool name must never appear as the author, the committer, or a
`Co-authored-by:` trailer of a published commit — a technically valid mail
address does not make the name publishable.

## Why this exists

A local `user.name` is not the only thing that decides the identity of a commit
that lands here:

- A **squash merge mints the author name from the GitHub account profile** at
  merge time, not from the branch's commits or from local git config. A branch
  whose commits are all correctly attributed still lands under whatever name the
  merging account carries.
- GitHub adds a **`Co-authored-by:` trailer** to that squash commit whenever the
  squasher differs from the commit author, which publishes the author identity a
  second time, in the message.

So the account profile name is the real control, and this guard is the net under
it: it runs before the commit exists, before the push, and on the server for
every PR and every push to `main`.

## Enable it locally (once per clone)

```bash
git config core.hooksPath .githooks
```

Hooks are not shared by `git clone`; the repository cannot turn them on for you.
CI runs the same check regardless, so a clone with the hooks off is caught, not
exempt.

## What it refuses

| Check | Example that is refused |
|---|---|
| Author / committer name matches the denylist | an internal agent name in `%an` or `%cn` |
| Author / committer address is not public | `someone@team6.local`, `x@box.lan`, an address with no TLD |
| A `Co-authored-by:` trailer names a denylisted name or a non-public address | a squash commit carrying the agent identity as a co-author |
| `EVOPET_IDENTITY_ALLOWLIST` is set and the address is not on it | any identity outside the allowed set |

## Configuration

The internal names are deliberately **not** in this repository.

| Source | Used by |
|---|---|
| `EVOPET_IDENTITY_DENYLIST` (comma or space separated) | hooks and CI |
| `EVOPET_IDENTITY_DENYLIST_FILE` (one per line) | hooks |
| `<git-dir>/evopet-identity-denylist` (default file, if present) | hooks |
| Repository variable `EVOPET_IDENTITY_DENYLIST` | CI (`identity-guard.yml`) |
| `EVOPET_IDENTITY_ALLOWLIST` (optional, comma separated) | hooks and CI |

Denylist entries are ERE fragments, matched case-insensitively against names,
addresses and trailers as whole tokens, so `smoke` does not match `smoketest`.
A local copy of the list in `<git-dir>/evopet-identity-denylist` is untracked by
construction and is the recommended way to run the hooks with the same list the
CI uses.

## Running it by hand

```bash
scripts/check-commit-identities.sh HEAD                 # one commit
scripts/check-commit-identities.sh origin/main..HEAD    # what a PR adds
scripts/check-commit-identities.sh --range=<base>..<head>
```

## If it fires

Fix the identity at commit time. Do not rewrite a published record as a habit:
it changes SHAs every clone and every open PR is built on, and GitHub Support is
the only way to clear the leftovers.

```bash
git commit --amend --author='Public Name <public@address>'
GIT_AUTHOR_NAME='Public Name' GIT_AUTHOR_EMAIL='public@address' git commit
```
