import { createServiceClient } from "@/lib/supabase/service";
import type {
  CollectorDossierViewModel,
  DossierPendingField,
  DossierSection,
} from "./collectorDossierViewModel";

type VaultReferenceRow = {
  id: string;
  reference: string;
  metadata: Record<string, unknown> | null;
  vault_variants: unknown;
};

type VaultVariant = {
  name: string | null;
  description: string | null;
  notes: string | null;
  vault_families: unknown;
};

type VaultFamily = {
  name: string | null;
  description: string | null;
  vault_collections: unknown;
};

type VaultCollection = {
  name: string | null;
  description: string | null;
  vault_brands: unknown;
};

type VaultBrand = {
  name: string | null;
  description: string | null;
  country_of_origin: string | null;
  independent_status: string | null;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type ApprovedArticleRow = {
  opening_identity: string | null;
  sections: unknown;
  manuscript_sha256: string | null;
  delta_sha256: string | null;
};

/**
 * Defensive parse of an approved article's stored sections into the exact
 * DossierSection shape both renderers consume. Anything malformed is dropped;
 * zero valid sections means the article is treated as absent — the skeleton
 * template is the fail-safe, never a half-rendered article.
 */
function parseArticleSections(value: unknown): DossierSection[] {
  if (!Array.isArray(value)) return [];
  const sections: DossierSection[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const s = entry as { moduleId?: unknown; heading?: unknown; paragraphs?: unknown };
    if (typeof s.moduleId !== "string" || typeof s.heading !== "string") continue;
    if (!Array.isArray(s.paragraphs)) continue;
    const paragraphs = s.paragraphs.filter(
      (p): p is string => typeof p === "string" && p.trim().length > 0
    );
    if (s.heading.trim().length === 0 || paragraphs.length === 0) continue;
    sections.push({ moduleId: s.moduleId, heading: s.heading, paragraphs });
  }
  return sections;
}

/**
 * The founder-approved reference-level article, if one exists. Only rows in
 * status 'approved' are ever consumed — the no-unapproved-prose floor is
 * structural, not conventional. Read failures fall back to the skeleton.
 */
async function readApprovedArticle(
  db: ReturnType<typeof createServiceClient>,
  referenceId: string
): Promise<{ opening: string | null; sections: DossierSection[]; manuscriptSha256: string | null; deltaSha256: string | null } | null> {
  const { data, error } = await db
    .from("collector_dossier_articles")
    .select("opening_identity, sections, manuscript_sha256, delta_sha256")
    .eq("vault_reference_id", referenceId)
    .eq("status", "approved")
    .maybeSingle();
  if (error) {
    console.error("[collector-dossier] article read failed:", error.message);
    return null;
  }
  if (!data) return null;
  const row = data as ApprovedArticleRow;
  const sections = parseArticleSections(row.sections);
  if (sections.length === 0) {
    console.error("[collector-dossier] approved article carried no valid sections; serving skeleton");
    return null;
  }
  return {
    opening: row.opening_identity?.trim() || null,
    sections,
    manuscriptSha256: row.manuscript_sha256,
    deltaSha256: row.delta_sha256,
  };
}

/**
 * NON-PUBLIC PREVIEW ONLY. The newest machine-composed draft article for a
 * reference, so the founder can read a verified draft inside the real
 * Dossier presentation before any approval decision. Nothing public ever
 * consumes a draft: the public path above reads status='approved' only,
 * and this reader is reachable solely through the admin-gated preview
 * route.
 */
async function readLatestDraftArticle(
  db: ReturnType<typeof createServiceClient>,
  referenceId: string
): Promise<{ opening: string | null; sections: DossierSection[] } | null> {
  const { data, error } = await db
    .from("collector_dossier_articles")
    .select("opening_identity, sections")
    .eq("vault_reference_id", referenceId)
    .eq("status", "draft")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as ApprovedArticleRow;
  const sections = parseArticleSections(row.sections);
  if (sections.length === 0) return null;
  return { opening: row.opening_identity?.trim() || null, sections };
}

function field(label: string, value: string | null): DossierPendingField {
  return { label, value };
}

function nonBlank(...values: Array<string | null | undefined>): string[] {
  return values
    .map((value) => value?.trim() ?? "")
    .filter((value) => value.length > 0);
}

/**
 * Build a production dossier from the canonical Vault chain only.
 * No listing row is read here: condition, photographs, price, provenance and
 * other seller-specific facts cannot leak into a reference-level artifact.
 */
export async function buildReferenceDossierViewModel(
  referenceId: string,
  preparedAt = new Date(),
  /** INTERNAL. "approved" is the only public path. "draft_preview" is used
      solely by the admin-gated preview route so the founder can read a
      machine-composed verified draft in the real Dossier presentation —
      it never touches the served artifact path. */
  articleSource: "approved" | "draft_preview" = "approved"
): Promise<CollectorDossierViewModel | null> {
  const db = createServiceClient();
  const { data, error } = await db
    .from("vault_references")
    .select(
      `
      id, reference, metadata,
      vault_variants (
        name, description, notes,
        vault_families (
          name, description,
          vault_collections (
            name, description,
            vault_brands (name, description, country_of_origin, independent_status)
          )
        )
      )
    `
    )
    .eq("id", referenceId)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("[collector-dossier] Vault chain read failed:", error.message);
    return null;
  }

  const reference = data as unknown as VaultReferenceRow;
  const variant = one(reference.vault_variants as VaultVariant | VaultVariant[] | null);
  const family = one(variant?.vault_families as VaultFamily | VaultFamily[] | null);
  const collection = one(
    family?.vault_collections as VaultCollection | VaultCollection[] | null
  );
  const brand = one(collection?.vault_brands as VaultBrand | VaultBrand[] | null);
  if (!variant || !family || !collection || !brand) return null;

  // Founder-approved editorial article, when one exists for this reference.
  // Absent (the normal state until content governance fills the table), the
  // Vault-only skeleton below renders exactly as it always has. The
  // draft_preview source is admin-only and never reaches a served artifact.
  const article =
    articleSource === "draft_preview"
      ? await readLatestDraftArticle(db, referenceId).then((draft) =>
          draft
            ? { ...draft, manuscriptSha256: null, deltaSha256: null }
            : null
        )
      : await readApprovedArticle(db, referenceId);
  if (articleSource === "draft_preview" && !article) return null;

  const brandName = brand.name?.trim() || "Unknown maker";
  const collectionName = collection.name?.trim() || "Uncatalogued collection";
  const familyName = family.name?.trim() || "Uncatalogued family";
  const variantName = variant.name?.trim() || "Uncatalogued variant";
  const referenceText = reference.reference?.trim() || referenceId;

  const profile = nonBlank(
    brand.description,
    collection.description,
    family.description,
    variant.description,
    variant.notes
  );
  if (profile.length === 0) {
    profile.push(
      `The current Vault record identifies this exact reference as ${variantName} within the ${familyName} family. No additional reference-level narrative is presently recorded.`
    );
  }

  const origin = nonBlank(
    brand.country_of_origin
      ? `${brandName} is catalogued in the FairWatchTrade Vault with country of origin ${brand.country_of_origin}.`
      : null,
    brand.independent_status
      ? `The Vault records the maker's ownership classification as ${brand.independent_status}.`
      : null
  );

  /* Reader-facing framing in natural buyer language. The boundary itself
     is preserved exactly — reference truth here, the individual watch with
     the seller's listing — but the reader is never taught the database
     architecture to understand it. */
  const exactReference: DossierSection = {
    moduleId: "EXACT_REFERENCE",
    heading: "This Reference",
    paragraphs: [
      `${referenceText} is the ${brandName} ${variantName}, part of the ${collectionName} collection.`,
      "This Dossier is about the reference itself — the watch as its maker specified it. Everything here applies to any example of this exact reference, not to one particular watch for sale.",
    ],
  };
  const canonicalBoundary: DossierSection = {
    moduleId: "CANONICAL_BOUNDARY",
    heading: "About This Dossier",
    paragraphs: [
      "Condition, service history, included items, provenance, photographs and asking price belong to the individual watch and remain part of the seller's listing.",
      "This Dossier does not authenticate, grade or describe the present condition of any individual watch.",
    ],
  };

  /* With an approved article: the governed identity anchor opens, the
     article's approved sections are the body — verbatim, never merged with
     or rewritten by the skeleton — and the canonical boundary closes. The
     article carries its own evidence section per the editorial manuscript
     law. Without one: the Vault-only skeleton, unchanged. */
  const sections: DossierSection[] = article
    ? [exactReference, ...article.sections, canonicalBoundary]
    : [
        exactReference,
        {
          moduleId: "VAULT_PROFILE",
          heading: "Vault Profile",
          paragraphs: [...profile, ...origin],
        },
        canonicalBoundary,
        {
          moduleId: "SOURCES_EVIDENCE_PREPARATION",
          heading: "Evidence and Preparation",
          paragraphs: [
            "Prepared from FairWatchTrade's canonical Vault hierarchy after the exact listing-to-reference identity was reviewed and confirmed.",
          ],
        },
      ];

  const templateVersion = article ? 2 : 1;

  return {
    templateVersion,
    identity: {
      brand: brandName,
      collection: collectionName,
      model: variantName,
      reference: referenceText,
      secondaryLabel: "Vault family",
      secondaryValue: familyName,
    },
    openingIdentity:
      article?.opening ??
      `Reference ${referenceText} resolves to the ${brandName} ${variantName} in the FairWatchTrade Vault.`,
    sections,
    listingSpecific: {
      moduleId: "LISTING_SPECIFIC_WATCH",
      heading: "The Listing-Specific Watch",
      supplied: false,
      readerNote:
        "Listing-specific facts are deliberately excluded from this canonical reference dossier and remain with the individual listing.",
      intent: "Keep canonical reference truth separate from one seller's watch.",
      fields: [
        field("Condition", null),
        field("Included items", null),
        field("Service information", null),
        field("Seller-provided provenance", null),
        field("Listing photographs", null),
        field("Current asking price", null),
      ],
    },
    preparationRecord: {
      heading: "Preparation record",
      fields: [
        field("Prepared date", preparedAt.toISOString()),
        field("Identity scope", "Exact Vault reference"),
        field("Dossier template version", String(templateVersion)),
        field("Listing revision", null),
      ],
    },
    /* The preview marks make a draft rendering visibly a draft in the
       document itself — a preview PDF can never be mistaken for, or
       circulated as, a published Dossier. */
    canary: {
      primary: "Collector Dossier",
      secondary:
        articleSource === "draft_preview"
          ? "Verified draft preview — not published"
          : "Reference-level artifact",
      state: "reference_production",
      authorizedToServe: articleSource !== "draft_preview",
      editorialManuscriptSha256: article?.manuscriptSha256 ?? null,
      editorialDeltaSha256: article?.deltaSha256 ?? null,
    },
  };
}
