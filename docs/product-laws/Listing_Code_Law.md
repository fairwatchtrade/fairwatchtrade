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

## Visibility Law

**Founder ruling, 2026-09-01:**

> **That number follows that watch and is visible wherever it goes.**

The law above made the code permanent, unique and unreusable, and then never
required anyone to *show* it. So it drifted into being visible only where the
platform talks to itself, and the omission was invisible precisely because the
code was still perfectly correct in the database.

The failure this closes is concrete. A collector writes *"how much for j75878,
and what's your best on x84953?"* — that is the only name they have for those
watches. The seller then opens the one room that lists their own unfinished
work and it does not print a single code, so the watch someone is asking about
cannot be found by the name they asked about it with.

**Requirement.** Any surface that represents a listing to a person shows that
listing's code. Buyer surfaces, seller surfaces, admin rooms, correspondence,
offers, trades, saved work, dialogs that name a listing before acting on it.
If a person can see the watch, they can see its name.

**A listing with no code yet is silent, not blank.** A draft that has never
become a listing has nothing to show and renders nothing — the component
already refuses an empty value. Absence of a code is a database question, never
a display decision.

**One component.** `components/FwtListingId.tsx` states the label and the
treatment once, so four surfaces cannot end up printing "FWT Listing ID",
"Listing ID", "FWT Code" and "ID" for the same fact.

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
