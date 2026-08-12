-- Aubrey Check Step 2 — cause-group identity on promoted evidence.
--
-- Several measurements can arise from ONE underlying cause. An exact
-- retained-byte recurrence and a future perceptual match on the same pair of
-- photographs are two observations of one suspected shared photograph, not two
-- independent corroborating findings. Each measurement is still retained
-- separately for inspection; they merely share a cause identity so a future
-- scoring model can count the cause once.
--
-- Assigned at evidence-write time. Nothing here holds, rejects, accuses, or
-- changes a listing: exact-hash evidence remains memory, not judgment.

alter table public.listing_integrity_evidence
  add column cause_group_key text,
  add column cause_group_kind text,
  add column cause_neutral_reason text;

alter table public.listing_integrity_evidence
  -- Cause-kind vocabulary. 'exact_retained_bytes' keys on the retained-byte
  -- digest itself, so every observation of the same bytes shares one cause.
  -- 'provider_result' is the independent default: one measurement, one cause.
  add constraint listing_integrity_evidence_cause_group_kind_check
    check (
      cause_group_kind is null
      or cause_group_kind in ('exact_retained_bytes', 'provider_result')
    ),
  -- Key and kind are present together or absent together. Absent is legal:
  -- rows promoted before this migration carry no cause identity and are
  -- counted by their own row identity instead.
  add constraint listing_integrity_evidence_cause_group_pair_check
    check (
      (cause_group_key is null and cause_group_kind is null)
      or (cause_group_key is not null and cause_group_kind is not null)
    ),
  -- Neutrality is an explicit, named, inspectable observation — never an
  -- inferred silence. A seller relisting their own watch produces byte-
  -- identical recurrence and is entirely legitimate.
  add constraint listing_integrity_evidence_cause_neutral_reason_check
    check (
      cause_neutral_reason is null
      or cause_neutral_reason in ('same_seller_recurrence')
    ),
  -- Neutrality only ever qualifies a cause that exists.
  add constraint listing_integrity_evidence_cause_neutral_requires_group_check
    check (cause_neutral_reason is null or cause_group_key is not null);

-- Deliberately NON-UNIQUE, for the same reason the Flight 1 hash index is:
-- recurrence within one listing is exactly what a cause group must permit.
create index listing_integrity_evidence_cause_group_idx
  on public.listing_integrity_evidence (listing_id, cause_group_key)
  where cause_group_key is not null;

comment on column public.listing_integrity_evidence.cause_group_key is
  'Shared identity for measurements arising from one underlying cause. Exact-layer rows key on sha256:<retained-byte digest>; every other measurement keys on its own result:<provider_result_id> and therefore counts once. Null on rows promoted before Step 2.';

comment on column public.listing_integrity_evidence.cause_group_kind is
  'How cause_group_key was derived: exact_retained_bytes | provider_result.';

comment on column public.listing_integrity_evidence.cause_neutral_reason is
  'Named legitimate explanation for a cause, recorded as evidence and never as an adverse signal. same_seller_recurrence: every recurring copy belongs to the same seller.';

comment on index public.listing_integrity_evidence_cause_group_idx is
  'Non-unique by design. Recurrence is the evidence a cause group must permit.';
