# Moon Rendering — Approach & Provenance

*Companion to the Moon Principle in PRODUCT_SOUL.md. How Vault moons get made.*

---

## The principle this serves

**The moon should have detail like the item it represents** (William's principle,
PRODUCT_SOUL.md). A moon's richness is a faithful function of its watch's actual
complexity and character — never inflated, never flattened. The moon *carries*
the watch's truth; it does not merely depict it.

---

## The two poles (the calibration references)

The two finest moonphase executions known, each the apex of a different
philosophy. They define the range every Vault moon lives within:

- **Parmigiani Tonda Selene** — the REALIST pole. Relief-engraved rose-gold moon:
  real craters, real maria, raised topography, raking light on metal. The moon as
  it actually *is*, rendered so faithfully you could navigate by it. (Also: the
  watch William's wife owns — the moon the family lives with.)
- **Breguet moonphase face** — the ICONOGRAPHIC pole. The classical engraved
  visage: a serene hand-finished face, centuries of horological tradition, on a
  deep blue ground. The moon as the craft has lovingly *personified* it.

Fidelity means honoring which philosophy a given watch follows — realism where
the piece is realist, character/face where the piece is iconographic. In kind,
not just in amount.

---

## The source of truth (canonical asset)

Vault moons are rendered from **William's own telescope photograph of the real
moon** — shot through his telescope + Nikon rig in Sebring, FL.

- Canonical corrected source: `moon_corrected_LR.jpg` (the detailed full-disc shot)
- **Scope behavior: LEFT-RIGHT MIRROR ONLY** (not inverted) — confirmed via an
  accidental 2021 plane-transit photo whose known travel direction revealed the
  flip. Any of William's moon photos correct with a single **horizontal flip**.
- Provenance: founder's own astrophotography → fully owned, zero IP question,
  maximally self-evident. Where did this moon come from? He pointed a telescope
  at the sky and took the picture.

This is the deepest expression of the Self-Evident Standard: the rendering's very
ORIGIN is checkable and real.

---

## IP guardrail

- The Selene and Breguet are **teachers (the standard), never templates.** We use
  the *technique and genre* — relief-engraved gold, classical moon-face — which
  are public-domain craft ideas centuries old. We never reproduce either brand's
  specific artwork/disc. A cloned Selene would (a) risk design/trade-dress rights
  and (b) make a collector smirk ("that's a ripped Selene") — violating our own
  Credibility Standard.
- Because the SOURCE is William's own photo of the real moon, the result is
  original by construction. Learn from the Selene; render our own.
- (Non-lawyer note: if the moons become a prominent commercial feature, a quick
  IP-attorney gut-check on final renderings is cheap insurance. The approach —
  own photo, original execution — is sound.)

---

## The pipeline

1. **Source:** William's telescope moon photo, orientation-corrected (horizontal
   flip). `moon_corrected_LR.jpg`.
2. **Stylization pass → GPT** (image-gen better suited for the artistic render).
   Turn the real moon into the engraved rose-gold relief asset. MUST stay
   grounded in the actual photo — never a from-scratch generated moon (provenance
   is the entire point).
3. **Back to Ducky 7** to wire into the Vault: per-watch fidelity logic (data
   drives how much relief — simple watch → simple moon, complex/finely-finished
   piece → relief-rich), rendering at galaxy scale vs. close-zoom reference card,
   moon-as-reference-card integration (shared spec grammar: movement, finishing,
   complications, dial treatment, materials, frequency/Hz).

### Caveat on the GPT pass
Image models tend to *reinterpret* rather than precisely transform — GPT may
drift toward a GENERIC moon and lose William's exact lunar geography. Watch for
this; push it to stay faithful to the attached photo. If it can't preserve
geography while achieving the gold-relief quality, fallback = programmatic
relief-mapping from the actual photo (Ducky 7), which preserves geography exactly
even if less painterly. Try GPT first.

---

## The GPT prompt (for the stylization pass)

> I'm attaching a photograph of the real moon that I took through my own
> telescope (orientation-corrected). Transform THIS photo — keeping its actual
> lunar surface, real craters, and real maria intact — into a stylized rendering
> that looks like the moon-phase disc of a high-end watch, in the spirit of the
> relief-engraved rose-gold moon on the Parmigiani Tonda Selene.
>
> Goal: my real moon, rendered as if hand-engraved in rose gold with raised
> topographic relief — craters and maria carved into the metal surface, raking
> light catching the raised rims so detail reads as three-dimensional and
> physical, not flat or printed. Warm rose-gold tone, finely stippled engraved
> metal texture.
>
> Critical: stay faithful to MY photo's actual lunar geography — do not invent or
> rearrange craters. This is my real moon, just rendered in engraved gold. Keep
> it recognizable as the same moon.
>
> Output: clean high-resolution moon disc on a transparent or dark background.
> Give me 2–3 variations (e.g. more photoreal-relief vs. more stylized-engraved;
> rose-gold vs. paler champagne gold).

---

## Provenance story (optional, for About / hover detail)

> "The moons in the Vault are rendered from a photograph of the real moon, taken
> through the founder's own telescope."

A credibility flourish no competitor can match — personal, true, verifiable, and
exactly the "real thing, seen truly" thread that runs through the whole platform.

---

*Logged the night the cluster-enrichment pipeline went live and the Moon
Principle was named. Source photo in hand; GPT stylization pass next; build to
follow.*

---

## FINAL ASSETS (locked)

The moon was sourced, stitched, de-seamed, and relief-rendered. Two canonical
assets, used by SCALE per the Moon Principle (the moon gains fidelity as you
approach it):

- **Galaxy / distant scale → "Champagne" (soft, warm rose-gold).** Reads clean
  and glows when small against the dark; relief stays legible without turning to
  noise at tiny sizes. This is the moon seen from across the galaxy.
- **Close zoom / reference card → "Photorealistic Relief" (refined rose gold).**
  Deep carved-gold relief, every crater dimensional, raked light on the rims.
  The horological payoff at the end of the journey — the moon arrived at.

Recommended behavior: crossfade #3 → #1 as the user zooms toward a moon, so the
approach FEELS like the moon coming into focus and gaining its gold. The journey
crescendos at the detail.

## Provenance of the final asset (unbroken chain)

William's telescope (fixed zoom) → Nikon D7100, max-quality JPEG, April 26 2021
→ William stitched the frames by hand into a complete disc → brightness-seam
correction → relief/engraved-gold render. The crater GEOGRAPHY is entirely his
real moon; the gold/relief is treatment, not invention. There is no more
self-evident moon: he photographed it and assembled it himself.


---

## THE ATLANTIS REVEAL (logged — do not lose)

A homage to the Space Shuttle Atlantis exhibit at Kennedy Space Center: a film
builds the story to an emotional peak, then the screen goes translucent and
LIFTS AWAY to reveal the actual orbiter, nose pitched down, feet from you. People
gasp. People cry. One of the great object-reveals anywhere.

**The idea:** build that same reveal into the Vault. A veil/screen/gate parts and
lifts to unveil the real object as if it was there all along.

**Why it fits FairWatchTrade exactly:**
- Atlantis reveals the REAL PHYSICAL OBJECT at the climax. That is the Moon
  Principle precisely — you traverse the galaxy to reach one specific watch; the
  moon/watch is the only real thing you can hold. The watch IS our Atlantis.
- KSC is William's soft spot (Jim McDivitt, the pressure suit at age 3, the
  reverence for the real thing). Building the Atlantis reveal in is William
  putting his own awe into the product.
- It is the dramatic older sibling of the existing Dial Reveal ("the detail was
  always there; FairWatchTrade just lets you see it").
- Anyone who has stood in that KSC room and gasped will recognize the reference
  instantly — it signals the builder venerates the real object.

**Candidate placements:**
- **Entrance gates** (see fairwatchtrade_vault_entrance_studio_v2.html): reader
  crosses "Enter" → the gates lift / go translucent → the galaxy is revealed
  behind them, there all along.
- **Moon / reference (the TRUEST parallel):** approaching the deepest level, the
  starfield/veil parts and lifts to reveal the watch (or the gold moon) hanging
  in space as if always present. This is the real-object-unveiled climax — the
  strongest Atlantis parallel and the emotional peak of the whole journey.

Recommendation: the moon-reveal is the deeper hit (real object unveiled), but
both could exist — a lift at the threshold AND a lift at the destination.

## Back-button caution — timing (logged)

The "Use RESET, not the browser back button" caution should NOT appear until the
user has clicked their first star (drilled in at least once). Before that there
is nothing to warn about, and unnecessary warnings are noise. Show it only after
the first drill-in. (Less annoying = better; warn only when earned.)

---

## Why the Atlantis Reveal matters (the real brief)

William has been through the KSC Atlantis reveal twenty times and still gets
teary. Somewhere along the way he stopped watching Atlantis and started watching
PEOPLE'S FACES at the moment of reveal — he positions strangers, tells them where
to stand, and waits for the gasp to land on them. Every time.

That is the design brief. FairWatchTrade is not a marketplace — it is the gasp.
The moment a collector reaches the watch nobody else recognized and the real
thing is simply THERE, unveiled, undeniable. The reveal is not about the object;
it is about what the object does to a person at the instant of unveiling.

So the reveal belongs at the MOON — the destination, the real watch — not the
gates. Atlantis taught the lesson: the gasp is at the object, not the threshold.
The moon-lift is where the face changes. That is where William would stand
someone and wait. Build it there.

Build this fresh, with room to pour into it. It is the emotional core of the
whole Vault.
