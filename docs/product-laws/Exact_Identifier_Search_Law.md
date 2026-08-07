# Exact Identifier Search Law

**Status:** GOVERNING  
**Applies to:** Global search, Browse search, saved-search matching, outside-agent search, listing-code lookup, and manufacturer reference lookup.

## Core Law

> An exact identifier search is a promise.

## Search Priority

1. Exact FairWatchTrade listing code.
2. Exact known manufacturer reference or model identifier.
3. Structured collector-language meanings.
4. Ordinary-text fallback.
5. Related or nearby alternatives only after exact-match resolution.

## Required Behavior

- When the exact identifier exists and is visible to the requester, return that exact watch clearly.
- When no exact match exists, state: **No exact match found.**
- Related results may appear only afterward and must be explicitly labeled as related or nearby.
- Reasonable input normalization may assist exact matching, but it must not alter canonical stored identifiers.
- Fuzzy matching may assist discovery but must never override exact truth.

## Forbidden Behavior

- Substituting a similar watch and presenting it as the requested one.
- Quietly dropping or rewriting the user's exact identifier.
- Mixing related results into an exact-match result set without a visible distinction.
- Allowing fuzzy relevance to outrank a valid exact match.

## Required Verification

Cover:
- exact listing-code hit;
- exact manufacturer-reference hit;
- exact no-match;
- related results after no-match;
- case and punctuation normalization;
- fuzzy candidate present while exact match exists.

> Related never masquerades as found.
