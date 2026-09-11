#!/usr/bin/env bash
# End-to-end proof of the EvoPet tap, in an isolated HOME so nothing of the
# user's real pet or Petdex state is touched.
set -uo pipefail
BIN=/Users/kethuda/EvoPet/packages/petdex-desktop-native/zig-out/bin/petdex-desktop-native
TESTHOME=/tmp/evopet-tap-test
rm -rf "$TESTHOME"; mkdir -p "$TESTHOME"

echo "=== freeing :7777 (quitting the installed app; restored at the end) ==="
osascript -e 'tell application "Petdex" to quit' 2>/dev/null || true
sleep 3
lsof -nP -iTCP:7777 -sTCP:LISTEN >/dev/null 2>&1 && echo "WARNING: :7777 still held" || echo ":7777 free"

echo "=== launching OUR patched build with HOME=$TESTHOME ==="
HOME="$TESTHOME" "$BIN" >"$TESTHOME/app.log" 2>&1 &
APP_PID=$!
sleep 6
if ! kill -0 "$APP_PID" 2>/dev/null; then
  echo "APP DIED — log:"; cat "$TESTHOME/app.log"; exit 1
fi
echo "app alive (pid $APP_PID)"
TOKEN=$(cat "$TESTHOME/.petdex/runtime/update-token" 2>/dev/null || echo "")
echo "token: ${#TOKEN} chars"
echo "server: $(curl -s -m 3 http://127.0.0.1:7777/health || echo 'no response')"

echo
echo "=== 1. a real claude-code hook, through the hook binary exactly as agents call it ==="
echo '{"session_id":"e2e-1","tool_name":"Bash","cwd":"/tmp/proj","hook_event_name":"PreToolUse"}' \
  | HOME="$TESTHOME" "$BIN" bubble pre claude-code

echo "=== 2. a direct HTTP post, exactly as opencode calls it ==="
curl -s -m 3 -X POST -H "x-petdex-update-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"text":"Reading files","title":"opencode session","agent_source":"opencode","busy":true}' \
  http://127.0.0.1:7777/bubble
echo
echo "=== 3. a /state event ==="
curl -s -m 3 -X POST -H "x-petdex-update-token: $TOKEN" -H 'Content-Type: application/json' \
  -d '{"state":"jumping","duration":800}' http://127.0.0.1:7777/state
echo
sleep 1

echo
echo "=== evo-queue contents ==="
Q="$TESTHOME/.petdex/runtime/evo-queue"
if [ -d "$Q" ]; then
  ls -la "$Q"
  echo "--- payloads (verbatim, as delivered) ---"
  for f in "$Q"/*; do echo "[$(basename "$f")]"; cat "$f"; echo; done
else
  echo "NO QUEUE DIRECTORY — tap did not fire"
fi

echo
echo "=== 4. does an UNAUTHENTICATED post get spooled? (must NOT) ==="
curl -s -m 3 -o /dev/null -w 'no-token post -> %{http_code}\n' -X POST -d '{"state":"jumping"}' http://127.0.0.1:7777/state
sleep 1
[ -d "$Q" ] && echo "queue file count now: $(ls "$Q" | wc -l | tr -d ' ')"

echo
echo "=== cleanup: kill our build, restore the user's app ==="
kill "$APP_PID" 2>/dev/null || true
sleep 2
open -a Petdex
sleep 6
osascript -e 'tell application "System Events" to tell process "Petdex" to get {title, size} of every window' 2>&1 | head -2
