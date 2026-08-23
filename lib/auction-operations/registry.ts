import fs from "node:fs";
import path from "node:path";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — REGISTERED PACKETS — lib/auction-operations/registry.ts

   THE ALLOWLIST. Auction Results V1 is an operator doorway for the three
   registered, already-proven source packets below — it is not a universal
   "select any house / upload any manifest" engine. A new sale or house
   requires a reviewed, source-specific manifest and adapter registration in
   THIS file, in the repository, through a commit. No route accepts an
   arbitrary manifest, arbitrary URL, or arbitrary adapter string; anything
   not returned by resolvePacket() does not exist to the server seam.

   Manifests are repo-held and read from disk at call time — the browser
   never uploads or edits one. (next.config.ts carries the tracing entries
   that keep these JSON files inside the deployed function bundle.)

   SERVER-ONLY: this module reads the filesystem. Never import it from a
   client component.
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

export type RegisteredPacket = {
  adapter: AdapterId;
  packetId: string;
  title: string;
  /** One truthful sentence the room shows about what this packet is. */
  description: string;
  /** Repo-held manifest paths (relative to the repository root). */
  manifestPaths: string[];
  uploads: UploadSpec[];
};

const PDF = { magicPrefix: "%PDF", maxBytes: 50 * 1024 * 1024 };

const PACKETS: RegisteredPacket[] = [
  {
    adapter: "phillips-sale",
    packetId: "NY080126",
    title: "Phillips — The New York Watch Auction: XIV",
    description:
      "156 results from the pinned official Results PDF and auction-page PDF you supply. Both hashes must match the registered manifest exactly.",
    manifestPaths: ["scripts/phillips/ny080126.sale.json"],
    uploads: [
      { kind: "results_pdf", label: "Official Results PDF", required: true, ...PDF },
      { kind: "auction_page_pdf", label: "Auction-page / catalogue PDF", required: true, ...PDF },
      {
        kind: "sale_page_html",
        label: "Saved sale-page HTML (optional — otherwise the registered page is fetched)",
        required: false,
        magicPrefix: "<",
        maxBytes: 20 * 1024 * 1024,
      },
    ],
  },
  {
    adapter: "monaco-legend",
    packetId: "sales-38-40-41",
    title: "Monaco Legend — Exclusive Timepieces 38 / 40 / 41",
    description:
      "724 results re-verified from the registered Monaco pages and pinned PDFs. Nothing to upload — the server fetches only the allowlisted registered URLs.",
    manifestPaths: [
      "scripts/monaco-legend/sale-38.sale.json",
      "scripts/monaco-legend/sale-40.sale.json",
      "scripts/monaco-legend/sale-41.sale.json",
    ],
    uploads: [],
  },
  {
    adapter: "monaco-layer2",
    packetId: "et33-et35-et36",
    title: "Monaco Legend — Exclusive Timepieces 33 / 35 / 36 (Layer 2 corpus)",
    description:
      "821 historically-acquired lots from the independently verified Layer 2 corpus. Supply the exact corpus JSONL — its SHA-256 is pinned. ET36 sold prices stay quarantined (outcomes ingest; prices are withheld pending the semantics ruling).",
    manifestPaths: ["scripts/monaco-legend/layer2-et33-et35-et36.manifest.json"],
    uploads: [
      {
        kind: "corpus_jsonl",
        label: "Layer 2 corpus JSONL (Monaco_ET33_ET35_ET36_821_Layer2_FINAL_2026-08-21.jsonl)",
        required: true,
        magicPrefix: "{",
        maxBytes: 50 * 1024 * 1024,
      },
    ],
  },
];

/** The one lookup. Unknown adapter/packet → null; the caller refuses. */
export function resolvePacket(adapter: unknown, packetId: unknown): RegisteredPacket | null {
  if (typeof adapter !== "string" || typeof packetId !== "string") return null;
  return PACKETS.find((p) => p.adapter === adapter && p.packetId === packetId) ?? null;
}

export function listPackets(): RegisteredPacket[] {
  return PACKETS.map((p) => ({ ...p, uploads: p.uploads.map((u) => ({ ...u })) }));
}

/** Reads a packet's repo-held manifests. Throws if one is missing — a
    deployment that lost its manifests must refuse loudly, not improvise. */
export function loadManifests(packet: RegisteredPacket): { bytes: Buffer; value: unknown }[] {
  return packet.manifestPaths.map((rel) => {
    const abs = path.join(process.cwd(), rel);
    const bytes = fs.readFileSync(abs);
    return { bytes, value: JSON.parse(bytes.toString("utf8")) };
  });
}

export const STAGING_BUCKET = "auction-operations-staging";
