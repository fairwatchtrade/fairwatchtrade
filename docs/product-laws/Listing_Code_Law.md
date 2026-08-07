# Listing Code Law

**Status:** GOVERNING  
**Applies to:** FairWatchTrade public listing identity, search, messages, seller/admin surfaces, transactions, support, and future Market History.

## Core Law

> UUIDs identify records to software. Public listing codes identify listings to people.

## Canonical Form

- One letter + five digits.
- Six characters total.
- Example: `q15932`.
- Case-insensitive on entry and search.
- Canonical public form does **not** require `#`.

The code carries no encoded meaning about seller, dealer, brand, model, lifecycle state, or date.

## Identity Law

A listing code:
- is assigned once when the listing record is created, including drafts and dealer imports;
- is stored permanently;
- is unique and non-null;
- remains unchanged through lifecycle transitions;
- is never recycled;
- is never reassigned to another listing;
- stays with the same listing when its content is corrected;
- is newly assigned when a genuinely new listing record is created.

A listing code is a public identifier, not an authentication credential.

## Search Behavior

Global search must recognize the canonical code and reasonable human input variations while preserving the stored canonical value.

Exact-code lookup is governed by `Exact_Identifier_Search_Law.md`.

## Forbidden Behavior

- Reusing a retired code.
- Recomputing codes in a way that can change existing identities.
- Encoding private or commercially sensitive meaning into the public code.
- Treating the public code as authorization.
- Displaying asking price later as realized price merely because the listing code persists into Market History.

## Required Verification

Prove:
- uniqueness;
- persistence through lifecycle changes;
- no reuse after withdrawal/deletion/archive;
- exact retrieval;
- case-insensitive input;
- authorization still depends on normal ownership/auth/RLS controls.
