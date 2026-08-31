/* ────────────────────────────────────────────────────────────────────────
   ADMIN ASSISTANT — CANONICAL ROOM REGISTRY

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "An unrecognized room is close enough to Founder Review."

   It is not. The prior resolver returned `founder_review` for ANY input it
   did not recognize — a typo, a stale client, a room built next month, a
   malformed body. The request then executed under Founder Review semantics
   against the Founder Review queue, and nothing in the response said so.

   > Wrong room is an error, not a default.

   ── KNOWING A KEY IS NOT SUPPORTING IT ──────────────────────────────────

   Three outcomes, deliberately distinct, because collapsing them tells the
   founder the wrong thing about his own product:

     · `ok`                — a room with a live adapter in this build;
     · `unsupported_room`  — a room this architecture NAMES but has not
                             attached yet. A client ahead of the server, or a
                             room still being built. Saying "invalid" here
                             would claim the room does not exist;
     · `invalid_room`      — nothing this product recognizes at all.

   A retired key would be a fourth: refused with its own sentence, never
   silently remapped onto whatever replaced it.

   ── THE THREAD IS NOT COLLATERAL ────────────────────────────────────────

   Resolution happens BEFORE any session or thread is read or written. A
   room-key failure therefore cannot create, mutate, resume, or close
   anything — the founder's current work is untouched by construction rather
   than by a promise, and every refusal sentence is allowed to say so.
   ──────────────────────────────────────────────────────────────────────── */

/** Every room the architecture names, implemented or not. */
export const ARCHITECTURE_ROOMS = [
  "founder_review",
  "marketplace_control",
  "auction_operations",
  "dealer_accelerator",
  "watch_passport",
  "vault_enrichment",
  "vault_review",
  "vault_upgrade",
  "watch_resolution",
] as const;

export type ArchitectureRoom = (typeof ARCHITECTURE_ROOMS)[number];

/** Rooms with a live adapter in THIS build. Widened only when one lands. */
export const IMPLEMENTED_ROOMS = [
  "founder_review",
  "marketplace_control",
] as const;

export type ImplementedRoom = (typeof IMPLEMENTED_ROOMS)[number];

/** Human names, for sentences the founder reads. */
export const ROOM_LABEL: Record<ArchitectureRoom, string> = {
  founder_review: "Founder Review",
  marketplace_control: "Marketplace Control",
  auction_operations: "Auction Operations",
  dealer_accelerator: "Dealer Accelerator",
  watch_passport: "Watch Passport",
  vault_enrichment: "Vault Enrichment",
  vault_review: "Vault Review",
  vault_upgrade: "Vault Upgrade",
  watch_resolution: "Watch Resolution",
};

/* Keys this product once used and has since retired. A retired key is
   refused with its own sentence and NEVER remapped onto its successor:
   silently honouring it would execute today's semantics against an
   intention recorded under yesterday's. Empty today, and the shape exists
   so the first retirement cannot be handled by a quiet rename. */
export const RETIRED_ROOM_KEYS: Readonly<Record<string, string>> = {};

export type RoomResolution =
  | { state: "ok"; room: ImplementedRoom }
  | { state: "unsupported_room"; room: ArchitectureRoom; sentence: string }
  | { state: "retired_room"; received: string; sentence: string }
  | { state: "invalid_room"; received: string | null; sentence: string };

export function isArchitectureRoom(v: unknown): v is ArchitectureRoom {
  return typeof v === "string" && (ARCHITECTURE_ROOMS as readonly string[]).includes(v);
}

export function isImplementedRoom(v: unknown): v is ImplementedRoom {
  return typeof v === "string" && (IMPLEMENTED_ROOMS as readonly string[]).includes(v);
}

/* The one place a room key becomes a room. Every caller must branch on the
   state; there is deliberately no variant that returns a room for input the
   product did not recognize. */
export function resolveRoom(raw: unknown): RoomResolution {
  if (typeof raw !== "string" || raw.trim() === "") {
    return {
      state: "invalid_room",
      received: typeof raw === "string" ? raw : null,
      sentence:
        "I couldn't tell which Admin room this is, so I haven't assumed one. " +
        "Nothing was read or changed, and any work you already have is still preserved.",
    };
  }

  const key = raw.trim();

  if (isImplementedRoom(key)) return { state: "ok", room: key };

  if (Object.prototype.hasOwnProperty.call(RETIRED_ROOM_KEYS, key)) {
    return {
      state: "retired_room",
      received: key,
      sentence:
        `This page is asking for "${key}", which this product has retired. ` +
        "I haven't guessed which room replaced it, so nothing was read or changed. " +
        "Reload the Admin page and try again.",
    };
  }

  if (isArchitectureRoom(key)) {
    return {
      state: "unsupported_room",
      room: key,
      sentence:
        `I don't have ${ROOM_LABEL[key]} attached yet, so I haven't treated this as another room. ` +
        "Nothing was read or changed here, and any work you already have is still preserved.",
    };
  }

  return {
    state: "invalid_room",
    received: key,
    sentence:
      `I couldn't establish this Admin room ("${key}"), so I haven't treated it as Founder Review ` +
      "or any other room. Nothing was read or changed, and any work you already have is still preserved.",
  };
}

/** HTTP status for a refusal. All are caller-side faults, never 500s. */
export function roomRefusalStatus(r: RoomResolution): number {
  switch (r.state) {
    case "ok":
      return 200;
    case "unsupported_room":
      return 501; // the product understands the room and has not built it
    case "retired_room":
      return 409; // client and server disagree about what exists
    default:
      return 400;
  }
}
