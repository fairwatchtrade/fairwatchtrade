-- Collector Dossier production wiring.
--
-- Canonical artifact ownership is reference-level. Exposure is listing-level.
-- A publish never waits on PDF work and never rolls back if Dossier work fails.

create table public.collector_dossiers (
  id                    uuid        primary key default gen_random_uuid(),
  vault_reference_id    uuid        not null unique
    references public.vault_references (id) on delete restrict,
  status                text        not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),
  template_version      integer     not null default 1 check (template_version > 0),
  storage_url           text,
  storage_path          text,
  pdf_sha256            text,
  pdf_bytes             bigint,
  generation_attempts   integer     not null default 0 check (generation_attempts >= 0),
  generation_started_at timestamptz,
  generated_at          timestamptz,
  last_error            text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint collector_dossiers_ready_artifact_check check (
    status <> 'ready'
    or (
      storage_url is not null
      and storage_path is not null
      and pdf_sha256 ~ '^[0-9a-f]{64}$'
      and pdf_bytes > 0
      and generated_at is not null
      and last_error is null
    )
  )
);

create table public.listing_collector_dossiers (
  listing_id               uuid        primary key
    references public.listings (id) on delete cascade,
  collector_dossier_id     uuid        not null
    references public.collector_dossiers (id) on delete restrict,
  identity_decision_id     uuid        not null
    references public.identity_resolution_decision (id) on delete restrict,
  identity_claim_fingerprint text      not null
    check (identity_claim_fingerprint ~ '^[0-9a-f]{64}$'),
  attached_at              timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create index listing_collector_dossiers_dossier_idx
  on public.listing_collector_dossiers (collector_dossier_id);

alter table public.collector_dossiers enable row level security;
alter table public.listing_collector_dossiers enable row level security;

revoke all on public.collector_dossiers from anon, authenticated;
revoke all on public.listing_collector_dossiers from anon, authenticated;
grant select, insert, update on public.collector_dossiers to service_role;
grant select, insert, update, delete on public.listing_collector_dossiers to service_role;

-- Resolve the existing governed identity domain and atomically ensure both
-- the reference artifact row (the durable job/status) and listing attachment.
-- No row means the listing is not currently published with a fingerprint-valid
-- human-reviewed exact REFERENCE decision.
create or replace function public.collector_dossier_attach_listing(
  p_listing_id uuid
)
returns table (
  dossier_id uuid,
  vault_reference_id uuid,
  dossier_status text,
  storage_url text
)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_listing_status text;
  v_decision_id uuid;
  v_fingerprint text;
  v_reference_id uuid;
  v_dossier public.collector_dossiers;
begin
  select l.status
    into v_listing_status
    from public.listings l
   where l.id = p_listing_id;

  if not found or v_listing_status <> 'published' then
    return;
  end if;

  select d.id, d.claim_fingerprint, c.vault_reference_id
    into v_decision_id, v_fingerprint, v_reference_id
    from public.identity_resolution_case k
    join public.identity_resolution_decision d
      on d.case_id = k.id
     and d.is_current
     and d.outcome = 'exact'
    join public.identity_resolution_candidate c
      on c.decision_id = d.id
     and c.candidate_role = 'selected'
     and c.vault_reference_id is not null
   where k.subject_type = 'listing'
     and k.listing_id = p_listing_id
     and d.claim_fingerprint =
       public.identity_resolution_claim_fingerprint('listing', p_listing_id)
   limit 1;

  if v_reference_id is null then
    return;
  end if;

  insert into public.collector_dossiers (vault_reference_id)
  values (v_reference_id)
  on conflict (vault_reference_id) do update
    set updated_at = now()
  returning * into v_dossier;

  insert into public.listing_collector_dossiers (
    listing_id,
    collector_dossier_id,
    identity_decision_id,
    identity_claim_fingerprint
  )
  values (
    p_listing_id,
    v_dossier.id,
    v_decision_id,
    v_fingerprint
  )
  on conflict (listing_id) do update set
    collector_dossier_id = excluded.collector_dossier_id,
    identity_decision_id = excluded.identity_decision_id,
    identity_claim_fingerprint = excluded.identity_claim_fingerprint,
    updated_at = now();

  return query
  select v_dossier.id, v_dossier.vault_reference_id, v_dossier.status, v_dossier.storage_url;
end;
$fn$;

revoke all on function public.collector_dossier_attach_listing(uuid) from public, anon, authenticated;
grant execute on function public.collector_dossier_attach_listing(uuid) to service_role;

-- Atomic claim. A timed-out generating row is recoverable on the next
-- qualifying publish/republish instead of remaining stranded forever.
create or replace function public.collector_dossier_claim(p_dossier_id uuid)
returns setof public.collector_dossiers
language sql
security definer
set search_path = ''
as $fn$
  update public.collector_dossiers
     set status = 'generating',
         generation_attempts = generation_attempts + 1,
         generation_started_at = now(),
         last_error = null,
         updated_at = now()
   where id = p_dossier_id
     and (
       status in ('pending', 'failed')
       or (
         status = 'generating'
         and generation_started_at < now() - interval '15 minutes'
       )
     )
  returning *;
$fn$;

revoke all on function public.collector_dossier_claim(uuid) from public, anon, authenticated;
grant execute on function public.collector_dossier_claim(uuid) to service_role;

create or replace function public.collector_dossier_mark_ready(
  p_dossier_id uuid,
  p_storage_url text,
  p_storage_path text,
  p_pdf_sha256 text,
  p_pdf_bytes bigint
)
returns setof public.collector_dossiers
language sql
security definer
set search_path = ''
as $fn$
  update public.collector_dossiers
     set status = 'ready',
         storage_url = p_storage_url,
         storage_path = p_storage_path,
         pdf_sha256 = p_pdf_sha256,
         pdf_bytes = p_pdf_bytes,
         generated_at = now(),
         last_error = null,
         updated_at = now()
   where id = p_dossier_id
     and status = 'generating'
     and p_storage_url is not null
     and p_storage_path is not null
     and p_pdf_sha256 ~ '^[0-9a-f]{64}$'
     and p_pdf_bytes > 0
  returning *;
$fn$;

revoke all on function public.collector_dossier_mark_ready(uuid, text, text, text, bigint)
  from public, anon, authenticated;
grant execute on function public.collector_dossier_mark_ready(uuid, text, text, text, bigint)
  to service_role;

create or replace function public.collector_dossier_mark_failed(
  p_dossier_id uuid,
  p_error text
)
returns setof public.collector_dossiers
language sql
security definer
set search_path = ''
as $fn$
  update public.collector_dossiers
     set status = 'failed',
         generation_started_at = null,
         last_error = left(coalesce(nullif(btrim(p_error), ''), 'generation_failed'), 1000),
         updated_at = now()
   where id = p_dossier_id
     and status = 'generating'
  returning *;
$fn$;

revoke all on function public.collector_dossier_mark_failed(uuid, text)
  from public, anon, authenticated;
grant execute on function public.collector_dossier_mark_failed(uuid, text)
  to service_role;

-- Durable enqueue/attachment at the publication boundary. The exception
-- handler is deliberate: Dossier infrastructure can fail, but the listing
-- publication that already happened must remain live.
create or replace function public.collector_dossier_on_listing_publish()
returns trigger
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if tg_op = 'UPDATE' and old.status = 'published' then
    return new;
  end if;

  perform * from public.collector_dossier_attach_listing(new.id);
  return new;
exception
  when others then
    raise warning 'Collector Dossier enqueue failed for listing %: %', new.id, sqlerrm;
    return new;
end;
$fn$;

drop trigger if exists collector_dossier_on_listing_publish on public.listings;
create trigger collector_dossier_on_listing_publish
after insert or update of status on public.listings
for each row
when (new.status = 'published')
execute function public.collector_dossier_on_listing_publish();

-- Existing qualifying published listings receive the same idempotent
-- attachment. Non-exact and variant-level decisions correctly produce no row.
do $fn$
declare
  v_listing record;
begin
  for v_listing in
    select id from public.listings where status = 'published'
  loop
    perform * from public.collector_dossier_attach_listing(v_listing.id);
  end loop;
end;
$fn$;

-- PFC274 = 62 — app/api/evaluate/route.ts is untouched.
