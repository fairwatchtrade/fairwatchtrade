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
  preparedAt = new Date()
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

  const sections: DossierSection[] = [
    {
      moduleId: "EXACT_REFERENCE",
      heading: "Exact Reference",
      paragraphs: [
        `The governed Vault chain for reference ${referenceText} is ${brandName} → ${collectionName} → ${familyName} → ${variantName}.`,
        "This is a reference-level artifact. It can be reused by multiple live listings only when each listing resolves to this same exact Vault reference.",
      ],
    },
    {
      moduleId: "VAULT_PROFILE",
      heading: "Vault Profile",
      paragraphs: [...profile, ...origin],
    },
    {
      moduleId: "CANONICAL_BOUNDARY",
      heading: "Canonical Boundary",
      paragraphs: [
        "Seller-specific condition, photographs, included items, service claims, asking price and seller-provided provenance are not part of this canonical reference dossier. They remain attached to the individual listing.",
        "This dossier records the governed Vault identity available at preparation time. It does not authenticate, grade or describe the present condition of any individual watch.",
      ],
    },
    {
      moduleId: "SOURCES_EVIDENCE_PREPARATION",
      heading: "Evidence and Preparation",
      paragraphs: [
        "Prepared from FairWatchTrade's canonical Vault hierarchy after the exact listing-to-reference identity was reviewed and confirmed.",
      ],
    },
  ];

  return {
    identity: {
      brand: brandName,
      collection: collectionName,
      model: variantName,
      reference: referenceText,
      secondaryLabel: "Vault family",
      secondaryValue: familyName,
    },
    openingIdentity: `Reference ${referenceText} resolves to the ${brandName} ${variantName} in the FairWatchTrade Vault.`,
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
        field("Dossier template version", "1"),
        field("Listing revision", null),
      ],
    },
    canary: {
      primary: "Collector Dossier",
      secondary: "Reference-level artifact",
      state: "reference_production",
      authorizedToServe: true,
      editorialManuscriptSha256: null,
      editorialDeltaSha256: null,
    },
  };
}
