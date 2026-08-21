# Founder Review — how the one-listing adjudication room actually works

**The misconception this file exists to kill:** Aubrey evidence does NOT
explain the founder decision, in either direction. A real listing holds
**11 clean evidence passes, zero adverse rows, and a founder rejection.**
Absence of adverse evidence never implies approval; a finding never implies
guilt. If you are tempted to auto-derive a verdict, a badge, or a
recommendation from provider results, that is the exact thing this room was
built to refuse. Provider output is context for a human decision.

## The pieces

| Piece | Where | Job |
|---|---|---|
| The room | `app/admin/listings/[id]/page.tsx` | Founder-only server page: identity → why-here → evidence → seller context → decision history → lifecycle → actions → raw record |
| Governed actions | `app/api/admin/listings/[id]/status/route.ts` | THE one door for every decision. Enforces seller-message law, writes the decision event, resolves the review record, routes held-private approvals |
| Evidence panel | `components/IntegrityEvidencePanel.tsx` | Aubrey Check per-photo evidence + the four decision buttons (its own approved Design Gate — ported, not redesigned; do not restyle it from the page) |
| Generic status tool | `components/ListingStatusControls.tsx` | Raw status select + Take Down; posts to the same one route |
| Recheck | `app/api/admin/listings/[id]/recheck/route.ts` | Founder re-run of the provider check (inert while enforcement is off) |

## The unit of review is the LISTING — and there are exactly two truth systems

- **`listing_integrity_reviews`** — CURRENT, mutable review truth per
  listing. One row, resolved/unresolved, founder notes.
- **`listing_decision_events`** — APPEND-ONLY lifecycle decision log. The
  status route inserts one row per REAL transition (a re-save of the same
  status writes nothing). A later decision appends; it cannot rewrite.

The room presents both and never merges them: the review record appears in
the "why is it here" strip (mutable current truth), the event log in
"Decision history" (append-only). **Do not create a third review-state or
history table.** If new persisted state is genuinely required, extend one of
these two and write down why here.

⚠ The log began **2026-08-07**. Earlier decisions have no rows. The room
reports that absence as *absent*, never as *clean* — keep it that way.

## The governed actions — exactly four, no Escalate

`approve | clarify | reject | return_to_draft`

Each maps to a status (`published | draft | rejected | draft`) and the route
400s on any mismatch. **There is no Escalate action or state** — `clarify`
is the need-more-information path. Do not invent one.

The seller-message law is enforced at the TRANSITION boundary in the route,
not in any component: every adverse transition (`rejected`, `draft`)
requires a seller-visible message, and the message may not mention the
provider, scores, source URLs, match classifications, or suspicion language
(`FORBIDDEN_SELLER_NOTE`). Both admin surfaces post through this one door,
so neither can be the bypass.

## The held-private seam (real machinery, not a special button)

A listing with `private_buyer_id` set is a held-private submission. In the
status route, **approve on such a row lands on `private_active`, not
`published`** — visible to exactly one authorized buyer, absent from
Browse/search, and no public "listing live" email is sent. The room states
this in its "Private listing seam" panel *before* the founder presses
Approve; the routing itself lives in the route. Do not flatten
`private_active` into generic public lifecycle behavior, and do not build a
second approval path for it.

## Evidence-schema cautions (learned, not theoretical)

- **`cause_group_key`** — unreliable: inconsistent, sometimes null,
  occasionally unique-per-row. Never use it as a durable grouping primitive.
- **`confidence`** — null on known adverse evidence. Never make it a
  required field or a primary visual axis.
- **Polarity** — there is NO persisted adverse/exculpatory field. The room
  *derives* presentation polarity from `classification` + `match_type`
  (`passed` → clean; otherwise full/partial finding) in `buildPanelPhoto()`.
  That derivation is presentation, not stored truth.
- Known providers observed in real rows: `aubrey_exact_hash`,
  `image_authenticity`. Known adverse wording: "This photograph appears to
  be a cropped portion of an image published elsewhere on the web."

## Seller context — retrieved, never invented

The panel shows: display name + member-since (`profiles`, via the service
client — the table is select-own RLS and a session read silently returns
nothing), listing counts by status (the seller's own `listings` rows), and
prior adverse decisions across ALL the seller's listings (the same
append-only log, wider scope). **No strikes, no synthetic risk scores, no
derived reputation.** The founder weighs the record; the panel only
retrieves it.

## Identity and access — current truth

Founder-only via a **hardcoded founder auth UUID**, checked on the SESSION
client, silent redirect otherwise. The literal is intentionally duplicated
in the page and the status route — two independent gates, never one shared
constant. This is current truth, not a role system; do not refactor it in
passing, and do not widen public RLS to make admin reads work — every read
here uses the service client *after* the session gate passes.

`AUBREY_ENFORCEMENT` is **OFF**. The room presents evidence regardless;
nothing auto-holds, and the recheck route is inert until that flag changes
by explicit founder decision.

## Marketplace Control relationship

Marketplace Control (`/admin`) is the operational ledger/queue; this room is
the one-listing decision surface. Entry: the ledger inspector's "Open
Adjudication →" link. Exit/continuation: "← Marketplace Control" and the
next-in-queue link (oldest other `pending_review`), so a decision never
dead-ends. The Operations Center points here — never back into Supabase.

## Verify current state

```sql
-- the two truth systems, side by side, for one listing
select status, resolved_at from listing_integrity_reviews where listing_id = '<id>';
select decision, prior_status, resulting_status, created_at
  from listing_decision_events where listing_id = '<id>' order by id desc;

-- the standing proof that evidence ≠ decision (clean-but-rejected exists)
select l.id from listings l
 where l.status = 'rejected'
   and not exists (select 1 from listing_integrity_provider_results r
                    where r.media_id in (select id from listing_media where listing_id = l.id)
                      and r.classification is distinct from 'passed');
```

```bash
# reachability (founder session required; anonymous → redirect to /)
curl -s -o /dev/null -w "%{http_code}" https://www.fairwatchtrade.com/admin/listings/<id>
```
