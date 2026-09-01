/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — PACKET SHAPES — lib/auction-operations/registry.ts

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "The packet allowlist lives here."

   It USED to, and that was the defect. This file held a hardcoded PACKETS
   array of three exact sale instances, and components/AdminAuctionResultsIngest
   held the same three again. Two mirrored lists meant a new sale that fitted
   an already-proven adapter still needed a source edit, a second edit in the
   browser, and a deployment — for a packet, not for a parser.

   Packet instances now live in the governed catalog
   (auction_operations_packet_revision) and are resolved through
   lib/auction-operations/packetCatalog.ts. What stays here is what genuinely
   belongs to code: the SHAPES the machinery speaks, and the staging bucket.

   Deliberately gone, and not to be restored:
     PACKETS         — the hardcoded three; now catalog rows
     resolvePacket   — now resolveActivePacketRevision, against the catalog
     listPackets     — now listActivePacketRevisions
     loadManifests   — now loadDescriptors, which resolves a descriptor from
                       the EXACT revision and rehashes it before use

   If you are reaching for a hardcoded packet fallback here because the
   catalog returned nothing, stop: an empty catalog is a truthful answer and
   the room must say so. A fallback would silently restore the mirrored list
   this flight removed.

   The ADAPTER allowlist is still code-owned and still finite — it lives in
   packetCatalog.ts beside the code that dispatches on it, mirrored by a
   CHECK constraint in the catalog migration.
   ════════════════════════════════════════════════════════════════════════ */

export type AdapterId = "phillips-sale" | "monaco-legend" | "monaco-layer2";

export type UploadKind = "results_pdf" | "auction_page_pdf" | "sale_page_html" | "corpus_jsonl";

export type UploadSpec = {
  kind: UploadKind;
  label: string;
  required: boolean;
  /** Magic-byte prefix the staged file must start with (checked server-side
      before planning — MIME labels are caller-supplied and not trusted). */
  magicPrefix: string;
  maxBytes: number;
};

/** The projection the plan/upload machinery consumes. Built from a catalog
    revision by packetCatalog.toRegisteredPacket — never authored by hand,
    and never assembled from anything the browser sent. */
export type RegisteredPacket = {
  adapter: AdapterId;
  packetId: string;
  title: string;
  /** One truthful sentence the room shows about what this packet is. */
  description: string;
  /** Repo-held manifest paths, for legacy descriptors that still name them.
      Empty for a runtime-registered instance whose descriptor travels in the
      catalog row. */
  manifestPaths: string[];
  uploads: UploadSpec[];
};

export const STAGING_BUCKET = "auction-operations-staging";
