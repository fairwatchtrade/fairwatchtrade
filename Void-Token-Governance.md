# --void Token Governance

**Permanent rule. Confirmed by Ducky 3. Self-enforcing at source (globals.css).**

## The rule

--void (#3D424F) is BELOW the readable floor on dark backgrounds. It is ONLY
for: placeholder: text, truly decorative elements, and disabled states.

Any text a user needs to READ — labels, hints, captions, "Soon" pills,
progress step names, nav items — floors at --ghost (#4A4F5C) minimum.

**If a brief specifies --void on informational text, --ghost wins.**

## Why this keeps happening

Briefs written without globals.css in hand reach for --void because it looks
like the right "quiet" token. But quiet and invisible are different on a dark
background. --void is invisible; --ghost is quiet-but-readable. The instinct
("make it whisper") is right; the token is wrong. Whisper = --ghost.

## History (caught & corrected, same session)

- Auth pages — labels, "Soon" pills, switch copy, terms — swapped to --ghost.
- Seller dashboard — header label, coming-soon items, soon pills — built
  --ghost per ruling (brief had said --void).
- Sell flow — progress-bar pending labels confirmed already --ghost (clean).

## Enforcement

Governance comment pasted into globals.css directly below the existing
"VOID FLOOR WARNING" block. See void-governance-snippet.css for the exact block.

## Sanctioned --void usage (CORRECT — leave them)

- placeholder:text-[var(--void)] on inputs/textareas — placeholder is
  decoration, not instruction. Explicitly permitted.
- The v1.62 child components use --void ONLY on placeholder: — clean.
