#!/bin/sh
# Commit identity guard.
#
# A commit that reaches a public repository must be attributable to a public
# identity. An internal agent/tool name or a private mail domain must never
# appear as the author, the committer, or a `Co-authored-by:` trailer of a
# published commit — the mail address being technically valid does not make the
# name publishable.
#
# Run by:
#   .githooks/commit-msg   one commit, before it exists (catches `--author`)
#   .githooks/pre-push     every commit about to leave the machine
#   .github/workflows/identity-guard.yml  every PR and every push to main, so a
#                          commit created server-side (a squash merge builds its
#                          author from the account profile, not from local git
#                          config) is still caught instead of being invisible.
#
# Usage:
#   scripts/check-commit-identities.sh <rev> [<rev>...]      # scan commits
#   scripts/check-commit-identities.sh <base>..<head>        # scan a range
#   scripts/check-commit-identities.sh --pre-push            # reads hook stdin
#   scripts/check-commit-identities.sh --message-file <file> # commit-msg hook
#
# Configuration — the internal names themselves are never committed here:
#   EVOPET_IDENTITY_DENYLIST       ERE fragments (comma or space separated),
#                                  matched case-insensitively against names,
#                                  e-mails and trailers as whole tokens
#   EVOPET_IDENTITY_DENYLIST_FILE  same, one per line; defaults to
#                                  <git-dir>/evopet-identity-denylist when present
#   EVOPET_IDENTITY_ALLOWLIST      when set, an e-mail must also match one of
#                                  these ERE fragments, on top of being public
# In CI the denylist is supplied from the repository variable of the same name.
set -eu

SOH=$(printf '\001')
TAB=$(printf '\t')
REC="----commit-identity-guard-record----"
ZERO=0000000000000000000000000000000000000000

work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT INT TERM
: >"$work/problems"
: >"$work/counts"

say() { printf '%s\n' "$*" >&2; }
problem() { printf '%s\n' "$*" >>"$work/problems"; }
lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

load_config() {
  deny=""
  if [ -n "${EVOPET_IDENTITY_DENYLIST:-}" ]; then
    deny="$EVOPET_IDENTITY_DENYLIST"
  fi
  deny_file="${EVOPET_IDENTITY_DENYLIST_FILE:-}"
  if [ -z "$deny_file" ]; then
    git_dir=$(git rev-parse --git-dir 2>/dev/null || echo "")
    if [ -n "$git_dir" ] && [ -f "$git_dir/evopet-identity-denylist" ]; then
      deny_file="$git_dir/evopet-identity-denylist"
    fi
  fi
  if [ -n "$deny_file" ] && [ -f "$deny_file" ]; then
    deny="$deny $(tr '\n' ' ' <"$deny_file")"
  fi
  deny=$(printf '%s' "$deny" | tr ',' ' ')
  deny_lc=$(lower "$deny")
  allow_lc=$(lower "${EVOPET_IDENTITY_ALLOWLIST:-}" | tr ',' ' ')
}

# token_offends <value> <patterns> -> 0 when a denylist token appears in the value
# as a whole token. Substring matching is deliberately NOT used: an internal name
# that happens to be a substring of a legitimate longer word (a company domain,
# say) must not be treated as a leak.
token_offends() {
  [ -n "$1" ] || return 1
  for pat in $2; do
    [ -n "$pat" ] || continue
    if printf '%s' "$1" | grep -Eiq "(^|[^[:alnum:]_-])${pat}([^[:alnum:]_-]|\$)"; then
      return 0
    fi
  done
  return 1
}

# name_offends <name> -> 0 when the name matches a denylist token
name_offends() {
  token_offends "$1" "$deny"
}

# email_offends <email> -> 0 when the address is internal or not public
email_offends() {
  addr=$(lower "$1")
  [ -n "$addr" ] || return 0
  case "$addr" in
    *"<"*|*">"*|*" "*) return 0 ;;
  esac
  if token_offends "$addr" "$deny_lc"; then
    return 0
  fi
  domain=${addr##*@}
  [ "$domain" != "$addr" ] || return 0        # no @ at all
  case "$domain" in
    *.*) ;;
    *) return 0 ;;                            # bare hostname: no public TLD
  esac
  case "$domain" in
    *.local|*.lan|*.internal|*.localhost|*.home|*.test|*.invalid|*.example|localhost)
      return 0 ;;
  esac
  if [ -n "$allow_lc" ]; then
    for pat in $allow_lc; do
      [ -n "$pat" ] || continue
      case "$addr" in *"$pat"*) return 1 ;; esac
    done
    return 0
  fi
  return 1
}

check_identity() { # <sha> <field> <name> <email>
  if name_offends "$3"; then
    problem "$1 $2 name is not a public identity: '$3'"
  fi
  if email_offends "$4"; then
    problem "$1 $2 address is not publicly attributable: '$4'"
  fi
}

check_trailer_line() { # <sha> <raw trailer line>
  sha=$1
  line=$2
  trailer_name=$(printf '%s' "$line" | sed -e 's/.*:[[:space:]]*//' -e 's/[[:space:]]*<.*$//')
  trailer_email=$(printf '%s' "$line" | sed -e 's/.*<//' -e 's/>.*$//')
  if name_offends "$trailer_name"; then
    problem "$sha Co-authored-by name is not a public identity: '$trailer_name'"
  fi
  if email_offends "$trailer_email"; then
    problem "$sha Co-authored-by address is not publicly attributable: '$trailer_email'"
  fi
}

scan_revs() { # rev-list / git log arguments: a range, or explicit revisions
  [ "$#" -gt 0 ] || return 0
  count=$(git rev-list --count "$@" 2>/dev/null || echo 0)
  [ "${count:-0}" -gt 0 ] || return 0
  printf '%s\n' "$count" >>"$work/counts"
  # The same arguments go to git log, not a materialized SHA list: `git log <sha>`
  # walks that commit's ancestors, while the range/`-n 1` form stays bounded.
  git log --no-patch --format="%H${SOH}%an${SOH}%ae${SOH}%cn${SOH}%ce" "$@" |
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    # POSIX parameter expansion instead of IFS splitting: names contain spaces,
    # and IFS=$'\\001' does not split under every /bin/sh.
    sha=${line%%"$SOH"*}
    rest=${line#*"$SOH"}
    an=${rest%%"$SOH"*}
    rest=${rest#*"$SOH"}
    ae=${rest%%"$SOH"*}
    rest=${rest#*"$SOH"}
    cn=${rest%%"$SOH"*}
    ce=${rest#*"$SOH"}
    [ "$sha" != "$line" ] || continue
    check_identity "$sha" "author" "$an" "$ae"
    check_identity "$sha" "committer" "$cn" "$ce"
  done
  git log --no-patch --format="${REC}%H%n%B" "$@" |
  awk -v rec="$REC" -v tab="$TAB" '
    index($0, rec) == 1 { sha = substr($0, length(rec) + 1); next }
    sha != "" && tolower($0) ~ /^[[:space:]]*co-authored-by:/ { print sha tab $0 }
  ' |
  while IFS= read -r line; do
    [ -n "$line" ] || continue
    sha=${line%%"$TAB"*}
    trailer=${line#*"$TAB"}
    [ "$sha" != "$line" ] || continue
    check_trailer_line "$sha" "$trailer"
  done
}

scan_tip() { # <rev>
  case "$1" in
    ""|"$ZERO") return 0 ;;
  esac
  git cat-file -e "$1^{commit}" 2>/dev/null || return 0
  scan_revs -n 1 "$1"
}

scan_unpushed() { # <rev>
  if git rev-parse --verify --quiet refs/remotes/origin >/dev/null 2>&1; then
    scan_revs "$1" --not --remotes=origin
  else
    scan_revs "$1" --not --remotes
  fi
  scan_tip "$1"
}

scan_spec() { # <base>..<head> | <rev>
  spec=$1
  case "$spec" in
    *..*)
      base=${spec%%..*}
      head=${spec##*..}
      case "$base" in
        ""|"$ZERO") scan_tip "$head" ;;
        *)
          if git merge-base --is-ancestor "$base" "$head" 2>/dev/null; then
            scan_revs "$base..$head"
          else
            say "identity-guard: '$base' is not an ancestor of '$head'; scanning what is not on any remote"
            scan_unpushed "$head"
          fi ;;
      esac ;;
    *) scan_tip "$spec" ;;
  esac
}

pre_push() {
  any=0
  while read -r local_ref local_sha remote_ref remote_sha; do
    [ -n "${local_sha:-}" ] || continue
    case "$local_ref" in "(delete)") continue ;; esac
    case "$local_sha" in "$ZERO") continue ;; esac
    any=1
    if [ "${remote_sha:-$ZERO}" = "$ZERO" ]; then
      scan_unpushed "$local_sha"
    elif git merge-base --is-ancestor "$remote_sha" "$local_sha" 2>/dev/null; then
      scan_revs "$remote_sha..$local_sha"
    else
      say "identity-guard: $remote_ref is being rewritten; scanning what is not on any remote"
      scan_unpushed "$local_sha"
    fi
  done
  [ "$any" -eq 1 ] || return 0
}

message_file() { # <path> [<pending sha>]
  [ -f "$1" ] || { say "identity-guard: no such message file: $1"; exit 2; }
  pending=${2:-$ZERO}
  an=${GIT_AUTHOR_NAME:-$(git config user.name || true)}
  ae=${GIT_AUTHOR_EMAIL:-$(git config user.email || true)}
  cn=${GIT_COMMITTER_NAME:-$an}
  ce=${GIT_COMMITTER_EMAIL:-$ae}
  printf '1\n' >>"$work/counts"
  check_identity "(pending commit)" "author" "$an" "$ae"
  check_identity "(pending commit)" "committer" "$cn" "$ce"
  grep -iE '^[[:space:]]*co-authored-by:[[:space:]]*.*<[^>]+>' "$1" 2>/dev/null |
  while IFS= read -r line; do
    check_trailer_line "(pending commit)" "$line"
  done
}

load_config

case "${1:-}" in
  --help|-h)
    sed -n '2,32p' "$0"; exit 0 ;;
  --pre-push)
    pre_push ;;
  --message-file)
    [ "$#" -ge 2 ] || { say "identity-guard: --message-file needs a path"; exit 2; }
    message_file "$2" "${3:-$ZERO}" ;;
  --range)
    [ "$#" -ge 2 ] || { say "identity-guard: --range needs <base>..<head>"; exit 2; }
    scan_spec "$2" ;;
  --range=*)
    scan_spec "${1#--range=}" ;;
  "")
    say "identity-guard: nothing to scan (pass revisions, a range, --pre-push or --message-file)"
    exit 2 ;;
  *)
    for rev in "$@"; do scan_tip "$rev"; done ;;
esac

scanned=$(awk '{s+=$1} END {print s+0}' "$work/counts")

if [ -s "$work/problems" ]; then
  say ""
  say "identity-guard: refusing to publish commits that are not publicly attributable."
  say ""
  sort -u "$work/problems" | while IFS= read -r line; do
    [ -n "$line" ] && say "  - $line"
  done
  say ""
  say "Fix the identity at commit time; do not rewrite the published record afterwards:"
  say "  git commit --amend --author='<public name> <public@address>'"
  say "  GIT_AUTHOR_NAME=... GIT_AUTHOR_EMAIL=... git commit    # going forward"
  say "Agents and automation commit under the repository owner's public identity,"
  say "never under an internal agent name."
  say ""
  say "See docs/commit-identity-guard.md."
  exit 1
fi

say "identity-guard: clean ($scanned identity check(s) over the scanned commits)"
exit 0
