//! The installed-pet catalog: the fixed table Settings lists and the
//! slug lookup both "pick this pet" entry points share.
//!
//! Extracted from main.zig (#613). Holds no effects and no model, so the
//! ceiling and the lookup can move without touching the app loop.
//!
//! Every entry carries whether its package is evolution-capable. This
//! app draws only capable packages, so the catalog has to remember the
//! distinction for the two consumers that read it: the Settings list
//! (which shows the rest with a reason) and the selection/rotation gate.

const std = @import("std");

// 32 silently truncated real installs: this machine had 47 pets across
// the two roots, so 15 of them never reached Settings. The ceiling is
// the thumbnail atlas, which registers as one image and has to fit the
// registry's 1MB slot: 96 cells of 48x52 is 0.91MB, and 128 would be
// 1.22MB.
pub const max_catalog = 96;

/// The key the EvoPet compiler writes into an EvoPet package's pet.json,
/// quoted as it appears in the file. Its value is the block the
/// evolution system reads: `{evolutionGates, maxLevel, topXp, curve}`.
pub const evopet_marker = "\"evopet\"";

/// Why a package is listed but not selectable. One sentence on the
/// surface that already lists it, so an exclusion is never silent — and
/// the only one, so the app does not grow a second vocabulary for the
/// same fact.
pub const incompatible_note = "not an EvoPet package \u{2014} no evolution stages";

pub const CatalogEntry = struct {
    name: [64]u8 = @splat(0),
    len: usize = 0,
    root: [160]u8 = @splat(0),
    root_len: usize = 0,
    /// Set from the bytes on disk (scan and install append), never
    /// inferred from a directory name: the marker lives inside pet.json.
    capable: bool = false,

    pub fn slice(self: *const CatalogEntry) []const u8 {
        return self.name[0..self.len];
    }
    pub fn rootSlice(self: *const CatalogEntry) []const u8 {
        return self.root[0..self.root_len];
    }
};
pub var catalog: [max_catalog]CatalogEntry = @splat(.{});
pub var catalog_len: usize = 0;

/// Whether a pet.json carries the `evopet` block. A stock Petdex package
/// is four fields and one sheet — no stages, no per-form art — so a
/// package without the marker cannot be drawn or advanced by the
/// evolution system.
///
/// The marker has to be a member whose value is an object, not the bare
/// word: the match is anchored (`{` or `,` before the key, `:` then `{`
/// after it) so a display name, a description, or a quoted string that
/// merely mentions `evopet` cannot claim one.
pub fn hasEvopetBlock(json: []const u8) bool {
    var search: usize = 0;
    while (search < json.len) {
        const relative = std.mem.indexOf(u8, json[search..], evopet_marker) orelse return false;
        const at = search + relative;
        search = at + 1;
        var before = at;
        while (before > 0 and isJsonSpace(json[before - 1])) before -= 1;
        if (before == 0 or (json[before - 1] != '{' and json[before - 1] != ',')) continue;
        var after = at + evopet_marker.len;
        while (after < json.len and isJsonSpace(json[after])) after += 1;
        if (after >= json.len or json[after] != ':') continue;
        after += 1;
        while (after < json.len and isJsonSpace(json[after])) after += 1;
        if (after < json.len and json[after] == '{') return true;
    }
    return false;
}

fn isJsonSpace(byte: u8) bool {
    return byte == ' ' or byte == '\t' or byte == '\r' or byte == '\n';
}

/// Entries selection and rotation may move inside. Read as a slice so a
/// test can build a catalog without touching the live one.
pub fn capableCount(entries: []const CatalogEntry) usize {
    var count: usize = 0;
    for (entries) |*entry| {
        if (entry.capable) count += 1;
    }
    return count;
}

/// First evolution-capable entry in catalog order: the boot fallback
/// when the saved pet is a stock package.
pub fn firstCapableIndex(entries: []const CatalogEntry) ?usize {
    for (entries, 0..) |*entry, i| {
        if (entry.capable) return i;
    }
    return null;
}

/// The selection gate, in one place. Index-based callers ask this instead
/// of reading the flag, so the bound check and the capability check can
/// never drift apart: an out-of-range index and a stock package are the
/// same answer.
pub fn selectableAt(entries: []const CatalogEntry, index: usize) bool {
    if (index >= entries.len) return false;
    return entries[index].capable;
}

/// The next evolution-capable entry after `active`, wrapping once.
/// Null means there is nowhere to rotate to: the rule is two capable
/// packages or none, because rotating *to* the pet already on screen
/// would stamp the day and leave the window unchanged, which is a
/// rotation that did not happen. Fewer than two capable packages
/// therefore makes rotation inert rather than letting it fall back onto
/// a stock package.
pub fn nextCapableIndex(entries: []const CatalogEntry, active: usize) ?usize {
    if (entries.len == 0) return null;
    if (capableCount(entries) < 2) return null;
    var offset: usize = 1;
    while (offset < entries.len) : (offset += 1) {
        const candidate = (active + offset) % entries.len;
        if (entries[candidate].capable) return candidate;
    }
    return null;
}

/// Slug to catalog index, the lookup both entry points into "pick this
/// pet" share: boot resolution (env/settings) and the petdex:// deep
/// link. Null means not installed, which each caller answers
/// differently — boot falls back to the first pet, a deep link ignores
/// the URL.
///
/// Deliberately unfiltered by capability: a stock package IS installed,
/// and callers use this to tell "on disk" from "must download". The
/// capability gate sits on selection instead, so a deep link to a stock
/// pet does not re-download what is already there.
pub fn catalogIndexOf(slug: []const u8) ?usize {
    if (slug.len == 0) return null;
    for (catalog[0..catalog_len], 0..) |*entry, i| {
        if (std.mem.eql(u8, entry.slice(), slug)) return i;
    }
    return null;
}

// ------------------------------------------------------------------ tests

test "the evopet marker is a keyed object, not a mention of the word" {
    // The shape our compiler writes, trimmed to the fields that matter.
    const capable =
        \\{"id":"tamahermes","displayName":"TamaHermes","description":"An evolving desktop companion.","spritesheetPath":"spritesheet.webp","evopet":{"evolutionGates":[11,23,32,45],"maxLevel":999,"topXp":998019880,"curve":"round(10 * (L - 1) ** 2 + (L - 1) ** 6 / 1000000000)"}}
    ;
    try std.testing.expect(hasEvopetBlock(capable));

    // A stock Petdex package: four fields, one sheet, no stages.
    const stock =
        \\{"id":"jack-the-drunk","displayName":"Jack the Drunk","description":"A swaggering chibi pirate pet.","spritesheetPath":"spritesheet.webp","kind":"object"}
    ;
    try std.testing.expect(!hasEvopetBlock(stock));

    // The word as a value must not claim the marker, quoted or not.
    try std.testing.expect(!hasEvopetBlock(
        \\{"id":"fake","displayName":"evopet","description":"says evopet here","spritesheetPath":"spritesheet.webp"}
    ));
    try std.testing.expect(!hasEvopetBlock(
        \\{"id":"fake","displayName":"Fake","description":"the \"evopet\" brand","spritesheetPath":"spritesheet.webp"}
    ));
    // Nor a member whose value is not an object.
    try std.testing.expect(!hasEvopetBlock(
        \\{"id":"fake","displayName":"Fake","evopet":"yes","spritesheetPath":"spritesheet.webp"}
    ));
    // Nor a longer key that merely contains the word: the match is the
    // whole quoted key, not a substring of one.
    try std.testing.expect(!hasEvopetBlock(
        \\{"id":"fake","displayName":"Fake","evopet_meta":{"a":1},"petdex":"x"}
    ));
    // Nor an empty/truncated file.
    try std.testing.expect(!hasEvopetBlock(""));
}

test "capable helpers count and pick only marked entries" {
    var entries: [3]CatalogEntry = @splat(.{});
    entries[1].capable = true;
    try std.testing.expectEqual(@as(usize, 1), capableCount(&entries));
    try std.testing.expectEqual(@as(?usize, 1), firstCapableIndex(&entries));

    entries[0].capable = true;
    try std.testing.expectEqual(@as(usize, 2), capableCount(&entries));
    try std.testing.expectEqual(@as(?usize, 0), firstCapableIndex(&entries));

    const none: [2]CatalogEntry = @splat(.{});
    try std.testing.expectEqual(@as(usize, 0), capableCount(&none));
    try std.testing.expect(firstCapableIndex(&none) == null);
}

test "one capable entry among stock ones: select it, but there is nowhere to rotate" {
    var entries: [3]CatalogEntry = @splat(.{});
    entries[1].capable = true;

    // Selection is the flag, and out of range is the same answer.
    try std.testing.expect(!selectableAt(&entries, 0));
    try std.testing.expect(selectableAt(&entries, 1));
    try std.testing.expect(!selectableAt(&entries, 2));
    try std.testing.expect(!selectableAt(&entries, 3));

    // Rotation: with one capable package there is no *other* pet to land
    // on, so the answer is null and the day leaves the pet alone.
    try std.testing.expect(nextCapableIndex(&entries, 0) == null);
    try std.testing.expect(nextCapableIndex(&entries, 1) == null);
    // Boot prefers the capable one wherever it sits.
    try std.testing.expectEqual(@as(?usize, 1), firstCapableIndex(&entries));
}

test "rotation steps over stock packages and wraps within the capable set" {
    var entries: [5]CatalogEntry = @splat(.{});
    entries[1].capable = true;
    entries[3].capable = true;

    // From a stock entry, the next capable one.
    try std.testing.expectEqual(@as(?usize, 1), nextCapableIndex(&entries, 0));
    // Skips the stock entry between them ...
    try std.testing.expectEqual(@as(?usize, 3), nextCapableIndex(&entries, 1));
    // ... and wraps back rather than running off the end.
    try std.testing.expectEqual(@as(?usize, 1), nextCapableIndex(&entries, 3));
    try std.testing.expectEqual(@as(?usize, 1), nextCapableIndex(&entries, 4));

    // An empty catalog, and a single capable entry, have nowhere to go.
    try std.testing.expect(nextCapableIndex(&[_]CatalogEntry{}, 0) == null);
    var single: [1]CatalogEntry = @splat(.{});
    single[0].capable = true;
    try std.testing.expect(nextCapableIndex(&single, 0) == null);
}
