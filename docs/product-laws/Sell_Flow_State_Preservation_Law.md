# Sell Flow State Preservation Law

**Status:** GOVERNING  
**Applies to:** Seller listing flows, drafts, overlays, navigation, resume, authentication interruption, and cross-device continuation.

## Core Law

> Seller-entered listing state may never be silently lost, replaced, merged into another watch, or moved to the wrong draft because of incidental UI or navigation behavior.

## Required Behavior

- Preserve the active listing identity, current step, entered fields, validation state, and attached photos across non-destructive interactions.
- Opening or closing help, dialogs, drawers, or overlays must not reset the Sell Flow.
- Browser history handling must preserve existing router-owned state rather than replacing it blindly.
- Authentication interruption must return the seller to the same intended listing and step when continuation is valid.
- Resuming an unfinished draft requires an explicit seller choice.
- Starting a new listing must create a genuinely new listing attempt and must not inherit identity, fields, notes, photos, or session state from the prior watch.

## Forbidden Behavior

- Silent draft resume.
- Cross-watch state contamination.
- Using incidental UI dismissal as workflow navigation.
- Remounting or route transitions that erase valid seller state.
- Reusing stale state from another listing attempt.
- Treating a successful render or URL check as proof that form state survived.

## Required Verification

Test with a populated listing, not an empty form.

Verify preservation after:
- ordinary step navigation;
- overlay/help open and close;
- outside click/tap;
- Escape where supported;
- browser or Android Back where supported;
- authentication expiry and return;
- explicit Resume;
- explicit Start New.

Closure requires proof that route, step, draft identity, entered values, validation state, and photos remain correct.

## Related Laws

- `Session_Expiry_Law.md`
