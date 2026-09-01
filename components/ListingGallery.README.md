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
