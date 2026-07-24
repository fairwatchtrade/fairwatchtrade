// ════════════════════════════════════════════════════════════════════════
// Auction Evidence Preservation Layer — hand-written domain types (v2.61)
//
// Mirrors the DB CHECK constraints as string-literal unions (repo convention:
// text + CHECK, not native Postgres enums — see lib/listing.ts, types/shipping.ts).
// No type-generation tooling is used. Keep these in lockstep with the migration
// 20260723214500_auction_evidence_preservation_layer.sql.
//
// This schema deliberately contains NO Vault reference/variant fields.
// ════════════════════════════════════════════════════════════════════════

// ── Source Artifact — five independent permission/retention axes ──
export type IntakeMethod =
  | "automated"
  | "public_file"
  | "founder_supplied_file"
  | "manual_entry";

export type PermissionStatus =
  | "permitted"
  | "authorized_or_licensed"
  | "restricted"
  | "unresolved";

export type AutomationStatus = "allowed" | "disabled" | "not_applicable";

export type PublicationStatus =
  | "allowed"
  | "internal_only"
  | "blocked"
  | "unresolved";

export type ArtifactRetentionScope =
  | "metadata_only"
  | "full_artifact_private"
  | "full_artifact_publishable";

// ── Result ──
export type PriceBasis = "hammer" | "hammer_plus_premium" | "other";
export type SaleOutcome = "sold" | "passed" | "withdrawn";

// ── Rights events — locked four-value vocabulary (mirror of DB CHECK) ──
export type RightsEventType =
  | "rights_state_change"
  | "takedown"
  | "restriction"
  | "blocking";

// The complete six-key snapshot stored in prior_state / resulting_state.
// Every event row carries all six keys, every time.
export interface ArtifactRightsSnapshot {
  intake_method: IntakeMethod;
  permission_status: PermissionStatus;
  automation_status: AutomationStatus;
  publication_status: PublicationStatus;
  artifact_retention_scope: ArtifactRetentionScope;
  full_artifact_storage_path: string | null;
}

// ── Row shapes ──

export interface AuctionEvidenceHouse {
  id: string;
  name: string;
  slug: string; // UNIQUE
  website_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionEvidenceSale {
  id: string;
  house_id: string; // FK -> auction_evidence_house(id)
  sale_name: string;
  sale_date: string | null;
  location: string | null;
  source_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionEvidenceSourceArtifact {
  id: string;
  sale_id: string; // FK -> auction_evidence_sale(id); (id, sale_id) is UNIQUE
  source_url: string;
  retrieved_at: string;
  content_hash: string | null; // 64-char hex SHA-256 when present (CHECK-enforced)
  // Six protected rights/state fields — mutated ONLY via the rights-state RPC:
  intake_method: IntakeMethod;
  permission_status: PermissionStatus;
  automation_status: AutomationStatus;
  publication_status: PublicationStatus;
  artifact_retention_scope: ArtifactRetentionScope;
  full_artifact_storage_path: string | null; // NULL iff retention scope is metadata_only
  // Ordinary descriptive fields — directly writable by the service client:
  attribution_note: string | null;
  price_basis_statement: string | null;
  omission_statement: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionEvidenceLot {
  id: string;
  sale_id: string; // FK -> auction_evidence_sale(id); UNIQUE with lot_number
  lot_number: string;
  brand_text: string | null; // as stated by the house — NOT a Vault reference
  model_text: string | null;
  reference_text: string | null;
  description: string | null;
  // (source_artifact_id, sale_id) composite FK -> source_artifact(id, sale_id):
  // a lot can only reference an artifact from its own sale.
  source_artifact_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface AuctionEvidenceResult {
  id: string;
  chain_root_id: string; // original row is self-rooted (chain_root_id = id)
  supersedes_result_id: string | null; // null on the original; set server-side on corrections
  is_current: boolean; // one current per chain AND one current per lot (partial unique indexes)
  lot_id: string; // immutable across a chain
  // price/currency/basis are all-present or all-absent; only 'sold' may carry them:
  price_realized: number | null;
  currency: string | null; // ISO 4217 (three uppercase letters)
  price_basis: PriceBasis | null;
  sale_outcome: SaleOutcome;
  result_date: string | null;
  source_artifact_id: string | null; // same-sale as lot, enforced in the RPC
  reviewed_by: string; // NOT NULL — recorded from the founder-gated route
  reviewed_at: string; // NOT NULL
  created_at: string;
  updated_at: string;
}

export interface AuctionEvidenceSourceArtifactEvent {
  id: string;
  source_artifact_id: string; // FK -> source_artifact(id) ON DELETE RESTRICT
  event_type: RightsEventType;
  prior_state: ArtifactRightsSnapshot; // jsonb, all six keys
  resulting_state: ArtifactRightsSnapshot; // jsonb, all six keys
  reason: string | null; // required (non-empty) for takedown/restriction/blocking
  actor_uid: string;
  created_at: string; // append-only: no updated_at
}

// The complete five-key snapshot stored in a lot-fact event's
// prior_state / resulting_state. Every event row carries all five keys.
export interface LotFactSnapshot {
  brand_text: string | null;
  model_text: string | null;
  reference_text: string | null;
  description: string | null;
  source_artifact_id: string | null;
}

export interface AuctionEvidenceLotFactEvent {
  id: string;
  lot_id: string; // FK -> auction_evidence_lot(id) ON DELETE RESTRICT
  prior_state: LotFactSnapshot; // jsonb, all five keys, built server-side
  resulting_state: LotFactSnapshot; // jsonb, all five keys, built server-side
  prior_source_artifact_id: string | null;
  resulting_source_artifact_id: string; // every correction re-anchors to evidence
  correction_reason: string; // non-blank (CHECK-enforced)
  reviewer_uid: string;
  created_at: string; // append-only: no updated_at
}

// ── RPC parameter contracts ──

// public.auction_evidence_create_or_correct_result(...)
// p_supersedes_result_id null => new chain (lot must have no existing chain);
// present => correct the CURRENT row. chain_root_id + lot_id are derived from
// the locked row on corrections; supersedes_result_id is set server-side.
export interface AuctionEvidenceResultUpsertParams {
  p_lot_id: string;
  p_price_realized: number | null;
  p_currency: string | null;
  p_price_basis: PriceBasis | null;
  p_sale_outcome: SaleOutcome;
  p_result_date: string | null;
  p_source_artifact_id: string | null;
  p_supersedes_result_id: string | null;
  p_reviewer_uid: string;
}

// public.auction_evidence_update_artifact_rights_state(...)
// Change-flag + value per protected field: flag=false carries the field forward
// unchanged; flag=true applies the value exactly, INCLUDING null (which is what
// makes the full_artifact_private -> metadata_only path-clearing transition
// representable). prior_state/resulting_state are built entirely server-side.
export interface AuctionEvidenceUpdateArtifactRightsStateParams {
  p_source_artifact_id: string;
  p_change_intake_method: boolean;
  p_new_intake_method: IntakeMethod | null;
  p_change_permission_status: boolean;
  p_new_permission_status: PermissionStatus | null;
  p_change_automation_status: boolean;
  p_new_automation_status: AutomationStatus | null;
  p_change_publication_status: boolean;
  p_new_publication_status: PublicationStatus | null;
  p_change_artifact_retention_scope: boolean;
  p_new_artifact_retention_scope: ArtifactRetentionScope | null;
  p_change_full_artifact_storage_path: boolean;
  p_new_full_artifact_storage_path: string | null;
  p_event_type: RightsEventType;
  p_reason: string | null;
  p_actor_uid: string;
}

// public.auction_evidence_correct_lot_facts(...)
// The ONLY application path that corrects the five protected reported-fact
// columns on auction_evidence_lot. Same set-flag presence semantics as the
// rights-state RPC: flag=false leaves the field unchanged; flag=true applies
// the value exactly, INCLUDING null — clearing a fact and leaving it alone are
// two different calls. prior_state/resulting_state are built server-side from
// the locked row; the update and its event append atomically.
export interface AuctionEvidenceCorrectLotFactsParams {
  p_lot_id: string;
  p_set_brand_text: boolean;
  p_new_brand_text: string | null;
  p_set_model_text: boolean;
  p_new_model_text: string | null;
  p_set_reference_text: boolean;
  p_new_reference_text: string | null;
  p_set_description: boolean;
  p_new_description: string | null;
  p_resulting_source_artifact_id: string; // required — corrections re-anchor to evidence
  p_correction_reason: string; // non-blank
  p_reviewer_uid: string;
}
