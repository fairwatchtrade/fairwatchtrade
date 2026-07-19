import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import PurchaseRequestForm from "@/components/PurchaseRequestForm";

/* ────────────────────────────────────────────────────────────────────────
   PURCHASE REQUEST — /listings/[id]/purchase-request  (v2.28)

   Server wrapper for the approved Buyer Purchase Request Design Gate. Fetches
   the listing for DISPLAY CONTEXT only — no write happens here; the form POSTs
   to /api/purchase-requests, which creates the authoritative snapshot with
   buyer_id derived from the live session, never the client.

   v2.28:
   · Auth gate now preserves the destination: an unauthenticated visitor is
     sent to /login?callbackUrl=<this form> so they return here after signing
     in (safe internal path — server-constructed, not request-controlled).
   · Fetches condition + documentation + has_bracelet + closureType so the
     read-only "Listing details" panel is derived from live seller truth
     (Included from documentation; Strap/Bracelet from has_bracelet +
     closureType). originalStrapBracelet is deliberately NOT used — it is a
     boolean-like originality flag, not strap material/colour.
   · A seller landing on their own listing's purchase-request URL is bounced
     back to the listing detail page — this form is buyer-only.
   ──────────────────────────────────────────────────────────────────────── */

type ListingPhoto = { photo: { url: string }; category: string };

type ListingDetails = {
  documentation?: string;
  closureType?: string;
};

type ListingForRequest = {
  id: string;
  brand: string;
  model: string | null;
  reference: string;
  asking_price: number;
  condition: string | null;
  has_bracelet: boolean | null;
  details: ListingDetails | null;
  photos: ListingPhoto[];
  seller_id: string;
  status: string;
};

// Included row — derived from the listing's documentation only. Unknown or
// missing values are omitted rather than guessed.
function includedFromDocumentation(doc?: string): string | null {
  switch (doc) {
    case "Full Set":
      return "Watch, box, and papers";
    case "Papers Only":
      return "Watch and papers";
    case "Box Only":
      return "Watch and box";
    case "Watch Only":
      return "Watch only";
    default:
      return null;
  }
}

// Strap / Bracelet row — derived from has_bracelet, with the closure appended
// only when present. Never invents colour, material, or manufacturer.
function strapFromListing(hasBracelet: boolean | null, closureType?: string): string {
  const base = hasBracelet ? "Bracelet" : "Strap";
  return closureType && closureType.trim() !== "" ? `${base} · ${closureType}` : base;
}

export default async function PurchaseRequestPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    // Preserve intent: return the buyer to this exact form after sign-in.
    redirect(`/login?callbackUrl=/listings/${id}/purchase-request`);
  }

  const { data, error } = await supabase
    .from("listings")
    .select(
      "id, brand, model, reference, asking_price, condition, has_bracelet, details, photos, seller_id, status"
    )
    .eq("id", id)
    .single();

  if (error || !data || data.status !== "published") {
    notFound();
  }

  const listing = data as ListingForRequest;

  // Sellers don't purchase-request their own listings.
  if (listing.seller_id === user.id) {
    redirect(`/listings/${listing.id}`);
  }

  const { data: sellerProfile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", listing.seller_id)
    .single();

  const sellerName = sellerProfile?.display_name ?? "Private Collector";

  const photos = Array.isArray(listing.photos) ? listing.photos : [];
  const dial = photos.find((p) => p?.category === "Dial");
  const heroUrl = (dial ?? photos[0])?.photo?.url ?? null;

  const details = (listing.details ?? {}) as ListingDetails;

  return (
    <PurchaseRequestForm
      listing={{
        id: listing.id,
        brand: listing.brand,
        model: listing.model,
        reference: listing.reference,
        askingPrice: Number(listing.asking_price),
        heroUrl,
        sellerName,
        condition: listing.condition ?? null,
        included: includedFromDocumentation(details.documentation),
        strap: strapFromListing(listing.has_bracelet, details.closureType),
      }}
    />
  );
}
