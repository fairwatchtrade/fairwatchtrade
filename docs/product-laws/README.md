# FairWatchTrade Product Laws

**Status:** GOVERNING  
**Repository path:** `/docs/product-laws/`

## Purpose

Product Laws preserve reusable product behavior that must survive across implementation flights, developer sessions, and future refactors.

They are not design history, continuity notes, implementation journals, or work orders.

They exist so anyone changing a governed surface can read the relevant law in the repository before touching that surface.

## Authority Order

1. **Product Soul** — constitutional principles: why FairWatchTrade exists and what it must never become.
2. **Product Laws** — reusable behavioral invariants: what must remain true whenever a governed area is changed.
3. **Current Work Order** — the bounded change authorized for the present flight.
4. **Repository Truth** — how the current implementation actually works.

A work order does not silently supersede a Product Law.

If a requested implementation conflicts with a Product Law, stop and surface the conflict unless the work order explicitly carries founder authorization to change that law.

## Required Use

Before modifying a product surface:

1. Identify whether one or more files in `/docs/product-laws/` apply.
2. Read the applicable laws before editing.
3. Preserve every applicable invariant unless explicit authority changes it.
4. Name applicable Product Laws in the work order.
5. Verify the implementation against both the work order and the governing Product Laws.

Recommended work-order form:

```text
Applicable Product Laws:
- /docs/product-laws/Help_Bubble_Law.md
- /docs/product-laws/Sell_Flow_State_Preservation_Law.md
```

Only list laws that genuinely apply.

## What Belongs Here

A rule belongs in `/docs/product-laws/` only when it is:

- reusable across multiple flights or surfaces;
- easy to violate accidentally;
- expensive or trust-damaging when forgotten;
- sufficiently settled that it should not be redesigned locally each time;
- concise enough to be consulted during implementation.

Do not create a Product Law merely because a topic is important.

## What Does Not Belong Here

Do not use this folder for:

- project history;
- continuity packets;
- meeting notes;
- discovery logs;
- speculative ideas;
- one-off visual preferences;
- implementation return packages;
- repository audits;
- temporary bug lists;
- superseded rules.

Historical context belongs elsewhere. This folder contains current law.

## Standard Law Structure

```text
# [Subject] Law

Status: GOVERNING
Applies to: ...

## Core Law
One short governing statement.

## Required Behavior
...

## Forbidden Behavior
...

## State Preservation
...

## Required Verification
...

## Related Laws
...

## Supersession
...
```

Not every law needs every section. Do not add empty ceremony.

## Change Control

Product Laws are not casually rewritten during implementation.

When a law needs to change:

- identify the exact conflict or new product decision;
- obtain explicit founder authorization;
- revise the law deliberately;
- preserve repository history through normal version control;
- update dependent work orders where necessary.

Do not fork competing versions of the same governing law inside this folder.

## Implementation Principle

> Product Soul says why. Product Laws say what must remain true. Work Orders say what changes now. Repository Truth says how it currently works.

## Closing Rule

> Put the memory that protects the product inside the repository.
