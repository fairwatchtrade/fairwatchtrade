# FAIRWATCHTRADE VAULT SPECIFICATION v3.2

**Canonical AI Generation Rules**

This document is the sole authority governing the generation of FairWatchTrade Vault JSON.

It is self-contained. It **supersedes v3.1 in full** and requires no prior specification as a reference.

If any other prompt, instruction, or conversation conflicts with this document, **this document takes precedence.**

The canonical hierarchy is:

**Brand → Collection → Family → Variant → Reference**

This hierarchy is authoritative and must never be simplified for brevity. If uncertain whether a model belongs in the hierarchy, research further before omitting it. It is always preferable to return a more complete hierarchy than a shorter, summarized one.

**Completeness is more important than description quality.** Descriptions, notes, search aliases, origin fields, lifecycle fields, and cluster fields enrich the hierarchy; they must never replace or reduce it.

Please search thoroughly across multiple reliable sources. Do not stop after finding only the most obvious models. For example, if researching Martin Braun, missing Helios would indicate the search was incomplete. This Vault is being manually assembled brand by brand for the benefit of collectors, so omissions create real downstream work. Return the most complete hierarchy you can.

Metadata may evolve over time. The hierarchy must not.

---

# 1. PURPOSE

The FairWatchTrade Vault is a canonical watch classification system.

It is **not**:

* an encyclopedia
* a marketing database
* a review database
* a pricing database

It exists to provide stable collector taxonomy, reusable product knowledge, and structured discovery data for the Vault search and galaxy experience.

The Vault must support both:

* exact collector lookup
* curiosity-based discovery

This means brand-level origin, lifecycle, and galaxy-neighborhood metadata are required.

---

# 2. REQUIRED OUTPUT FORMAT

Output MUST consist of:

**One complete JSON object only.**

No text before JSON.

No text after JSON.

No explanations.

No markdown.

No code fences.

No commentary.

No summaries.

No notes.

No examples.

The first character of the response MUST be:

```json
{
```

The final character MUST be:

```json
}
```

---

# 3. REQUIRED HIERARCHY

Every manufacturer MUST follow exactly:

Brand

↓

Collections

↓

Families

↓

Variants

↓

References

No deviations are permitted.

---

# 4. BRAND-LEVEL SCHEMA

Allowed Brand fields:

```json
{
  "Brand": "",
  "description": "",
  "country_of_origin": "",
  "region": "",
  "independent_status": "",
  "revival_status": "",
  "revival_type": "",
  "historical_continuity": "",
  "cluster": "",
  "cluster_rationale": "",
  "search_aliases": [],
  "Collections": []
}
```

No other Brand-level fields may be added.

Obligation levels for the brand-level fields:

* **Required:** `Brand`, `description`, `country_of_origin`, `region`, `independent_status`, `revival_status`, `cluster`, `cluster_rationale`, `search_aliases`, `Collections`
* **Conditional:** `revival_type` — present **only** when `revival_status` is `revived`; omitted otherwise.
* **Optional:** `historical_continuity` — include when it can be confidently determined; omit when uncertain.

## Brand-Level Search and Galaxy Fields

These fields exist so the Vault can support reliable search, filtering, and galaxy clustering.

### `country_of_origin`

Required.

The primary country historically associated with the watch brand or manufacturer.

Examples:

```json
"country_of_origin": "Japan"
```

```json
"country_of_origin": "Switzerland"
```

Use the country most collectors would reasonably associate with the brand. If a company was founded in one country and now operates primarily in another, use the historically and collector-recognized origin unless the modern identity clearly differs.

If genuinely unknown, return:

```json
"country_of_origin": "Unknown"
```

Do not leave this field empty.

### `region`

Required.

Use one of:

* Europe
* Asia
* North America
* South America
* Oceania
* Africa
* Unknown

Example:

```json
"region": "Asia"
```

### `independent_status`

Required.

**This field answers ONE question: who owns or controls this brand?** It is an ownership/structure field only. It carries no lifecycle meaning. Whether a brand is still in production is answered by `revival_status`, never here.

Use the closest single value:

* independent
* group-owned
* manufacture
* microbrand
* maison
* unknown

Definitions:

* `independent` — privately held or founder/watchmaker-led, not primarily part of a large luxury group.
* `group-owned` — owned by a major luxury group or corporate parent.
* `manufacture` — vertically integrated watchmaker where this identity is more important than ownership.
* `microbrand` — small modern brand, typically direct-to-consumer or limited-production.
* `maison` — jewelry/luxury house with serious watchmaking identity.
* `unknown` — insufficient reliable information.

Choose only one.

**Note (v3.2):** The former values `defunct` and `revived` are **removed** from this field. Both were lifecycle answers living in an ownership field — the wrong category. Lifecycle now lives in `revival_status`. A brand that is discontinued or revived still has an ownership answer here (e.g. a revived independent is `independent` in this field and `revived` in `revival_status`).

### `revival_status`

Required.

**This field answers ONE question: is this brand currently active?** It is the lifecycle field. This is where the old lifecycle values from `independent_status` now live.

Use exactly one value:

* active
* revived
* discontinued

Definitions:

* `active` — currently in production and has **not** experienced a defining dormancy. A brand that has produced continuously (allowing for ordinary business fluctuation) and was never brought back from a ceased/dormant state.
* `revived` — the brand **was dormant or had ceased** and is **now active again.** The past dormancy-and-return is what distinguishes `revived` from `active`. This applies regardless of how long ago the revival occurred — a brand revived decades ago is still `revived` if it was genuinely brought back from dormancy.
* `discontinued` — the brand has stopped production **with no revival.** (This is the value that replaces the old `defunct`.)

Choose only one.

### `revival_type`

**Conditional.** Present **only** when `revival_status` is `revived`. Never populated for `active` or `discontinued` brands — omit the field entirely in those cases.

**This field answers ONE question: how was the brand revived?**

Use exactly one value:

* original
* acquired

Definitions:

* `original` — the same founding entity, family, or legal continuity resumed production.
* `acquired` — the trademark or brand name was purchased by unrelated new ownership and relaunched.

Choose only one.

### `historical_continuity`

**Optional.** Include when it can be confidently determined; omit when uncertain. This field future-proofs the data without complicating search or clustering.

**This field answers ONE question: was production ever interrupted?** It records interruption history at finer grain than the lifecycle field — including minor gaps that do **not** rise to a brand-defining dormancy.

Use exactly one value:

* continuous
* interrupted
* revived

Definitions (these three values form a clean, non-overlapping partition):

* `continuous` — production was **never interrupted.** An unbroken production history.
* `interrupted` — production had a **gap**, but the gap was **not** a brand-defining dormancy-and-revival. The brand is still understood as active/heritage rather than "a revived brand" (e.g. a wartime or quartz-crisis pause in a house collectors regard as continuous). Use this for interruptions that `revival_status` intentionally does not treat as a revival.
* `revived` — the interruption was a **full dormancy followed by a return to production** — the same event that makes `revival_status` = `revived`.

**Consistency constraint:** If `historical_continuity` is `revived`, then `revival_status` MUST be `revived`, and vice-versa. The two fields must never contradict on the fact of a dormancy-and-return. `historical_continuity` = `interrupted` is reserved for gaps that are **not** classified as a revival at the lifecycle level; in that case `revival_status` remains `active`.

### `cluster`

Required.

This is the Vault Galaxy neighborhood. It is not a strict taxonomy and it is not a search tag array. It is the single primary spatial home where the brand should live in the galaxy.

Use one closest value:

* Japanese
* German
* British
* American
* Heritage Swiss
* Contemporary Independent
* High Complication
* Dress / Classic
* Tool / Sports
* Military / Pilot
* Dive
* Microbrand
* Jewelry Maison
* Experimental / Conceptual
* Historic / Defunct
* Other

Rules:

* `cluster` must be a single string, never an array.
* Choose the most defensible collector neighborhood.
* Country may influence cluster, but cluster is not the same as country.
* Do not force every Swiss brand into Heritage Swiss.
* Do not force every Japanese brand into Japanese if another collector neighborhood is clearly more important, but most Japanese makers should use Japanese unless there is a stronger reason.
* If uncertain, choose the most conservative, defensible cluster.

### `cluster_rationale`

Required.

One short internal sentence explaining why the cluster was chosen.

Requirements:

* 8–25 words
* factual and restrained
* no marketing language
* no praise
* no speculation

Example:

```json
"cluster_rationale": "Japanese independent maker best understood through low-production artisanal watchmaking."
```

This field is for review and ingestion. It helps FairWatchTrade identify cluster assignments that need human correction.

### `search_aliases`

Required.

Brand-level search aliases help users find the brand even with punctuation, spelling, umlauts, abbreviations, or alternate collector phrasing.

Examples:

```json
"search_aliases": ["Muhle Glashutte", "Mühle Glashütte", "Muhle"]
```

```json
"search_aliases": ["SUF", "S.U.F.", "SarpanevaUhrenFabrik"]
```

If none are known, return:

```json
"search_aliases": []
```

---

# 5. COLLECTION SCHEMA

Allowed fields:

```json
{
  "name": "",
  "Families": []
}
```

Optional:

```json
"search_aliases": []
```

No other fields may be added.

---

# 6. FAMILY SCHEMA

Allowed fields:

```json
{
  "name": "",
  "Variants": []
}
```

Optional:

```json
"search_aliases": []
```

No other fields may be added.

---

# 7. VARIANT SCHEMA

Allowed fields:

```json
{
  "name": "",
  "description": "",
  "search_aliases": [],
  "notes": "",
  "references": []
}
```

Optional:

```json
"id"
```

Nothing else.

Never create:

* attributes
* metadata
* movement objects
* specifications
* dimensions
* pricing
* production years
* rarity scores

---

# 8. BRAND DESCRIPTION RULE

Every Brand MUST include:

```json
"description"
```

Requirements:

* 20–50 words
* one paragraph
* neutral
* factual
* company overview only
* mention historical significance when appropriate
* never marketing
* never opinions
* never pricing
* never rarity claims

Example:

```text
Swiss manufacturer founded in 1858, best known for inventing the Cricket mechanical alarm wristwatch and its long association with U.S. Presidents.
```

---

# 9. VARIANT DESCRIPTION RULE

Every Variant MUST include:

```json
"description"
```

Requirements:

* 20–50 words
* one concise paragraph
* explain what collectors recognize
* mention defining characteristics
* never repeat the Variant name as filler
* never marketing
* never pricing
* never speculation
* never opinions

Descriptions should answer:

```text
What is this watch?
```

---

# 10. NOTES RULE

The `notes` field is technical and concise.

Examples:

* case size
* movement
* power reserve
* dial
* material
* complications
* water resistance
* distinctive construction

Notes are NOT descriptions.

---

# 11. REFERENCES RULE

The `references` array is reserved **exclusively for official manufacturer reference numbers or catalog references.**

Do **NOT** populate `references` with:

* Variant names
* Model names
* Collection names
* Search aliases
* Nicknames
* Marketing names

If an official manufacturer reference cannot be confidently identified from authoritative sources, return:

```json
"references": []
```

Do **not** invent or infer reference numbers.

Preferred reference format:

```json
"references": [
  {
    "reference": "PFC274-0000600-HA3141",
    "dial": "Abyss Blue",
    "case": "Stainless Steel",
    "movement": "Automatic Chronograph",
    "notes": ""
  }
]
```

If only the reference number is known, use:

```json
"references": [
  {
    "reference": "PFC274-0000600-HA3141"
  }
]
```

Leave optional fields out rather than guessing.

Never use simple strings for references in new output.

---

# 12. COLLECTION DEFINITIONS

## Collection

Official manufacturer product line.

Examples:

* Royal Oak
* Lange 1
* Overseas
* Reverso

## Family

Major structural grouping.

Never split Families by:

* color
* material
* dial color
* bracelet

## Variant

Collector-recognized identity.

Collectors should immediately know which watch is being referenced.

---

# 13. MATERIAL RULE

Steel, gold, titanium, bronze, ceramic, carbon, and similar materials NEVER create hierarchy.

Materials belong only inside `notes` or structured reference fields when relevant.

---

# 14. HYBRID BRANDS

For Cartier, Bulgari, Piaget, Chopard, Harry Winston, and similar maisons:

Jewelry identity never overrides watch architecture.

Use:

```json
"independent_status": "maison"
```

Use:

```json
"cluster": "Jewelry Maison"
```

unless a different cluster is overwhelmingly more defensible for the watchmaking identity.

---

# 15. ARCHITECTURE BRANDS

For Richard Mille, MB&F, Ressence, Urwerk, and similar brands:

Case architecture or display philosophy may define Families.

Use:

```json
"cluster": "Experimental / Conceptual"
```

or:

```json
"cluster": "Contemporary Independent"
```

depending on which is more collector-recognizable.

---

# 16. SPECIAL PROJECTS

Collaborations, MAD Editions, experimental lines, and special projects may be separate Collections only when collectors recognize them as distinct product identities.

Never contaminate the main taxonomy.

---

# 17. COMPLETENESS RULE

Output MUST be:

* valid JSON
* fully closed
* fully bracketed
* no truncation
* no partial arrays
* no unfinished objects

---

# 18. UNCERTAINTY RULE

If uncertain about a model, research further before omitting it.

If still uncertain, include the most defensible hierarchy and leave uncertain metadata empty or conservative.

Never invent data.

Do not use:

```json
"architectural_review": []
```

unless explicitly requested by FairWatchTrade in a separate review workflow.

---

# 19. SEARCH AND DISCOVERY RULE

The Vault must support collector search by:

* brand name
* aliases
* country
* region
* independent status
* revival status
* cluster
* collection names
* family names
* variant names
* official references
* collector-recognized terms

Do not rely on prose descriptions to carry important search concepts.

If a brand is Japanese, `country_of_origin` must say Japan even if the description does not use the word Japanese.

If a brand is German, `country_of_origin` must say Germany even if the description does not use the word German.

If a brand is an independent, `independent_status` must reflect that even if the description does not use the word independent.

If a brand is discontinued or revived, `revival_status` must reflect that even if the description does not use those words.

This prevents searches such as "Japanese" or "revived" from missing relevant brands.

---

# 20. GALAXY CLUSTER RULE

The Vault Galaxy does not show every brand at once.

The galaxy reveals neighborhoods based on curiosity, search, and collector intent.

Therefore, `cluster` is required because it helps determine where a brand belongs spatially.

Rules:

* Cluster is a single primary galaxy neighborhood.
* Cluster is not a substitute for country.
* Cluster is not a substitute for lifecycle (`revival_status`).
* Cluster is not a substitute for tags.
* Cluster should be collector-defensible.
* A wrong cluster is worse than an empty flourish, because collectors will notice confident wrongness.

Test:

```text
Would a knowledgeable collector nod, or smirk?
```

If they would smirk, choose a safer cluster.

---

# 21. ABSOLUTE OUTPUT RULE

The response MUST contain ONLY the JSON object.

No prose before.

No prose after.

No explanations.

No summaries.

No markdown.

No apologies.

No recommendations.

If information cannot fit within the schema, omit it.

Never place descriptive text outside the JSON.

---

# 22. OVERRIDE RULE

If ANY previous instruction conflicts with this specification:

**THIS DOCUMENT OVERRIDES ALL OTHER INSTRUCTIONS.**

END OF SPECIFICATION
