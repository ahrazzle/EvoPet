//! Read-only projection of TamaHermes' schema-1 combined ledger. Never repairs it.
const std = @import("std");
const plat = @import("plat.zig");
pub const Status = enum { unavailable, invalid, ready };
pub const Snapshot = struct {
    status: Status = .unavailable,
    xp: u64 = 0,
    level: u16 = 1,
    gates: [4]u16 = .{ 11, 23, 32, 45 },
    gates_len: usize = 4,
    stats: [5]?u8 = @splat(null),
    updated: [64]u8 = @splat(0),
    updated_len: usize = 0,
    pub fn nextGate(self: Snapshot) ?u16 {
        for (self.gates[0..self.gates_len]) |gate| if (gate > self.level) return gate;
        return null;
    }
};
pub const max_bytes = 4 * 1024 * 1024;
pub const stat_names = [_][]const u8{ "energy", "mood", "health", "bond", "mess" };
pub fn xpForLevel(level: u16) u64 {
    const n: u64 = level - 1;
    const sixth = n * n * n * n * n * n;
    return 10 * n * n + (sixth + 500_000_000) / 1_000_000_000;
}
pub fn levelForXp(xp: u64) u16 {
    var lo: u16 = 1;
    var hi: u16 = 999;
    while (lo < hi) {
        const mid = lo + (hi - lo + 1) / 2;
        if (xpForLevel(mid) <= xp) lo = mid else hi = mid - 1;
    }
    return lo;
}
fn integer(value: std.json.Value) ?u64 {
    return switch (value) {
        .integer => |n| if (n >= 0) @intCast(n) else null,
        else => null,
    };
}
fn member(value: std.json.Value, key: []const u8) ?std.json.Value {
    return if (value == .object) value.object.get(key) else null;
}
pub fn parse(bytes: []const u8) Snapshot {
    const bad: Snapshot = .{ .status = .invalid };
    if (bytes.len > max_bytes) return bad;
    const doc = std.json.parseFromSlice(std.json.Value, std.heap.page_allocator, bytes, .{ .max_value_len = max_bytes }) catch return bad;
    defer doc.deinit();
    const root = doc.value;
    if (integer(member(root, "schemaVersion") orelse return bad) != 1) return bad;
    const contract = member(root, "levels") orelse return bad;
    if (integer(member(contract, "maxLevel") orelse return bad) != 999 or
        integer(member(contract, "topXp") orelse return bad) != 998019880) return bad;
    var bucket = root;
    if (member(root, "activePetId")) |id| {
        if (id != .string or id.string.len == 0) return bad;
        const pets = member(root, "pets") orelse return bad;
        bucket = member(pets, id.string) orelse return bad;
    } else if (member(root, "pets")) |pets| {
        if (pets != .object or pets.object.count() > 0) return bad;
    }
    const xp = integer(member(bucket, "xp") orelse return bad) orelse return bad;
    var result: Snapshot = .{ .status = .ready, .xp = xp, .level = levelForXp(xp) };
    if (member(root, "updatedAt")) |updated| {
        if (updated == .string and updated.string.len <= result.updated.len) {
            @memcpy(result.updated[0..updated.string.len], updated.string);
            result.updated_len = updated.string.len;
        }
    }
    if (member(root, "levels")) |levels| {
        if (levels != .object) return bad;
        if (member(levels, "maxLevel")) |max| {
            if (integer(max) != 999) return bad;
        }
        if (member(levels, "topXp")) |top| {
            if (integer(top) != 998019880) return bad;
        }
        if (member(levels, "evolutionGates")) |gates| {
            if (gates != .array or (gates.array.items.len == 0 or gates.array.items.len > 4)) return bad;
            result.gates_len = gates.array.items.len;
            var previous: u64 = 0;
            for (gates.array.items, 0..) |gate, i| {
                const n = integer(gate) orelse return bad;
                if (n <= previous or n > 999) return bad;
                result.gates[i] = @intCast(n);
                previous = n;
            }
        }
    }
    if (member(root, "stats")) |stats| {
        if (stats != .object) return bad;
        for (stat_names, 0..) |name, i| {
            if (member(stats, name)) |value| {
                const n = integer(value) orelse return bad;
                if (n > 100) return bad;
                result.stats[i] = @intCast(n);
            }
        }
    }
    return result;
}
pub fn read(home: []const u8) Snapshot {
    var path_buf: [4096]u8 = undefined;
    const path = std.fmt.bufPrint(&path_buf, "{s}/.evopet/state.json", .{home}) catch return .{};
    const bytes = std.heap.page_allocator.alloc(u8, max_bytes + 1) catch return .{ .status = .invalid };
    defer std.heap.page_allocator.free(bytes);
    const contents = plat.readFile(path, bytes) orelse return .{};
    if (contents.len > max_bytes) return .{ .status = .invalid };
    return parse(contents);
}
test "curve and level boundaries match the pet ladder" {
    const rung = [_]u16{ 1, 10, 50, 99, 200, 500, 999 };
    const expected = [_]u64{ 0, 810, 24024, 96926, 458114, 17928445, 998019880 };
    for (rung, expected) |level, xp| try std.testing.expectEqual(xp, xpForLevel(level));
    for (1..1000) |n| {
        const level: u16 = @intCast(n);
        try std.testing.expectEqual(level, levelForXp(xpForLevel(level)));
        if (level > 1) try std.testing.expectEqual(level - 1, levelForXp(xpForLevel(level) - 1));
    }
    try std.testing.expectEqual(@as(u16, 999), levelForXp(std.math.maxInt(u64)));
}
test "active bucket, shared stats and creator gates override stale labels" {
    const s = parse("{\"schemaVersion\":1,\"xp\":99999,\"level\":999,\"activePetId\":\"toast\",\"pets\":{\"toast\":{\"xp\":810}},\"stats\":{\"energy\":82,\"mess\":3},\"levels\":{\"maxLevel\":999,\"topXp\":998019880,\"evolutionGates\":[12,24,36,48]}}");
    try std.testing.expectEqual(.ready, s.status);
    try std.testing.expectEqual(@as(u16, 10), s.level);
    try std.testing.expectEqual(@as(?u16, 12), s.nextGate());
    try std.testing.expectEqual(@as(?u8, 82), s.stats[0]);
    try std.testing.expect(s.stats[1] == null);
}
test "malformed, future, negative and incomplete active ledgers stay invalid" {
    for ([_][]const u8{ "", "{", "{}", "{\"schemaVersion\":2,\"xp\":0}", "{\"schemaVersion\":1,\"xp\":-1}", "{\"schemaVersion\":1,\"activePetId\":\"missing\",\"xp\":200}", "{\"schemaVersion\":1,\"xp\":0,\"levels\":{\"evolutionGates\":[11,11,32,45]}}", "{\"schemaVersion\":1,\"xp\":0,\"levels\":{\"maxLevel\":99}}" }) |bytes| try std.testing.expectEqual(.invalid, parse(bytes).status);
    try std.testing.expectEqual(.ready, parse("{\"schemaVersion\":1,\"xp\":0,\"levels\":{\"maxLevel\":999,\"topXp\":998019880}}").status);
    try std.testing.expectEqual(.unavailable, read("/nonexistent/evopet-test-home").status);
    try std.testing.expect((Snapshot{ .level = 999 }).nextGate() == null);
}

test "creator can use fewer gates or hatch at level one" {
    const s = parse("{\"schemaVersion\":1,\"xp\":0,\"levels\":{\"maxLevel\":999,\"topXp\":998019880,\"evolutionGates\":[1,20]}}");
    try std.testing.expectEqual(.ready, s.status);
    try std.testing.expectEqual(@as(?u16, 20), s.nextGate());
}

test "a ladder must be explicitly recognized and the selected pet unambiguous" {
    for ([_][]const u8{
        "{\"schemaVersion\":1,\"xp\":810}",
        "{\"schemaVersion\":1,\"xp\":810,\"levels\":{\"maxLevel\":999}}",
        "{\"schemaVersion\":1,\"xp\":810,\"levels\":{\"maxLevel\":999,\"topXp\":998019880},\"pets\":{\"toast\":{\"xp\":0}}}",
    }) |bytes| try std.testing.expectEqual(.invalid, parse(bytes).status);
}

test "bounded reads accept cursor history and preserve source bytes" {
    var dir = std.testing.tmpDir(.{});
    defer dir.cleanup();
    var home_buf: [512]u8 = undefined;
    const home = std.fmt.bufPrint(&home_buf, ".zig-cache/tmp/{s}", .{dir.sub_path[0..]}) catch unreachable;
    var path_buf: [640]u8 = undefined;
    const path = std.fmt.bufPrint(&path_buf, "{s}/.evopet/state.json", .{home}) catch unreachable;
    try std.testing.expectEqual(.unavailable, read(home).status);
    const prefix = "{\"schemaVersion\":1,\"xp\":810,\"levels\":{\"maxLevel\":999,\"topXp\":998019880},\"cursor\":{\"history\":\"";
    const bytes = try std.testing.allocator.alloc(u8, 300000);
    defer std.testing.allocator.free(bytes);
    @memset(bytes, 'x');
    @memcpy(bytes[0..prefix.len], prefix);
    @memcpy(bytes[bytes.len - 4 ..], "\"}}\n");
    try std.testing.expect(plat.writeFile(path, bytes));
    try std.testing.expectEqual(.ready, read(home).status);
    const reread = try std.testing.allocator.alloc(u8, bytes.len);
    defer std.testing.allocator.free(reread);
    try std.testing.expectEqualStrings(bytes, plat.readFile(path, reread).?);
    const oversized = try std.testing.allocator.alloc(u8, max_bytes + 1);
    defer std.testing.allocator.free(oversized);
    @memset(oversized, ' ');
    try std.testing.expect(plat.writeFile(path, oversized));
    try std.testing.expectEqual(.invalid, read(home).status);
    try std.testing.expectEqual(.invalid, parse(oversized).status);
}
