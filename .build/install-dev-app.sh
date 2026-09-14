#!/usr/bin/env bash
# Build, package and install our patched app as a PARALLEL bundle.
#
# The stock /Applications/Petdex.app is deliberately left untouched: the tap
# only exists in a build of ours, and keeping the two separate means reverting
# is one command (see the footer) and no Petdex update can overwrite the tap.
#
# The bundle identity is *not* changed. app.zon's id is used at runtime as the
# keychain service (desktop_auth.zig) and passed to the SDK (main.zig), so a
# renamed bundle would be signed out and could not answer petdex:// links the
# same way. Only the install path distinguishes the two.
set -euo pipefail
WORK=/Users/kethuda/EvoPet/.build
REPO=/Users/kethuda/EvoPet
APP="$HOME/Applications/EvoPet.app"
export PATH="$WORK/zig:$PATH"
export NATIVE_SDK_PATH="$WORK/native-sdk"
NATIVE_CLI="$NATIVE_SDK_PATH/zig-out/bin/native"

cd "$REPO/packages/petdex-desktop-native"
"$NATIVE_CLI" build -Dcpu=baseline -Dtrace=off
rm -rf "$WORK/pkg-macos"
"$NATIVE_CLI" package --target macos \
  --binary zig-out/bin/petdex-desktop-native \
  --signing adhoc --output "$WORK/pkg-macos"

mkdir -p "$HOME/Applications"
rm -rf "$APP"
cp -R "$WORK/pkg-macos" "$APP"
codesign -dv "$APP" 2>&1 | grep -E 'Identifier|Signature'

# Free the hook-server port, then run ours. It re-points
# ~/.petdex/bin/petdex-hook at itself on boot, which is what routes every
# agent's hooks through the tap.
pkill -f "petdex-desktop-native" 2>/dev/null || true
sleep 3
open "$APP"
sleep 8
curl -s -m 3 http://127.0.0.1:7777/health || { echo "hook server did NOT come up" >&2; exit 1; }
echo
echo "installed: $APP"
echo "symlink  : $(readlink ~/.petdex/bin/petdex-hook)"
echo
# to revert: pkill -f petdex-desktop-native && open -a /Applications/Petdex.app
