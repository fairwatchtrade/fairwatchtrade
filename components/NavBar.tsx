"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import MobileNav from "@/components/MobileNav";

/* ────────────────────────────────────────────────────────────────────────
   NAV BAR — site navigation, sits inside the sticky header above MarketBar.

   Desktop: wordmark left, Browse · Sell · Dashboard · Account · About right.
   Mobile (md:hidden): wordmark + hamburger; tapping opens <MobileNav />,
   the left-edge "watch roll" drawer (separate component).

   Active link is rendered in gold via usePathname().

   v1.64: Studio token pass; full-screen overlay extracted into MobileNav.
   ──────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Browse", href: "/browse" },
  { label: "Sell", href: "/sell" },
  { label: "Dashboard", href: "/dashboard" },
  { label: "Account", href: "/account" },
  { label: "About", href: "/about" },
];

function Wordmark({ onClick }: { onClick?: () => void }) {
  return (
    <Link
      href="/"
      onClick={onClick}
      className="font-display text-xl font-light tracking-[0.02em]"
    >
      <span className="text-[var(--platinum)]">Fair</span>
      <span className="text-[var(--gold)]">Watch</span>
      <span className="text-[var(--platinum)]">Trade</span>
    </Link>
  );
}

export default function NavBar() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <nav className="w-full border-b border-[var(--border-subtle)] bg-[var(--ink)]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-6">
        <Wordmark />

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((item) => (
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
          ))}
        </div>

        {/* Mobile hamburger */}
        <button
          type="button"
          aria-label="Open menu"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="text-[var(--slate)] md:hidden"
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
      <MobileNav open={open} onClose={() => setOpen(false)} />
    </nav>
  );
}
