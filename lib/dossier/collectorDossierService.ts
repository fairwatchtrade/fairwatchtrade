import { createHash } from "node:crypto";
import { createServiceClient } from "@/lib/supabase/service";
import { resolveListingReference } from "@/lib/research/resolveListingReference";

type DossierStatus = "pending" | "generating" | "ready" | "failed";

type AttachedDossierRow = {
  dossier_id: string;
  vault_reference_id: string;
  dossier_status: DossierStatus;
  storage_url: string | null;
};

type DossierRow = {
  id: string;
  vault_reference_id: string;
  status: DossierStatus;
  storage_url: string | null;
  storage_path: string | null;
  pdf_sha256: string | null;
  pdf_bytes: number | null;
};

export type CollectorDossierState =
  | { state: "not_qualified" }
  | { state: "pending"; dossierId: string; referenceId: string }
  | { state: "generating"; dossierId: string; referenceId: string }
  | { state: "failed"; dossierId: string; referenceId: string }
  | {
      state: "ready";
      dossierId: string;
      referenceId: string;
      storageUrl: string;
      storagePath: string;
      sha256: string;
      byteLength: number;
    };

function toState(row: DossierRow): CollectorDossierState {
  if (
    row.status === "ready" &&
    row.storage_url &&
    row.storage_path &&
    row.pdf_sha256 &&
    row.pdf_bytes
  ) {
    return {
      state: "ready",
      dossierId: row.id,
      referenceId: row.vault_reference_id,
      storageUrl: row.storage_url,
      storagePath: row.storage_path,
      sha256: row.pdf_sha256,
      byteLength: row.pdf_bytes,
    };
  }

  return {
    state: row.status === "ready" ? "failed" : row.status,
    dossierId: row.id,
    referenceId: row.vault_reference_id,
  };
}

async function readDossier(dossierId: string): Promise<DossierRow | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("collector_dossiers")
    .select(
      "id,vault_reference_id,status,storage_url,storage_path,pdf_sha256,pdf_bytes"
    )
    .eq("id", dossierId)
    .maybeSingle();
  if (error) {
    console.error("[collector-dossier] state read failed:", error.message);
    return null;
  }
  return (data as DossierRow | null) ?? null;
}

/**
 * Public-page-safe state lookup. The current governed resolver is re-run
 * before exposure, so a stale attachment can never outlive a changed claim or
 * corrected identity decision.
 */
export async function getCollectorDossierForListing(
  listingId: string
): Promise<CollectorDossierState> {
  const resolution = await resolveListingReference(listingId);
  if (!resolution) return { state: "not_qualified" };

  const db = createServiceClient();
  const { data: attachment, error } = await db
    .from("listing_collector_dossiers")
    .select("collector_dossier_id")
    .eq("listing_id", listingId)
    .maybeSingle();
  if (error || !attachment) {
    if (error) console.error("[collector-dossier] attachment read failed:", error.message);
    return { state: "not_qualified" };
  }

  const dossier = await readDossier(attachment.collector_dossier_id);
  if (!dossier || dossier.vault_reference_id !== resolution.referenceId) {
    return { state: "not_qualified" };
  }
  return toState(dossier);
}

/**
 * Idempotent publish/republish worker.
 *
 * The database publication trigger has already created the durable pending
 * row and listing attachment before this runs. Calling attach again is the
 * application-side recovery seam and is safe. A generation failure is written
 * as failed and returned; it never changes listings.status.
 */
export async function ensureCollectorDossierForListing(
  listingId: string
): Promise<CollectorDossierState> {
  const resolution = await resolveListingReference(listingId);
  if (!resolution) return { state: "not_qualified" };

  const db = createServiceClient();
  const { data: attached, error: attachError } = await db.rpc(
    "collector_dossier_attach_listing",
    { p_listing_id: listingId }
  );
  if (attachError) {
    console.error("[collector-dossier] durable attach failed:", attachError.message);
    return { state: "not_qualified" };
  }

  const attachment = ((attached ?? [])[0] ?? null) as AttachedDossierRow | null;
  if (!attachment || attachment.vault_reference_id !== resolution.referenceId) {
    return { state: "not_qualified" };
  }

  const existing = await readDossier(attachment.dossier_id);
  if (!existing) return { state: "not_qualified" };
  if (existing.status === "ready") return toState(existing);

  const { data: claimed, error: claimError } = await db.rpc(
    "collector_dossier_claim",
    { p_dossier_id: attachment.dossier_id }
  );
  if (claimError) {
    console.error("[collector-dossier] claim failed:", claimError.message);
    return toState(existing);
  }

  const claim = ((claimed ?? [])[0] ?? null) as DossierRow | null;
  if (!claim) {
    // Another request owns the job, or it completed between our reads.
    return toState((await readDossier(attachment.dossier_id)) ?? existing);
  }

  try {
    // Keep Chromium and Blob upload code out of ordinary listing-page reads.
    // They are loaded only by the post-publication worker.
    const [{ put }, { generateDossierPdf }, { buildReferenceDossierViewModel }] =
      await Promise.all([
        import("@vercel/blob"),
        import("./dossierPdf"),
        import("./referenceDossierViewModel"),
      ]);
    const vm = await buildReferenceDossierViewModel(resolution.referenceId);
    if (!vm) throw new Error("canonical_vault_chain_unavailable");
    if (!vm.canary.authorizedToServe) throw new Error("production_dossier_not_authorized");

    const pdf = await generateDossierPdf(vm);
    const pdfBuffer = Buffer.from(pdf);
    const sha256 = createHash("sha256").update(pdfBuffer).digest("hex");
    const pathname =
      `collector-dossiers/references/${resolution.referenceId}/collector-dossier-v1.pdf`;

    // The connected Vercel Blob store authenticates through OIDC in
    // production. A deterministic reference path plus overwrite makes a retry
    // idempotent if upload succeeded but the ready-state write did not.
    const blob = await put(pathname, pdfBuffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: "application/pdf",
      cacheControlMaxAge: 31_536_000,
    });

    const { data: ready, error: readyError } = await db.rpc(
      "collector_dossier_mark_ready",
      {
        p_dossier_id: claim.id,
        p_storage_url: blob.url,
        p_storage_path: blob.pathname,
        p_pdf_sha256: sha256,
        p_pdf_bytes: pdfBuffer.byteLength,
      }
    );
    if (readyError || !ready?.[0]) {
      throw new Error(readyError?.message || "ready_state_write_failed");
    }

    return toState(ready[0] as DossierRow);
  } catch (error) {
    const message = error instanceof Error ? error.message : "generation_failed";
    console.error("[collector-dossier] generation failed:", message);
    await db.rpc("collector_dossier_mark_failed", {
      p_dossier_id: claim.id,
      p_error: message,
    });
    return {
      state: "failed",
      dossierId: claim.id,
      referenceId: claim.vault_reference_id,
    };
  }
}
