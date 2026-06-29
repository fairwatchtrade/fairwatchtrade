"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/* ════════════════════════════════════════════════════════════════════════
   NAV DRAWER — hamburger-triggered site navigation, every page.
   COLLECTOR'S DRAWER (Phase 2) — listing-detail only, desktop: left,
   mobile: bottom sheet.
   Never confuse the two.
   ════════════════════════════════════════════════════════════════════════ */

/* ────────────────────────────────────────────────────────────────────────
   MOBILE NAV — the "watch roll" drawer  (v1.65)

   Left-edge drawer (82% width) that slides in over a dimmed peek strip (18%).
   Tapping the peek — or the close hint, or a nav item — closes it. Mobile
   only (md:hidden); desktop never renders this. The Collector's Drawer on
   listing detail is a separate desktop-hover component and never shares a
   screen with this at mobile sizes.

   Structural note: the outer flex row makes the drawer (w-[82%]) and the peek
   (flex-1) siblings, so the peek fills the literal remainder. The peek is
   `relative` so its ghosted dial + close hint anchor to it.
   ──────────────────────────────────────────────────────────────────────── */

type BadgeVariant = "green" | "gold" | "blue";

function Badge({
  variant,
  children,
}: {
  variant: BadgeVariant;
  children: React.ReactNode;
}) {
  const colors: Record<BadgeVariant, string> = {
    green: "border-[rgba(80,180,120,0.35)] text-[var(--success)]",
    gold: "border-[var(--border-gold)] text-[var(--gold)]",
    blue: "border-[rgba(100,150,220,0.35)] text-[rgba(140,180,240,0.9)]",
  };
  return (
    <span className={`border px-1.5 py-0.5 text-[8px] tracking-[1px] ${colors[variant]}`}>
      {children}
    </span>
  );
}

type NavItem = {
  label: string;
  href: string;
  badge?: { variant: BadgeVariant; label: string };
};

type NavSection = { section: string; items: NavItem[] };

const SECTIONS: NavSection[] = [
  {
    section: "Discover",
    items: [
      { label: "Browse", href: "/browse" },
      { label: "My Catalogue", href: "/buyer", badge: { variant: "green", label: "Soon" } },
      { label: "Saved Watches", href: "/buyer", badge: { variant: "gold", label: "Soon" } },
    ],
  },
  {
    section: "Trade",
    items: [
      { label: "Sell a Watch", href: "/sell" },
      { label: "My Listings", href: "/account", badge: { variant: "gold", label: "Active" } },
    ],
  },
  {
    section: "Intelligence",
    items: [
      { label: "Messages", href: "/account", badge: { variant: "blue", label: "Soon" } },
      { label: "Vault", href: "/vault" },
      { label: "Market Intel", href: "/account", badge: { variant: "gold", label: "Soon" } },
    ],
  },
];

const METALS = [
  { label: "Gold", value: "$4,091" },
  { label: "Silver", value: "$59.30" },
  { label: "Platinum", value: "$1,625" },
];

export default function MobileNav({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname();

  return (
    <div
      className={`fixed inset-0 z-50 flex md:hidden transition-opacity duration-300 ${
        open ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
      }`}
    >
      {/* Drawer — 82%, slides from left */}
      <div
        className={`relative flex h-full w-[82%] flex-col bg-[#09090E] transition-transform duration-300 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Gold left-edge accent */}
        <div className="absolute inset-y-0 left-0 w-[2px] bg-gradient-to-b from-transparent via-[rgba(201,168,76,0.15)] to-transparent" />

        {/* Header */}
        <div className="flex items-center justify-between border-b border-[var(--border-faint)] px-5 py-4">
          <Link href="/" onClick={onClose} className="font-display text-[15px] font-normal text-[var(--platinum)]">
            Fair<span className="text-[var(--gold)]">Watch</span>Trade
          </Link>
          <button
            type="button"
            aria-label="Close menu"
            onClick={onClose}
            className="text-[20px] leading-none text-[var(--ghost)] transition-colors hover:text-[var(--slate)]"
          >
            ×
          </button>
        </div>

        {/* Greeting */}
        <div className="border-b border-[var(--border-faint)] px-5 py-5">
          <div className="font-display text-[16px] font-light text-[var(--platinum)]">
            Welcome back.
          </div>
          <div className="mt-1 text-[10px] tracking-[1px] text-[var(--slate)]">
            Your catalogue is waiting.
          </div>
        </div>

        {/* Nav sections */}
        <div className="flex-1 overflow-y-auto py-3">
          {SECTIONS.map((sec) => (
            <div key={sec.section}>
              <div className="px-5 pb-2 pt-4 text-[7.5px] uppercase tracking-[3px] text-[var(--ghost)]">
                {sec.section}
              </div>
              {sec.items.map((item) => {
                const isActive = pathname === item.href;
                return (
                  <Link
                    key={`${sec.section}-${item.label}`}
                    href={item.href}
                    onClick={onClose}
                    className={`flex items-center justify-between border-l-2 px-5 py-[13px] text-[13px] transition ${
                      isActive
                        ? "border-[var(--gold)] bg-[rgba(201,168,76,0.04)] text-[var(--platinum)]"
                        : "border-transparent text-[var(--muted)] hover:text-[var(--slate)]"
                    }`}
                  >
                    <span>{item.label}</span>
                    {item.badge && <Badge variant={item.badge.variant}>{item.badge.label}</Badge>}
                  </Link>
                );
              })}
            </div>
          ))}

          {/* Account — below a divider */}
          <div className="my-2 border-t border-[var(--border-faint)]" />
          <Link
            href="/account"
            onClick={onClose}
            className="flex items-center border-l-2 border-transparent px-5 py-[13px] text-[13px] text-[var(--ghost)] transition hover:text-[var(--slate)]"
          >
            Account
          </Link>
        </div>

        {/* Market strip — static placeholders (live values Phase 2) */}
        <div className="mt-auto border-t border-[var(--border-faint)] px-5 py-4">
          <div className="flex gap-5">
            {METALS.map((m) => (
              <div key={m.label}>
                <div className="text-[7px] uppercase tracking-[2px] text-[var(--ghost)]">
                  {m.label}
                </div>
                <div className="text-[11px] text-[var(--muted)]">{m.value}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Peek — dimmed remainder, taps to close. relative so children anchor. */}
      <div className="relative flex-1 bg-[rgba(7,8,12,0.88)]" onClick={onClose}>
        {/* Ghosted dial — decorative */}
        <svg
          className="absolute right-0 top-1/3 opacity-[0.12]"
          viewBox="0 0 120 120"
          width="90"
          height="90"
          aria-hidden="true"
        >
          <circle cx="60" cy="60" r="58" stroke="#C9A84C" strokeWidth="0.75" fill="none" />
          <circle cx="60" cy="60" r="52" stroke="#C9A84C" strokeWidth="0.25" fill="none" />
          <circle cx="60" cy="60" r="2" fill="#C9A84C" opacity="0.5" />
        </svg>
        {/* Close hint */}
        <div className="absolute bottom-8 right-0 flex w-[18%] flex-col items-center gap-1">
          <span className="text-[8px] uppercase tracking-[2px] text-[var(--ghost)]">Close</span>
        </div>
      </div>
    </div>
  );
}
