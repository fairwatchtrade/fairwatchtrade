# Readability Floor Governance

**Permanent design-system law. Confirmed across mobile nav (v1.65b) and seller
profile (v1.66). Applies to EVERY page, current and future. Self-enforcing —
read before choosing text tokens.**

## The law

**The readability bar is outdoor sunlight at full brightness — NOT a dark room.**

Studio prototypes are designed as dark-room art pieces; their token choices
look elegant in a dark editor and become unreadable in real-world conditions
(phone in sun, bright office, older eyes). When translating any prototype to a
built page, text roles must be lifted to pass the sunlight bar.

## Token floors for TEXT (informational, user must read it)

- **Labels** (stat keys, section labels, eyebrows): floor at `--muted`.
  Never `--ghost`, never `--void`.
- **Body / instructional copy** (notes, hints, fallback sentences, correspondence
  text): floor at `--muted`, prefer `--slate` when it's real information the
  user needs to act on.
- **Primary values / names / titles**: `--platinum-dim` or `--platinum`.
- **Gold eyebrows**: `--gold-subtle` (rgba 0.45) is too weak on near-black at
  small sizes. Use `--gold` (smaller size to keep restraint) or raise opacity.

## Permitted dim usage (NOT subject to the floor)

- `--void`: placeholder text, truly decorative elements, disabled states, and
  decorative *repetition* of a line already read above (e.g. a closing-whisper
  repeat of an eyebrow). See Void-Token-Governance.md.
- `--ghost`: acceptable ONLY for genuinely secondary decoration, never for the
  primary instance of information the user needs.

## Why this keeps happening (the recurring trap)

A prototype reaches for the quietest token because "quiet = luxury." But quiet
and invisible are different on a dark background. The instinct is right; the
token is one or two tiers too low. Restrained ≠ unreadable. Every prototype
translation will hit this — bake the lift in at build time, don't fix per page.

## Standard build step (do this on EVERY page translation)

When building any page from a Studio prototype:
1. Identify every text role.
2. Apply the floors above BEFORE first render — don't ship the prototype's raw
   tokens and wait for a screenshot to reveal the problem.
3. The card/listing treatments (Browse cards etc.) are the REFERENCE for
   "correct readability" — match new surfaces to them, not to the dimmest
   prototype values.

## History (same fix, three times — hence this law)

- Mobile nav (v1.65b): nav text lifted one tier; section labels --ghost→--muted,
  8.5px; greeting --slate→--platinum-dim. Porch/sunlight test.
- Seller profile (v1.66): entire left column at floor/below; labels --ghost→
  --muted, instructional copy --ghost→--muted/--slate, gold eyebrows
  strengthened. Right-column cards were already correct — proved the contrast.
- (Earlier) --void-on-readable-text caught 3-4x across auth/dashboard/sell flow.

These are the SAME disease at different tiers. This doc + Void-Token-Governance
together set the full text-readability policy.
