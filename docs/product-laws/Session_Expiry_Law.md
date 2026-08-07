# Session Expiry Law

**Status:** GOVERNING  
**Applies to:** Authentication expiry during an in-progress FairWatchTrade workflow, especially Sell Flow.

## Core Law

> Session expiry is an authentication interruption, not permission to destroy workflow state.

## Required Behavior

- Clearly tell the user that the session expired.
- Clearly state whether the current draft is saved.
- Provide a primary **Sign In and Continue** action.
- Preserve the intended route and exact Sell Flow step.
- After successful authentication, return the seller to that same valid workflow position.
- Preserve the correct draft identity and seller-entered state.

## Forbidden Behavior

- Returning the seller to the beginning of Sell Flow without cause.
- Silently redirecting to Account or another unrelated surface.
- Creating a new listing because authentication expired.
- Losing or changing the seller's draft as a side effect of sign-in.

## Required Verification

With a populated draft:
1. expire authentication at a non-initial Sell step;
2. confirm the expiry state is explicit;
3. sign in;
4. confirm the same draft, route, step, entered values, and photos are restored.

Visual treatment remains subject to the applicable Design Gate. This law governs behavior, not final dialog styling.
