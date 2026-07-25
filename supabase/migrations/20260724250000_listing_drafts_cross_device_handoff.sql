-- ════════════════════════════════════════════════════════════════════════
-- LISTING DRAFTS — server-side draft + cross-device handoff  (List From Phone)
--
-- Single source of truth for an in-progress listing, owned by the authenticated
-- seller, so the same unfinished listing continues from desktop to phone.
-- V1 is HANDOFF WITH A BATON: exactly one active editor at a time.
--
-- Access law (order §5): only the authenticated OWNING seller may touch a draft.
-- There is NO direct client write policy — every write goes through a
-- SECURITY DEFINER RPC that re-checks ownership via auth.uid() and enforces the
-- baton + optimistic revision. Clients may only SELECT their own drafts (RLS).
--
-- The handoff identifier is a random, unguessable, short-lived, revocable token
-- scoped to one draft + one seller. It is NON-AUTHORITATIVE: redeeming requires
-- signing in as the same seller (auth.uid() = seller_id). The link never carries
-- a raw draft id, seller id, storage path, or bearer credential.
--
-- Publication remains the boundary where the real listings row is created
-- (/api/listings). This table never receives a public listing code.
--
-- Owner postgres, fixed search_path, no dynamic SQL — the house RPC pattern.
-- PFC274 = 62 — the evaluate route is untouched.
-- ════════════════════════════════════════════════════════════════════════

create table if not exists public.listing_drafts (
  id                  uuid        primary key default gen_random_uuid(),
  seller_id           uuid        not null references auth.users(id) on delete cascade,
  content             jsonb       not null default '{}'::jsonb,
  active_editor       text        not null default 'desktop',
  handoff_token       text,
  handoff_status      text        not null default 'none',
  handoff_expires_at  timestamptz,
  handoff_redeemed_at timestamptz,
  handoff_returned_at timestamptz,
  capture_session_id  uuid,
  revision            integer     not null default 0,
  status              text        not null default 'active',
  listing_id          uuid        references public.listings(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  last_activity_at    timestamptz not null default now(),
  constraint listing_drafts_active_editor_check check (active_editor in ('desktop','phone')),
  constraint listing_drafts_handoff_status_check check (handoff_status in ('none','issued','redeemed','expired','revoked','returned')),
  constraint listing_drafts_status_check check (status in ('active','published','abandoned'))
);

comment on table public.listing_drafts is
  'Server-side single source of truth for an in-progress listing (List From Phone). '
  'Owner-scoped; writes only via SECURITY DEFINER RPCs. V1 single-active-editor baton. '
  'Never receives a public listing code — the real listings row is created only at publish.';

alter table public.listing_drafts enable row level security;

-- Reads: the owning seller only. NO insert/update/delete policy — all writes go
-- through the controlled RPCs below (order §5: no unrestricted client writes).
create policy listing_drafts_select_own on public.listing_drafts
  for select using (auth.uid() = seller_id);

create index if not exists listing_drafts_seller_idx on public.listing_drafts (seller_id, updated_at desc);
create unique index if not exists listing_drafts_handoff_token_idx
  on public.listing_drafts (handoff_token) where handoff_token is not null;

-- Reads are RLS-guarded; the table is not writable by anon/authenticated
-- directly (no write policy). service_role keeps its defaults.
revoke insert, update, delete on public.listing_drafts from authenticated, anon;

-- ── helper: 2-hour handoff window (matches mobile_wizard_sessions) ─────────
create or replace function public.listing_draft_handoff_ttl() returns interval
language sql immutable set search_path = '' as $$ select interval '2 hours' $$;

-- ── create / initialize a draft for the authenticated seller ──────────────
create or replace function public.listing_draft_create(p_content jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); v_id uuid;
begin
  if v_uid is null then raise exception 'AUTH_REQUIRED'; end if;
  insert into public.listing_drafts (seller_id, content, active_editor)
  values (v_uid, coalesce(p_content, '{}'::jsonb), 'desktop')
  returning id into v_id;
  return v_id;
end $fn$;

-- ── save content (the active editor only; optimistic revision) ────────────
create or replace function public.listing_draft_save_content(
  p_draft_id uuid, p_content jsonb, p_expected_revision integer, p_editor text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  if r.status <> 'active' then return jsonb_build_object('state','NOT_ACTIVE','status',r.status); end if;
  if p_editor is distinct from r.active_editor then
    return jsonb_build_object('state','NOT_ACTIVE_EDITOR','active_editor',r.active_editor);
  end if;
  if p_expected_revision is distinct from r.revision then
    return jsonb_build_object('state','STALE','revision',r.revision);
  end if;
  update public.listing_drafts
     set content = coalesce(p_content,'{}'::jsonb), revision = revision + 1,
         updated_at = now(), last_activity_at = now()
   where id = p_draft_id;
  return jsonb_build_object('state','SAVED','revision', r.revision + 1);
end $fn$;

-- ── issue a scoped, expiring handoff token (re-issue revokes the prior) ────
create or replace function public.listing_draft_issue_handoff(
  p_draft_id uuid, p_capture_session_id uuid default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype; v_token text; v_exp timestamptz;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  if r.status <> 'active' then return jsonb_build_object('state','NOT_ACTIVE','status',r.status); end if;
  v_token := encode(extensions.gen_random_bytes(24), 'hex');  -- 48 hex chars, unguessable
  v_exp := now() + public.listing_draft_handoff_ttl();
  update public.listing_drafts
     set handoff_token = v_token, handoff_status = 'issued', handoff_expires_at = v_exp,
         handoff_redeemed_at = null, handoff_returned_at = null,
         capture_session_id = coalesce(p_capture_session_id, capture_session_id),
         updated_at = now()
   where id = p_draft_id;
  return jsonb_build_object('state','ISSUED','token', v_token, 'expires_at', v_exp);
end $fn$;

-- ── revoke an outstanding handoff (seller may cancel) ─────────────────────
create or replace function public.listing_draft_revoke_handoff(p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  update public.listing_drafts
     set handoff_token = null, handoff_status = 'revoked', handoff_expires_at = null,
         active_editor = 'desktop', updated_at = now()
   where id = p_draft_id;
  return jsonb_build_object('state','REVOKED');
end $fn$;

-- ── redeem a handoff: transfer active editor desktop → phone (atomic) ─────
create or replace function public.listing_draft_redeem_handoff(p_token text)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  if p_token is null or length(p_token) < 16 then return jsonb_build_object('state','INVALID'); end if;
  select * into r from public.listing_drafts where handoff_token = p_token for update;
  if not found then return jsonb_build_object('state','INVALID'); end if;
  -- Ownership: never reveal draft details to a non-owner.
  if r.seller_id <> v_uid then return jsonb_build_object('state','WRONG_ACCOUNT'); end if;
  if r.status <> 'active' then return jsonb_build_object('state','NOT_ACTIVE','status',r.status); end if;
  -- Expiry (lazy).
  if r.handoff_expires_at is not null and r.handoff_expires_at < now() then
    update public.listing_drafts
       set handoff_status = 'expired', handoff_token = null, active_editor = 'desktop', updated_at = now()
     where id = r.id;
    return jsonb_build_object('state','EXPIRED');
  end if;
  if r.handoff_status not in ('issued','redeemed') then
    return jsonb_build_object('state','INVALID','handoff_status',r.handoff_status);
  end if;
  -- Atomic redeem + assign active editor. Replay by the same owner during the
  -- window simply re-opens the phone editor; it never creates a second editor.
  update public.listing_drafts
     set active_editor = 'phone', handoff_status = 'redeemed',
         handoff_redeemed_at = coalesce(handoff_redeemed_at, now()),
         last_activity_at = now(), updated_at = now()
   where id = r.id;
  return jsonb_build_object('state','REDEEMED','draft_id', r.id,
                            'content', r.content, 'revision', r.revision);
end $fn$;

-- ── return authority phone → desktop (save latest, release phone) ─────────
create or replace function public.listing_draft_return_authority(
  p_draft_id uuid, p_content jsonb default null, p_expected_revision integer default null)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype; v_rev integer;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  v_rev := r.revision;
  -- Optionally save the phone's final content (revision-guarded) before release.
  if p_content is not null then
    if p_expected_revision is distinct from r.revision then
      return jsonb_build_object('state','STALE','revision',r.revision);
    end if;
    v_rev := r.revision + 1;
    update public.listing_drafts set content = p_content, revision = v_rev where id = r.id;
  end if;
  update public.listing_drafts
     set active_editor = 'desktop', handoff_status = 'returned', handoff_token = null,
         handoff_returned_at = now(), last_activity_at = now(), updated_at = now()
   where id = r.id;
  return jsonb_build_object('state','RETURNED','revision', v_rev);
end $fn$;

-- ── lightweight status poll (desktop awareness; lazy-expires stale handoff) ─
create or replace function public.listing_draft_status(p_draft_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  -- Lazy expiry releases stale editor authority safely without discarding content.
  if r.handoff_status in ('issued','redeemed')
     and r.handoff_expires_at is not null and r.handoff_expires_at < now() then
    update public.listing_drafts
       set handoff_status = 'expired', handoff_token = null, active_editor = 'desktop', updated_at = now()
     where id = r.id;
    r.handoff_status := 'expired'; r.active_editor := 'desktop';
  end if;
  return jsonb_build_object('state','OK','active_editor', r.active_editor,
    'handoff_status', r.handoff_status, 'revision', r.revision, 'status', r.status,
    'handoff_expires_at', r.handoff_expires_at, 'listing_id', r.listing_id);
end $fn$;

-- ── mark published (idempotent close after the real listing is created) ───
create or replace function public.listing_draft_mark_published(p_draft_id uuid, p_listing_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $fn$
declare v_uid uuid := auth.uid(); r public.listing_drafts%rowtype;
begin
  if v_uid is null then return jsonb_build_object('state','AUTH_REQUIRED'); end if;
  select * into r from public.listing_drafts where id = p_draft_id for update;
  if not found or r.seller_id <> v_uid then return jsonb_build_object('state','DENIED'); end if;
  if r.status = 'published' then
    return jsonb_build_object('state','ALREADY_PUBLISHED','listing_id', r.listing_id);
  end if;
  update public.listing_drafts
     set status = 'published', listing_id = p_listing_id, handoff_token = null,
         handoff_status = 'none', updated_at = now()
   where id = r.id;
  return jsonb_build_object('state','PUBLISHED','listing_id', p_listing_id);
end $fn$;

-- Least-privilege execution: these are seller actions, never public/service.
do $$
declare fn text;
begin
  foreach fn in array array[
    'public.listing_draft_create(jsonb)',
    'public.listing_draft_save_content(uuid,jsonb,integer,text)',
    'public.listing_draft_issue_handoff(uuid,uuid)',
    'public.listing_draft_revoke_handoff(uuid)',
    'public.listing_draft_redeem_handoff(text)',
    'public.listing_draft_return_authority(uuid,jsonb,integer)',
    'public.listing_draft_status(uuid)',
    'public.listing_draft_mark_published(uuid,uuid)'
  ] loop
    execute format('revoke all on function %s from public', fn);
    execute format('grant execute on function %s to authenticated', fn);
  end loop;
end $$;
