# Active Criteria Law

**Status:** GOVERNING  
**Applies to:** Browse filtering, Refine rail, Active Criteria, Quick Add, Gallery View, and Collector View.

## Core Law

> Use Refine to build the search. Use Active Criteria to continue the search.

## Required Behavior

- The left Refine rail is the full search-building surface.
- Every active criterion is reflected in the persistent Active Criteria surface above results.
- Refine may be hidden to reclaim listing width.
- Active Criteria remains visible when Refine is hidden.
- Each active criterion supports direct removal.
- Removing a criterion must genuinely broaden the result set and synchronize all filter state.
- Refine is reopened for deeper additions or changes.
- Gallery View and Collector View use the same search state.
- Collector View remains one watch per row.
- Browse context and scroll position should remain stable during ordinary criterion removal and rail open/close behavior.

## Forbidden Behavior

- Decorative-only chips.
- A permanently visible Refine rail as fallback.
- A second independent filter system across the top.
- Silent loosening or reapplication of removed criteria.
- Gallery-only implementation.
- Hiding or weakening Active Criteria when Refine is collapsed.
- A simpler substitute that removes hide-and-reclaim behavior.

## Required Verification

Verify:
- Refine open with criteria;
- Refine hidden with the same criteria;
- one-by-one criterion removal;
- synchronized result count/state;
- Refine reopen;
- Gallery/Collector parity;
- no loss of browse context.

> Start with conviction. Broaden with intention.
