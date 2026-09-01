-- ═══════════════════════════════════════════════════════════════════════
-- AUCTION OPERATIONS — retired is terminal
--
-- THE DEFECT THIS FILE EXISTS TO KILL:
--
--   A retired packet revision could be activated again.
--
-- Live verification found it, and it reported as a NOTE rather than a
-- failure because nothing visibly broke: the switch ran in reverse, exactly
-- one revision stayed active, and every invariant the constraints police
-- still held. What it quietly destroyed was history.
--
-- A revision row carries ONE activated_by, ONE activated_at and ONE
-- retired_at. Re-activating a retired row overwrites the first two and
-- clears the third, so the record of when that revision governed — the
-- record every run bound to it depends on for provenance — is gone. There
-- is no second slot for it to move to. The row does not become wrong; it
-- becomes a different, later claim wearing the same id.
--
-- ── THE RULE, STATED POSITIVELY ────────────────────────────────────────
--
--   Only an approved revision whose activation_state = 'inactive'
--   may become active.
--
-- Written as an allowlist rather than as "not retired", because an
-- exclusion list is one new state away from being wrong again, and a
-- positive rule refuses anything it has not been taught to permit.
--
--   approved + inactive  →  active
--   active               →  already_active
--   retired              →  retired_is_terminal
--
-- ── RESTORING OLD MECHANICS ────────────────────────────────────────────
-- To bring back a retired revision's mechanics, do NOT reactivate the row.
-- Create a new revision carrying them, validate it, approve it, activate
-- it. The retired row keeps its own lifecycle intact and the restored
-- mechanics get their own attribution, which is the honest description of
-- what actually happened.
--
-- ── WHAT IS NOT BUILT HERE ─────────────────────────────────────────────
-- No activation event ledger. A ledger would make reactivation safe by
-- giving history somewhere to live, and it may well be the right answer
-- later — but it is a schema for recording events, not a two-line
-- eligibility fix, and it is deliberately out of scope.
--
-- This migration replaces ONLY the activation function. No table, no
-- constraint, no index, no grant, no row.
--
-- Verify:
--   select prosrc like '%retired_is_terminal%'
--     from pg_proc where proname = 'auction_operations_activate_packet_revision';
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.auction_operations_activate_packet_revision(
  p_revision_id uuid,
  p_actor       uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  v_packet_id text;
  v_row       public.auction_operations_packet_revision%rowtype;
  v_retired   uuid;
begin
  select packet_id into v_packet_id
    from public.auction_operations_packet_revision
   where id = p_revision_id;
  if v_packet_id is null then
    raise exception 'unknown_revision' using errcode = 'no_data_found';
  end if;

  -- Serialize every concurrent switch on this packet, in a fixed order.
  perform 1
     from public.auction_operations_packet_revision
    where packet_id = v_packet_id
    order by id
      for update;

  -- Re-read under the lock: what was true before it is not evidence.
  select * into v_row
    from public.auction_operations_packet_revision
   where id = p_revision_id;

  if v_row.approval_state <> 'approved' then
    raise exception 'not_approved' using errcode = 'check_violation';
  end if;

  if v_row.activation_state = 'active' then
    raise exception 'already_active' using errcode = 'unique_violation';
  end if;

  if v_row.activation_state = 'retired' then
    raise exception 'retired_is_terminal' using errcode = 'check_violation';
  end if;

  -- The positive rule. Anything that is not explicitly inactive is refused,
  -- including a state added after this function was written.
  if v_row.activation_state <> 'inactive' then
    raise exception 'not_activatable' using errcode = 'check_violation';
  end if;

  update public.auction_operations_packet_revision
     set activation_state = 'retired',
         retired_at       = now()
   where packet_id = v_packet_id
     and activation_state = 'active'
  returning id into v_retired;

  update public.auction_operations_packet_revision
     set activation_state = 'active',
         activated_by     = p_actor,
         activated_at     = now()
   where id = p_revision_id;

  return jsonb_build_object(
    'activated', p_revision_id,
    'retired',   v_retired,
    'packet_id', v_packet_id
  );
end;
$$;

comment on function public.auction_operations_activate_packet_revision(uuid, uuid) is
  'Atomic packet revision switch. Only an approved, INACTIVE revision may become active; retired is terminal, so a retired row can never overwrite its own activation history. Retires the incumbent and activates the target in one transaction under a deterministic family lock.';
