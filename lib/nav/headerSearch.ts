/* ════════════════════════════════════════════════════════════════════════
   HEADER SEARCH — availability law + submit seam  (Global Search DD2)

   ONE mechanism, one state. The compact header Search is a new PLACEMENT of
   the existing Search Flight 1 mechanism: it submits free text into /browse?q=,
   where Browse's existing parser, URL state, Active Criteria, and result path
   take over (see BrowseClient — `searchParams.get("q")`). No second parser,
   no forked Search state, no live-results overlay.

   Availability (DD2 §2): Global Search belongs wherever a collector may
   reasonably decide "I want to find or move toward a watch," and is absent
   wherever focused work deserves the room. Because the NavBar header is global
   (app/layout.tsx mounts it on every route), the compact affordance is gated
   here by pathname. This is a strict ALLOWLIST: a route shows the compact
   Search only if it is explicitly a discovery surface. Everything else —
   Browse (owns the full inline Search), Vault (no Search in the Galaxy;
   reference detail is client state, not a distinct route), creation, review,
   transaction, correspondence, auth, legal, admin, home — shows none.
   ════════════════════════════════════════════════════════════════════════ */

/** Normalize a pathname: drop a trailing slash except for root. */
function normalize(pathname: string): string {
  if (!pathname) return "/";
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.slice(0, -1);
  return pathname;
}

/**
 * Standard collector discovery surfaces that receive ONE compact header Search.
 * Allowlist only — never a denylist — so an operational route can never leak a
 * Search affordance just because it shares the global shell.
 *
 *   · /catalogue                      — public catalogue
 *   · /watch-dna                      — Watch DNA (v3.21a: live Catalogue-family
 *                                       discovery surface; same header stack as
 *                                       its sibling so the rail never jumps)
 *   · /account                        — account overview + collector modules
 *                                       (deep links keep pathname === /account)
 *   · /listings/<id>                  — listing detail (object-dominant; the
 *                                       compact field is subordinate free-text
 *                                       reach, distinct from the Drawer's
 *                                       "Search Similar Watches" action)
 *   · /sellers/<id>                   — public seller profile / inventory
 *
 * Deliberately EXCLUDED (discovery not the purpose, or a canonical Search
 * already owns the surface):
 *   · /browse (full inline Search is canonical — never a second field)
 *   · /vault, /vault/galaxy (no Search inside the Galaxy; reference detail is
 *     client state within VaultGalaxy, not a distinct route)
 *   · /account/settings (operational), /listings/<id>/purchase-request
 *     (transaction), /tracking/<id>, /dashboard
 *   · /sell, /sell/mobile (creation) · /login, /signup, /forgot-password,
 *     /reset-password (auth) · /terms, /privacy (legal) · /admin/** (admin)
 *   · / (home landing — its own discovery entry; not redesigned here)
 */
export function headerSearchVisible(pathname: string | null | undefined): boolean {
  const p = normalize(pathname ?? "/");
  if (p === "/catalogue") return true;
  /* v3.21a — Watch DNA joined the Catalogue family as a live rail
     destination. It qualifies under this law's own principle (a collector
     discovering what to move toward), and rail continuity requires the
     SAME header stack across sibling family pages: without this row the
     rail jumped ~50px when crossing /catalogue ↔ /watch-dna (Jason's
     unmoved-mouse observation, 2026-08-02). */
  if (p === "/watch-dna") return true;
  if (p === "/account") return true;
  if (/^\/listings\/[^/]+$/.test(p)) return true; // detail only — not sub-routes
  if (/^\/sellers\/[^/]+$/.test(p)) return true;
  return false;
}

/**
 * The one submit seam: a free-text query becomes a /browse URL that Browse's
 * existing `q` parser consumes verbatim. Empty/whitespace text routes to bare
 * /browse (no empty q). The text is preserved exactly — no client-side
 * parsing, mapping, or interpretation happens here.
 */
export function buildBrowseSearchHref(text: string): string {
  const trimmed = text.trim();
  return trimmed ? `/browse?q=${encodeURIComponent(trimmed)}` : "/browse";
}
