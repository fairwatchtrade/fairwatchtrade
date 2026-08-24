-- ════════════════════════════════════════════════════════════════════════
-- MONACO PROVENANCE STATEMENTS — stop asserting what the source never said
-- supabase/migrations/20260824090000_monaco_price_basis_provenance_correction.sql
--
-- Three stored `price_basis_statement` values describe production
-- incorrectly. Two of them became wrong as a direct consequence of this
-- repair; one was over-specific from the beginning.
--
-- ── ET36 — THE OVER-SPECIFIC ONE ───────────────────────────────────────
-- The stored statement asserts the website figures are "source-native on a
-- TTC premium basis". The governed Layer 2 corpus says something narrower
-- and more honest: Monaco's website displays `Result (Premium)`, and the
-- ET36 page does NOT explicitly state the VAT basis.
--
-- The ~1.04 arithmetic observed against other sales is real evidence that a
-- VAT-basis distinction may exist. It is not proof that this figure is
-- ex-VAT, and it must never be used to transform the number. A provenance
-- note that names a basis the source does not establish is exactly the
-- failure the price-basis vocabulary was widened to prevent — it just fails
-- in prose instead of in a column.
--
-- The same statement also said "no realized price is recorded from this
-- source", which stopped being true when the 232 corpus values were
-- ingested.
--
-- ── ET33 / ET35 — MADE STALE BY THIS REPAIR ────────────────────────────
-- Both said the results were "recorded with price_basis 'other' because the
-- schema vocabulary has no premium+VAT value". That was an honest and
-- accurate note when written. The vocabulary now HAS such a value and those
-- rows carry it, so the sentence now describes a production state that no
-- longer exists.
--
-- Correcting these is not scope creep: leaving a provenance note that
-- contradicts the data it describes would be finishing the repair halfway.
-- The historical reason is preserved in the new text rather than deleted,
-- because why a fallback was chosen is worth keeping.
--
-- ── WHY A MIGRATION AND NOT THE RIGHTS RPC ─────────────────────────────
-- `auction_evidence_update_artifact_rights_state` governs RIGHTS —
-- permission, publication, retention, public-use scope. A price-basis
-- statement is PROVENANCE. Extending the rights function to carry it would
-- blur two boundaries the order is explicit about keeping separate, and the
-- order forbids inventing a second rights mechanism. A migration is the
-- audit trail for a bounded data correction of this shape.
--
-- Matched on sale name and current text rather than on generated ids, so
-- this migration is reproducible against a restored database.
-- ════════════════════════════════════════════════════════════════════════

begin;

-- ── ET36 ────────────────────────────────────────────────────────────────
update public.auction_evidence_source_artifact a
   set price_basis_statement =
'Monaco''s website displays "Result (Premium)". The ET36 page does not explicitly state the VAT basis, so the composition of these figures is UNRESOLVED. The source-reported values are trusted and stored exactly as displayed, in EUR, under price_basis ''reported_result_basis_unverified''. No 1.04 conversion, no ex-VAT inference, no TTC inference, and no inheritance of ET33/ET35 semantics has been applied. Cross-source evidence makes a VAT-basis distinction plausible but does not establish one; these rows are publishable as factual results and are NOT eligible for normalized cross-house statistical comparison until their semantics are reconciled.'
  from public.auction_evidence_sale s
 where s.id = a.sale_id
   and s.sale_name = 'Exclusive Timepieces 36'
   and a.price_basis_statement like '%TTC premium basis%';

-- ── ET33 / ET35 ─────────────────────────────────────────────────────────
update public.auction_evidence_source_artifact a
   set price_basis_statement =
'Official auction results in EUR including buyer''s premium and VAT, recorded under price_basis ''result_including_premium_and_vat''. Historical note: these rows were originally recorded as ''other'' because the schema vocabulary then had no value capable of expressing premium+VAT semantics — a deliberate fallback, not a mapping error. The vocabulary now carries the exact value and the rows have been migrated to it through the governed correction path; the stored amounts and currencies were never altered.'
  from public.auction_evidence_sale s
 where s.id = a.sale_id
   and s.sale_name in ('Exclusive Timepieces 33','Exclusive Timepieces 35')
   and a.price_basis_statement like '%no premium+VAT value%';

-- Prove the correction landed and that nothing still asserts the old claims.
do $$
declare v_ttc int; v_stale int;
begin
  select count(*) into v_ttc from public.auction_evidence_source_artifact
   where price_basis_statement like '%TTC premium basis%';
  select count(*) into v_stale from public.auction_evidence_source_artifact
   where price_basis_statement like '%no premium+VAT value%';
  if v_ttc <> 0 then raise exception 'a TTC overclaim survived (% rows)', v_ttc; end if;
  if v_stale <> 0 then raise exception 'a stale ''other'' provenance note survived (% rows)', v_stale; end if;
end $$;

commit;
