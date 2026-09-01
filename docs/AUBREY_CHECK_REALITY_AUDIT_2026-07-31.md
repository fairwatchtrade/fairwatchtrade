# Aubrey Check — Reality Audit

**Date:** 2026-07-31
**Mode:** Read-only. No deployment, no production mutation, no strike, no schema change, no activation.
**Work order:** `FairWatchTrade_Aubrey_Check_Reality_Audit_Work_Order_2026-07-31.md`

---

## Ruling

### `PARTIALLY_IMPLEMENTED`

The Aubrey Check is **not** vapour, and it is **not** the Integrity Engine wearing its name. A real
Google Cloud Vision `WEB_DETECTION` provider exists, is correctly written, and — proven live in this
audit — **works and discriminates correctly**. The API you pay for is real and functional.

It has never run inside FairWatchTrade, not once, and there is a defect that would have made it
report stolen photographs as clean if it had.

---

## The one-paragraph answer

Everything around the Aubrey Check was built: the provider call, the persistence tables, the
correlation, the fail-open discipline, the hold logic, the admin panel. Two constants and one
environment flag were deliberately left unset pending a live proof that never happened, so the
feature has been inert since the day it shipped. Separately — and this is the part nobody could have
known without calling the API — Google does not return a `score` on `fullMatchingImages`, but the
classifier decides purely on score. So even with the flag on and thresholds set, a borrowed photo
would be classified `passed`. The gap is small, but it is not only a switch.

---

## A · Provider / API reality — **PROVEN**

| Question | Finding | Class |
|---|---|---|
| Real public-web image matching call? | Yes — `POST https://vision.googleapis.com/v1/images:annotate`, feature `WEB_DETECTION` | Proven |
| Where | `lib/imageAuthenticity.ts` → `executeImageAuthenticityCheck()` | Proven |
| Invoked by | `app/api/listings/route.ts` (publish) and `app/api/admin/listings/[id]/recheck/route.ts` | Proven |
| Env var | `GOOGLE_CLOUD_VISION_API_KEY` | Proven |
| What is sent | **Bytes** — the blob is fetched server-side and base64'd, deliberately so Google-side fetch flakiness cannot masquerade as a clean result | Proven |
| Returns source pages? | Yes — `fullMatchingImages`, `partialMatchingImages`, `pagesWithMatchingImages` | Proven |
| Preserved | source URLs, thumbnails, match type, best score, domain, pages — bounded to 5 matches / 512-char URLs | Proven |
| Mock or stub? | **Neither.** Real code, real endpoint, real parsing | Proven |
| Ever completed in a real environment? | **Never inside FairWatchTrade.** Proven live in this audit, outside the app | Proven |

### Live provider proof (run outside the application, no DB write)

| Control | Full matches | Pages | Sample source domains |
|---|---|---|---|
| **Borrowed** — public Omega Speedmaster image | **5** | **5** | `ebay.com`, `pacgenesis.com`, `palmesano.com.ar` |
| **Original** — a real FairWatch seller upload | **0** | **0** | — |

The provider discriminates exactly as the product requires: a borrowed photograph is located on the
public web, complete with an eBay source page; an original upload is not found anywhere.

**The key you pay for is live and working.** The second key, `GEMINI_AUBREY_SEARCH_API_KEY`, returns
`HTTP 401 — "API keys are not supported by this API"` against Vision; it is for a different API and
is not usable here. It is referenced by no code.

---

## The blocking defect — **`score` is never returned, and the classifier only reads `score`**

`mapWebDetectionToRow()` derives `bestFull` / `bestPartial` from `match.score`, then classifies:

```
full match ≥ T_HIGH   → high_confidence_match
any match  ≥ T_REVIEW → review_suggested
otherwise             → passed
```

In both live calls, **every returned match carried `score: null`.** Google populates scores on
`webEntities` and `visuallySimilarImages`, not on `fullMatchingImages` — a full match is a binary
assertion, not a scored one.

Consequence: `bestFull` stays `null`, both branches are skipped, and the row is written
`classification: "passed"`, `verdict: "clean"`, `matched_source_url: null` — **discarding the five
source pages it just received.** A photograph lifted from an eBay listing would be recorded as
clean, and the listing would publish unheld.

This is the failure that would have looked exactly like success. Nothing would have errored.

**The signal is presence, not score:** a non-empty `fullMatchingImages` *is* the finding.

---

## B · Entry-path routing

| Origin | Aubrey status | Class |
|---|---|---|
| Desktop uploaded file | Wired — `source: "desktop_sell"`, `capture_source: "desktop_upload"`, `media_meta` correlated | Proven (inert) |
| Mobile wizard live camera | Wired — `capture_source: "live_camera"` | Proven (inert) |
| Mobile gallery/upload fallback | Shares the wizard path; not separately classified | Inferred |
| Dealer import | Excluded — RLS forbids the client claiming this source | Proven |
| Post-publication Additional Photos | **No path exists** — no re-check on photo addition | Proven |
| Admin/seller supplemental photo | **No path exists** | Proven |

The primary launch risk path — arbitrary desktop upload — *is* the one that is wired.

---

## C · Correlation — **sound**

Keyed on **`capture_session_id` + `storage_path`** per media entry, never array position, and
deliberately per-entry rather than off the top-level session id (which badge forfeiture may null).
Retry resumes rather than re-gates. This is the part most likely to have been done badly, and it
was done well.

---

## D · Persistence — **schema real and applied**

| Table | Exists | Rows in production |
|---|---|---|
| `listing_integrity_provider_results` | yes (15 cols) | **1** |
| `listing_integrity_evidence` | yes (10 cols) | **0** |
| `listing_media` | yes (13 cols) | 22 |

The single provider row is `provider = 'ai_photo_quality'`, `completed`, `passed`, written
2026-07-25.

> **Aubrey rows in production: `0`. There has never been one.**

This is almost certainly the source of the memory of having tested it. Something *did* run, and it
*did* write a completed passing result — it was AI Photo Quality, the exact system the work order
warns must not be mistaken for the Aubrey Check.

The intended three-way split (media / all attempts / immutable accepted evidence) is confirmed
correct in schema.

Two listings carry `integrity_hold_reason = 'results_pending'` — the fail-open hold, not an Aubrey
match. One (`b5088e7d…`) is the separately-quarantined draft-leak listing.

---

## E · Fail-open correctness — **excellent, and better than required**

`operationalRow()` distinguishes: `missing_api_key`, `thresholds_unset`, `image_fetch_status_NNN`,
`image_fetch_failed`, `provider_fetch_failed`, `provider_status_NNN`, `invalid_response`,
`unparseable_body`. 6-second timeout with `AbortController`.

**No failure path can produce `passed`.** A provider outage holds the listing at `pending_review`
and accuses no one. This law is correctly kept.

---

## F · Publish / hold behaviour

Status is decided **before** insert — no insert-then-correct window. Completed evidence can hold a
listing at `pending_review`; nothing anywhere writes `rejected`. Seller-facing copy is the approved
neutral text ("Your photographs are receiving an additional authenticity review"). Retry is
release-only and never demotes.

---

## G · Admin review — real, not mocked

`components/IntegrityEvidencePanel.tsx` is data-driven from real rows, with a server-authorized
recheck route that returns `503` while enforcement is off. Machine evidence never creates a strike.
Untestable end-to-end today only because no Aubrey row has ever existed to render.

---

## I · Security — **no findings**

Key is server-only (`lib/imageAuthenticity.ts` is never imported by a client component; verified by
call-graph). No key in any client bundle. Bytes are sent rather than a URL, so no SSRF surface is
opened toward Google. URLs bounded to 512 chars, matches capped at 5, domains parsed through `URL()`
with a `try`. Admin evidence is server-authorized.

---

## Why it is inert — two independent locks

1. **`AUBREY_ENFORCEMENT` is absent from `.env.local`** → defaults off → every call site is dead code.
2. **`T_HIGH` and `T_REVIEW` are hard-coded `null`** in source → even with the flag on and the key
   present, `executeImageAuthenticityCheck` returns `unavailable / thresholds_unset` and refuses to
   spend a call.

Both were deliberate, documented decisions pending a live proof that never ran.

### Archaeology — was it ever on?

- `lib/imageAuthenticity.ts` has **exactly one commit in its entire history**: `4891c59` (v2.24).
- `git log --all -S"T_HIGH"` shows the constant **born `null` and never changed**, on any branch.
- `AUBREY_ENFORCEMENT` appears in that same single commit and nowhere else.

There is no reverted activation to recover. Unlike the Galaxy meteor shower, nothing was lost — this
was never turned on.

---

## Exact missing or broken seams

1. **Classification cannot fire on real provider output** — `score` is always `null`; classify on
   *presence* of `fullMatchingImages`, with score as a tiebreaker when present. *(Blocking)*
2. **`T_HIGH` / `T_REVIEW` unset** — and largely moot once (1) is fixed.
3. **`AUBREY_ENFORCEMENT` never set** in any environment.
4. **Evidence discarded on a `passed` verdict** — `matched_source_url` and `pages` are nulled out.
   The five eBay URLs the provider returned should be retained even when the verdict is clean.
5. **Stale source comment** — "GOOGLE_CLOUD_VISION_API_KEY does not exist yet (no account, no key)"
   is false; the key exists and works.
6. **No post-publication re-check path** for photos added after publish.
7. **`GEMINI_AUBREY_SEARCH_API_KEY`** is unusable for Vision and referenced by nothing — dead config.

---

## Smallest safe next flight

1. Fix classification to key on **presence** of full matches (a handful of lines).
2. Run the live proof against expendable images to fix `T_REVIEW` for *partial* matches only.
3. Retain source pages on clean verdicts.
4. Turn `AUBREY_ENFORCEMENT` on in a **non-production environment first**, publish one borrowed and
   one original test listing, and read the resulting rows.
5. Only then enable in production.

Cost is negligible — one Vision call per uploaded photo, capped at 5 matches, 6-second timeout.

---

## Confirmation

No deployment occurred. No production data was mutated. No strike was created. No schema was
changed. No feature was activated. All database access was `SELECT`. The two provider calls were
made from a local script directly to Google, wrote nothing, and touched no listing.
