/* ════════════════════════════════════════════════════════════════════════
   CATALOGUE GREETING IDENTITY                                    (v7.5)

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This column stores the name shown in the greeting."

   It stores nothing of the kind. It stores ONE preference — whether an
   eligible dealer has asked for their business name instead of their
   personal one — and nothing else. The name itself is always resolved live
   from `profiles.display_name` or `dealer_profiles.business_name` at read
   time. There is no cached identity here and there must never be one: a
   dealer who renames their business must be greeted by the new name on the
   next page load, not by whatever was true when they ticked a box.

   WHY THE VOCABULARY IS DELIBERATELY TINY:

     NULL       → normal behaviour: greet by display_name, or by nothing.
     'business' → the dealer explicitly asked for the business name.

   There is no 'personal' and no 'none'. NULL already means "personal if you
   have one, bare if you don't", so a 'personal' value would be a second
   spelling of the default and 'none' would be a third — three values for
   two real states, and every reader would have to know which two agreed.
   The CHECK below makes the third spelling unrepresentable rather than
   merely discouraged.

   'business' IS A REQUEST, NOT A GUARANTEE. The column can legitimately say
   'business' for an account with no dealer row at all — a dealer profile can
   be removed after the box is ticked, and nothing here prevents that. That
   is not corruption and must not be repaired by a trigger: the READER falls
   through to normal behaviour when the business identity cannot resolve.
   An orphaned override is a reachable, supported state.

   DELIBERATELY NOT BUILT:
     · no backfill — every existing row stays NULL, which is already the
       correct answer for every one of them;
     · no new RLS — profiles' existing policies already scope a row to its
       owner, and this column is not more sensitive than display_name;
     · no trigger — see above, the reader owns the fallback;
     · no new table — one nullable preference does not earn one.

   Verify current state:
     select greeting_identity, count(*)
       from public.profiles group by 1 order by 1;
   ════════════════════════════════════════════════════════════════════════ */

alter table public.profiles
  add column if not exists greeting_identity text;

alter table public.profiles
  drop constraint if exists profiles_greeting_identity_check;

alter table public.profiles
  add constraint profiles_greeting_identity_check
  check (
    greeting_identity is null
    or greeting_identity = 'business'
  );

comment on column public.profiles.greeting_identity is
  'Catalogue greeting preference. NULL = greet by display_name (or bare). '
  '''business'' = the dealer asked to be greeted by dealer_profiles.business_name, '
  'resolved live at read time. Never stores a name. An override with no resolvable '
  'dealer identity is a supported state and falls back in the reader.';
