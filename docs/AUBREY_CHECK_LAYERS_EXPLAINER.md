# The Aubrey Check — layers and thresholds, in plain terms

Written 2026-08-01, for Jason. Not a spec. This is the reasoning, so the
decisions are yours rather than mine.

---

## Part 1 — Why "threshold 3" is a guess, and why that's still fine

### What a threshold actually is

Each odd thing we notice about a photo carries a **weight**:

| weight | meaning | example |
|---|---|---|
| 1 | worth a glance | saved out of Photoshop |
| 2 | hard to explain casually | different shape from every other photo in the listing |
| 3 | very hard to explain | *(reserved — nothing scores this yet)* |

Add up the weights on a listing. That total is the **score**. The threshold is
the line where we stop letting it publish and ask a human to look.

Tonight's real case scored **4**: the Bezel photo was the wrong shape (2) and
carried no camera data while its five siblings did (2).

An honest set scores **0**.

### Why 3

- At **2**, a single weight-2 oddity holds the listing. One cropped photo, one
  image off a different phone — an honest seller gets stopped for one quirk.
- At **3**, one oddity is never enough. It takes two independent things wrong
  with the same listing. Tonight's case clears it at 4.
- At **5+**, you'd have missed tonight's case.

So 3 is the lowest number that requires *corroboration* while still catching
the only real fraud we've measured.

### Why it is nonetheless a guess

We have **one** real fraud case and **one** honest set. Both yours. Both from
the same evening.

That is a sample of one on each side. Any statement of the form "two anomalies
almost always mean fraud" is, right now, unsupported — it might be true, but
nobody has measured it, and confident unmeasured numbers are exactly what
produced the original broken version of this feature.

Compare with `T_SAME = 17`, the verifier threshold. That one came from actual
measurements:

```
re-uploaded untouched .......  1.2   theft
cropped to the watch ........  2.8   theft
different watch, same model .. 31.4  innocent
two unrelated seller photos .. 64.5  innocent
```

A gap of 28.6 to place a line in. **That** is a measured threshold. Score 3 has
nothing like it yet.

### What to do about it

Ship 3, label it in the code as provisional, and revisit once ~50 real listings
have run through. Then the question becomes answerable with data: what did
honest sellers actually score?

The thing that makes shipping a guess safe here is that **the consequence of
being wrong is small**. A listing is held and a human looks at it. Nobody is
accused, nothing is deleted, nothing is public. If the threshold is too tight
you'll see it as annoying extra reviews, not as harmed sellers — and it's one
number to change.

That asymmetry is the whole reason this design is safe to be uncertain in.

---

## Part 2 — Why layer 1 has to split in two

### The thing coherence actually detects

**Set coherence** asks one question: *do these photographs match each other?*

Same camera, same shape, same lighting, same afternoon. That's what an honest
seller produces, because they walked around one watch on one desk with one
phone.

It caught tonight's case because the scammer was **lazy** — five real photos
with one lifted hero shot dropped in. The odd one out was odd *relative to its
siblings*.

### The attack that beats it completely

Take **all six photos from the same stolen listing.**

Now the set is perfectly coherent. Same camera, same lighting, same day, same
dimensions — because it *was* one real shoot, just somebody else's. Coherence
looks for internal disagreement and finds none, because there is none.

This is not a hypothetical. It's the easier attack. Copying six images off one
Bezel page is less work than mixing sources.

**So coherence is strong against careless fraud and blind to careful fraud.**
Anyone telling you scammers "cannot hide" from it is overselling it.

### What actually catches that

A different question, about each photo on its own terms:

> Does this look like a person photographed their watch, or like a catalogue?

Studio lighting. Seamless background. No hands, no desk, no room, no window
reflection. Perfect symmetry. That's what Copilot keyed on, and it's what makes
a fully-stolen set still feel wrong — not because the photos disagree with each
other, but because *none* of them looks like a private seller's photo, while
the listing says "my watch."

That is an **absolute** judgement about one image. Coherence is a **relative**
judgement across a set. They're different measurements, and one cannot stand in
for the other.

### The split

| | question | catches | misses |
|---|---|---|---|
| **1a Coherence** | do these photos match each other? | one lifted photo in a real set | a wholly stolen coherent set |
| **1b Character** | does this look like a private photo or a catalogue? | a wholly stolen catalogue set | a photo stolen from another private seller |

Note the last cell. **1b misses a photo stolen from another individual**, because
that photo genuinely *is* a private seller's photo — just not this one's. That
gap is what layers 2 and 3 exist for.

None of the four layers is sufficient. That's not a weakness in the design;
it's the reason there are four.

### Why the distinction matters practically

If you conflate them, you'll believe you're covered when you aren't. You'd look
at "layer 1 catches stolen photos" and reasonably conclude the coherent-set
attack was handled. It isn't. Naming them separately is what stops you trusting
a defence you don't have.

1b is also the one that needs Gemini — a judgement call about how a photograph
*feels* — whereas 1a is arithmetic. Different costs, different failure modes,
different code. Another reason not to fuse them.

---

## The stack, restated

| layer | question | strength | cost |
|---|---|---|---|
| **1a** coherence | do these match each other? | cheap, offline, no vendor | blind to coherent theft |
| **1b** character | private photo or catalogue? | catches wholesale theft | needs a model, judgement not fact |
| **2** internal reuse | seen on FairWatch before? | perfect memory, improves forever | only knows your own site |
| **3** external provenance | seen anywhere on the web? | catches genuine outside theft | **weakest** — index gaps, vendors |
| **4** capture provenance | taken live, in the wizard? | **strongest** — nothing to detect | only for sellers who use it |

Layer 4 doesn't detect fraud. It **prevents** it — a photo taken through the
wizard didn't exist until the shutter fired. That's why the wizard matters more
than any detector, and why pushing sellers toward it is worth more than tuning
any threshold on this page.

Every layer is fail-open, writes its own row, and can only ever raise a hand.
The worst outcome any of them can produce is a person being asked to look.

---

## Implementation status

**Layer 2 (internal reuse) — Flight 1 built: exact retained-byte indexing.**
Each listing photo's exact retained bytes (the normalized object FairWatchTrade
stores, post client-side compression) are hashed server-side with SHA-256 and
recorded on `listing_media`, with cross-listing recurrence captured as its own
evidence row under provider `aubrey_exact_hash`.

Flight 1 is **evidence-only and inert**: recurrence is an observation, never a
verdict. It creates no hold, no rejection, no seller message, no review
surface, and it does not participate in the publish gate or the
`image_authenticity` coverage requirement. It catches byte-identical reuse
only — a re-encoded, cropped, or resized copy is a non-match at this layer.

Still ahead, in order, each separately authorized: cause-group scoring repair,
then broader signal expansion. Layers 1b (photo character) and 3 (external
provenance) remain **unbuilt**; nothing in Flight 1 changes that. Threshold 3
remains provisional (unmeasured); `T_SAME = 17` remains the measured verifier
threshold. Neither is recalibrated by Flight 1.
