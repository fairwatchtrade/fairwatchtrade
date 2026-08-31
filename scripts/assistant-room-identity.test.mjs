/* Admin Assistant — fail-closed room identity (Round A).

   These prove a product law, not a helper's syntax: an unrecognized room
   must never execute under another room's semantics. The specific
   regression guarded is the prior resolver returning `founder_review` for
   ANY unrecognized input.

   Run: node scripts/assistant-room-identity.test.mjs */
import assert from "node:assert/strict";
import {
  resolveRoom,
  roomRefusalStatus,
  isImplementedRoom,
  isArchitectureRoom,
  ARCHITECTURE_ROOMS,
  IMPLEMENTED_ROOMS,
  ROOM_LABEL,
} from "../lib/assistantRooms.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// ── The two live rooms still resolve ─────────────────────────────────────
for (const room of IMPLEMENTED_ROOMS) {
  const r = resolveRoom(room);
  ok(`${room} resolves`, r.state === "ok" && r.room === room);
}

// ── Nothing unrecognized may become another room ─────────────────────────
const NEVER_A_ROOM = [
  "founder_reviewX",
  "FOUNDER_REVIEW",          // case matters; a near-miss is still a miss
  " founder_review ",        // resolved after trim, see below
  "admin",
  "",
  "   ",
  "null",
  "undefined",
  "../founder_review",
  "founder_review; drop",
  "1",
];
for (const bad of NEVER_A_ROOM) {
  const r = resolveRoom(bad);
  if (bad.trim() === "founder_review") continue; // trimmed, legitimately ok
  ok(`"${bad}" never resolves to a room`, r.state !== "ok");
  ok(`"${bad}" is not silently founder_review`, !("room" in r && r.room === "founder_review"));
}

// Trimming is the ONE normalization, and it is deliberate.
ok("surrounding whitespace is trimmed, not rejected", resolveRoom(" founder_review ").state === "ok");

// ── Non-string input ─────────────────────────────────────────────────────
for (const [label, value] of [
  ["null", null],
  ["undefined", undefined],
  ["a number", 7],
  ["an object", { room: "founder_review" }],
  ["an array", ["founder_review"]],
  ["a boolean", true],
]) {
  const r = resolveRoom(value);
  ok(`${label} fails closed`, r.state === "invalid_room");
  ok(`${label} does not yield a room`, !("room" in r));
}

// ── Known-but-unbuilt rooms are unsupported, NOT invalid ─────────────────
// A client ahead of the server must be told the room is not attached yet,
// never that it does not exist.
const unbuilt = ARCHITECTURE_ROOMS.filter((r) => !IMPLEMENTED_ROOMS.includes(r));
ok("there are architecture rooms still unbuilt", unbuilt.length === 7);
for (const room of unbuilt) {
  const r = resolveRoom(room);
  ok(`${room} is unsupported_room`, r.state === "unsupported_room");
  ok(`${room} is not invalid_room`, r.state !== "invalid_room");
  ok(`${room} refusal names the room in human words`, r.sentence.includes(ROOM_LABEL[room]));
  ok(`${room} refusal returns 501`, roomRefusalStatus(r) === 501);
}

// ── Every refusal orients the founder ────────────────────────────────────
// A raw error code alone is not enough (Round A, explicit).
for (const bad of ["totally_unknown_room", "", "auction_operations"]) {
  const r = resolveRoom(bad);
  ok(`"${bad}" carries a human sentence`, typeof r.sentence === "string" && r.sentence.length > 40);
  ok(`"${bad}" promises the founder's work survives`, /preserved/i.test(r.sentence));
  ok(`"${bad}" says nothing was changed`, /nothing was read or changed/i.test(r.sentence));
}

// The headline regression: the sentence for an unknown key must explicitly
// deny the old behaviour rather than merely omit it.
{
  const r = resolveRoom("totally_unknown_room");
  ok("unknown key explicitly denies the Founder Review fallback", /Founder Review/.test(r.sentence));
  ok("unknown key returns 400", roomRefusalStatus(r) === 400);
}

// ── Registry integrity ───────────────────────────────────────────────────
ok("every implemented room is an architecture room",
  IMPLEMENTED_ROOMS.every((r) => isArchitectureRoom(r)));
ok("the architecture names nine rooms", ARCHITECTURE_ROOMS.length === 9);
ok("every architecture room has a human label",
  ARCHITECTURE_ROOMS.every((r) => typeof ROOM_LABEL[r] === "string" && ROOM_LABEL[r].length > 0));
ok("architecture rooms are unique", new Set(ARCHITECTURE_ROOMS).size === ARCHITECTURE_ROOMS.length);
ok("isImplementedRoom rejects an unbuilt architecture room", !isImplementedRoom("vault_upgrade"));
ok("isImplementedRoom rejects nonsense", !isImplementedRoom("nope"));

// ── The required room set cannot silently shrink ─────────────────────────
// If a room is ever dropped from ARCHITECTURE_ROOMS, this fails — the
// architecture owns this list, not whatever happened to get built.
for (const required of [
  "marketplace_control", "founder_review", "auction_operations",
  "dealer_accelerator", "watch_passport", "vault_enrichment",
  "vault_review", "vault_upgrade", "watch_resolution",
]) {
  ok(`${required} remains in the required room set`, ARCHITECTURE_ROOMS.includes(required));
}

console.log(`assistant-room-identity: ${pass} assertions PASS`);
