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
 *   · /listings/<id>                  — listing detail (object-dominant; the
 *                                       compact field is subordinate free-text
 *                                       reach, distinct from the Drawer's
 *                                       "Search Similar Watches" action)
 *   · /sellers/<id>                   — public seller profile / inventory
 *
 * Deliberately EXCLUDED (discovery not the purpose, or a canonical Search
 * already owns the surface):
 *   · /account, /account/settings, /catalogue, /watch-dna — the Painted Line
 *     rail pages (v3.21b permanent law: the rail begins immediately beneath
 *     the metals strip; no full-width utility band above a persistent rail —
 *     see headerSearchVisible below)
 *   · /browse (full inline Search is canonical — never a second field)
 *   · /vault, /vault/galaxy (no Search inside the Galaxy; reference detail is
 *     client state within VaultGalaxy, not a distinct route)
 *   · /listings/<id>/purchase-request (transaction), /tracking/<id>, /dashboard
 *   · /sell, /sell/mobile (creation) · /login, /signup, /forgot-password,
 *     /reset-password (auth) · /terms, /privacy (legal) · /admin/** (admin)
 *   · / (home landing — its own discovery entry; not redesigned here)
 */
export function headerSearchVisible(pathname: string | null | undefined): boolean {
  const p = normalize(pathname ?? "/");
  /* v3.21b — PERMANENT STRUCTURAL LAW (bench ruling, 2026-08-02, arbitrated
     by Jason): on Painted Line rail pages the rail begins IMMEDIATELY
     beneath the metals strip. A full-width utility band above a persistent
     rail recreates the dead rectangle the first redesign existed to kill —
     the stack is `metals strip → rail │ content`, never
     `metals strip → band → rail │ content`. Therefore /account,
     /account/settings, /catalogue, and /watch-dna carry NO compact
     search row, and no replacement search is added to their content
     columns "for universality" — a truly universal search may return
     later only as global chrome through its own Design Gate, and
     page-specific search only from a real product need. Browse remains
     the canonical search destination (one rail click away). */
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
