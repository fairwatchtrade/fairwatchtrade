# Continuity Spine — the machinery

## The misconception this file exists to kill

> "The Continuity Spine knows what is true about FairWatchTrade."

It does not, and it must never be built as though it does.

This machinery answers one narrow question: **where is the evidence, and what
about it is unproven?** It is a retrieval and honesty layer. It has no opinion
about what the product should be, it cannot see production, it cannot see the
database, and it resolves no contradiction it finds.

The second misconception, close behind:

> "It compiled, so it is current."

A packet is compiled output. Its existence proves a command ran, nothing more.
That is why `continuity/packets/` is gitignored — a committed packet would
start to look like a record.

---

## What this is for

Someone arriving with no context should be able to start from `CONTINUITY.md`
alone and recover enough bounded, source-linked institutional context to begin
safe diagnosis — without the founder locating historical files by hand.

The governing truth distinction, preserved everywhere and never flattened:

> **Continuity says believed. Git says shipped. Production says users have.
> The founder's ruling says what the product should be.**

---

## The flow

```
CONTINUITY.md            permanent front door, procedure-first, fact-light
   ↓
System Homes             README.md beside the machinery, carrying frontmatter
   ↓
ARTIFACT_CATALOG.json    one hand-maintained pointer/classifier index
   ↓
derive.mjs               deterministic facts read from Git at compile time
   ↓
packets/<system>-<role>-<date>.md    ephemeral, gitignored, never authority
```

## Hand-maintained vs derived vs ephemeral

Getting this boundary wrong is how a continuity system starts lying.

| Layer | Kind | Rule |
| --- | --- | --- |
| System Home `open`, `traps`, `production_proof`, `protected`, `not_built` | **hand-maintained** | Git cannot derive their semantics. A human writes them. |
| System Home `owns`, `watches`, `system_id` | **hand-maintained** | Declarations, not facts about history. |
| Artifact Catalog | **hand-maintained** | Pointers and classifications only. |
| Last-touch commit, dates, version labels, continuity gaps, README corpus, coverage | **derived** | Read from Git every run. |
| Recovery packets | **ephemeral** | Compiled on demand. Gitignored. |

> **A derived fact is never written back into a hand-maintained field.**

Caching "current version" or "last commit" into a home would create a second
truth that drifts from the log it summarizes. If you want the derived value,
run the tool.

---

## Where the behaviour actually lives

The part that costs hours if it is not written down.

| Behaviour | Lives in | Not in |
| --- | --- | --- |
| Version derivation law | `derive.mjs` → `deriveVersionFromSubject` | any consumer |
| Version claim comparison | `derive.mjs` → `compareVersionClaim` | the compiler |
| Continuity gap detection | `derive.mjs` → `deriveContinuityGap` | the validator |
| **What counts as a System Home** | a README carrying frontmatter with `system_id` | any registry file |
| Structural integrity rules | `validate.mjs` → `validateCatalogStructure` | the compiler |
| Coverage arithmetic | `compile.mjs` → `computeCoverage` | `derive.mjs` |
| Packet section order and wording | `compile.mjs` → `renderPacket` | templates |
| Shared fixtures | `fixtures/cases.mjs` | duplicated in either tool |

**There is no home registry.** A README becomes a System Home purely by
carrying frontmatter with a `system_id`; the corpus is discovered with
`git ls-files` every run. Adding a home is therefore a one-file change, and
nothing can fall out of a list nobody remembered to update.

---

## The version derivation law

This is a governed contract, not an implementation detail. Read it before
touching `deriveVersionFromSubject`.

Commit subjects in this repository fall into three materially different
classes:

1. subjects beginning cleanly with this commit's own version;
2. subjects with a short punctuation/whitespace prefix before that version;
3. subjects whose prose later *mentions* a version belonging to another build,
   deployment, merge, or spec.

A parser anchored at character 0 fails loudly on class 2. A parser that scans
forward for the first version-shaped token **fails silently and confidently**
on class 3 — and the silent failure is worse, because a confident wrong
version is indistinguishable from a right one.

**The contract:**

1. Inspect only the subject-leading position.
2. Permit a leading run of characters that are exclusively non-alphanumeric or
   whitespace, structurally bounded to the run before the first alphanumeric
   character.
3. The first alphanumeric content must itself begin with `v` + integer major +
   `.` + integer minor.
4. On success, return the normalized token with the commit SHA and subject as
   evidence.
5. If prose begins before a version token appears, return `VERSION_UNDERIVABLE`.
6. A version-shaped token appearing later in prose is a **reference**, never
   this commit's version. Do not scan the remainder. Do not promote it.
7. `VERSION_UNDERIVABLE` means the version could not be derived. It is **not**
   agreement, **not** mismatch, and **not** a repository defect by itself.
8. A human label disagreeing with a successfully derived version is
   `VERSION_MISMATCH`.
9. Never convert "could not derive" into "agrees".

```text
v7.53 - ...                                    → v7.53
@ v6.81 - ...                                  → v6.81
v7.17 - ... prior v6.86 posture ...            → v7.17
chore: trigger deployment for v3.25 ...        → VERSION_UNDERIVABLE
Merge main ... (brings v2.40 /list ...)        → VERSION_UNDERIVABLE
```

This is the same fail-closed distinction as:

> **"No difference found" is not the same as "could not verify."**

Version parsing is case-sensitive on a lowercase `v` by deliberate choice —
determinism beats leniency here, and a subject that does not follow the
convention should be reported, not guessed at.

---

## System Home schema

Frontmatter at the top of a README beside the machinery it describes.

```yaml
---
system_id: wanted            # required, unique across the repository
owns:                        # required — paths this system is responsible for
  - app/wanted
watches:                     # optional — paths that affect it but it does not own
  - app/api/listings
protected:                   # optional — a recorded seam and why
  - path: lib/wanted.ts
    reason: exact protected-seam reason
open:                        # optional — human-maintained open work
  - id: EXAMPLE-001
    state: OPEN
    what: what is actually unfinished
production_proof:            # optional — the last recorded production proof
  what: what was proven
  when: 2026-08-30
  how: source pointer or exact proof method
traps:                       # optional but strongly expected
  - a specific mechanical hazard
not_built:                   # optional — deliberate absences
  - what does not exist, so nobody infers it
---
```

`owns` and `watches` are **continuity metadata, not access control**.
`protected` records a seam and a reason; it grants and revokes nothing.

The frontmatter reader is a deliberately small strict subset of YAML —
scalars, scalar lists, lists of flat objects, and one level of nested map. It
is not a YAML engine, and anything it cannot parse becomes a reported error
rather than a guess. **A frontmatter parser that guesses is a continuity system
that lies.** Use two-space indentation and no tabs.

### Adding or updating a System Home safely

1. Add the frontmatter to the README that already sits beside the machinery.
   Do not create a parallel "feature homes" folder — colocation is the
   convention and a second taxonomy would compete with it.
2. Preserve the existing prose. The home points at authority; it does not
   rewrite authority into its own words.
3. Declare the system in `ARTIFACT_CATALOG.json` under `systems` so it can be
   requested by id and so its absence would register as `UNCOVERED`.
4. Record only what you have actually verified. **Never seed a home with
   remembered state.** A continuity system born with stale "current" data is
   worse than one with none — the honest empty states ("no open work
   recorded", "no production proof recorded") say plainly that nothing was
   written down.
5. Run `node continuity/validate.mjs`.

---

## Artifact Catalog

One catalog, not separate decision/build/incident/supersession indexes.

**Types:** `decision` · `build_order` · `discovery` · `design` · `incident` · `law`

**Authority states:** `current` · `superseded` · `draft` · `rejected` ·
`for_review` · `authorized` · `final`

Of those, `current`, `authorized` and `final` resolve as current authority.
`superseded`, `rejected`, `draft` and `for_review` never do — that is the
mechanism that stops a plausible old order compiling as though it were live.

The states are deliberately **not** collapsed for schema neatness. `draft` and
`for_review` mean different things about who has looked at a thing, and
flattening them would erase that.

`writer` records a **role**, never an individual's name. This is deliberate and
matches the repository's standing rule that authoring and tooling identities do
not appear in committed files.

### Adding an artifact without manufacturing authority

- Record what is needed to **find and classify** the source: id, type, system,
  title, source location, authority state, supersession edges, writer role,
  date, and shipped commits where materially applicable.
- Set the authority state from what the artifact itself says, never from its
  date or from where the file happens to sit. **Chronology is not authority.**
- If two artifacts both claim to be current for a contract that permits one,
  the validator fails. Do not resolve that by editing a state to make the
  error go away — find out which one is actually current.
- If you cannot establish authority from the evidence available, record the
  contradiction as an `incident` and leave it unresolved. The compiler will
  surface it. That is the correct outcome, not a failure.

> **A catalog entry does not make its target authoritative.**

---

## Source location tiers

| Class | Meaning | Verified locally? |
| --- | --- | --- |
| `repo` | Repo-relative path expected to track current repository source. | Yes — a missing target is a structural defect. |
| `repo_permalink` | Commit-pinned permalink where immutable history identity is required. | No. |
| `drive` | Stable Drive file id / URL. | No — warned. |
| `production_proof` | A procedure or read rather than a durable artifact. Store the exact proof method. | No. |
| `external_handoff` | A file handed to the builder outside repo and outside Drive. | No — warned. |

`external_handoff` exists because the alternative was worse: faking a
repo-relative path, or claiming a Drive location that was never verified. An
honest "the compiler cannot locate this" is the point of the tier.

**Never** fake a repo-relative path to a Drive artifact, and **never** mirror a
Drive artifact into the repository merely to make a link convenient. Where
proof is a procedure rather than a file, describe the procedure precisely
instead of manufacturing a link.

---

## Coverage states

| State | Condition |
| --- | --- |
| `COVERED` | Governed home exists, no freshness or integrity defect detected. |
| `DEGRADED` | Governed home exists with a continuity gap or comparable unresolved defect. |
| `UNCOVERED` | Declared system has material tracked implementation and **no** governed home. |
| `DECLARED_ONLY` | Declared in the catalog with no tracked implementation found. |
| `COULD_NOT_VERIFY` | Git derivation unavailable; coverage genuinely unknown. |

The README corpus count is **discovered every run**, never hard-coded, and
every count is printed with the exact enumeration scope that produced it.
Different scopes legitimately produce different counts — a disagreement about
the number is usually a disagreement about the scope, which is why the scope
travels with the number.

> **Never infer "no home" means "no risk."** The compiler states exactly what
> is missing instead.

### `CONTINUITY_GAP`

Raised when any tracked `owns` path carries commits **after** the System Home's
own last update. The home file itself is excluded from the comparison — a
documentation edit is not implementation drift.

The report names the system, the home path, the home's last-update SHA and
date, the count of newer commits, and each newer SHA with its date, subject and
derived version.

The compiler **never rewrites the home**. The purpose is to make missed closure
loud, not to pretend a compiler can infer the human meaning that went missing.

---

## Hard failure vs packet warning

`validate.mjs` exits non-zero **only** on structural defects — the class of
problem that would let a packet state something false:

- invalid catalog JSON, or a missing catalog
- duplicate artifact ids, or duplicate `system_id`
- dangling `supersedes` / `superseded_by` targets
- circular supersession
- inverse supersession disagreement
- an artifact both resolving as current authority and recorded as superseded
- multiple current authorities where the contract requires one
- a `repo`-tier source whose target does not exist
- malformed System Home metadata
- unknown authority state or artifact type
- compiler/validator fixture disagreement

Everything else is a **warning**: it degrades coverage and appears in the
packet, and it does not fail the process. Continuity gaps, unverifiable
external sources, homes not declared in the catalog, and owned paths missing
from disk all live here.

The distinction matters in both directions. Making staleness a hard failure
would block every build on ordinary drift until people started ignoring the
validator. Making a false-authority defect a mere warning would let a packet
confidently state something untrue.

---

## Fixtures

`continuity/fixtures/cases.mjs` holds the shared cases; `run.mjs` is the
harness.

```bash
node continuity/fixtures/run.mjs
```

**Run it unpiped.** A shell pipeline whose final program is a formatter returns
the formatter's exit code and will report success over a failing suite. If you
want formatted output, capture the real exit code separately first.

Both the validator and the compiler evaluate the same fixture set and compare
signatures; a disagreement is a hard failure. That is the guard against the two
tools drifting into two different opinions about the same rule.

Every fixture id is obviously synthetic. Real current state is never seeded
into fixtures.

---

## Failure modes and traps

- **The forward-scan parser.** The single most dangerous change anyone could
  make here is "improve" version derivation by searching the whole subject for
  a version token. It would pass casual testing and silently attribute other
  builds' versions to commits. Fixtures C2, C2b and C2c exist to catch exactly
  that.
- **Mirrored supersession is one edge, not two.** `supersedes` and
  `superseded_by` are inverse descriptions of the same relationship. Walking
  both as outgoing edges turns every correctly-mirrored pair into a false
  2-cycle. `buildSupersessionGraph` normalizes to a single newer→older
  direction first.
- **Absence read as safety.** Every empty section in a packet is phrased to say
  that nothing was recorded, not that nothing exists. Preserve that wording.
- **Caching a derived fact.** Writing a derived commit or version into a home
  creates a second truth that drifts.
- **Seeding remembered state.** Recording a production proof or open item that
  was not verified in that session makes the system confidently wrong.
- **Piping the harness.** Masks the exit code.

---

## The zero-context drill

The proof that this system works is not that its tests pass. It is that someone
starting cold can recover a subsystem without asking which files to read.

1. Provide **only** `CONTINUITY.md`.
2. It runs `node continuity/validate.mjs`, then
   `node continuity/compile.mjs --coverage`.
3. It picks a real system and compiles a packet for it.
4. It states what is not proven, what is protected, and what it must verify
   before mutating anything.

The failure sentence is:

> "Send me the files."

If that sentence is needed, the drill failed regardless of what the tests say.

---

## What this deliberately does NOT do

- **No archive reorganization.** Historical artifacts are not relocated,
  renamed, flattened, or normalized. This system indexes; it does not tidy.
- **No authority engine.** It never decides which of two conflicting
  authorities wins. It shows both and marks the contradiction unresolved.
- **No production or database access.** Nothing here proves what production
  does. A packet compiles with no network and no credentials by design.
- **No governance repair.** It may report that a governing document
  contradicts another source. It may not silently fix one.
- **No second documentation kingdom.** System Homes are the existing colocated
  READMEs. There is no parallel taxonomy and there must not be one.
- **No historical rewriting.** Old evidence is never edited to make it
  consistent with current understanding.
