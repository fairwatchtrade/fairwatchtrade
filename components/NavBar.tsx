"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import MobileNav from "@/components/MobileNav";
import NotificationsBell from "@/components/NotificationsBell";
import FairWatchTradeLogo from "@/components/FairWatchTradeLogo";

/* ────────────────────────────────────────────────────────────────────────
   NAV BAR — site navigation, sits inside the sticky header above MarketBar.

   Desktop (lg:flex, ≥1024px): wordmark left, then the primary words right.
   Signed out: Browse · Sell · Catalogue · Vault · Account · About.
   Signed in:  Browse · Sell · Catalogue · Vault · About — the avatar/name
   cluster is the Account entrance, so the word would be a second door.
   Below 1024 (lg:hidden): wordmark + hamburger; tapping opens <MobileNav />,
   the left-edge "watch roll" drawer (separate component).

   v3.23 raised this from md (768px), which was never wide enough for the
   signed-in row — it only ever passed because the guest header is ~190px
   narrower, so every signed-out check cleared while signed-in collided.

   v3.25 corrects the replacement. v3.23 chose xl (1280) from a reported
   collision "at 1216px", but those screenshots were captured at ~1.375
   effective scale (browser zoom on top of display scaling), so the true
   collision width was ~884 CSS — and that was BEFORE Account left the
   signed-in row and before the name was bounded. Measured from the live
   DOM, the signed-in row now needs ~850: wordmark 134 + padding 48 +
   Browse 59 · Sell 34 · Catalogue 83 · Vault 43 · About 47 + bell ~26 +
   identity cluster ~206 (icon 26 + name ≤150 + chevron) + six 24px gaps.
   lg (1024) keeps ~145px of margin. NEVER size this from a screenshot:
   pixels in an image are not CSS pixels unless the zoom is known.

   Active link is rendered in gold via usePathname().

   v1.64: Studio token pass; full-screen overlay extracted into MobileNav.
   ──────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Browse", href: "/browse" },
  { label: "Sell", href: "/sell" },
  { label: "Catalogue", href: "/catalogue" },
  { label: "Vault", href: "/vault" },
  { label: "Account", href: "/account" },
  { label: "About", href: "/about" },
];

/* v4.28 — the wordmark is now the canonical live identity
   (components/FairWatchTradeLogo): live F/W clock mark + wordmark, one
   component shared with the mobile drawer. The local Wordmark() that used
   to live here was the second of two hand-maintained copies; both are
   gone. Sizing note for the width budget documented above: the identity
   adds roughly 55px to the left cluster, which the lg (1024) breakpoint
   still clears comfortably. */

// v2.5 — Account indicator icon. Thin outline person + faint outer
// medallion ring, ~26px visual footprint (matching the "Recommended" demo
// card proportions per the design ruling). Stroke stays thin/precise at
// this size — it does NOT scale proportionally with the larger box, since
// that reads as heavy/chunky. currentColor so the color-state classes on
// the wrapping element drive it (default --muted/--slate, hover/open
// --gold/--platinum).
function AccountIcon() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11.5" stroke="currentColor" strokeWidth="1" opacity="0.35" />
      <circle cx="13" cy="9.6" r="3.4" stroke="currentColor" strokeWidth="1.2" />
      <path
        d="M5.8 19.4c1.1-3.5 4-5.3 7.2-5.3s6.1 1.8 7.2 5.3"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

// v2.5 — Small dropdown caret, rotates 180° when open.
function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      width="8"
      height="8"
      viewBox="0 0 8 8"
      fill="none"
      className={`transition-transform ${open ? "rotate-180" : ""}`}
      aria-hidden="true"
    >
      <path d="M1 2.5L4 5.5L7 2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export default function NavBar({
  authed = false,
  initialUnreadCount = 0,
  displayName = null,
  isAdmin = false,
}: {
  authed?: boolean;
  initialUnreadCount?: number;
  displayName?: string | null;
  isAdmin?: boolean;
} = {}) {
  const [open, setOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const joinRef = useRef<HTMLDivElement>(null);
  const hamburgerRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  // Compact Global Search does NOT live in the masthead. It mounts once BELOW
  // the metals/auction strip via <HeaderSearchSlot> (layout.tsx), so the header
  // stack reads masthead → strip → search → content.

  // v2.5 — close the account dropdown on outside click.
  useEffect(() => {
    if (!accountOpen) return;
    function handleClick(e: MouseEvent) {
      if (accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [accountOpen]);

  // v2.55 — close the signed-out "join" prompt on outside click.
  useEffect(() => {
    if (!joinOpen) return;
    function handleClick(e: MouseEvent) {
      if (joinRef.current && !joinRef.current.contains(e.target as Node)) {
        setJoinOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [joinOpen]);

  // v2.5 — Sign Out. Auth-flow law: this is the only place NavBar redirects
  // on its own initiative (a deliberate user action, not a login side
  // effect), so it's exempt from the "no forced redirects" login law.
  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    setAccountOpen(false);
    router.push("/");
    router.refresh();
  }

  return (
    <nav className="w-full border-b border-[var(--border-subtle)] bg-[var(--ink)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-6">
        <FairWatchTradeLogo />

        {/* Desktop links */}
        <div className="hidden items-center gap-6 lg:flex">
          {/* v3.23 — design ruling: "Account" is a GUEST-ONLY word.
              Signed in, the avatar/name cluster is the single Account
              entrance (My Account → Overview), so the primary word is just a
              second door into the same workspace landing in a different room.
              Signed out there is no avatar and no workspace control, so the
              word stays and still opens the join panel below — the guest
              never gets ambushed by authentication. */}
          {NAV_LINKS.filter((item) => item.label !== "Account" || !authed).map((item) => {
            // v2.55 — the "Account" word must never one-click-bounce a
            // signed-out browser into /sell. Signed in: an ordinary link to
            // /account. Signed out: it opens a small join prompt in place —
            // create an account or sign in — never an ambush. Browsing is free.
            if (item.label === "Account" && !authed) {
              return (
                // flex items-center: the wrapper must center its button like
                // the row centers the sibling links — without it, the button
                // rides the div's taller text baseline and "Account" sits
                // ~1.5px low (Jason's off-center nav finding, v2.55-era).
                <div key="account-join" ref={joinRef} className="relative flex items-center">
                  <button
                    type="button"
                    onClick={() => setJoinOpen((v) => !v)}
                    aria-expanded={joinOpen}
                    aria-haspopup="menu"
                    className={`text-[10px] uppercase tracking-[2.5px] transition-colors ${
                      joinOpen
                        ? "text-[var(--gold)]"
                        : "text-[var(--slate)] hover:text-[var(--platinum)]"
                    }`}
                  >
                    Account
                  </button>
                  {joinOpen && (
                    <div
                      role="menu"
                      className="absolute left-1/2 top-[calc(100%+12px)] z-50 w-[340px] max-w-[calc(100vw-32px)] -translate-x-1/2 border border-[var(--border-subtle)] bg-[var(--surface)] p-5"
                    >
                      <div className="mb-4 font-display text-[16px] font-light leading-[1.35] text-[var(--platinum)]">
                        Make FairWatchTrade your home for watches and knowledge.
                      </div>
                      <ul className="mb-4 flex flex-col gap-3.5 text-[11px] leading-[1.55] text-[var(--muted)]">
                        <li>Keep your saved watches, saved searches, offers, listings, and correspondence together in one place.</li>
                        <li>See new listings in your FairWatchTrade notifications as soon as they are published — never held for a daily batch.</li>
                        <li>Sell for 5% only when a sale is completed. No listing fees. No paid placement.</li>
                      </ul>
                      <Link
                        href="/signup"
                        onClick={() => setJoinOpen(false)}
                        className="mb-2 block border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-3 py-2.5 text-center text-[9px] uppercase tracking-[2px] text-[var(--gold)] transition-colors hover:bg-[rgba(201,168,76,0.1)]"
                      >
                        Create account
                      </Link>
                      <Link
                        href="/login"
                        onClick={() => setJoinOpen(false)}
                        className="block px-3 py-1 text-center text-[9px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
                      >
                        Sign in
                      </Link>
                    </div>
                  )}
                </div>
              );
            }
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`text-[10px] uppercase tracking-[2.5px] transition-colors ${
                  pathname === item.href
                    ? "text-[var(--gold)]"
                    : "text-[var(--slate)] hover:text-[var(--platinum)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {/* Bell — authenticated users only; count seeded server-side. */}
          {authed && <NotificationsBell initialUnreadCount={initialUnreadCount} />}

          {/* v2.5 — Account indicator. Logged-out: icon + Sign In / Register,
              links to /login. Logged-in: icon + displayName + chevron, opens
              the account dropdown. */}
          {!authed ? (
            <Link
              href="/login"
              className="flex items-center gap-2 text-[10px] uppercase tracking-[2.5px] text-[var(--muted)] transition-colors hover:text-[var(--gold)]"
            >
              <AccountIcon />
              Sign In / Register
            </Link>
          ) : (
            <div ref={accountRef} className="relative">
              <button
                type="button"
                onClick={() => setAccountOpen((v) => !v)}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className={`flex items-center gap-2 text-[10px] uppercase tracking-[2.5px] transition-colors ${
                  accountOpen ? "text-[var(--gold-subtle)]" : "text-[var(--muted)] hover:text-[var(--gold)]"
                }`}
              >
                <span className={accountOpen ? "text-[var(--gold)]" : "text-[var(--slate)]"}>
                  <AccountIcon />
                </span>
                {/* v3.23 — the display name is unbounded user data. Left
                    free it wrapped to two lines and pushed the row past the
                    viewport (Jason's signed-in overflow). Single line,
                    bounded, ellipsis — so no name can widen the masthead. */}
                <span
                  className={`max-w-[150px] truncate ${
                    accountOpen ? "text-[var(--platinum)]" : "text-[var(--slate)]"
                  }`}
                >
                  {displayName ?? "Account"}
                </span>
                <Chevron open={accountOpen} />
              </button>

              {accountOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-[calc(100%+10px)] w-48 border border-[var(--border-subtle)] bg-[var(--surface)] py-1"
                >
                  {/* My Account and My Listings both pointed at bare /account,
                      which moduleFromParam resolves to Inventory — two menu
                      items, one destination. My Account now uses the same
                      Overview target the left-nav item produces
                      (selectModule("dashboard") → /account?module=dashboard),
                      so there is still exactly one way to reach Overview.
                      Desktop only: mobile Account has no Overview module and
                      stays Inventory-only under the single-view law. */}
                  <Link
                    href="/account?module=dashboard"
                    onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-[10px] uppercase tracking-[2.5px] text-[var(--slate)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                  >
                    My Account
                  </Link>
                  <Link
                    href="/sell"
                    onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-[10px] uppercase tracking-[2.5px] text-[var(--slate)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                  >
                    Sell a Watch
                  </Link>
                  <Link
                    href="/account"
                    onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-[10px] uppercase tracking-[2.5px] text-[var(--slate)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                  >
                    My Listings
                  </Link>
                  <Link
                    href="/account/settings"
                    onClick={() => setAccountOpen(false)}
                    className="block px-4 py-2 text-[10px] uppercase tracking-[2.5px] text-[var(--slate)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                  >
                    Account Settings
                  </Link>
                  {isAdmin && (
                    <Link
                      href="/admin"
                      onClick={() => setAccountOpen(false)}
                      className="block px-4 py-2 text-[10px] uppercase tracking-[2.5px] text-[var(--slate)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--platinum)]"
                    >
                      Admin
                    </Link>
                  )}
                  <div className="my-1 h-px bg-[var(--border-subtle)]" />
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="block w-full px-4 py-2 text-left text-[10px] uppercase tracking-[2.5px] text-[var(--muted)] transition-colors hover:bg-[var(--hover-wash)] hover:text-[var(--danger)]"
                  >
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          ref={hamburgerRef}
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="text-[var(--slate)] lg:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="6" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile drawer — the watch-roll nav */}
      <MobileNav
        open={open}
        onClose={() => setOpen(false)}
        authed={authed}
        triggerRef={hamburgerRef}
      />
    </nav>
  );
}
