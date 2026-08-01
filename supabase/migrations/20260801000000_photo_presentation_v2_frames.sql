-- ════════════════════════════════════════════════════════════════════════
-- PHOTO PRESENTATION v2 — per-photo frames
-- supabase/migrations/20260801000000_photo_presentation_v2_frames.sql
--
-- v1 stored ONE framing record per listing, which silently meant "the hero's
-- framing". A seller could not centre the dial AND the clasp; the second edit
-- overwrote the first. v2 keys framing by stable pathname:
--
--   { "heroPathname": "listings/dial-abc.jpg",
--     "frames": { "listings/dial-abc.jpg": { "focalX":0.42, "focalY":0.68,
--                                            "zoom":1.10 } } }
--
-- ── WHY THIS MIGRATION IS URGENT ──────────────────────────────────────
-- The deployed CHECK rejects any key except heroPathname/focalX/focalY/zoom.
-- The moment the v2 client publishes a `frames` object the INSERT fails and
-- the seller cannot list at all. The constraint must accept v2 before the
-- application that writes it is deployed.
--
-- ── NO BACKFILL, NO REWRITE ───────────────────────────────────────────
-- Existing v1 rows stay exactly as they are and remain valid — the new
-- constraint accepts both shapes. The application sanitizer migrates v1 to v2
-- in memory on read, attaching the old focal values to the hero they belonged
-- to. Nothing on disk is touched, so there is nothing to roll back.
--
-- ── DEEP VALIDATION WITHOUT SUBQUERIES ────────────────────────────────
-- A CHECK constraint cannot contain a subquery (SQLSTATE 0A000), which rules
-- out iterating the frames map with jsonb_each. jsonb_path_exists IS
-- immutable and CAN express "does any frame violate this", so the range rules
-- are enforced by looking for a counter-example rather than by iteration.
--
-- Bounds mirror lib/photoPresentation.ts exactly: focal 0..1, zoom 1..1.14.
-- If those move, they move in both places or the write is refused here.
-- ════════════════════════════════════════════════════════════════════════

begin;

alter table public.listings
  drop constraint if exists listings_photo_presentation_check;

alter table public.listings
  add constraint listings_photo_presentation_check check (
    photo_presentation is null
    or (
      jsonb_typeof(photo_presentation) = 'object'

      -- Only known top-level keys. v1 (focalX/focalY/zoom) stays accepted so
      -- already-stored rows remain valid.
      and (photo_presentation - array[
            'heroPathname', 'frames', 'focalX', 'focalY', 'zoom'
          ]) = '{}'::jsonb

      and (
        photo_presentation -> 'heroPathname' is null
        or jsonb_typeof(photo_presentation -> 'heroPathname') in ('string', 'null')
      )

      and (
        photo_presentation -> 'frames' is null
        or jsonb_typeof(photo_presentation -> 'frames') = 'object'
      )

      -- No frame may carry an unknown key…
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.key != "focalX" && @.key != "focalY" && @.key != "zoom")'
      )
      -- …or a non-numeric value…
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.*.keyvalue() ? (@.value.type() != "number")'
      )
      -- …or an out-of-range focal point…
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.focalX < 0 || @.focalX > 1 || @.focalY < 0 || @.focalY > 1)'
      )
      -- …or a zoom outside the governed band.
      and not jsonb_path_exists(
        photo_presentation,
        '$.frames.* ? (@.zoom < 1 || @.zoom > 1.14)'
      )

      -- Legacy v1 scalars, still range-checked where present.
      and (
        photo_presentation -> 'focalX' is null
        or (
          jsonb_typeof(photo_presentation -> 'focalX') = 'number'
          and (photo_presentation ->> 'focalX')::numeric between 0 and 1
        )
      )
      and (
        photo_presentation -> 'focalY' is null
        or (
          jsonb_typeof(photo_presentation -> 'focalY') = 'number'
          and (photo_presentation ->> 'focalY')::numeric between 0 and 1
        )
      )
      and (
        photo_presentation -> 'zoom' is null
        or (
          jsonb_typeof(photo_presentation -> 'zoom') = 'number'
          and (photo_presentation ->> 'zoom')::numeric between 1 and 1.14
        )
      )
    )
  );

comment on column public.listings.photo_presentation is
  'Per-photo framing metadata: { heroPathname, frames: { <pathname>: { focalX, focalY, zoom } } }. Presentation only — uploaded photographs are never altered. NULL = automatic framing. The v1 single-record shape is still accepted and is migrated on read.';

commit;
