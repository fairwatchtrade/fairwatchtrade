import type { SupabaseClient } from "@supabase/supabase-js";
import { STAGING_BUCKET, type UploadSpec } from "@/lib/auction-operations/registry";
import {
  loadDescriptors,
  toRegisteredPacket,
  type PacketRevisionRow,
} from "@/lib/auction-operations/packetCatalog";
import { sha256Hex, type AuctionRun } from "@/lib/auction-operations/runStore";
// One engine, two entrances: these are the SAME functions the CLIs run.
import { generatePhillipsSalePlan, planToBytes } from "@/scripts/phillips-sale-import.mjs";
import { buildMonacoPlan, verifyMonacoSource } from "@/scripts/monaco-legend-import.mjs";
import {
  buildLayer2Plan,
  layer2PlanToBytes,
  parseLayer2Corpus,
} from "@/lib/auction-operations/monaco-layer2-core.mjs";

/* ════════════════════════════════════════════════════════════════════════
   AUCTION OPERATIONS — PLAN ENGINE — lib/auction-operations/planEngine.ts

   Turns a registered packet's inputs into a deterministic, server-held
   plan. ZERO Auction Evidence writes happen anywhere in this module — a
   plan is a reviewable proposal, and the founder's explicit Apply is the
   only thing that executes one.

   INPUT ACQUISITION IS THE ONLY THING THAT VARIES BY ADAPTER:
     phillips-sale  founder-staged PDFs (+ optional saved sale-page HTML;
                    otherwise ONE fetch of the registered auctionPageUrl)
     monaco-legend  server fetches of the three manifests' pinned URLs
     monaco-layer2  the founder-staged, hash-pinned Layer 2 corpus JSONL

   Every acquired byte is hash-verified against its registered manifest
   before parsing, and every parse/semantic/live contradiction throws — the
   route records the refusal on the run; nothing is improvised.
   ════════════════════════════════════════════════════════════════════════ */

export type GeneratedPlan = {
  plan: unknown;
  planBytes: string;
  planSha256: string;
  summary: Record<string, unknown>;
  contradictions: string[];
  sourceHashes: Record<string, string>;
};

async function downloadStaged(
  db: SupabaseClient,
  run: AuctionRun,
  spec: UploadSpec
): Promise<Buffer | null> {
  const storagePath = run.input_paths[spec.kind];
  if (!storagePath) {
    if (spec.required) throw new Error(`missing_source: ${spec.kind} was never staged`);
    return null;
  }
  const { data, error } = await db.storage.from(STAGING_BUCKET).download(storagePath);
  if (error || !data) {
    // An optional kind that was simply never staged is an ordinary absence.
    if (!spec.required) return null;
    throw new Error(`missing_source: staged ${spec.kind} could not be read (${error?.message ?? "empty"})`);
  }
  const bytes = Buffer.from(await data.arrayBuffer());
  if (bytes.length === 0 || bytes.length > spec.maxBytes)
    throw new Error(`missing_source: staged ${spec.kind} has an unacceptable size (${bytes.length} bytes)`);
  // Magic bytes, not the caller's MIME label, decide what the file is.
  if (!bytes.subarray(0, 64).toString("latin1").trimStart().startsWith(spec.magicPrefix))
    throw new Error(`missing_source: staged ${spec.kind} does not look like ${spec.label}`);
  return bytes;
}

async function fetchRegistered(url: string): Promise<Buffer> {
  const response = await fetch(url, {
    headers: { "user-agent": "FairWatchTrade auction evidence verifier/1.0" },
  });
  if (!response.ok) throw new Error(`registered source fetch failed: ${url}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Plan a run from the EXACT packet revision it was created against.
 *
 * The revision, not a packet id, is the parameter on purpose. A packet id
 * resolves to whatever is active *now*; a revision is what this run was
 * bound to when it was created. Planning through the id would reintroduce
 * the time-of-check/time-of-use gap the catalog exists to close — a
 * revision activated mid-flight could change the mechanics under a run the
 * founder had already started reviewing.
 *
 * Adapter dispatch below is still a literal switch over code-owned names.
 * The revision NAMES its adapter; it never supplies one.
 */
export async function generatePlanForRun(
  db: SupabaseClient,
  run: AuctionRun,
  revision: PacketRevisionRow
): Promise<GeneratedPlan> {
  const packet = toRegisteredPacket(revision);
  const descriptor = revision.descriptor as Record<string, unknown>;

  if (packet.adapter === "phillips-sale") {
    const [{ bytes: manifestBytes, value: saleManifest }] = loadDescriptors(revision);
    const manifest = saleManifest as {
      auctionPageUrl: string;
      resultsPdf: { sha256: string };
      auctionPagePdf: { sha256: string };
    };
    const specs = Object.fromEntries(packet.uploads.map((u) => [u.kind, u]));
    const resultsPdfBytes = (await downloadStaged(db, run, specs.results_pdf))!;
    const auctionPagePdfBytes = (await downloadStaged(db, run, specs.auction_page_pdf))!;
    const stagedHtml = await downloadStaged(db, run, specs.sale_page_html);
    // The only network the Phillips path may touch: the ONE registered page.
    const salePageHtml = stagedHtml
      ? stagedHtml.toString("utf8")
      : (await fetchRegistered(manifest.auctionPageUrl)).toString("utf8");

    const generated = await generatePhillipsSalePlan({
      saleManifest: manifest,
      saleManifestBytes: manifestBytes,
      resultsPdfBytes,
      auctionPagePdfBytes,
      salePageHtml,
      db,
    });
    return {
      plan: generated.plan,
      planBytes: generated.planBytes,
      planSha256: generated.planSha256,
      summary: generated.summary,
      contradictions: generated.contradictions ?? [],
      sourceHashes: {
        sale_manifest: sha256Hex(manifestBytes),
        results_pdf: manifest.resultsPdf.sha256,
        auction_page_pdf: manifest.auctionPagePdf.sha256,
        sale_page_html: sha256Hex(Buffer.from(salePageHtml)),
      },
    };
  }

  if (packet.adapter === "monaco-legend") {
    const manifests = loadDescriptors(revision);
    const harvested = [];
    const sourceHashes: Record<string, string> = {};
    for (const { bytes, value } of manifests) {
      const manifest = value as {
        sale: { id: string; landing_url: string };
        artifacts: { catalog_pdf: { url: string }; results_pdf: { url: string } };
      };
      const [landing, catalog, results] = await Promise.all([
        fetchRegistered(manifest.sale.landing_url),
        fetchRegistered(manifest.artifacts.catalog_pdf.url),
        fetchRegistered(manifest.artifacts.results_pdf.url),
      ]);
      harvested.push(
        verifyMonacoSource({
          manifest,
          manifestHash: sha256Hex(bytes),
          landingHtml: landing.toString("utf8"),
          catalogPdfBytes: catalog,
          resultsPdfBytes: results,
        })
      );
      sourceHashes[`sale_${manifest.sale.id}_manifest`] = sha256Hex(bytes);
    }
    const plan = await buildMonacoPlan(harvested, db);
    const planBytes = planToBytes(plan);
    return {
      plan,
      planBytes,
      planSha256: sha256Hex(Buffer.from(planBytes)),
      summary: (plan as { summary: Record<string, unknown> }).summary,
      contradictions: [],
      sourceHashes,
    };
  }

  // monaco-layer2 — the verified historical corpus, and the one family
  // proven runtime-registerable in this flight.
  const [{ bytes: manifestBytes, value }] = loadDescriptors(revision);
  const manifest = value as { corpus: { sha256: string } };
  const specs = Object.fromEntries(packet.uploads.map((u) => [u.kind, u]));
  const corpusBytes = (await downloadStaged(db, run, specs.corpus_jsonl))!;
  const corpusSha256 = sha256Hex(corpusBytes);
  if (corpusSha256 !== manifest.corpus.sha256)
    throw new Error(
      `source_hash_mismatch: staged corpus ${corpusSha256} is not the registered Layer 2 corpus`
    );
  const rows = parseLayer2Corpus(corpusBytes.toString("utf8"));
  /* The plan's flight label was the family's ONE instance literal, written
     into the plan object and therefore into the hashed bytes. It now comes
     from the descriptor, which is what makes a second Layer 2 sale possible
     without editing the adapter.

     The migrated ET33/ET35/ET36 descriptor carries the original string
     verbatim, so this packet's plan bytes stay byte-identical to the
     pre-catalog output — the plan-hash boundary is not weakened, it is
     preserved deliberately. An adapter default keeps the CLI path unchanged
     for the same reason. */
  const flight = typeof descriptor?.flight === "string" ? descriptor.flight : undefined;
  const plan = await buildLayer2Plan({ manifest, corpusSha256, rows, db, flight });
  const planBytes = layer2PlanToBytes(plan);
  return {
    plan,
    planBytes,
    planSha256: sha256Hex(Buffer.from(planBytes)),
    summary: (plan as { summary: Record<string, unknown> }).summary,
    contradictions: [],
    sourceHashes: { manifest: sha256Hex(manifestBytes), corpus_jsonl: corpusSha256 },
  };
}

/* resolvePacket is deliberately NOT re-exported any more. Packet
   resolution belongs to the catalog; a re-export here was how the old
   hardcoded list reached the routes. */
