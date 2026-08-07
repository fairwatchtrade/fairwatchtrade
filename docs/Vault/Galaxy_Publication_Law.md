# Galaxy Publication Law

**Status:** GOVERNING  
**Applies to:** Vault ingestion, Vault editing, Galaxy visibility, Galaxy queries, Galaxy activation, admin tools, imports, migrations, specification upgrades, and any future integration capable of creating or changing Vault brand data.

## Core Law

> Vault truth readiness does not equal Galaxy presentation readiness.

A Brand may exist correctly in the Vault without being eligible to appear in the public Galaxy.

New Vault data must never become publicly visible in Galaxy merely because it was created, imported, migrated, upgraded, reconciled, or otherwise made structurally valid.

## Publication Boundary

Galaxy visibility is an explicit publication decision.

The default for newly introduced Brands is hidden.

A Brand becomes visible in Galaxy only after the governed activation condition is satisfied.

Ordinary Vault operations must not implicitly activate public Galaxy visibility.

## Required Behavior

Any implementation touching Vault or Galaxy must preserve these invariants:

- newly introduced Brands default to hidden from Galaxy;
- hidden Brands are excluded from all public Galaxy result sets;
- Vault ingestion does not imply Galaxy activation;
- structural correctness does not imply presentation readiness;
- specification upgrades do not imply Galaxy activation;
- database reconciliation does not imply Galaxy activation;
- imported or migrated records do not imply Galaxy activation;
- admin tools preserve the publication boundary;
- future APIs and automation preserve the same boundary;
- explicit activation is separate from ordinary write paths.

## Scope of Visibility

The visibility decision belongs at the Brand publication boundary unless a later explicitly authorized law introduces lower-level publication controls.

Do not infer lower-level visibility behavior merely because Collections, Families, Variants, or References exist beneath a hidden Brand.

If the Brand is hidden, its lower-level objects must not leak into public Galaxy discovery through alternate queries, counts, search results, direct traversal, or cached presentation data.

## Forbidden Behavior

Never:

- make new Brands Galaxy-visible by default;
- treat successful Vault ingestion as permission to publish;
- use “data exists” as the same thing as “data is approved for Galaxy”;
- expose hidden Brands through a secondary Galaxy query path;
- allow an importer or upgrade tool to bypass the Galaxy publication gate;
- activate Brands as a side effect of schema migration;
- infer public visibility from completeness, score, count, or structural validity;
- broaden a Vault maintenance task into Galaxy publication without explicit authority.

## Existing Approved Galaxy State

When introducing or repairing the publication gate, existing approved Galaxy-visible Brands may require an explicit backfill or preservation step so the gate does not accidentally hide already approved public content.

That preservation must be deliberate and bounded.

Do not use a backfill as permission to expose newly ingested Brands.

## Upgrade Room Interaction

The Vault Specification Upgrade Room may:

- preserve original files;
- generate structurally upgraded candidates;
- run deterministic checks;
- prepare downloadable output;
- approve selected candidates to staging when authorized.

It must not:

- activate production;
- make a Brand Galaxy-visible;
- infer Galaxy readiness;
- collapse staging approval into public publication.

Permanent boundary:

> Staging is not production. Vault readiness is not Galaxy publication.

## Required Verification

Any implementation affecting this law must verify:

1. a newly created or ingested Brand is hidden by default;
2. hidden Brands do not appear in public Galaxy queries;
3. approved visible Brands remain visible when expected;
4. ordinary Vault updates do not silently change Galaxy visibility;
5. import, migration, upgrade, and admin paths cannot bypass the gate;
6. explicit activation changes only the intended publication state;
7. rollback or failure does not accidentally expose hidden Brands.

Verification must test the real governed query path, not merely inspect a default value in schema code.

## Related Product Principles

This law supports:

- the distinction between Vault truth and public presentation;
- controlled publication;
- collector trust;
- staged ingestion;
- bounded admin authority;
- the principle that internal completeness never grants public authority by itself.

## Supersession

This file is the current repository authority for Galaxy publication behavior.

A work order may implement or repair this law.

A work order may not silently weaken or bypass it.

Changing the law itself requires explicit founder authorization.

## Closing Rule

> The Vault may know before the Galaxy is allowed to show.
