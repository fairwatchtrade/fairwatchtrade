"use client";

import { useEffect, type RefObject } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import FairWatchTradeLogo from "@/components/FairWatchTradeLogo";

/* ════════════════════════════════════════════════════════════════════════
   NAV DRAWER — hamburger-triggered site navigation, every page.
   COLLECTOR'S DRAWER (Phase 2) — listing-detail only, desktop: left,
   mobile: bottom sheet.
   Never confuse the two.
   ════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────
   MOBILE NAV — the "watch roll" drawer  (v1.66)

   Left-edge drawer (76% width) that slides in over a dimmed peek strip (~24%).
   The wider peek makes the live page behind unmistakably visible — the drawer
   reads AS a drawer before the user interacts. Tapping the peek — or the close
   hint, the watch-hand pull, or a nav item — closes it. Below the desktop
   masthead breakpoint only (lg:hidden — v3.23 raised it from md, v3.25
   corrected it to lg); desktop never renders this. Must always match
   <NavBar> and <HeaderSearchSlot> exactly.

   Visually alive, not interactively alive: the page behind keeps ticking and
   animating (nothing is unmounted), shows through the 0.72 peek backdrop, but
   receives no input until the drawer closes. The closed-state wrapper's
   pointer-events-none/opacity-0 is the HIDE mechanism — left untouched.

   Structural note: the outer flex row makes the drawer (w-[76%]) and the peek
   (flex-1) siblings, so the peek fills the literal remainder. The peek is
   `relative` so its watch-hand pull + close hint anchor to it.

   Layer hierarchy (v1.65b): (1) drawer nav content — brightest, readable in
   outdoor sun; (2) gold watch-hand handle; (3) revealed page — dimmed to 0.80
   so it stays alive but recedes, context not competition. Nav text tokens were
   lifted one tier for sunlight readability (the "porch test").
   ──────────────────────────────────────────────────────────────────────── */

type BadgeVariant = "green" | "gold" | "blue";

/* Inline line-icons, one per nav item. Thin stroke to match Studio restraint.
   Active = gold, inactive = muted, set by the caller via the `active` prop. */
const ICON_PATHS: Record<string, React.ReactNode> = {
  "My Catalogue": (
    <>
      <path d="M7 3C5 3 3 3.5 3 5v7c0-1.5 2-2 4-2s4 .5 4 2V5c0-1.5-2-2-4-2z" />
      <line x1="7" y1="3" x2="7" y2="10" />
    </>
  ),
  Catalogue: (
    <>
      <path d="M7 3C5 3 3 3.5 3 5v7c0-1.5 2-2 4-2s4 .5 4 2V5c0-1.5-2-2-4-2z" />
      <line x1="7" y1="3" x2="7" y2="10" />
    </>
  ),
  "Saved Watches": <path d="M4 2h6a1 1 0 011 1v9l-4-2.5L3 12V3a1 1 0 011-1z" />,
  "Sell a Watch": (
    <>
      <path d="M3 3h4l5 5-4 4-5-5V3z" />
      <circle cx="5.5" cy="5.5" r="1" />
    </>
  ),
  Sell: (
    <>
      <path d="M3 3h4l5 5-4 4-5-5V3z" />
      <circle cx="5.5" cy="5.5" r="1" />
    </>
  ),
  About: (
    <>
      <circle cx="7" cy="7" r="5.5" />
      <line x1="7" y1="6.2" x2="7" y2="10" />
      <circle cx="7" cy="4.2" r="0.6" fill="currentColor" stroke="none" />
    </>
  ),
  "My Listings": (
    <>
      <rect x="2" y="2" width="4" height="4" />
      <rect x="8" y="2" width="4" height="4" />
      <rect x="2" y="8" width="4" height="4" />
      <rect x="8" y="8" width="4" height="4" />
    </>
  ),
  Correspondence: (
    <>
      <rect x="2" y="4" width="10" height="8" rx="1" />
      <path d="M2 4l5 5 5-5" />
    </>
  ),
  "Market Intel": (
    <>
      <rect x="2" y="8" width="2" height="4" />
      <rect x="6" y="5" width="2" height="7" />
      <rect x="10" y="2" width="2" height="10" />
    </>
  ),
  Account: (
    <>
      <circle cx="7" cy="4" r="2.5" />
      <path d="M2 13c0-3 2.5-5 5-5s5 2 5 5" />
    </>
  ),
};

function NavIcon({ label, active }: { label: string; active: boolean }) {
  if (label === "Browse") {
    return (
      <svg
        width="15"
        height="15"
        viewBox="-0.5 -0.5 16 16"
        fill="none"
        stroke={active ? "var(--gold)" : "var(--muted)"}
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        <path d="m6.5329999999999995 6.5329999999999995 4.351125 -2.4173125 -2.41725 4.35125 -4.3511875 2.41725 2.4173125 -4.3511875Z" />
        <path d="M7.5 14.337187499999999c3.7760624999999997 0 6.837187500000001 -3.061125 6.837187500000001 -6.837187500000001 0 -3.7760624999999997 -3.061125 -6.837187500000001 -6.837187500000001 -6.837187500000001C3.7239375000000003 0.6628125 0.6628125 3.7239375000000003 0.6628125 7.5c0 3.7760624999999997 3.061125 6.837187500000001 6.837187500000001 6.837187500000001Z" />
      </svg>
    );
  }

  if (label === "Vault") {
    return (
      <svg
        width="15"
        height="15"
        viewBox="0 0 24 24"
        fill="none"
        stroke={active ? "var(--gold)" : "var(--muted)"}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="shrink-0"
        aria-hidden="true"
      >
        <path d="M3 19V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
        <path d="M10 15a3 3 0 1 1 0-6a3 3 0 0 1 0 6m8-1v-4m-5.5-.5l1-1m-6 1l-1-1m0 7l1-1m6 1l-1-1M2 8h1M2 6h1m0 10H2m1 2H2" />
      </svg>
    );
  }

  const paths = ICON_PATHS[label];
  if (!paths) return null;
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      stroke={active ? "var(--gold)" : "var(--muted)"}
      strokeWidth="1.25"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0"
      aria-hidden="true"
    >
      {paths}
    </svg>
  );
}

function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
}) {
  const colors: Record<BadgeVariant, string> = {
    green: "border-[color:light-dark(rgba(46,125,79,0.5),rgba(80,180,120,0.35))] text-[var(--success)]",
    gold: "border-[var(--border-gold)] text-[var(--gold)]",
    blue: "border-[color:light-dark(rgba(58,98,160,0.5),rgba(100,150,220,0.35))] text-[color:light-dark(#3A62A0,rgba(140,180,240,0.9))]",
  };
  return (
    <span className={`border px-1.5 py-0.5 text-[8px] tracking-[1px] ${colors[variant]}`}>
      {children}
    </span>
  );
}

// Global Search DD2 — approved XCover hierarchy. Account is promoted OUT of the
// old bottom utility tier into the PRIMARY group; Browse/Sell/Catalogue/Vault
// surround it so the hierarchy stays legible. Correspondence and About sit in a
// quieter secondary group below. Account itself is rendered auth-aware (a link
// when signed in; the preserved join panel when signed out — never a /sell
// bounce), so it is not in this static list.
type NavLink = { label: string; href: string; badge?: { variant: BadgeVariant; label: string } };

const PRIMARY_LINKS: NavLink[] = [
  { label: "Browse", href: "/browse" },
  { label: "Sell", href: "/sell" },
  { label: "Catalogue", href: "/catalogue" },
  { label: "Vault", href: "/vault" },
];

const SECONDARY_LINKS: NavLink[] = [
  { label: "Correspondence", href: "/account?module=communications" },
  { label: "About", href: "/about" },
];

export default function MobileNav({
  open,
  onClose,
  authed = false,
  triggerRef,
}: {
  open: boolean;
  onClose: () => void;
  authed?: boolean;
  triggerRef?: RefObject<HTMLButtonElement | null>;
}) {
  const pathname = usePathname();
  const router = useRouter();

  // Escape closes the drawer and returns focus to the hamburger trigger (a11y:
  // the keyboard user lands back where they opened it). Outside interaction
  // (the peek) already closes via its onClick below.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        triggerRef?.current?.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose, triggerRef]);

  // v2.5 — Sign Out, mobile. Mirrors NavBar's desktop handler exactly (no
  // shared hook introduced — the brief didn't ask for one, and the logic is
  // three lines). Not bound by the login "no forced redirect" law — this is
  // a deliberate user action, not a post-login side effect.
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    onClose();
    router.push("/");
    router.refresh();
  }

  return (
    <div
      className={`fixed inset-0 z-50 flex lg:hidden transition-opacity duration-300 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* Drawer — 82%, slides from left */}
      <div
        className={`relative flex h-full w-[76%] flex-col bg-[color:light-dark(#FFFDF8,#09090E)] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Gold left-edge accent */}
        <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-[rgba(201,168,76,0.15)] to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-faint)] px-5 py-4">
          {/* v4.28 — the canonical live identity, compact. This was the
              second hand-maintained copy of the wordmark; both copies are
              now one component, so the drawer can never drift from the
              masthead again. */}
          <FairWatchTradeLogo size="compact" onClick={onClose} animate={open} />
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="text-[20px] leading-none text-[var(--muted)] transition-colors hover:text-[var(--slate)]"
          >
            ×
          </button>
        </div>

        {/* Greeting — authed only. "Welcome back" + "Your catalogue is
            waiting" is personalized framing that must not greet a signed-out
            visitor as a returning member (audit D5). Signed-out users get the
            header, then straight to the nav sections. */}
        {authed && (
          <div className="border-b border-[var(--border-faint)] px-5 py-5">
            <div className="font-display text-[16px] font-light text-[var(--platinum)]">
              Welcome back.
            </div>
            <div className="mt-1 font-display text-[13px] font-light italic text-[var(--platinum-dim)]">
              Your catalogue is waiting.
            </div>
          </div>
        )}

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto py-3">
          {/* ── PRIMARY tier — Browse · Sell · Catalogue · Vault · Account ──
              Account is promoted here (was bottom utility) and given a slightly
              elevated tone so it reads as primary, not an afterthought. */}
          <div className="px-5 pb-2 pt-2 text-[8.5px] uppercase tracking-[3px] text-[var(--muted)]">
            Primary
          </div>
          {PRIMARY_LINKS.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={`primary-${item.label}`}
                href={item.href}
                onClick={onClose}
                className={`flex items-center justify-between border-l-2 px-5 py-[13px] text-[13px] transition ${
                  isActive
                    ? "border-[var(--gold)] bg-[color:light-dark(rgba(122,95,32,0.05),rgba(201,168,76,0.04))] text-[var(--platinum)]"
                    : "border-transparent text-[var(--slate)] hover:text-[var(--platinum)]"
                }`}
              >
                <span className="flex items-center gap-3">
                  <NavIcon label={item.label} active={isActive} />
                  <span>{item.label}</span>
                </span>
                {item.badge && <Badge variant={item.badge.variant}>{item.badge.label}</Badge>}
              </Link>
            );
          })}

          {/* Account — primary tier. Signed in: an elevated link to /account.
              Signed out: the preserved join panel (never a /sell bounce),
              occupying the primary tier so Account is visible for guests too. */}
          {authed ? (
            <Link
              href="/account"
              onClick={onClose}
              className={`flex items-center gap-3 border-l-2 px-5 py-[13px] text-[13px] transition ${
                pathname === "/account"
                  ? "border-[var(--gold)] bg-[color:light-dark(rgba(122,95,32,0.05),rgba(201,168,76,0.04))] text-[var(--platinum)]"
                  : "border-transparent text-[var(--platinum-dim)] hover:text-[var(--platinum)]"
              }`}
            >
              <NavIcon label="Account" active={pathname === "/account"} />
              <span>Account</span>
            </Link>
          ) : (
            /* v2.55 — signed-out Account: invite the visitor to join instead of
               one-click-bouncing into /sell. Panel content preserved verbatim;
               only its position moved up into the primary tier (DD2). */
            <div className="px-5 py-5">
              <div className="font-display text-[16px] font-light leading-[1.35] text-[var(--platinum)]">
                Make FairWatchTrade your home for watches and knowledge.
              </div>
              <ul className="mt-4 flex flex-col gap-3.5 text-[11px] leading-[1.6] text-[var(--muted)]">
                <li>Keep your saved watches, saved searches, offers, listings, and correspondence together in one place.</li>
                <li>See new listings in your FairWatchTrade notifications as soon as they are published — never held for a daily batch.</li>
                <li>Sell for 5% only when a sale is completed. No listing fees. No paid placement.</li>
              </ul>
              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/signup"
                  onClick={onClose}
                  className="border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2.5 text-center text-[12px] uppercase tracking-[1.5px] text-[var(--gold)] transition-colors hover:bg-[color:light-dark(rgba(122,95,32,0.12),rgba(201,168,76,0.1))]"
                >
                  Create account
                </Link>
                <Link
                  href="/login"
                  onClick={onClose}
                  className="px-4 py-1 text-center text-[12px] uppercase tracking-[1.5px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
                >
                  Sign in
                </Link>
              </div>
            </div>
          )}

          {/* ── Quieter secondary group — Correspondence · About ──
              Correspondence targets an account surface, so it is shown only when
              signed in (a guest tap would bounce). About is public, always shown. */}
          <div className="my-2 border-t border-[var(--border-faint)]" />
          {SECONDARY_LINKS.filter((item) => authed || item.href !== "/account").map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={`secondary-${item.label}`}
                href={item.href}
                onClick={onClose}
                className={`flex items-center gap-3 border-l-2 px-5 py-[13px] text-[13px] transition ${
                  isActive
                    ? "border-[var(--gold)] text-[var(--platinum)]"
                    : "border-transparent text-[var(--muted)] hover:text-[var(--platinum)]"
                }`}
              >
                <NavIcon label={item.label} active={isActive} />
                <span>{item.label}</span>
              </Link>
            );
          })}

          {/* v2.5 — Sign Out, logged-in users only. The brief's referenced
              --ghost styling doesn't actually apply to interactive nav items
              in this file (only to the close "×" and the pull-hint copy), so
              this instead follows the real established pattern for a
              below-divider secondary action — the Account link just above —
              with the hover color swapped to --danger to match the desktop
              dropdown's Sign Out treatment for consistency across surfaces. */}
          {authed && (
            <button
              type="button"
              onClick={handleSignOut}
              className="flex w-full items-center gap-3 border-l-2 border-transparent px-5 py-[13px] text-left text-[13px] text-[var(--muted)] transition hover:text-[var(--danger)]"
            >
              <span className="w-[14px] shrink-0" aria-hidden="true" />
              <span>Sign Out</span>
            </button>
          )}
        </div>
      </div>

      {/* Peek — dimmed remainder, taps to close. relative so children anchor.
          0.72 backdrop lets the live page read through (visually alive). */}
      <div className="relative flex-1 bg-[color:light-dark(rgba(37,35,31,0.35),rgba(7,8,12,0.80))]" onClick={onClose}>
        {/* Watch-hand pull — a dauphine hand pointing left, centered vertically.
            The drawer-pull gesture, not a UI chevron. Decorative SVG, so the
            gold fill is hardcoded (can't read CSS vars). */}
        <div className="absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2">
          <svg
            width="22"
            height="40"
            viewBox="0 0 22 40"
            fill="none"
            aria-hidden="true"
          >
            {/* Dauphine hand: tapered diamond pointing left, with facet edge */}
            <polygon points="2,20 20,9 16,20 20,31" style={{ fill: "var(--gold)" }} />
            <polygon points="2,20 20,9 16,20" style={{ fill: "light-dark(#B49353, #E6C868)" }} opacity="0.55" />
            {/* Pivot cap */}
            <circle cx="19" cy="20" r="2" style={{ fill: "var(--gold)" }} />
          </svg>
          <span className="text-[7px] uppercase tracking-[3px] text-[var(--muted)]">
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
