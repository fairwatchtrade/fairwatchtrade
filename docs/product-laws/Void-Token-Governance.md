# --void Token Governance

**Status:** GOVERNING  
**Applies to:** all FairWatchTrade text tokens and any surface using `--void`, especially mobile navigation, Sell Flow, Account, Catalogue, admin, and future responsive work.

## Core Law

> `--void` is below the readable floor on dark backgrounds and may never be used for information the user needs to read.

`--void` is reserved for:

- placeholder text;
- truly decorative elements;
- disabled or unavailable states where low emphasis is intentional and the state remains understandable.

## Relationship to Readability Floor

This law governs **where `--void` may be used**.

`Readability-Floor-Governance.md` governs **how bright readable text must be**.

For current readable-text floors:

- labels, section keys, eyebrows, hints, captions, progress labels, nav items, and other informational text must meet the readability floor defined in `Readability-Floor-Governance.md`;
- `--ghost` is not a general readable-text fallback;
- where the two documents appear to conflict, `Readability-Floor-Governance.md` controls readable-text brightness.

Permanent distinction:

> `--void` is for non-reading states.  
> Readable information starts at the governing readability floor.

## Required Behavior

- Treat placeholder copy as non-instructional and eligible for `--void`.
- Treat decorative repetition as eligible for `--void` only when the same information is already available in a readable primary instance.
- Treat disabled states as eligible for `--void` only when the disabled meaning remains visually understandable.
- Lift any user-facing informational text above `--void` before first render.
- When translating a prototype, do not preserve a quiet token merely because it looked elegant in a dark-room design environment.

## Forbidden Behavior

Never use `--void` for:

- labels;
- instructional copy;
- hints the user needs to act on;
- captions carrying unique information;
- progress-step names;
- active or available navigation items;
- live values;
- warnings;
- seller/buyer workflow guidance;
- any primary instance of information the user is expected to read.

Do not use `--ghost` as an automatic replacement for invalid `--void` text. Apply the current floor from `Readability-Floor-Governance.md`.

## Mobile Visibility Requirement

Mobile verification must assume real-world brightness, not a dark-room preview.

For any mobile visibility pass:

1. identify all text using `--void`, `--ghost`, or similarly dim tokens;
2. classify each instance as placeholder, decoration, disabled state, or readable information;
3. leave sanctioned non-reading uses alone;
4. lift readable information to the governing readability floor;
5. verify on the real production device under bright conditions;
6. do not close the issue from code inspection or screenshots alone if real-device legibility remains uncertain.

## Sanctioned `--void` Usage

Correct examples include:

- input and textarea placeholder text;
- decorative marks that communicate no unique information;
- disabled-state text where the disabled condition is already clear and usability is preserved.

These uses should not be “fixed” merely because they are dim.

## Required Verification

When work touches text tokens or mobile readability, verify:

- no informational text remains on `--void`;
- no readable text is incorrectly treated as decorative;
- placeholder and disabled-state uses remain intentionally dim;
- the current readability floor is applied consistently;
- the surface remains legible on the real target device in bright conditions.

## Related Law

- `/docs/product-laws/Readability-Floor-Governance.md`

## Supersession

This file replaces the older rule that allowed `--ghost` as the general minimum for readable informational text.

That older floor is superseded.

The governing readable-text floor is now defined by `Readability-Floor-Governance.md`.

## Closing Rule

> Quiet may be restrained. It may not become unreadable.
