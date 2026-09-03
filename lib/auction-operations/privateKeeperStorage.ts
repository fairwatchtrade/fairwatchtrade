import type { SupabaseClient } from "@supabase/supabase-js";
/* Relative, extension-explicit imports on purpose: this boundary is proven
   against the LIVE bucket by a node script (tsconfig allows .ts specifiers),
   the same module Apply runs — not a re-implementation of it. */
import { STAGING_BUCKET } from "./registry.ts";
import type { AuctionRun } from "./runStore.ts";
import { PRIVATE_KEEPER_BUCKET } from "./monaco-portable-core.mjs";

/* ════════════════════════════════════════════════════════════════════════
   PRIVATE KEEPER STORAGE — lib/auction-operations/privateKeeperStorage.ts

   The production implementation of the storage boundary the portable
   writer is given. The writer never learns which storage it is talking to:
   tests hand it an in-memory fake; Apply hands it this.

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "Uploading the keeper is just a put."

   The private keeper bucket is CONTENT-ADDRESSED: the object's path is the
   SHA-256 of its bytes. A path therefore either holds exactly those bytes
   or must not be written at all. `upsert: false` is load-bearing — the
   writer already refuses on a hash conflict before it would upload, but
   the boundary must be incapable of silently replacing an object even if
   a future caller forgets to check. A not-found on download is an ordinary
   answer (`null`), never an exception; every other storage error is.

   The exact staged keeper bytes come from the STAGING bucket at the path
   the run recorded at birth — the same object the plan engine hashed — so
   the bytes Apply retains are the bytes the plan was generated from, and
   the writer rehashes them against the plan before anything depends on
   them.

   Service client only, obtained after the founder gate, like every other
   Auction Operations write. No browser path exists into either bucket.
   ════════════════════════════════════════════════════════════════════════ */

export type KeeperStorage = {
  download(path: string): Promise<Buffer | null>;
  upload(path: string, bytes: Buffer): Promise<void>;
};

const NOT_FOUND = /not found|does not exist|no such|404/i;

export function privateKeeperStorage(db: SupabaseClient): KeeperStorage {
  const bucket = db.storage.from(PRIVATE_KEEPER_BUCKET);
  return {
    async download(path) {
      const { data, error } = await bucket.download(path);
      if (error) {
        if (NOT_FOUND.test(error.message)) return null;
        throw new Error(`private_keeper_read_failed: ${error.message}`);
      }
      if (!data) return null;
      return Buffer.from(await data.arrayBuffer());
    },
    async upload(path, bytes) {
      const { error } = await bucket.upload(path, bytes, {
        contentType: "application/json",
        upsert: false,
      });
      if (error) throw new Error(`private_keeper_write_failed: ${error.message}`);
    },
  };
}

/** The exact staged keeper bytes for a run — the object the plan engine
    hashed, read back from the staging bucket at the path the run recorded
    at birth. Absent is a bounded `missing_source`, never a 500. */
export async function stagedKeeperBytes(db: SupabaseClient, run: AuctionRun): Promise<Buffer> {
  const path = run.input_paths?.portable_json;
  if (!path) throw new Error("missing_source: this run recorded no staged portable_json");
  const { data, error } = await db.storage.from(STAGING_BUCKET).download(path);
  if (error || !data) throw new Error(`missing_source: staged portable_json could not be read (${error?.message ?? "empty"})`);
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0) throw new Error("missing_source: staged portable_json is empty");
  return bytes;
}
