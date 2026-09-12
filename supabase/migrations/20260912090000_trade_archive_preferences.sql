-- ═══════════════════════════════════════════════════════════════════════════
-- TRADE ARCHIVE PREFERENCES — private, per-participant, reversible (2026-09-12)
--
-- THE MISCONCEPTION THIS MIGRATION EXISTS TO KILL:
--
--   "Archive is a property of the trade."
--
-- It is not. Archive is a property of one person's workspace. Two people
-- share a trade and each may be done looking at it on a different day, so
-- the preference cannot live on the shared record — and on THIS schema it
-- provably must not: `trade_deals_select_party` and `trade_offers_select_party`
-- grant SELECT to BOTH parties on the whole row, so an `archived_by_a`
-- column would be readable by party B the moment it existed. "We don't
-- render it" is not privacy. Hence a narrow own-user table (order §11.2).
--
-- This table owns NO commercial truth. It cannot: it holds a user, a record
-- identity, and two timestamps. Nothing here can change a deal's status, a
-- leg, a transfer event, cash direction, cash amount, a listing reservation
-- or completion provenance, because none of those words appear in it.
--
-- ── THE GENERATION COLUMN, WHICH IS THE WHOLE OF §13 ──────────────────────
-- `record_updated_at` is the target record's own `updated_at` AT THE INSTANT
-- IT WAS ARCHIVED, captured server-side. A preference applies only while the
-- record still carries that exact generation.
--
-- Both trade tables already maintain `updated_at` by their own database
-- trigger (`trg_trade_deals_updated_at`, `trg_trade_offers_updated_at`), so
-- this is a governed lifecycle generation that already existed — not a new
-- versioning system invented for archive. Any authoritative change moves it:
-- a completed deal retracted back to settling, a cancelled deal revived, a
-- second terminal episode after a reactivation. In every one of those cases
-- the stored generation no longer matches, the preference stops applying,
-- and the record returns to Active for that user — who may archive it again
-- if and when it finishes again. An old archive bit can never hide a new
-- episode, and actionable `settling` truth can never sit in Archived.
--
-- Writes go only through `trade_archive_set()`, which derives the caller,
-- proves participation, and recomputes eligibility from live status. The
-- browser may say only WHICH record and WHETHER to archive.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.trade_archive_preferences (
  user_id           uuid        not null references auth.users (id) on delete cascade,
  record_kind       text        not null check (record_kind in ('deal', 'offer')),
  record_id         uuid        not null,
  archived_at       timestamptz not null default now(),
  record_updated_at timestamptz not null,
  primary key (user_id, record_kind, record_id)
);

comment on table public.trade_archive_preferences is
  'One person''s private decision to file a finished trade out of their Active view. Presentation only: no commercial truth, never visible to the counterparty. A row applies only while record_updated_at still matches the target record''s current updated_at.';
comment on column public.trade_archive_preferences.record_updated_at is
  'The target record''s updated_at when archived. Any authoritative lifecycle change moves updated_at and silently retires this preference, returning the record to Active.';

create index if not exists trade_archive_preferences_record
  on public.trade_archive_preferences (record_kind, record_id);

alter table public.trade_archive_preferences enable row level security;

-- Own rows only, and only for reading. There is no INSERT/UPDATE/DELETE
-- policy on purpose: every write is a participation-checked RPC below, so a
-- client cannot mint a preference for a trade it is not part of.
drop policy if exists trade_archive_preferences_select_own on public.trade_archive_preferences;
create policy trade_archive_preferences_select_own
  on public.trade_archive_preferences for select
  using (user_id = auth.uid());

revoke all on public.trade_archive_preferences from anon, authenticated;
grant select on public.trade_archive_preferences to authenticated;

-- ── The one mutation ──────────────────────────────────────────────────────
create or replace function public.trade_archive_set(
  p_record_kind text,
  p_record_id   uuid,
  p_archived    boolean
) returns jsonb
  language plpgsql
  security definer
  set search_path to ''
as $function$
declare
  v_caller  uuid := auth.uid();
  v_status  text;
  v_updated timestamptz;
  v_ok      boolean;
begin
  if v_caller is null then
    raise exception 'not_authenticated';
  end if;
  if p_record_kind not in ('deal', 'offer') then
    raise exception 'bad_record_kind';
  end if;

  /* Participation and existence in one read. A stranger and a missing row
     get the SAME answer: a trade this caller is not part of must not be
     confirmed to exist by the shape of the refusal. */
  if p_record_kind = 'deal' then
    select d.status, d.updated_at into v_status, v_updated
    from public.trade_deals d
    where d.id = p_record_id
      and (d.party_a_id = v_caller or d.party_b_id = v_caller);
  else
    select o.status, o.updated_at into v_status, v_updated
    from public.trade_offers o
    where o.id = p_record_id
      and (o.proposer_id = v_caller or o.recipient_id = v_caller);
  end if;

  if v_status is null then
    raise exception 'not_found';
  end if;

  /* RESTORE — idempotent, and never blocked by eligibility. A record that
     became active again while archived must always be releasable. */
  if p_archived is not true then
    delete from public.trade_archive_preferences
    where user_id = v_caller and record_kind = p_record_kind and record_id = p_record_id;
    return jsonb_build_object('record_kind', p_record_kind, 'record_id', p_record_id, 'archived', false);
  end if;

  /* ARCHIVE — eligibility from CURRENT status, recomputed here rather than
     trusted from the browser. Leg status is not read: the deal owns the
     deal's lifecycle, and a moving watch is not a finished agreement. */
  v_ok := case
    when p_record_kind = 'deal'  then v_status in ('completed', 'cancelled')
    else                              v_status in ('declined', 'superseded', 'withdrawn')
  end;
  if not v_ok then
    raise exception 'not_eligible:%', v_status;
  end if;

  insert into public.trade_archive_preferences (user_id, record_kind, record_id, archived_at, record_updated_at)
  values (v_caller, p_record_kind, p_record_id, now(), v_updated)
  on conflict (user_id, record_kind, record_id) do update
    set archived_at = now(), record_updated_at = excluded.record_updated_at;

  return jsonb_build_object(
    'record_kind', p_record_kind,
    'record_id', p_record_id,
    'archived', true,
    'generation', v_updated
  );
end;
$function$;

revoke all on function public.trade_archive_set(text, uuid, boolean) from public, anon;
grant execute on function public.trade_archive_set(text, uuid, boolean) to authenticated;

comment on function public.trade_archive_set(text, uuid, boolean) is
  'Archive or restore one finished trade record for the CALLING user only. Derives the user, proves participation, recomputes eligibility from live deal/offer status (never leg status), and stamps the record generation. Idempotent both ways. Changes no commercial truth.';
