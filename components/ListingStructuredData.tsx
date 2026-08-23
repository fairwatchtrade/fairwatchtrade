import { SITE_URL, listingUrl } from "@/lib/discovery/publicDiscovery";

/* ════════════════════════════════════════════════════════════════════════
   LISTING STRUCTURED DATA — the canonical page, made legible  (v6.44)

   The discovery API is how an agent SEARCHES FairWatchTrade. This is how an
   agent that already has a listing URL — pasted by the collector, remembered
   from a previous conversation, followed from anywhere — reads that page
   without guessing from prose. Same facts, same canonical object, second
   entrance. One listing, multiple discovery entrances.

   THE GATE THAT MATTERS. This renders for a PUBLISHED listing and nothing
   else. The listing page also serves 'reserved' and 'private_active' rows to
   the accounts authorized to see them, and a private listing's facts must
   never be emitted as machine-readable structured data — a viewer's browser
   extension, a summarizer, or a page-reading agent would carry them straight
   out. The caller passes `status`; anything but 'published' renders nothing.

   NOT AN SEO PASS. No meta tags, no titles, no descriptions, no canonical
   link element are touched here. This component adds one script element
   carrying the facts the page already displays, and nothing else about how
   the site is indexed changes.

   FACTS ONLY. Availability comes from marketplace status. Price comes from
   the listing. Nothing is inferred, rounded, or completed. Service documents
   are excluded by the same public photo predicate every other surface uses —
   the caller passes photographs already filtered through it.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

type Props = {
  status: string;
  id: string;
  publicCode: string | null;
  brand: string | null;
  model: string | null;
  reference: string | null;
  condition: string | null;
  description: string | null;
  price: number | null;
  currency: string | null;
  /** Already filtered through the public service-photo predicate. */
  photoUrls: string[];
  sellerName: string | null;
};

/** schema.org itemCondition, mapped only where FairWatchTrade's own condition
    vocabulary maps cleanly. An unmapped condition emits no claim rather than
    a wrong one. */
const CONDITION_URL: Record<string, string> = {
  New: "https://schema.org/NewCondition",
  Unworn: "https://schema.org/NewCondition",
  Excellent: "https://schema.org/UsedCondition",
  "Very Good": "https://schema.org/UsedCondition",
  Good: "https://schema.org/UsedCondition",
  Fair: "https://schema.org/UsedCondition",
};

export default function ListingStructuredData(props: Props) {
  if (props.status !== "published") return null;

  const name = [props.brand, props.model].filter(Boolean).join(" ").trim();
  if (name === "") return null;

  const url = listingUrl(props.id);

  const offer: Record<string, unknown> = {
    "@type": "Offer",
    url,
    availability: "https://schema.org/InStock",
    seller: props.sellerName
      ? { "@type": "Organization", name: props.sellerName }
      : { "@type": "Organization", name: "FairWatchTrade" },
  };
  if (props.price !== null && Number.isFinite(props.price)) {
    offer.price = props.price;
    offer.priceCurrency = props.currency ?? "USD";
  }

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": url,
    url,
    name,
    offers: offer,
    isPartOf: { "@type": "WebSite", name: "FairWatchTrade", url: SITE_URL },
  };

  if (props.brand) data.brand = { "@type": "Brand", name: props.brand };
  if (props.reference) data.mpn = props.reference;
  if (props.publicCode) data.sku = props.publicCode;
  if (props.description) data.description = props.description;
  if (props.photoUrls.length > 0) data.image = props.photoUrls;
  if (props.condition && CONDITION_URL[props.condition]) {
    offer.itemCondition = CONDITION_URL[props.condition];
  }

  return (
    <script
      type="application/ld+json"
      /* JSON.stringify escapes nothing dangerous here — every value is a
         database fact rendered as JSON — but "<" is closed off anyway so a
         description containing markup can never break out of the element. */
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, "\\u003c"),
      }}
    />
  );
}
