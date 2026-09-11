#!/usr/bin/env bash
# Prove we can build petdex-desktop-native from our own fork, without touching
# the user's installed /Applications/Petdex.app. Recipe mirrored from
# .github/workflows/desktop-native-ci.yml (macOS leg).
set -euo pipefail

WORK=/Users/kethuda/EvoPet/.build
REPO=/Users/kethuda/EvoPet
ZIG_VER=0.16.0
ARCH=$(uname -m); [ "$ARCH" = "arm64" ] && ARCH=aarch64
SDK_BRANCH=feat/floating-window-0.5.3
SDK_REF=c0b10d027efa490fc99a3bc7f1cf88b015999d45

mkdir -p "$WORK"
stage() { echo; echo "=== [$(date +%H:%M:%S)] $* ==="; }

stage "1/6 fetch zig $ZIG_VER ($ARCH)"
if [ ! -x "$WORK/zig/zig" ]; then
  # Derive the tarball URL from Zig's own index rather than assuming the
  # naming convention (it is zig-<arch>-macos-<ver>, not zig-macos-<arch>-<ver>).
  ZIG_URL=$(curl -fsSL https://ziglang.org/download/index.json \
    | python3 -c "import json,sys; print(json.load(sys.stdin)['$ZIG_VER']['${ARCH}-macos']['tarball'])")
  echo "zig tarball: $ZIG_URL"
  curl -fsSL "$ZIG_URL" -o "$WORK/zig.tar.xz"
  mkdir -p "$WORK/zig"
  tar -xf "$WORK/zig.tar.xz" -C "$WORK/zig" --strip-components=1
fi
export PATH="$WORK/zig:$PATH"
zig version

stage "2/6 clone pinned SDK"
if [ ! -d "$WORK/native-sdk/.git" ]; then
  git clone --depth 1 --branch "$SDK_BRANCH" https://github.com/Railly/native.git "$WORK/native-sdk"
fi
git -C "$WORK/native-sdk" fetch --depth 1 origin "$SDK_REF"
git -C "$WORK/native-sdk" checkout --detach "$SDK_REF"
export NATIVE_SDK_PATH="$WORK/native-sdk"
git -C "$NATIVE_SDK_PATH" rev-parse HEAD

stage "3/6 apply Petdex SDK patches (must match the pin)"
cd "$REPO" && scripts/patch-native-sdk.sh

stage "4/6 build the native CLI from the pinned SDK"
cd "$NATIVE_SDK_PATH" && zig build cli
NATIVE_CLI="$NATIVE_SDK_PATH/zig-out/bin/native"
"$NATIVE_CLI" --version || true

stage "5/6 build petdex-desktop-native"
cd "$REPO/packages/petdex-desktop-native"
"$NATIVE_CLI" build -Dcpu=baseline -Dtrace=off
ls -lh zig-out/bin/

stage "6/6 upstream's own hook stdin regression test"
python3 tests/hook_stdin_test.py ./zig-out/bin/petdex-desktop-native

stage "DONE — stock build reproducible from our fork"
