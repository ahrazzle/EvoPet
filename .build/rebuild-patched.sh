#!/usr/bin/env bash
# Rebuild our patched app from the fork and run the app's own tests.
set -euo pipefail
WORK=/Users/kethuda/EvoPet/.build
REPO=/Users/kethuda/EvoPet
export PATH="$WORK/zig:$PATH"
export NATIVE_SDK_PATH="$WORK/native-sdk"
NATIVE_CLI="$NATIVE_SDK_PATH/zig-out/bin/native"
stage() { echo; echo "=== [$(date +%H:%M:%S)] $* ==="; }

stage "build with the evopet tap"
cd "$REPO/packages/petdex-desktop-native"
"$NATIVE_CLI" build -Dcpu=baseline -Dtrace=off
ls -lh zig-out/bin/

stage "upstream hook stdin regression (must still pass)"
python3 tests/hook_stdin_test.py ./zig-out/bin/petdex-desktop-native

stage "the app's own unit tests (must still pass)"
cd "$REPO/packages/petdex-desktop-native"
zig build test 2>&1 | tail -20

stage "DONE"
