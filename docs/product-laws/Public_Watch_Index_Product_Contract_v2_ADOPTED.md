# FairWatchTrade — Public Watch Index
## Adopted Product Law · v2 · 2026-09-09

**Writer:** Aubrey  
**Review lineage:** Layout → BouncerD → DataMan → Aubrey reconciled v2 → Layout confirmation → Jason adoption → BouncerD adopted-v2 cold-check  
**Status:** ADOPTED PRODUCT LAW — LOCKED by Jason on 2026-09-09; not a build order  
**Adoption basis:** Layout confirmed the consolidated v2 and both completion choices; Jason directed “lock it.” [R5–R6]  
**Edition:** Adopted-status edition of Aubrey’s reconciled v2; the contract version remains v2. Only adoption/status/provenance wording changes. The original v1 and reconciled v2 review copy remain unchanged as history. Layout’s independently consolidated v3 is derivative working history, not the governing contract.  
**Authority:** Product definition only. No implementation, deployment, database change, public release, or robots change is authorized.  
**Source basis:** Jason's assignment, the v1 source register, Layout's adoption-with-corrections, DataMan's five-point semantic return, BouncerD's first cold review, Layout's final v2 confirmation, Jason's adoption, and BouncerD's adopted-v2 cold-check. These sources are identified in §15. This is not a fresh repository or production verification.

> **FairWatchTrade can remember that a reference appeared in its public marketplace without keeping the former seller, the former listing, or later private activity public.**

## 0. Adoption, review disposition, and what remains conditional

Layout adopted the product shape with three corrections. DataMan returned **PASS with five semantic corrections** and passed the coverage semantics. BouncerD returned **PASS WITH THREE CORRECTIONS**, expressly conditional on the notice/retention/suppression prerequisite. Aubrey incorporated those returns in reconciled v2. Layout then confirmed that v2 and both completion choices; Jason adopted it with “lock it.” BouncerD subsequently cold-checked the adopted v2 and returned **PASS WITH ONE CLARIFICATION**; that clarification is folded into §3 without reopening any product choice. Product-law adoption remains complete, with no general review loop reopened. Neither Bouncer review grants the still-required public-retention permission. [R1–R3; R5–R7]

| Return | Consolidated disposition |
| --- | --- |
| Layout 1 / DataMan 1 — neutral history name | Use `public_listing_history_status` and the three states in §3. “Previously Listed” is conditional human shorthand only. |
| Layout 2 / DataMan 2 — public knowledge only | Every reference-knowledge assertion concerns approved public information, never existence of hidden/internal knowledge. |
| Layout 3 / DataMan 3 / BouncerD C3 — counts | Remove exact current listing counts from V1 as well as historical counts. Eligible links are offerings, not a physical-watch census. No field is reintroduced merely to relabel it. |
| DataMan 4 — publication versus association | Require separate proof of the public episode and its reference association; correct the association without rewriting publication evidence. |
| DataMan 5 — evidence boundary | Consume the existing governed public Market Evidence projection, not a broader class of internally held evidence. |
| BouncerD Q4 — temporal reconstruction | Specify public assessment-date granularity and acknowledge repeated observation and correlation. |
| BouncerD Q5 — suppression | Name the authorized actor, private decision record, no-resurrection rule, and FWT-controlled publication scope. |

**Two concrete completion choices proposed by Aubrey, confirmed by Layout, and adopted by Jason [R5–R6]:** publish assessment dates at **UTC calendar-day precision** (§12), and make suppression/re-admission **founder-authorized through a server-enforced administrative path** (§8). BouncerD required these details to be chosen; he did not select those exact choices himself. No path or mechanism is claimed to be built.

**Aubrey clarification, carried from the response to BouncerD:** a consumer can timestamp its own observations. Day-granular FWT metadata therefore does not guarantee a day-granular reconstructed timeline. The contract acknowledges that limit rather than claiming that coarsening prevents it. [R4]

**Still required before public release or backfill:** confirm the applicable notice, historical-retention, and suppression permissions. Neither review waives that condition. No code, schema change, ingestion, deployment, public release, robots change, or additional Seven assignment is authorized here.

## 1. Purpose and scope

The Public Watch Index answers three different collector questions without confusing them:

- **Does FWT have approved public reference knowledge for this reference?**
- **Is a qualifying public listing episode established for this reference?**
- **Does FWT have a publicly available listing for it now?**

Market Evidence is a fourth, independent answer: **Does at least one reference-linked record qualify for public presentation through the governed Market Evidence projection?** Evidence from an auction is not an FWT marketplace listing, and a listing is not proof of a sale.

The adopted product is a public-safe reference index, not a historical seller directory, physical-watch Passport, sold-price database, or replacement search engine. It does not complete the broader Market History product by another name.

**Reading convention:** “Inherited” identifies a rule in the original source register. Review corrections are attributed to [R1–R3]. The two completion choices originated with Aubrey and were confirmed by Layout before Jason’s adoption; the temporal clarification remains attributed to Aubrey. The consolidated requirements are now adopted product law. None is a Seven build order or a grant of public-release/backfill permission. [R4–R6]

## 2. The subject is the canonical reference

One index record describes one defensibly resolved **watch/reference identity**. It does not describe a particular owner's physical watch.

Use FWT's governed public reference identity and manufacturer/reference wording. Include collection, family, and variant only where the identity supports them. Do not invent missing hierarchy to make an entry look complete. Manufacturer reference text alone must not collapse different brands or materially distinct references into one record.

Do not publish physical-watch identifiers, serials, identifier fragments, equality tokens, owner identifiers, or stable owner pseudonyms. The existing Passport is a separate physical-watch product; its founder-only boundary is not changed by this index. [S3 §§2, 4, 16–18]

A title that resembles a reference is not sufficient to assign its marketplace history to that reference. An unresolved association contributes no exact-reference claim until governed evidence resolves it. That does not remove an otherwise eligible listing from its existing marketplace: it only limits what this index may say about a particular reference.

**Current association:** consume the existing governed server-derived identity resolution. DataMan's review reports a brand/reference-constrained resolver, ambiguity resolving to null, and server-side re-resolution at publication persistence rather than trust in the browser. These are reported source semantics, not a fresh production verification or permission to build a new resolver. Founder correction may intentionally override incorrect seller text; seller-text equality must not become a correction or acceptance test. [R3 correction 4]

**Historical association:** durable proof that publication occurred is distinct from defensible proof that the episode belongs to this canonical reference. A present `listings.vault_reference_id`, current seller text, or another current mutable listing row is not sufficient by itself to backfill historical reference identity.

**Retrospective correction:** correct the public reference association; do not rewrite the old publication evidence. Keep the superseded association and correction trail auditable under their authorized internal rules. A correction must be defensibly tied to the original publication episode. If that connection cannot be established, withdraw the exact-reference history assertion until it can; do not move unsupported history to whichever reference today's row names. Other independent eligible contributions may still support either reference. [R3 correction 4]

## 3. Four independent assertions—not four exclusive buckets

| Assertion | What earns it | What it does not establish |
| --- | --- | --- |
| `available_now` | At least one genuine listing for the resolved reference passes the current governed public-discovery and availability rules. | A completed sale, FWT ownership of the watch, or a guarantee it will remain available. |
| `public_listing_history_status` | At least one qualifying genuine public publication episode, linked defensibly to this reference, is durably evidenced and permitted for this public use. | A sale, a realized price, physical-watch continuity, or permission to republish the old listing. |
| Approved public reference knowledge | Reference information is approved for public representation within the applicable public scope. A `reference_knowledge` row or hidden Vault material alone does not qualify. | Internal knowledge, an FWT listing, past availability, stock, or a physical watch in FWT's possession. |
| Market Evidence | At least one reference-linked record currently qualifies through the existing governed public Market Evidence projection (§9). | An FWT listing or sale, current availability, or history of the particular watch a collector is viewing. |

Several assertions can be true at once. A reference can have available listings, qualifying public listing history, approved public reference knowledge, and public Market Evidence simultaneously.

For `public_listing_history_status`, **publication need not have ended**. A still-live listing can establish `established` when both its public episode and reference association are supported and permitted. **A still-live listing establishes `established` only through the same durable publication evidence required by §5. Current public status is not itself the evidence, and a history status must survive its listing leaving public availability.** This means “a qualifying public publication has occurred,” not “a separate earlier offering ended” or “an earlier completed sale exists.” [R1 correction 1; R3 correction 1; R7]

As presentation shorthand, **Available Now** takes precedence when availability is established. **Previously Listed** is permitted only when `public_listing_history_status = established` **and** current availability has been successfully and completely checked and is **no current qualifying public listings**. If availability cannot be checked, say “Public listing history established; current availability unavailable,” rather than implying that availability is known to have ended. “Approved public reference knowledge” and “Market Evidence” remain independent descriptions, not upgrades in commercial status. [R1; R3]

### Negative and unavailable answers

The machine contract must distinguish an affirmative fact, a successful check that did not establish that fact, and a failed or incomplete check. Exact wire encoding is a later engineering decision; these meanings are mandatory:

- `available_now`: **yes**, **no current qualifying public listings**, or **availability unavailable**. A positive answer needs a currently validated eligible listing. A definitive negative requires a successful complete check of the relevant current public population.
- `public_listing_history_status` uses exactly these semantic states: **`established`**, **`not_established_within_coverage`**, **`unavailable_or_incomplete`**. `established` requires a qualifying evidenced and permitted public contribution; it does not claim complete history. `not_established_within_coverage` means a successful complete evaluation of the stated approved public coverage did not establish a qualifying record. `unavailable_or_incomplete` means the required assessment could not be completed reliably. Missing, restricted, or incompletely assessed records must never produce “FWT has never listed this reference.”
- Approved public reference knowledge and Market Evidence: distinguish a positive public assertion, no qualifying public information established after a complete check within coverage, and an unavailable/incomplete public check. Missing public knowledge or evidence must reveal nothing about internal knowledge or evidence. A restricted/internal row is not a positive result and must not produce a special response revealing its existence. [R3 correction 2]

Do not reduce these distinctions to an unexplained false value or empty array. Coverage and failure information must be public-safe and must not identify withheld records or private activity. [S5: Trust Boundary; S6 §18]

## 4. Admission into current availability

**Inherited:** External inventory discovery admits genuinely public, active, currently available, approved, factually current inventory. Records not affirmatively admitted do not serialize. Eligibility belongs in the governed public-discovery boundary, not independently in each consumer. [S5: Privacy / Admission Boundary; Governed External Eligibility; One public inventory projection]

**Adopted application:** A reference earns `available_now` only when a real listing both resolves to that reference and passes that existing eligibility boundary. Exclude fixtures, tests, and known publication mistakes. Do not invent a competing definition based solely on a status string, a reachable URL, a sitemap entry, or a seller's wording.

A draft, rejected submission, pending review, removed listing, private listing, reserved listing, or completed/ended opportunity cannot independently establish availability. Where a lifecycle name differs in production, use its actual governed meaning rather than creating a new lifecycle in this contract.

**No aggregate current listing count in V1.** Provide the availability assessment and currently eligible canonical listing links only. A bounded or paginated link set must disclose its retrieval completeness without adding an exact aggregate count or treating an empty partial page as a definitive negative. At least one validated eligible listing can establish a positive answer without claiming exhaustive retrieval. [R1 correction 3; R3 correction 3]

Links identify **current public offerings**, not distinct physical watches. Their number must not be presented or consumed as an existence, rarity, scarcity, owner, completed-deal, or worldwide-supply figure. Count removal resolves BouncerD's V1 count correction without reintroducing a field to relabel. No physical-watch equivalence is inferred from shared reference or seller, and no separate identity-resolution work is authorized. [R2 Q6]

Current listing links must lead to the existing canonical eligible listing. Keep the index's current-availability links separate from its durable historical statement. Re-evaluate eligibility when serving current claims; historical presence never keeps a departed listing in available inventory.

## 5. Admission into historical public presence

Require all of the following:

1. **Genuine publication:** the listing entered the actual public marketplace, not merely a draft, review queue, preview, import, private invitation, or test.
2. **Durable publication evidence:** a governed source supports the genuine public episode itself. Do not reconstruct publication from today's row, a convenient timestamp, search-engine memory, a screenshot alone, or a guess.
3. **Defensible reference-association evidence:** separately establish that this publication episode belongs to the asserted canonical reference, including any defensible retrospective correction. Today's reference link, seller wording, or mutable listing contents alone do not establish that historical association.
4. **Public-use eligibility:** the minimal historical statement is permitted under applicable FWT publication/retention rulings and is not subject to a governing suppression or takedown.
5. **No disqualifying mistake:** the event is not a fixture, fabricated episode, or publication excluded by a governed mistake/correction reason.

**Inherited:** `listing_mistake` must not become provenance just because publication occurred briefly. Private-only episodes are permanently excluded from collector/public Passport provenance. A genuine public episode may remain historical after the listing becomes private, but the later private period remains private. [S3 §§13–14]

**Application retained after review:** Adopt those source-selection boundaries for the reference-level Public Watch Index, without publishing Passport or importing its richer internal history. Conditions 2 and 3 prove different claims; neither substitutes for the other. A source may support both only if its actual evidence does so. [R3 correction 4]

There is no invented minimum number of public hours or visits. A brief genuine publication is not automatically a mistake, and a long-lived test is not automatically real. Evidence and governed reason codes decide.

### Backfill boundary

Historical backfill is not authorized by this document. Before any future backfill, establish the actual source coverage and public-retention permission for the affected population. Record missing coverage honestly. Do not relabel a history with missing durable events as complete.

If the required history mechanism does not exist, identify that specific prerequisite. Do not manufacture a new history by copying mutable listing rows into an index.

## 6. What survives lifecycle changes

The contract retains **the smallest permitted reference-level fact**: a qualifying public listing for this reference occurred. It does not retain the non-public listing as a discoverable offering.

| Transition or condition | Current availability | Historical public presence |
| --- | --- | --- |
| Genuine public listing remains eligible | Includes that listing. | Established if its publication is durably evidenced and otherwise eligible. |
| Public → removed | Excludes that listing. Other eligible listings may still make the reference available. | The minimal permitted prior-public statement can remain. Do not assert why it was removed. |
| Public → reserved | Excludes that listing. | The qualifying public episode can remain. Do not expose reservation, buyer, timing, or transaction terms. |
| Public → private | Excludes that listing and its URL from current results. | Only the qualifying earlier public episode can remain; neither the private transition reason nor subsequent private activity is published. |
| Public → sold/completed/ended | Excludes the departed offering. | Public presence alone remains a presence claim, not a sale claim. |
| Private-only; never genuinely public | Contributes nothing. | Contributes nothing. The reference may appear independently through other approved public sources. |
| Private → genuine public | Eligible only after the current public gate passes. | Only the evidenced public episode can qualify; the private period does not. |
| Mistake, false reference association, or governing withdrawal of permission | Re-evaluate the affected current assertion. | Correct or withdraw the affected contribution. Other independent valid contributions may still support the reference. |
| Listing deleted | No current contribution from it. | Retain a claim only if a permitted durable historical source independently survives. Do not keep forbidden listing contents merely to preserve the index. |

**Inherited:** The SEO order requires non-public listing states to leave the sitemap and emit `noindex`, while preserving authorized human use of the existing page. This index does not exempt a listing from that rule or redirect its private details into a new public page. [S2: Dynamic listing metadata]

For otherwise equivalent public evidence and permission, removed, reserved, private, and completed departures have the same public treatment: the offering and its current link disappear; only the minimal permitted earlier-public fact can remain. Do not serialize which departure occurred. This is equivalence of this index's output, not a promise about what someone might learn from other public observations. [R2 Q1, Q4]

**Durable does not mean permanently uncorrectable or irrevocably public.** A governed source correction, rights restriction, or takedown must be reflected in the public projection. Preserve authorized internal evidence under its own rules; do not expose the private reason for a public withdrawal. Suppression authority and persistence are defined in §8.

## 7. Minimum public field contract

Field names below are conceptual, not a database schema or a promised existing endpoint.

| Field group | Permitted content | Persistence boundary |
| --- | --- | --- |
| Public reference identity | Governed public reference key; manufacturer; model/reference text; supported hierarchy. | May persist while correct and approved for public use. No physical-watch or account key. |
| Historical presence | `public_listing_history_status` assessment with explicit coverage/qualification semantics. | May persist after a listing departs, subject to evidence, correction, and permission. |
| Approved public reference knowledge | Status based solely on information approved for public representation; approved destination when one exists. | May persist independently of listing activity. Neither positive nor negative status reveals internal knowledge. |
| Market Evidence | Status from the existing governed public Market Evidence projection; approved reference-level evidence destination when available. | Subject to that gate's reviewed resolution, association freshness, public-use permission, semantics, and correction rules. |
| Current availability | `available_now` assessment and currently eligible canonical listing links. **No aggregate count.** | Dynamic. Never an immutable historical inventory or physical-watch claim. |
| Contract and freshness metadata | Contract version; public assessment date at UTC calendar-day precision (§12); public coverage/retrieval completeness and unavailable states. | Explain public assessments, not source-event times, hidden knowledge, or internal processing history. |
| Reference destination | A real, approved, reference-level human URL if available. | Must remain reference-level and obey its own public policy; no invented route or hidden old-listing redirect. |

**Exclude from V1:** aggregate current listing counts, historical listing counts, publication/removal/reservation/transaction event dates, historical listing codes/URLs, historical photographs, seller prose, asking/realized prices, outcomes, fees, ownership/transfer history, seller identity, buyer identity, private recipients, correspondence, offers, raw provenance packets, private storage paths, access tokens, review findings, and internal scores. An assessment date is not a listing-event date.

This deliberate minimum does **not** revoke the broader Market History direction. That older product contemplates richer listing snapshots where rights permit, with truthful outcome/price distinctions. It needs its own governed release; the Public Watch Index does not build or cancel it. [S4 §6]

The omission of both current and historical aggregate listing counts is the consolidated V1 scope decision from Layout and DataMan. A later count would require deliberate adoption, a definition of offerings versus physical watches, and privacy review; it must not become a rarity or demand metric. Count omission is not a claim that a consumer cannot count returned links. [R1; R3]

## 8. Privacy and public-retention boundary

**Inherited:** An ordinary seller is not to become a permanently indexed identity merely by listing a watch. Dealer-profile eligibility is separately governed. [S2: Seller-profile privacy ruling]

**Retained product boundary:** This index carries no seller/buyer identity for either individuals or dealers. Existing current listing and dealer pages keep their separately governed behavior; they do not supply historical seller relationships to this index. BouncerD passed this distinction without broadening the index to dealer histories. [R2 Q2]

Apply the exclusion to every representation—not only visible prose. No account identifiers, hashed owner handles, seller filters, historical listing-link arrays, image filenames, serialized hidden fields, or error details that reconstruct the excluded relationship.

Private-only changes must not create an entry, increment a public count, advance an entry's public-change timestamp, or alter its public description. **V1 exposes no counts; that removal does not weaken the private-only prohibition.** Public assessment dates must arise from genuine public-scope assessment, not private-only events. Public availability may change when an offering leaves public availability; the index does not reveal the private reason or subsequent private activity. Evaluate this boundary on a reference with one listing as well as on larger populations. [R2 Q3]

The same public-scope discipline applies to internal reference knowledge. Private-only or unapproved internal material must not independently create a public entry, change an assertion, or produce a distinctive error or coverage message that exposes its existence. [R3 correction 2]

### Repeated observation and correlation

A reference-level aggregate is **not a promise of anonymity** from information someone observed while a listing was public. A consumer can repeatedly record availability and then-public canonical listing links, follow those links while public, and correlate public seller information into a timeline that FWT does not publish in this index. Removing counts does not eliminate that possibility. [R2 Q4]

> **The index is a current-state projection. FairWatchTrade does not undertake that repeated observation over time cannot reconstruct a sequence FWT does not itself publish.**

The narrower promise is that FWT does not provide historical seller linkage, old listing-link archives, private-state explanations, or other unnecessary reconstruction fields through this index. Day-granular assessment metadata reduces published timestamp precision; it does **not** prevent observers from using their own clocks to narrow when they saw a change. That final limitation is Aubrey's explicit clarification, not BouncerD's claim that coarsening limits all reconstruction to a day. [R2 Q4; R4]

### Suppression authority and persistence

**Confirmed product law — Aubrey proposal, Layout confirmation, Jason adoption [R4–R6]:** suppression and re-admission require **founder authority**, resolved server-side through a governed administrative path using existing authority conventions, not a new role. A suppression decision records its actor, time, reason, and affected contribution/scope internally; the actor, reason, and private decision details are never published. Every ordinary refresh, cache regeneration, or full rebuild must consume that suppression as publication authority and must not re-admit the contribution simply because the original source is read again. [R2 Q5; R4]

Re-admission requires an explicit authorized reversal and a successful eligibility check. Reference reassociation must not evade a suppression that still covers the contribution. Ordinary accounts, public consumers, and refresh processes have no suppression/reinstatement authority under this adopted rule. This document does not create a seller self-service suppression workflow or claim the administrative path already exists.

Suppression changes permission to publish; it does not rewrite the underlying publication event or authorize a parallel factual-history ledger. Use the governed publication/correction source as an input. If a durable source decision or administrative path is absent, that is a specific prerequisite for a later authorized build, not permission to improvise a public-only override.

FWT must apply the decision across **all affected representations it controls**, including the index, FWT-generated previews, and FWT-controlled caches. It cannot promise erasure of copies independently retained by third-party assistants, search services, or other consumers. This defines the product's control boundary; it does not grant third parties retention rights or waive any separate applicable obligation. [R2 Q5; R4]

### Retention permission remains conditional

Prior publication is not blanket permission for perpetual republication. Applicable ordinary-seller/dealer notice, historical retention, and suppression policy must be confirmed before public release or backfill. **BouncerD's retention PASS remains conditional on precisely this prerequisite; this revision does not clear it.** Existing source-specific rulings are preserved rather than reopened by default. [R2 Q1]

## 9. Market Evidence has its own gate

**V1 consumes the existing governed public Market Evidence projection. It does not define a broader evidence class.** A positive Market Evidence assertion means at least one reference-linked record currently passes that gate. DataMan identifies its required dimensions as exact reviewed reference resolution, current/fresh association, public-use permission, and resolved result semantics. Mere internal possession of an auction packet or database row is insufficient. [R3 correction 5]

The Public Watch Index must not reimplement or loosen that gate to produce a positive answer. Exact values whose meanings remain unresolved stay withheld even where normalized factual evidence has settled public-use permission. If the gate's public assessment is unavailable or incomplete, preserve that state rather than promoting internally held data into public evidence.

**Inherited:** The recovered AI Search Moment direction expressly preserves the settled public-facing use of normalized factual Monaco evidence. It distinguishes a semantics quarantine from a rights prohibition and says stale stored defaults must not override settled rulings. [S5: Listing Discovery and Market Intel Rights; Settled Monaco Ruling]

Therefore, do not impose a new blanket “all auction evidence is private” rule. Consume the current governed publication truth; report a specific representation/ruling mismatch for reconciliation instead of either blindly withholding eligible facts or bypassing a real restriction.

V1 exposes an approved evidence destination, not a copied keeper or a generated valuation. A reference-level auction result never establishes that the physical watch in a current FWT listing appeared in that auction. [S3 §17]

## 10. Public entrance and relationship to Seven's work

**Adopted entrance direction: provide a separately identified, read-only machine-readable Public Watch Index.** Advertise its capability through the existing `/.well-known/fwt-discovery.json` entrance rather than inventing a disconnected discovery system.

Prefer a small capability description pointing to a versioned, bounded/paginated resource over a single ever-growing static JSON dump. The suggested `/.well-known/fwt-watch-index.json` remains a possible entrance name—not an adopted route, implementation claim, or prerequisite for this contract. Exact paths and transport follow a later bounded technical discovery.

The public contract must expose the reference subject, four separate assertions, supported lookup semantics, freshness, coverage, incomplete retrieval, and unavailable states. It must not imply unsupported filters or make exact-reference lookup return a nearby reference as an exact match. [S5: Exact Identifier Integrity; S6 §6]

Where a collector follows a historical/reference result, the destination should explain the same reference-level public facts—not reopen a removed listing. Reuse an existing suitable public reference destination if proven. If none exists, record the missing destination as a specific future product dependency. Do not fake a URL or publish founder-only Vault/Passport content to fill it.

This is distinct from a sitemap. The index describes approved reference facts; Seven's sitemap work governs indexable URLs. Do not add this product to his current build, alter canonicals/Return to Browse, include API URLs in his sitemap contrary to its policy, or change the robots posture. Publishing/advertising the new resource requires separate authorization. No search-engine indexing, ranking, or external-agent adoption outcome is promised. [S2: Mission; Sitemap; Robots boundary]

## 11. External AI and FWT's own assistant

The public index is a shared **public-truth contract**, not necessarily the sole database for every FWT search or assistant. The internal assistant may have separate authorized capabilities, but those do not enlarge what it may publish as public watch history.

| Collector question | Required interpretation / answer boundary |
| --- | --- |
| “Does FWT have approved public reference knowledge for this reference?” | Describe only information approved for public representation. A negative or unavailable public answer says nothing about internal knowledge; knowledge never implies inventory. |
| “Have you listed one before?” | Use `public_listing_history_status`. Explain that an established episode may be a currently live listing; it does not prove a separate earlier offering or sale. Use “Previously Listed” only under §3's confirmed-no-current-availability condition. Never consult private-only episodes for a public answer. |
| “Do you have one now?” | Use a successful current availability assessment and eligible links. History or evidence alone cannot answer yes. |
| “You had one yesterday—is it still there?” | Recheck current eligibility. If unavailable, state that; do not guess from an old snapshot. |
| “Did it sell, and for how much?” | This index does not establish a sale or price. A separate permitted transaction/evidence source would be needed. |
| “Who owned or sold it?” | The historical index does not expose that relationship. Do not derive an answer from hidden identifiers. |
| “Is it popular, rare, or worth buying?” | Reference presence and returned offering links do not establish those claims. No aggregate counts exist in V1; do not manufacture recommendations, scarcity, or valuation. |
| “What Market Evidence can FWT show?” | Use only records admitted by the existing public Market Evidence gate. A packet stored internally is not a positive answer; no physical-watch provenance follows from reference-level evidence. |
| “Find this exact reference.” | Preserve exact identity. Any related results must be labeled as alternatives, never substituted as the requested reference. |

A “find one for sale” tool continues to mean current public inventory. History-only and knowledge-only entries must not enter its ordinary purchase results or their counts. A later history/research query is an explicit separate scope. Existing confirmed/unconfirmed search semantics also remain unchanged. [S4 §§6–7; S6 §§5–6, 18]

An authorized internal question about a user's own private record belongs to a separately authorized tool/context. It must not feed public historical-presence assertions or responses to other users.

## 12. Freshness, correction, and failure

The index is a derived public representation of governed identity, lifecycle, reference-knowledge, and evidence sources—not a second manually maintained history ledger. Each affirmative assertion must be explainable internally from its admitted sources without disclosing those private proof records publicly. [S3 §21; S5: One source of truth, many discovery surfaces]

### Public assessment-date precision

**Confirmed product law — Aubrey proposal, Layout confirmation, Jason adoption [R4–R6]:** expose the public assessment **date at UTC calendar-day precision (`YYYY-MM-DD`)**, not a per-listing event timestamp or exact internal processing time. It is the date of an actual successful public-scope assessment, not a publication, reservation, removal, or transaction date. Where an assertion was not successfully checked, its unavailable/incomplete state remains explicit; a general response date must not imply that all four assertions were verified.

Keep internal freshness checks as precise as necessary to support current eligibility. A day-granular public date is **not** daily-only refresh permission, a one-day freshness guarantee, or permission to call a stale listing available. A generated response time is not a substitute for checking availability, and opening a page must not pretend old data was refreshed. Changes to current public eligibility or allowed historical assertions must propagate through FWT-controlled index responses, previews, and caches. [R2 Q4; R4]

Consumers can time their own requests; the date choice does not bound the precision of their observations. Private-only source changes must not leak through other metadata or error paths simply because this field is coarse.

Do not serve a stale positive claim as current after FWT knows it is invalid. If freshness cannot be established, disclose the unavailable/stale assessment and withhold an actionable availability assertion. Exact refresh bounds and cache mechanics must be decided and proven before a future build can claim live availability; this contract invents no timing guarantee.

A failure of one source must not turn all other dimensions into falsehoods. Proven history can remain historical while current availability is unavailable. Conversely, a current listing does not prove complete historical coverage.

Corrections occur in the governed source, then its public projection changes. Reference-association correction follows §2 without rewriting original publication evidence. Suppression and authorized reversal follow §8 and remain effective through rebuilds. Do not patch the index to disagree with source facts or evade publication restrictions. If correction machinery is absent, identify the precise gap. Preserve required public correction explanations at reference level without exposing private reasons or reviving restricted details.

## 13. Product acceptance scenarios for a future authorized build

These are adopted acceptance requirements for a future authorized build, not tests executed by this document-adoption task.

| Scenario | Required public result |
| --- | --- |
| Approved public reference knowledge only | Public knowledge may be present. No invented listing, sale, inventory, or hidden-knowledge claim. |
| Internal reference row exists but no approved public knowledge | No positive public-knowledge assertion from that row and no response that distinguishes hidden existence from otherwise identical public inputs. |
| Evidence admitted by the existing public Market Evidence gate only | Market Evidence may be positive. It does not earn FWT public listing history. |
| Auction packet exists but reviewed association, freshness, permission, or result semantics fail the public gate | No positive Market Evidence assertion from that packet. Do not create a broader substitute gate. |
| One genuine current public listing with separate supported publication and reference-association proof | Availability and `public_listing_history_status = established` may coexist. Use “Available Now,” not “Previously Listed,” as the headline; expose no aggregate count. |
| Current listing but no durable historical-publication proof | Current availability may be established; do not fabricate history completeness or backfill an episode from a timestamp. |
| Sole public listing becomes reserved/private/removed | No current offering for that listing; minimal eligible prior-public fact may remain; no private-state explanation. |
| One of several current listings departs | Remove only its current contribution. Others may keep `available_now` true. |
| Private-only listing or private-only edits | No public-presence contribution, no entry created solely from it, and no private-change timestamp leakage. |
| Private episode followed by genuine public publication | Only the public episode contributes. |
| Test/fixture or governed `listing_mistake` | No qualifying historical contribution; temporary publication is not enough. |
| Current mutable reference field changes without evidence tying the old public episode to the new reference | Do not transfer historical presence based on the mutable row alone. |
| Founder reference correction overrides incorrect seller text with defensible episode-linked evidence | Correct the public association despite text inequality; original publication evidence and superseded association/correction trail remain auditable. |
| Reference correction, merge, split, or withdrawn association cannot be defensibly tied to the public episode | Withdraw the affected exact-reference claim; preserve other independently valid contributions and authorized source history. |
| Historical source removed or public-use permission withdrawn | Re-evaluate/suppress the affected public assertion; no shadow archive retaining prohibited detail. |
| Suppressed source is read again by ordinary refresh, cache regeneration, or full rebuild | Contribution remains suppressed; source persistence is not reinstatement authority. |
| Suppressed contribution acquires a corrected reference association | Still honor suppression within its recorded scope; reassociation does not evade the decision. |
| Suppression or reversal request from an ordinary account | No administrative authority. Founder-authorized action records actor/reason internally and never publishes them. |
| Authorized reversal of suppression | Require an explicit reversal plus a successful eligibility check before re-admission. |
| Same physical watch genuinely relisted | No unique-watch count or popularity inference. V1 historical presence remains an assertion, not a statistic. |
| Current-source failure or incomplete result set | No invented negative or exact total. A validated positive may stand; a definitive negative requires a complete successful relevant public check. |
| History established but current availability unavailable | Preserve `established`; do not use “Previously Listed” to imply a confirmed end to current availability. |
| Complete historical check within stated coverage yields no qualifying public record | Use `not_established_within_coverage`, never “never happened.” Incomplete/unreliable assessment uses `unavailable_or_incomplete`. |
| Consumer records repeated public responses and follows eligible links while public | Do not claim that absent counts or coarse dates prevent a third-party timeline; publish no historical linkage service of FWT's own. |
| Public metadata contains assessment date | UTC calendar-day precision under the adopted rule; not a source-event time, false refresh claim, or private-activity signal. |
| Takedown after an external consumer cached a formerly public response | Update affected FWT-controlled representations; do not promise recall of independently retained third-party copies. |
| Exact reference has no public index entry | No exact public result. Do not disclose whether private/internal records exist. |
| Price, seller, or private-packet fields are accidentally supplied upstream | They do not appear in the index, metadata, error response, or historical preview. |
| Ordinary current-inventory search | Historical/knowledge/evidence records do not masquerade as available listings. |

## 14. Adoption record—not permission to build

**Review status:** Layout's three corrections, DataMan's five semantic corrections, and BouncerD's three privacy corrections are incorporated in this adopted v2. Counts are removed rather than relabeled. The reference-only subject, four independent assertions, private-only exclusion, identical treatment of non-public departures, and no-public-Passport boundary remain intact. Review verdicts apply to their stated scopes; this is not a claim of fresh code, runtime, or retention-permission verification.

**Confirmation closed:** Layout confirmed Aubrey’s reconciled v2 and both completion choices: UTC calendar-day public assessment precision and founder-authorized suppression/re-admission through a server-enforced administrative path. Jason then directed “lock it.” The temporal-observation clarification and FWT-controlled cache/preview scope remain explicit in §8 with their provenance preserved. No additional duck review loop is required. [R5–R6]

**Single governing lineage:** Aubrey v1 draft → Layout review → BouncerD review → DataMan review → Aubrey reconciled v2 → Layout confirmation → Jason adoption. This adopted-status v2 is the current product-law artifact. Layout’s independently consolidated v3 remains a derivative working consolidation, not a competing final or governing file. No file from another seat was renamed, edited, or deleted in recording this lineage.

**Publication prerequisite still open:** identify the applicable ordinary-seller/dealer notice and historical-retention/suppression permission before any public release or backfill. BouncerD's conditional PASS does not waive this. If existing rulings suffice, identify them; if a specific permission is missing, name that gap rather than manufacturing an answer.

**Later bounded implementation facts, not work authorized here:** establish source coverage, the existing public gates, the durable suppression/correction path, approved reference/evidence destinations, and freshness/transport mechanics before a separate build order. Do not turn these into another broad audit or expand Seven's current sitemap flight.

**Founder adoption is complete.** Scheduling, build authority, public-release authority, and backfill permission remain separate acts. This document creates no calendar promise, robots blocker, new Final Flights number, or priority change. DataMan receives no new ingestion job; BouncerD receives no implementation job. No repo or production work is performed by this adoption. [R6]

## 15. Source register and limits

The source labels below preserve provenance when this Markdown file is moved outside chat. They are project documents, not proof of present deployment. Section titles identify the passages used.

- **[S1] Jason's Public Watch Index assignment and supplied DataMan concept, 2026-09-09.** Establishes this drafting scope, the proposed four distinctions, identity-free historical presence, and the ban on valuation/popularity/seller-history claims. No endpoint or release is established by the assignment.
- **[S2] `FWT_Robots_Readiness_SEO_Foundation_GRS_005_006_007_Seven_Order_2026-09-09_v2_BOUNCER_CHECKED.md`.** Relevant sections: Mission; Seller-profile privacy ruling; Dynamic listing metadata; Sitemap; Robots boundary; Preserve human navigation. The order is not a deployment return.
- **[S3] `FWT_06F_Watch_Passport_Seven_Build_Order_2026-08-24_v2_PROOF_HARDENED.md`.** Relevant §§2, 4, 13–18, 21. Supplies public/private/mistake source-selection and protected-identifier rules. Its implemented scope is described as founder-only; its future-public source rules do not authorize public Passport or this index.
- **[S4] `FairWatchTrade_Public_Listing_Codes_and_Search_Governing_Direction_2026-07-23.md`.** Relevant §§6–8, 10–11. Separates Available Now, Market History, and Auction Results; distinguishes asking price/outcome truth; preserves rights-dependent exact listing-code history and access boundaries. The broader direction is not silently shrunk by this index.
- **[S5] `FWT_AI_Search_Moment_Agent_Native_Marketplace_Primitive_2026-08-23 (4).md`.** Relevant sections: Privacy / Admission Boundary; Governed External Eligibility; Listing Discovery and Market Intel Rights; Settled Monaco Ruling; Exact Identifier Integrity; Trust Boundary; One public inventory projection; Freshness is product truth. Supplies the public inventory/evidence distinction and preserves settled source-specific rulings.
- **[S6] `FWT_Agent_Discovery_Bridge_V1_Seven_Build_Order_2026-08-26_v4_AUTHORIZED.md`.** Relevant §§5–6, 18, 19–22. Preserves current-inventory tool purpose, exact/no-match behavior, unknown/unconfirmed distinction, failure-not-empty behavior, and bounded authority. Its historical API/platform details are not reasserted as current implementation facts here.

### Review inputs incorporated in v2

- **[R1] Layout's “ADOPT WITH THREE SPECIFIC CORRECTIONS” return, supplied by Jason in this conversation, 2026-09-09.** Neutral history naming; approved public knowledge language; no exact current count. Adopts the product shape subject to the two scoped reviews. No separate attachment filename is asserted.
- **[R2] `FWT_Public_Watch_Index_BouncerD_Cold_Review_2026-09-09_v1.md`.** Q1 retains the notice/retention condition; Q4 requires timestamp precision and an honest repeated-observation limit; Q5 requires suppression actor/record/persistence and the third-party-copy boundary; Q6's count concern is resolved by V1 omission. Its production examples are reviewer-reported, not independently verified here.
- **[R3] DataMan's “PASS — with five exact semantic corrections” return, supplied by Jason in this conversation, 2026-09-09.** Exact `public_listing_history_status` states; approved public knowledge only; no current aggregate count; separate publication/reference-association proof and non-rewriting retrospective correction; consumption of the existing public Market Evidence gate. Coverage semantics pass as written. Resolver/gate behavior is reported review evidence, not a fresh repository check by Aubrey. No separate attachment filename is invented.
- **[R4] Aubrey's response to BouncerD, 2026-09-09, carried explicitly as completion proposals/clarification.** Proposes UTC-day assessment dates, founder-authorized suppression/re-admission, and all affected FWT-controlled representations; explains that an observer's own clock can provide finer timing. These originated as Aubrey’s proposals/clarification, not additional reviewer approvals. Layout subsequently confirmed both completion choices and the consolidated v2; Jason adopted it. See [R5–R6].

- **[R5] Layout’s final reconciled-v2 confirmation, supplied by Jason in this conversation, 2026-09-09.** Selects Aubrey’s reconciled v2 as the current contract, classifies Layout’s independent v3 as derivative working consolidation, confirms UTC calendar-day assessment precision and founder-authorized suppression/re-admission through a server-enforced administrative path, and ends the general review loop. Public-retention/notice/suppression permission remains a separate prerequisite.
- **[R6] Jason’s founder direction, 2026-09-09: “lock it.”** Adopts Aubrey’s reconciled v2 with Layout’s confirmed choices as product law. It does not authorize implementation, release, backfill, robots changes, or a new Seven assignment.
- **[R7] `FWT_Public_Watch_Index_v2_BouncerD_Cold_Check_2026-09-09_v1.md`.** Cold-check of the adopted v2 returned **PASS WITH ONE CLARIFICATION**. All prior privacy/retention corrections survived. The only merge seam was §3 wording that could be misread as allowing current public status itself to establish historical publication evidence. The clarification now states that `established` requires the same durable publication evidence as §5 and must survive the listing leaving public availability. Bouncer also noted that the count attribution should read **C3**, not Q6. No product choice, build authority, release authority, or retention permission was added.

### Adopted-edition integrity

This remains **Public Watch Index product contract v2**. It is the adopted edition of `FWT_Public_Watch_Index_Product_Contract_Aubrey_2026-09-09_v2_RECONCILED_FOR_LAYOUT.md`; that source review copy remains preserved unchanged. Its SHA-256 at adoption was `5f2dfb9db7df0ff8f500aba810eea202b5f1ed9cc357afff5ddc12478dbe8f87`. After adoption, BouncerD performed the bounded cold-check recorded as [R7]. The resulting §3 durable-publication-evidence sentence and the C3 attribution correction are **clarifications to the already-adopted v2**, not a new product version and not a reopened product choice. All exclusions and conditional public-release prerequisites remain unchanged.

No fresh schema, endpoint, public reference route, historical completeness, retention permission, deployment status, or search-engine behavior was verified in this task. Product-law adoption does not establish any of those facts or make this a shipped capability.

---

> **FWT has approved public reference knowledge. FWT has qualifying public listing history. FWT has a qualifying public offering available now. FWT has evidence admitted by its public Market Evidence gate. These are four independent claims; none stands in for another.**

**End — Aubrey · v2 ADOPTED PRODUCT LAW · Locked by Jason · No build, release, or backfill authority**
