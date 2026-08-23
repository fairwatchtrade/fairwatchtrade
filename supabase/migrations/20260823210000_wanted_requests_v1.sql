-- ═══════════════════════════════════════════════════════════════════════
-- WANTED / LOOKING FOR V1 — the collector demand primitive
--
-- THE MISCONCEPTION THIS FILE EXISTS TO KILL:
-- "Wanted is a Saved Search with a price on it." It is not. saved_searches
-- stores a URL query string for passive inventory monitoring. A Wanted
-- request is a structured DEMAND object: watch identity, must-have vs
-- preferred criteria, a requester-private budget, and a lifecycle that
-- sellers answer with governed listings. Neither table can express the
-- other's job; nothing here reuses saved_searches.
--
-- ── THE PRIVACY LAW IS ENFORCED HERE, NOT IN THE APPLICATION ──────────
-- The seller must never see the buyer's exact target, exact ceiling,
-- private note, or identity. The weak way to do that is to select fewer
-- columns in a query. The way it is done here: SELLERS HAVE NO ROW ACCESS
-- TO wanted_requests AT ALL. The only seller-facing read is
-- wanted_requests_for_seller(), a SECURITY DEFINER projection that cannot
-- return those columns because it does not select them. A crafted
-- PostgREST request from a seller's session returns zero rows, not a
-- filtered row — there is no column list to get wrong.
--
-- The coarse budget signal is computed INSIDE that function, from the
-- seller's own inventory, and leaves Postgres as one of three words.
-- ═══════════════════════════════════════════════════════════════════════

create table if not exists public.wanted_requests (
  id            uuid primary key default gen_random_uuid(),
  requester_id  uuid not null references auth.users (id) on delete cascade,

  status        text not null default 'draft'
                check (status in ('draft', 'active', 'answered', 'paused', 'closed')),

  /* ── Watch identity — structured Brand, assisted model text, optional
     reference. Honest ambiguity is the law: a collector who knows
     "Kalpa Hebdomadaire, white guilloché" but not the reference must not
     be forced to guess one, so only brand is NOT NULL. */
  brand            text not null check (btrim(brand) <> ''),
  model_text       text,
  reference_text   text,
  display_identity text not null check (btrim(display_identity) <> ''),

  /* ── REQUESTER-PRIVATE matching inputs. Locked by founder ruling: these
     are used internally for matching and eligibility, and are never
     rendered, returned, logged, or parameterised toward a seller. */
  target_price  numeric(12,2) check (target_price is null or target_price >= 0),
  max_price     numeric(12,2) check (max_price is null or max_price >= 0),
  currency      text,
  /* A short note the collector writes for themselves. Requester-private. */
  collector_note text check (collector_note is null or char_length(collector_note) <= 500),

  /* ── Seller-visible criteria ── */
  min_condition text,
  documentation text not null default 'any'
                check (documentation in ('any', 'papers', 'full_set')),
  must_have     text[] not null default '{}',
  preferred     text[] not null default '{}',
  private_listing_ok boolean not null default true,

  /* Optional, collector-chosen at close. Never seller-visible. */
  close_reason  text check (close_reason is null or close_reason in
                ('bought_on_fwt', 'bought_elsewhere', 'no_longer_interested', 'other')),

  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  activated_at timestamptz,
  closed_at    timestamptz,

  /* Money is a pair or it is nothing — a bare number with no currency is
     not a budget. Mirrors the listings money-truth convention. */
  constraint wanted_requests_money_pair_check check (
    (target_price is null and max_price is null and currency is null)
    or (currency is not null and (target_price is not null or max_price is not null))
  ),
  /* Bounded criteria: a demand object, not a document. */
  constraint wanted_requests_criteria_bounds_check check (
    array_length(must_have, 1) is null or array_length(must_have, 1) <= 12
  ),
  constraint wanted_requests_preferred_bounds_check check (
    array_length(preferred, 1) is null or array_length(preferred, 1) <= 12
  )
);

create index if not exists wanted_requests_requester_idx
  on public.wanted_requests (requester_id, created_at desc);
/* The seller queue's read path: active demand, newest first. */
create index if not exists wanted_requests_open_idx
  on public.wanted_requests (created_at desc)
  where (status in ('active', 'answered'));

alter table public.wanted_requests enable row level security;

/* OWN ROWS ONLY. There is deliberately no seller SELECT policy: a seller
   reaching this table directly gets nothing, which is what makes the
   privacy law structural rather than a query-shape convention. */
drop policy if exists wanted_requests_select_own on public.wanted_requests;
create policy wanted_requests_select_own on public.wanted_requests
  for select using (requester_id = auth.uid());

drop policy if exists wanted_requests_insert_own on public.wanted_requests;
create policy wanted_requests_insert_own on public.wanted_requests
  for insert with check (requester_id = auth.uid());

drop policy if exists wanted_requests_update_own on public.wanted_requests;
create policy wanted_requests_update_own on public.wanted_requests
  for update using (requester_id = auth.uid()) with check (requester_id = auth.uid());

drop policy if exists wanted_requests_delete_own on public.wanted_requests;
create policy wanted_requests_delete_own on public.wanted_requests
  for delete using (requester_id = auth.uid());

comment on table public.wanted_requests is
  'Collector demand primitive. target_price / max_price / collector_note are REQUESTER-PRIVATE: no seller-facing policy or projection may return them. Not a Saved Search — that table monitors inventory passively and stores only a query string.';

-- ── Answers ────────────────────────────────────────────────────────────
-- An answer is always a governed listing. There is no freeform response
-- path, which is why this table has no message column and never will.

create table if not exists public.wanted_request_answers (
  id                uuid primary key default gen_random_uuid(),
  wanted_request_id uuid not null references public.wanted_requests (id) on delete cascade,
  listing_id        uuid not null references public.listings (id) on delete cascade,
  seller_id         uuid not null references auth.users (id) on delete cascade,

  kind  text not null check (kind in ('existing_listing', 'new_listing', 'private_listing')),
  state text not null default 'unread'
        check (state in ('unread', 'viewed', 'declined', 'pursuing', 'closed')),

  /* Truthful compatibility AT ANSWER TIME: which required criteria the
     listing meets, which it fails, which preferences matched. Frozen when
     the answer is sent so a later listing edit cannot rewrite what the
     collector was shown. Carries no budget numbers — only the coarse fit. */
  criteria_report jsonb not null default '{}',

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  /* DEDUPE AS A CONSTRAINT, NOT APPLICATION POLITENESS. One listing may
     answer one request exactly once; a double submit is refused by the
     database, not by a disabled button. */
  constraint wanted_request_answers_one_per_listing unique (wanted_request_id, listing_id)
);

create index if not exists wanted_request_answers_request_idx
  on public.wanted_request_answers (wanted_request_id, created_at desc);
create index if not exists wanted_request_answers_seller_idx
  on public.wanted_request_answers (seller_id, created_at desc);

alter table public.wanted_request_answers enable row level security;

/* The requester reads answers to their own requests; the seller reads
   their own answers. Neither can read anyone else's, and the join to
   wanted_requests below never exposes a private column because it selects
   none — it only tests ownership. */
drop policy if exists wra_select_requester_or_seller on public.wanted_request_answers;
create policy wra_select_requester_or_seller on public.wanted_request_answers
  for select using (
    seller_id = auth.uid()
    or exists (
      select 1 from public.wanted_requests w
       where w.id = wanted_request_id and w.requester_id = auth.uid()
    )
  );

/* The requester may move their own answer through its states (viewed,
   declined, pursuing, closed). Sending an answer is server-side only — no
   client INSERT policy exists, so a browser cannot manufacture one. */
drop policy if exists wra_update_requester_state on public.wanted_request_answers;
create policy wra_update_requester_state on public.wanted_request_answers
  for update using (
    exists (
      select 1 from public.wanted_requests w
       where w.id = wanted_request_id and w.requester_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from public.wanted_requests w
       where w.id = wanted_request_id and w.requester_id = auth.uid()
    )
  );

comment on table public.wanted_request_answers is
  'One governed listing answering one Wanted request. Uniqueness is enforced on (wanted_request_id, listing_id) — duplicate answers are a database refusal. No message column: a freeform response path does not exist before a governed listing does.';

-- ── updated_at triggers (the established repo convention) ──────────────
create or replace function public.touch_wanted_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_wanted_requests_updated_at on public.wanted_requests;
create trigger trg_wanted_requests_updated_at
  before update on public.wanted_requests
  for each row execute function public.touch_wanted_updated_at();

drop trigger if exists trg_wanted_request_answers_updated_at on public.wanted_request_answers;
create trigger trg_wanted_request_answers_updated_at
  before update on public.wanted_request_answers
  for each row execute function public.touch_wanted_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
-- THE SELLER PROJECTION — the only way a seller sees demand
--
-- SECURITY DEFINER because sellers have no row access to wanted_requests.
-- It returns identity, criteria, age and state — and a THREE-WORD budget
-- signal computed here, from the seller's own eligible inventory, so no
-- number ever crosses the boundary.
--
-- Known bound, stated rather than hidden: a seller who repeatedly re-prices
-- a listing could narrow the ceiling to roughly the width of the 'near'
-- band. The band is deliberately wide (15%) and the buckets deliberately
-- coarse; a numeric signal must never be introduced here.
-- ═══════════════════════════════════════════════════════════════════════

create or replace function public.wanted_requests_for_seller()
returns table (
  id                 uuid,
  display_identity   text,
  brand              text,
  model_text         text,
  reference_text     text,
  min_condition      text,
  documentation      text,
  must_have          text[],
  preferred          text[],
  private_listing_ok boolean,
  status             text,
  created_at         timestamptz,
  budget_fit         text,
  answer_count       bigint,
  answered_by_me     boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  /* The seller's own answerable inventory, by brand. Price is read here and
     stays here: only the comparison's VERDICT leaves this function. */
  my_listings as (
    select l.brand, l.asking_price, l.asking_currency
      from public.listings l, me
     where l.seller_id = me.uid
       and l.status in ('draft', 'pending_review', 'published')
       and l.asking_price is not null
  )
  select
    w.id,
    w.display_identity,
    w.brand,
    w.model_text,
    w.reference_text,
    w.min_condition,
    w.documentation,
    w.must_have,
    w.preferred,
    w.private_listing_ok,
    w.status,
    w.created_at,
    /* Coarse fit, or NULL when the seller has nothing comparable to judge
       against — an absent signal is more honest than a manufactured one. */
    (
      select case
        when count(*) = 0 then null
        when bool_or(ml.asking_price <= coalesce(w.max_price, w.target_price)) then 'within'
        when bool_or(ml.asking_price <= coalesce(w.max_price, w.target_price) * 1.15) then 'near'
        else 'outside'
      end
      from my_listings ml
      where ml.brand = w.brand
        and (w.currency is null or ml.asking_currency = w.currency)
        and coalesce(w.max_price, w.target_price) is not null
    ) as budget_fit,
    (select count(*) from public.wanted_request_answers a where a.wanted_request_id = w.id),
    exists (
      select 1 from public.wanted_request_answers a, me
       where a.wanted_request_id = w.id and a.seller_id = me.uid
    )
  from public.wanted_requests w, me
  /* Open demand only, never the seller's own request, never a draft,
     paused or closed one. */
  where w.status in ('active', 'answered')
    and w.requester_id <> me.uid
  order by w.created_at desc
$$;

revoke all on function public.wanted_requests_for_seller() from public, anon;
grant execute on function public.wanted_requests_for_seller() to authenticated, service_role;

comment on function public.wanted_requests_for_seller() is
  'The ONLY seller-facing read of Wanted demand. SECURITY DEFINER because sellers hold no row access to wanted_requests. Returns no budget number, no requester identity, and no private note — the budget signal is computed here and leaves as within/near/outside.';
