# Product Fidelity Rules

## 1. Build the feature Jason actually imagined

When Jason describes a feature, treat the described capability as the required product outcome.

Do not silently reduce it into:

- a review-only page;
- a report;
- a dashboard;
- a status screen;
- a recommendation engine;
- a manual checklist;
- a preview;
- a diagnostic room;
- or a weaker “Phase 1” substitute

unless Jason explicitly approves that reduction first.

If Jason asks for a room that **does something**, the shipped feature must do that thing.

## 2. Do not trade usefulness for implementation convenience

Implementation difficulty is not permission to shrink the feature.

Do not spend substantial effort building an easier adjacent feature simply because the requested one is harder.

A polished useless substitute is still the wrong product.

## 3. Preserve the founder’s verb

Identify the main action word in Jason’s request and preserve it through implementation.

Examples:

- “upgrade” means the system performs an upgrade;
- “update” means it changes the relevant artifact/state;
- “import” means it performs the import;
- “repair” means it repairs;
- “merge” means it merges;
- “apply” means it applies;
- “search” means it actually searches;
- “restore” means it restores.

Do not replace an action verb with “review,” “inspect,” “explain,” or “show” unless that was the requested action.

## 4. Acceptance begins with the user outcome

Before architecture or implementation planning, write one plain-language sentence:

**When this is finished, Jason will be able to ________.**

That sentence must describe the actual capability Jason requested.

Every major implementation decision must be checked against it.

If the final product cannot complete that sentence, the feature is not complete.

## 5. No unauthorized scope reduction

If the full requested capability genuinely cannot be built safely or correctly in the current flight, stop and state the blocker.

Do not independently redefine the deliverable downward.

Jason decides whether to:

- solve the blocker;
- split the work;
- accept an interim stage;
- or change the feature.

Agents do not make that product decision on Jason’s behalf.

## 6. Intermediate infrastructure is not the product

Schemas, status checks, version detection, validation, reconciliation, dry runs, previews, reports, and review screens may be necessary machinery.

They do not count as completion unless they produce the requested end-user/admin capability.

Do not declare success because the plumbing is sophisticated.

## 7. Prefer end-to-end vertical capability

For a large feature, build the thinnest complete path that performs the real action before expanding secondary capabilities.

A narrow working upgrade path is more valuable than a comprehensive review system that cannot upgrade anything.

## 8. Do not invent enterprise process

FairWatchTrade is currently a solo-development project.

Process must be proportional to actual risk.

Do not introduce committees, excessive gates, parallel proof systems, unnecessary worktrees, elaborate approval structures, or enterprise release ceremony unless the technical risk genuinely requires them.

## 9. Complexity must buy capability

Every major piece of complexity must answer:

**What new thing can Jason do because this exists?**

If the answer is merely “understand the system better,” but the requested feature was supposed to perform an action, reconsider the design.

## 10. Stop when the requested capability is complete

Do not expand a bounded feature into a platform, framework, generalized orchestration layer, or future-proof architecture unless required for the requested behavior.

Build the real thing, verify the real thing, close it.

## 11. Product fidelity outranks architectural elegance

A technically elegant implementation that does not deliver Jason’s requested capability is a failed implementation.

A simpler implementation that faithfully performs the requested job is preferable.

## 12. Mandatory final self-check

Before declaring a large feature complete, answer these four questions:

1. What exact capability did Jason ask for?
2. Can he perform that capability now?
3. Did I replace any requested action with review, explanation, or manual work?
4. Did I shrink the feature without Jason explicitly approving that change?

If #2 is no, or #3/#4 is yes, the feature is not complete.
