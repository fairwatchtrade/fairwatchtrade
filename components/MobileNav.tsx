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
   MOBILE NAV — the "watch roll" drawer  (v1.65a)

   Left-edge drawer (76% width) that slides in over a dimmed peek strip (~24%).
   The wider peek makes the live page behind unmistakably visible — the drawer
   reads AS a drawer before the user interacts. Tapping the peek — or the close
   hint, the watch-hand pull, or a nav item — closes it. Mobile only
   (md:hidden); desktop never renders this.

   Visually alive, not interactively alive: the page behind keeps ticking and
   animating (nothing is unmounted), shows through the 0.72 peek backdrop, but
   receives no input until the drawer closes. The closed-state wrapper's
   pointer-events-none/opacity-0 is the HIDE mechanism — left untouched.

   Structural note: the outer flex row makes the drawer (w-[76%]) and the peek
   (flex-1) siblings, so the peek fills the literal remainder. The peek is
   `relative` so its watch-hand pull + close hint anchor to it.
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
        className={`relative flex h-full w-[76%] flex-col bg-[#09090E] transition-transform duration-300 ${
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

      {/* Peek — dimmed remainder, taps to close. relative so children anchor.
          0.72 backdrop lets the live page read through (visually alive). */}
      <div className="relative flex-1 bg-[rgba(7,8,12,0.72)]" onClick={onClose}>
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
            <polygon points="2,20 20,9 16,20 20,31" fill="#C9A84C" />
            <polygon points="2,20 20,9 16,20" fill="#E6C868" opacity="0.55" />
            {/* Pivot cap */}
            <circle cx="19" cy="20" r="2" fill="#C9A84C" />
          </svg>
          <span className="text-[7px] uppercase tracking-[3px] text-[var(--ghost)]">
            Close
          </span>
        </div>
      </div>
    </div>
  );
}
