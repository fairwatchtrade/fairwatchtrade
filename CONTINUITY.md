# FairWatchTrade — Continuity

**If this is the only file you were given, you are in the right place.**

You are probably starting cold: no context from previous work, no knowledge of
which historical documents matter, and no way to ask which files to read. This
file exists so you never have to ask that question.

Everything below is a procedure. It deliberately contains almost no facts,
because facts go stale and procedures do not.

---

## What this is

The Continuity Spine is a small repository-local recovery system. It lets you
compile a **recovery packet** for one subsystem: what the system is, what it
owns, what is protected, what is open, what mechanical traps will cost you
hours, and — first, before any of that — **what has not been proven.**

It is five parts:

```
CONTINUITY.md            this file — the permanent front door
System Homes             README.md files beside the machinery they describe
ARTIFACT_CATALOG.json    one hand-maintained pointer index
derive.mjs               deterministic facts read from Git
packets/                 compiled on demand, gitignored, never authority
```

## The one thing you must not misunderstand

> **A packet points at evidence. It is not authority because it exists.**

A catalog entry does not make its target authoritative. A packet does not make
its contents current. Both are recovery views compiled from repository
evidence at the moment you ran the command.

The categories this system keeps separate, and will not flatten for you:

> **Continuity says believed. Git says shipped. Production says users have.
> The founder's ruling says what the product should be.**

When those disagree, the packet shows you the disagreement. It does not pick a
winner. For present implementation truth, current Git and deployed-commit
evidence outranks a stale continuity claim. For product intent, current
founder and product law govern.

---

## Commands

Node only. No PowerShell, no Python, no local model, no vector database, no
embeddings, no retrieval service, no network, and no database access.

**1. Check the machinery is internally sound.**

```bash
node continuity/validate.mjs
```

Exits non-zero only on *structural* defects — things that would let a packet
state something false. Staleness is not a structural defect; it is reported as
a warning and degrades coverage.

**2. See what is and is not covered.**

```bash
node continuity/compile.mjs --coverage
```

**3. Compile the packet for the system you are about to work on.**

```bash
node continuity/compile.mjs --system <system> --role <builder|founder>
```

Run `--coverage` first if you do not know the system names. The packet is
written to `continuity/packets/` and is gitignored — it is disposable output,
regenerate it whenever you want.

**4. Prove the machinery still behaves.**

```bash
node continuity/fixtures/run.mjs
```

Run it **unpiped**. The exit code is the result; piping into a formatter masks
it.

---

## How to read uncertainty

These words mean specific things. They are not synonyms and the tools will
never collapse them.

| State | Meaning |
| --- | --- |
| `COVERED` | A governed System Home exists and no freshness or integrity defect was detected. |
| `DEGRADED` | A home exists but something is unresolved — usually a continuity gap. Its prose may describe an older implementation. |
| `UNCOVERED` | Real implementation exists with **no** governed home. Nothing is recorded about it. |
| `CONTINUITY_GAP` | Commits touched the system's owned paths *after* its home was last updated. |
| `COULD_NOT_VERIFY` | The check could not run — usually Git was unavailable. |
| `VERSION_UNDERIVABLE` | This commit's subject carries no version at its leading position. |
| `VERSION_MISMATCH` | A human label disagrees with the version derived from the commit. |
| `NOT BUILT / DO NOT INFER` | Recorded as deliberately absent. Do not infer it from adjacent machinery. |

Two distinctions do most of the work:

> **`COULD_NOT_VERIFY` is not "no difference found."**
> One means the question went unanswered. The other means it was answered.

> **`VERSION_UNDERIVABLE` is not agreement, not mismatch, and not a defect.**
> It means the version simply cannot be derived from that subject.

**Absence is never evidence of safety.** "No open work recorded" means none was
written down. "No home" means nothing is recorded about a system that may still
be large and live. The packet says so out loud in both cases.

---

## Before you change anything

The packet is a starting point for diagnosis, never a licence to mutate.

1. Confirm current Git state yourself — branch, HEAD, dirty and untracked files.
2. Read the newer commits named under any `CONTINUITY_GAP` before trusting the
   home's description.
3. Treat every `TRAPS` entry as load-bearing. They are recorded precisely
   because they are mechanical, specific, and expensive to rediscover.
4. Anything the packet marks as a contradiction is **unresolved**. Verify it or
   obtain a ruling. Do not resolve it by choosing the more convenient source.
5. Production state, database state, and deployment state are **not** in this
   system. Nothing here proves what production currently does.

Governing product authority is not in this system either. The standing order —
Product Soul, then Product Laws, then the current work order, then repository
truth — lives at [`docs/product-laws/README.md`](docs/product-laws/README.md).
The Continuity Spine points at law; it never restates or overrides it.

---

## Where the machinery is documented

[`continuity/README.md`](continuity/README.md) — the schemas, the version
parser contract, the source tiers, the hard-failure versus warning boundary,
how to add a System Home safely, and how to add an artifact without
manufacturing authority.

Read it before changing anything under `continuity/`.
