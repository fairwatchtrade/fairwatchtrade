/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER · BREGUET 5967 — PRIVATE UNBOUND CANARY SEED

   The single immutable server-side seed for the first real Collector
   Dossier. This is deliberately NOT a Vault identity.

   Reference 5967BB/11/9W6 is not presently in the canonical Vault. This
   seed therefore stands alone: it creates no Vault row, no identity
   decision, and no listing binding, and it must never be read as public
   identity authority. `authorizedToServe` is false and stays false until
   a separate authorization exists.

   Editorial inputs are hash-bound. The two SHA-256 values below identify
   the exact v3 manuscript and delta manifest this dossier renders from.
   Stale v1 files of near-identical name exist beside them; the hashes —
   never the filenames — decide which content is legitimate.
   ──────────────────────────────────────────────────────────────────────── */

export type CanaryState = "PRIVATE_UNBOUND_CANARY";

export type Breguet5967CanarySeed = {
  readonly brand: string;
  readonly collection: string;
  readonly model: string;
  readonly reference: string;
  readonly caseMaterial: string;
  readonly editorialManuscriptSha256: string;
  readonly editorialDeltaSha256: string;
  readonly canaryState: CanaryState;
  readonly authorizedToServe: false;
};

export const BREGUET_5967_CANARY_SEED: Breguet5967CanarySeed = Object.freeze({
  brand: "Breguet",
  collection: "Classique",
  model: "5967",
  reference: "5967BB/11/9W6",
  caseMaterial: "18K white gold",
  editorialManuscriptSha256:
    "6897c3d6ccb6d1573cbc8febffed0da05bbcca02e004018c2317c9e8d6c9b130",
  editorialDeltaSha256:
    "4ea40296bb6a436846b95f912525d6361024fdf17d3903dc1873d86f37c3f79b",
  canaryState: "PRIVATE_UNBOUND_CANARY",
  authorizedToServe: false,
});

/* The two lines that must appear in the HTML and on every PDF page.
   Subordinate to the watch in weight, unmistakable in meaning. */
export const CANARY_MARK_PRIMARY = "PRIVATE UNBOUND CANARY";
export const CANARY_MARK_SECONDARY = "NOT PUBLICATION AUTHORIZED";

/* Slug used by both the private route and the PDF endpoint. */
export const BREGUET_5967_CANARY_SLUG = "breguet-5967bb-11-9w6";
