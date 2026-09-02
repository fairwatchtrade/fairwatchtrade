# Watch Detail inspection viewer — zoom machinery

**Lead with the misconception this file exists to kill:**

> "The zoom is just a CSS transform on the image. This could be a lot simpler."

Every one of the decisions below looks like an over-complication until you know
which browser behaviour or which lie about the photograph it is preventing.
Four of them are load-bearing in ways that produce no type error and no console
warning when removed — the feature just quietly becomes wrong.

Files: `components/InspectionViewport.tsx` · `lib/media/inspectionZoom.ts` ·
the inspection overlay in `components/ListingGallery.tsx`.

Verify current state:

```bash
node --experimental-strip-types scripts/inspection-zoom.test.mjs
grep -n 'passive: false' components/InspectionViewport.tsx
grep -n 'key={heroUrl}' components/ListingGallery.tsx
```

---

## Why the Ctrl+wheel cancellation is element-scoped

`Ctrl + wheel` is the browser's **page zoom** gesture, and on a listing page it
is also an accessibility feature a collector may be actively relying on. We
take it away only over the photograph itself, and give it straight back
everywhere else.

The listener is attached to the photograph interaction viewport — the element
that *is* the Fit rectangle — and nowhere else. **Not** `window`, **not**
`document`, **not** the modal, **not** the image stage.

The stage is the specific trap. It is shared with the previous/next arrows, so
a listener there would swallow Ctrl+wheel while the pointer sits over a
navigation control, which is not the photograph and not ours to intercept.

Ordinary wheel — no Ctrl — is never touched at all. Scrolling past a modal is
not this component's business, and the handler returns immediately when
`ctrlKey` is false.

## Why the listener must be non-passive

A React synthetic `onWheel` handler cannot reliably `preventDefault()` a
browser-zoom gesture in the installed event system. Modern browsers also treat
wheel listeners as passive by default, and `preventDefault()` inside a passive
listener does nothing but log a warning.

So it is a native listener with `{ passive: false }`, added and removed against
the same element reference, which also survives Strict Mode's development
double-mount cleanly.

If you replace it with `onWheel={...}`, nothing will fail to compile. The page
will simply zoom instead of the watch.

## Why Ctrl+wheel stays consumed AT the ceiling

`preventDefault()` runs **before** the "is there any detail left?" check —
deliberately, and the test suite pins the ordering.

At maximum zoom the photograph stops growing. If the gesture were released at
that moment, the next wheel notch would reach the browser and the whole page
would lurch mid-inspection. The collector's hand has not changed, so the
behaviour must not either. The gesture is consumed for as long as the pointer
is over the photograph, whether or not it still has anywhere to go.

## Why the Fit rectangle is computed in JS, not in CSS

`containRect()` in `lib/media/inspectionZoom.ts` sizes the viewport in explicit
pixels. That looks like the fussy option; it is the only one that worked, and
**both CSS attempts failed silently** — no error, no warning, just a viewer
with no zoom.

- `container-type: size` on the stage, with the viewport sized in `cqw`/`cqh`:
  size containment makes an element's box independent of its contents, so as a
  `flex-1` item the stage collapsed to **8×0** and took the photograph with it.
- `aspect-ratio` with `width: 100%` and `max-height`: width is then DEFINITE,
  so the ratio only derives height and `max-height` merely clips. The box keeps
  the full stage width and the aspect is quietly violated — measured live at
  1120×749 for a 0.75-aspect photograph.

So the stage is measured with a ResizeObserver and the contain rectangle is
arithmetic. The viewport IS the photograph's Fit rectangle by construction, so
the interaction boundary and the visible image can never disagree.

Measure the STAGE, not the viewport: sizing an element from its own measured
size is a loop waiting to happen.

## The cursor-anchor invariant

The point under the pointer is the thing being inspected, so it must not move:

```
imagePoint     = (pointer - translation) / scale
newTranslation = pointer - imagePoint × newScale
```

Screen-space, `transform-origin: 0 0`, so a point at image coordinate `p`
appears at `p·s + t`. Mixing origins is how anchored zoom drifts.

Centre-anchored zoom is simpler and is the wrong product: it slides the detail
away from the collector exactly when they lean in, which is the one moment the
interaction exists for.

Translation is clamped so the image always covers the frame:

```
viewport − viewport×scale  ≤  translate  ≤  0
```

At scale 1 that collapses to exactly `0`, which is why Fit cannot be nudged
off-centre, and why zooming back out lands on Fit exactly rather than near it.

## The native-detail ceiling

```
maxScale = max(1, min(naturalW / fitW, naturalH / fitH))
```

**Never a 2×, 3× or any other constant.** Past this ratio the browser is
interpolating, and interpolation presented as inspection is the same lie as an
upscaled listing photograph — it looks like more information and is not. If a
source has nothing more to give, `maxScale === 1`, the interaction is not
offered, the hint does not appear, and the accessible controls do not render.
A Zoom In button on a photograph that cannot zoom is a button that lies.

`min` of the two axes, not `max`: the first axis to run out of pixels decides,
because past that point the other one is being invented too.

Two measurement rules that look pedantic and are not:

- natural dimensions come from the **displayed image's own load state**, not
  from a guess or from a different source variant;
- the Fit baseline is the viewport's **`clientWidth` / `clientHeight`**, never
  `getBoundingClientRect()`. The rect reports the *transformed* size, so using
  it would shrink the ceiling as the collector zoomed in — exactly backwards,
  and self-limiting in a way that looks like a physics bug.

`getBoundingClientRect()` **is** correct for locating the pointer, because the
pointer arrives in screen coordinates and needs the element's on-screen origin.
It is only the untransformed *size* it must never be asked for.

Geometry changes are reconciled at **render**, not in an effect: an effect
would paint one frame of over-scaled interpolation before correcting itself.

## Photo change → Fit, and why it is a `key`

`<InspectionViewport key={heroUrl} … />`.

The key is load-bearing, not tidiness. A changed photograph remounts the
viewport, which takes scale, translation, in-flight drag records **and the
previous source's measured dimensions** all at once.

Resetting by hand would leave the old naturals alive for a frame — and for that
frame photograph B could be zoomed on the authority of photograph A's pixels,
which is precisely the invented detail the ceiling exists to prevent. Every
navigation path (Next, Previous, thumbnail, keyboard, reopening on a different
photo) funnels through the same `active` state, so all of them reset.

## Mobile accessibility boundary

`touch-action: none` is applied **only** to the photograph interaction
viewport, and only when the source actually has detail worth pinching into.

Never done, and never to be added:

- `user-scalable=no`
- `maximum-scale` on the viewport meta
- page-wide or modal-wide `touch-action: none`

Browser pinch-zoom is an accessibility feature. Taking it from the whole site
to simplify one image gesture is not a trade this product makes. If custom
pinch ever conflicts with browser accessibility behaviour, accessibility wins
and the conflict gets reported.

## The supporting-photo rail is justified, not a grid of squares

`lib/media/justifiedRows.ts` + `components/InspectionPhotoRail.tsx`.

Rows of a common height, each filling the column exactly: a wide photograph
takes a row alone, two narrow ones share. Every tile keeps its own aspect.

**Why it is not five identical squares.** A uniform grid needs every photograph
cropped into the same box, and the crop throws away the one thing a thumbnail
is good for. A dial macro, a caseback engraving, a wrist shot and a box flat
lay are different SHAPES, and shape is legible long before content is at rail
size. It also broke the rule the rest of the viewer keeps — the stage is
object-contain and the resting hero refuses the seller's focal crop, because
subtracting evidence to improve presentation is the trade this product does not
make. The old `h-14 w-14 object-cover` rail was making it anyway, and a
caseback engraving near the frame edge vanished from its own thumbnail.

`object-cover` **is** still used on a tile, and that is correct: the tile was
sized FROM that photograph's aspect, so the box already matches the image and
cover crops nothing. It absorbs sub-pixel rounding, nothing more.

**The last row is capped.** Justified to full width, one lone portrait left over
at the end becomes taller than every row above it and the rail reads as broken.
It is allowed to end short instead — a row that does not reach the edge says
"that is all of them", which is true.

**Aspects are measured, never assumed.** A photograph whose dimensions have not
arrived is laid out square and re-laid on load. Holding the rail blank until
everything measures, or guessing portrait, both trade a truthful rail for a
convenient one.

## The stage is fixed so the room does not jump

The stage reserves its geometry independently of which photograph is showing,
and the rail sits beside it rather than beneath. Moving between a portrait dial
macro and a landscape box shot now changes what is inside the frame and never
the frame itself — before this, the whole room resized on every thumbnail click
and the eye had to re-find the watch.

**Nothing in the room moves when the photograph changes** — not the frame, not
either arrow, not the rail, not the hint band. Holding the arrows still while
keeping them close to the watch is what the bounded stage below is for. An
earlier version pinned them to the photograph instead, and they travelled every
time a portrait was followed by a landscape.

Both arrows are always present, because the inspection room **cycles** instead
of stopping at the ends. In a room whose entire purpose is looking through a
set, an arrow that dies on the last photograph is a control that stopped
working — and an arrow that disappears is one more thing moving. The resting
hero above still clamps at the ends; only the room cycles.

The hint band under the stage is reserved whether or not the hint is showing,
for the same reason: its arrival and departure must not move the photograph.

On narrow screens the rail returns to a band beneath the stage. A side column
there would spend the width the photograph needs, which is the wrong trade on
the smallest screen. Both rails exist in the DOM and CSS hides one — the hidden
one is `display: none`, so it is out of the accessibility tree and unfocusable
rather than a duplicate set of controls.

## The stage is bounded to the listing, not to the room

The stage used to be "whatever width is left over", which is how a 598px
photograph came to sit in a 1150px box with the arrows stranded at its far
edges. Two arrangements were tried before this one, and both failed
instructively:

- **Centred, arrows at the room's edges.** The arrows never moved, but sat a
  couple of hundred pixels from the watch.
- **Left-aligned, arrows pinned to the photograph.** The arrows hugged the
  watch, and travelled every time a portrait was followed by a landscape.

Neither compromise turns out to be necessary. The stage is sized to the MEDIAN
rectangle across the photographs *in this listing*, so the arrows can sit on the
stage's own edges and be both close and still.

**The median, and not the widest.** This was wrong the first time and the
mistake is worth keeping: sizing to the widest photograph hands the whole room
to a single outlier. One 16:9 shot among nine portraits set a 984px stage and
put the arrows 213px from every watch in the listing — precisely the sprawl the
bounding was built to end. Sizing to the narrowest fails identically from the
other side, hostage to one extreme portrait. The median is hostage to neither.

What that costs, stated plainly: a photograph wider than the stage is
width-bound and renders shorter than the room could technically show it. It is
not cropped, and inspection zoom still reaches every pixel the source has. The
majority of photographs fill the stage exactly, and the arrows stand against
them.

eBay reaches the same place from the other direction. Every image in one of
their listings is the same shape — measured on a live listing: sixteen
photographs, every one of them aspect 0.75 — so their stage never needs to vary,
and their arrows sit a permanent ~93px from the photograph. Ours varies per
listing rather than per photograph, which is the smallest unit that can hold
still while someone is looking at it.

Things that will bite whoever changes this next:

- **"Actually occupies" is load-bearing.** A photograph's rectangle is bounded
  by the room's height AND by the source's own pixels. Sizing the stage from
  aspect ratio alone builds a box that a low-resolution photograph cannot fill,
  which is the original sprawl in a smaller box.
- **The stage reserves against the rail's MINIMUM, never its rendered width.**
  The rail grows into whatever the stage leaves behind, so reading the rail's
  actual width while deciding the stage width is reading a number that has not
  been decided yet.
- **Width is measured on the room, height on the stage area** — two different
  elements, deliberately. Measuring width on the element whose width is about to
  be set from that measurement is the feedback loop being avoided.
- **The measured stage carries no padding.** `clientWidth` INCLUDES padding, so
  a padded stage computes a Fit rectangle wider than the box the photograph is
  laid out in, and a wide photograph then overflows it and slides under both
  arrows. The padding lives on the wrapper above — it is the arrows' room, not
  the photograph's.
- **An explicit width needs `flex: 0 0 auto` beside it.** A `flex-1` item
  resolves its main size from the basis and ignores `width` outright.
- **Four geometry constants mirror Tailwind classes** — `STAGE_GUTTERS`,
  `ROOM_GAP`, `RAIL_MIN`, `WIDE_ROOM`. Change a class without its constant and
  the stage reserves the wrong width, silently, and it merely looks a little
  off. The suite reads each constant back out of the class it mirrors.
- **Full-size sources are probed on open, desktop only.** That is real
  bandwidth, spent because the stage cannot be bounded without knowing every
  photograph's true pixel size. On a phone the rail is a band underneath, there
  is no leftover width to bound, and the probe is skipped entirely.
- Until every photograph has reported, the stage stays as wide as the room
  allows. Bounding on a partial set would size the room to whichever files
  happened to load first, and then move it when the rest arrived.

The room and the header hang on **one shared `max-w`**, so they cannot drift out
of alignment on a very wide display.

The rail's tile height is **derived from the rail's width** — two tiles plus the
gap between them IS the column — so handing the rail more room enlarges the
supporting photographs instead of packing more of them in. The old hardcoded
`78` was this same rule at the old `168`, written down as a number, and
therefore silently wrong the moment the column changed.

## Inspection zoom is not Dial Reveal

Different instruments, different rooms, deliberately kept apart:

| | Dial Reveal | Inspection zoom |
|---|---|---|
| Where | resting hero, listing page | opened inspection viewer |
| Gesture | a tiny gold control, quiet invitation | Ctrl+scroll, drag, pinch |
| Does | adjusts reveal strength; **the photograph never moves** | moves and scales the photograph |
| Posture | the photograph stays quiet | the collector has deliberately entered deeper inspection |

Dial Reveal is a resting-hero instrument and does not follow into the overlay.
Do not merge them; the listing page's quiet is a product law, and the viewer is
where that quiet is deliberately set aside.

## Non-gesture accessible equivalents

Wheel and pinch are not the only way to operate zoom:

- **Zoom In / Zoom Out / Fit** — real `<button>`s in the viewer header, beside
  Close. Keyboard operable for free, with a visible focus ring, disabled when
  the action would do nothing, and absent entirely when `maxScale === 1`.
- **`+` / `-` / `0`** on the focused photograph surface.
- The surface is `tabIndex={0}`, `role="img"`, and named from the listing's own
  identity — never with a claim about what the photograph shows.
- Current zoom is announced through a polite live region, and only when it is
  saying something: at Fit there is no zoom level worth reading aloud.

They live in the header rather than over the watch on purpose. The accessible
equivalent must not become a persistent instrument panel standing between a
collector and the object.

### Keyboard arbitration

The viewer has a **document-level** Left/Right handler for photo navigation.
While the photograph surface is focused **and zoomed**, arrow keys pan instead
and the event is stopped locally, so the document handler never also fires.
Unzoomed, arrows are left alone and photo navigation behaves as it always did.

That split is the whole reason panning is gated on `scale > 1`. Remove the
gate and every arrow press starts fighting the photo navigation.
