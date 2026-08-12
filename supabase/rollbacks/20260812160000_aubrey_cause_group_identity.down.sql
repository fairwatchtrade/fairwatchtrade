-- Rollback for Aubrey Check Step 2 — cause-group identity.
-- Removes only the objects the forward migration added. Every pre-existing
-- evidence row, column and constraint survives untouched.

drop index if exists public.listing_integrity_evidence_cause_group_idx;

alter table public.listing_integrity_evidence
  drop constraint if exists listing_integrity_evidence_cause_neutral_requires_group_check,
  drop constraint if exists listing_integrity_evidence_cause_neutral_reason_check,
  drop constraint if exists listing_integrity_evidence_cause_group_pair_check,
  drop constraint if exists listing_integrity_evidence_cause_group_kind_check;

alter table public.listing_integrity_evidence
  drop column if exists cause_neutral_reason,
  drop column if exists cause_group_kind,
  drop column if exists cause_group_key;
