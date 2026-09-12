//! The auto-upload preference both halves of EvoPet share:
//! `~/.evopet/settings.json`.
//!
//! The desktop app owns the switch (Settings -> Pet library) and writes
//! the file the moment the user moves it; the hatch CLI reads the same
//! bytes before publishing a freshly hatched pet. Neither side may name
//! the path, the key, or the document shape a second time, so all three
//! live here and the CLI's half mirrors this file.
//!
//! Preferences only. The growth ledger is `~/.evopet/state.json` and
//! stays there: one write path per file is what keeps a growth update
//! from being able to clobber a choice the user made.

const std = @import("std");
const plat = @import("plat.zig");

/// The file, relative to the user's home directory.
pub const relative_path = ".evopet/settings.json";

/// The one member the document carries.
pub const key = "autoUpload";

/// What an absent key, an absent file, an unreadable file, or an
/// unusable value resolves to. The user's call was "auto upload is the
/// default with an off switch", so the default can only be true: only an
/// explicit false in the file turns publishing off.
pub const default_auto_upload = true;

/// The document for a switch state, byte-for-byte the contract's shape:
/// `{"autoUpload": true}`.
///
/// Written whole on every change. It is a preference and not a journal,
/// so there is no other member to preserve and nothing to merge.
pub fn documentFor(enabled: bool) []const u8 {
    return if (enabled) "{\"autoUpload\": true}" else "{\"autoUpload\": false}";
}

fn isJsonSpace(byte: u8) bool {
    return byte == ' ' or byte == '\t' or byte == '\r' or byte == '\n';
}

/// Whether a hatched pet is published, read from `settings.json` bytes.
///
/// One key/value pair is looked up, not a document validated — the same
/// tolerance the app's other settings file gets — so a file that has been
/// reformatted, reordered, or extended by a newer CLI still yields the
/// user's stated intent. What it will not do is guess: a missing key, a
/// value that is not a boolean (`falsehood`, `"false"`, a truncated
/// file), or bytes that are not JSON at all answer the default.
///
/// Reading never writes, so a malformed file is left exactly as found.
pub fn autoUploadFrom(json: []const u8) bool {
    const wanted = "\"" ++ key ++ "\"";
    var search: usize = 0;
    while (search < json.len) {
        const relative = std.mem.indexOf(u8, json[search..], wanted) orelse return default_auto_upload;
        const at = search + relative;
        search = at + 1;
        // A member key sits at the start of the object or after a comma.
        // Anchoring here is what keeps a display name, a description, or
        // any string that merely mentions the word from claiming the
        // setting.
        var before = at;
        while (before > 0 and isJsonSpace(json[before - 1])) before -= 1;
        if (before == 0) continue;
        if (json[before - 1] != '{' and json[before - 1] != ',') continue;
        var after = at + wanted.len;
        while (after < json.len and isJsonSpace(json[after])) after += 1;
        if (after >= json.len or json[after] != ':') continue;
        after += 1;
        while (after < json.len and isJsonSpace(json[after])) after += 1;
        if (booleanAt(json[after..])) |value| return value;
    }
    return default_auto_upload;
}

/// A bare `true` or `false` that ends where a value can end. A longer
/// word or a quoted one is a different value than the contract defines,
/// and reads as no value at all.
fn booleanAt(rest: []const u8) ?bool {
    if (std.mem.startsWith(u8, rest, "true") and valueEndsAt(rest["true".len..])) return true;
    if (std.mem.startsWith(u8, rest, "false") and valueEndsAt(rest["false".len..])) return false;
    return null;
}

fn valueEndsAt(rest: []const u8) bool {
    if (rest.len == 0) return true;
    return isJsonSpace(rest[0]) or rest[0] == ',' or rest[0] == '}';
}

/// Read the preference from `path`. A file that is not there resolves to
/// the default, so nothing is ever created by reading.
pub fn readFromPath(path: []const u8, buf: []u8) bool {
    const json = plat.readFile(path, buf) orelse return default_auto_upload;
    return autoUploadFrom(json);
}

/// Write the preference to `path`, creating `~/.evopet/` on the first
/// switch use. Returns whether the bytes landed.
pub fn writeToPath(path: []const u8, enabled: bool) bool {
    return plat.writeFile(path, documentFor(enabled));
}

/// `path` for a home directory.
pub fn pathFor(buf: []u8, home: []const u8) ?[]const u8 {
    return std.fmt.bufPrint(buf, "{s}/{s}", .{ home, relative_path }) catch null;
}

// ------------------------------------------------------------------ tests

test "the document is the contract's shape in both states" {
    try std.testing.expectEqualStrings("{\"autoUpload\": true}", documentFor(true));
    try std.testing.expectEqualStrings("{\"autoUpload\": false}", documentFor(false));
    // What is written is what is read back, both ways.
    try std.testing.expect(autoUploadFrom(documentFor(true)));
    try std.testing.expect(!autoUploadFrom(documentFor(false)));
}

test "an absent key is on: the default cannot be off" {
    try std.testing.expect(autoUploadFrom("{}"));
    try std.testing.expect(autoUploadFrom(""));
    try std.testing.expect(autoUploadFrom("{\"otherKey\": false}"));
    try std.testing.expect(autoUploadFrom("{\"active_pet\":\"tamahermes\"}"));
}

test "only an explicit false turns publishing off" {
    try std.testing.expect(!autoUploadFrom("{\"autoUpload\": false}"));
    try std.testing.expect(!autoUploadFrom("{\"autoUpload\":false}"));
    // Whitespace is not a meaning, and the member need not come first.
    try std.testing.expect(!autoUploadFrom("{\n  \"autoUpload\"\t:  false\n}"));
    try std.testing.expect(!autoUploadFrom("{\"other\":1,\"autoUpload\":false,\"more\":2}"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\": true}"));
}

test "the word as a value or inside a longer key is not the setting" {
    try std.testing.expect(autoUploadFrom("{\"name\":\"autoUpload\"}"));
    try std.testing.expect(autoUploadFrom("{\"description\":\"autoUpload stays on\"}"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload_enabled\":false}"));
    // A fake mention before the real key must not swallow it.
    try std.testing.expect(!autoUploadFrom("{\"name\":\"autoUpload\",\"autoUpload\":false}"));
}

test "malformed bytes read the default instead of guessing" {
    try std.testing.expect(autoUploadFrom("{\"autoUpload\":"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\": fals"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\": falsehood}"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\": \"false\"}"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\": 0}"));
    try std.testing.expect(autoUploadFrom("{\"autoUpload\":[]}"));
    try std.testing.expect(autoUploadFrom("not json at all"));
}

test "the file round-trips, and a malformed read leaves it untouched" {
    var test_dir = std.testing.tmpDir(.{});
    defer test_dir.cleanup();
    var path_buf: [512]u8 = undefined;
    const path = std.fmt.bufPrint(
        &path_buf,
        ".zig-cache/tmp/{s}/.evopet/settings.json",
        .{test_dir.sub_path[0..]},
    ) catch unreachable;

    var read_buf: [512]u8 = undefined;
    // Nothing on disk yet: the default, and still nothing on disk.
    try std.testing.expect(readFromPath(path, &read_buf));
    try std.testing.expect(plat.readFile(path, &read_buf) == null);

    // The first write creates the directory as well as the file.
    try std.testing.expect(writeToPath(path, false));
    try std.testing.expect(!readFromPath(path, &read_buf));
    try std.testing.expectEqualStrings("{\"autoUpload\": false}", plat.readFile(path, &read_buf).?);

    // A malformed file reads the default and is not repaired on disk.
    const broken = "{\"autoUpload\": tru";
    try std.testing.expect(plat.writeFile(path, broken));
    try std.testing.expect(readFromPath(path, &read_buf));
    try std.testing.expectEqualStrings(broken, plat.readFile(path, &read_buf).?);
}
