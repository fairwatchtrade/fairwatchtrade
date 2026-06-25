"use client";

import { useState } from "react";
import Link from "next/link";

/* ────────────────────────────────────────────────────────────────────────
   NAV BAR — site navigation, sits inside the sticky header above MarketBar.

   Desktop: wordmark left, Browse · Sell · Account right.
   Mobile (md:hidden): wordmark + hamburger; tapping opens a full-screen
   overlay with the same links stacked and a close button top-right.
   ──────────────────────────────────────────────────────────────────────── */

const NAV_LINKS = [
  { label: "Browse", href: "/browse" },
  { label: "Sell", href: "/sell" },
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
      <span className="text-[#E8E4DC]">Fair</span>
      <span className="text-[#C9A84C]">Watch</span>
      <span className="text-[#E8E4DC]">Trade</span>
    </Link>
  );
}

export default function NavBar() {
  const [open, setOpen] = useState(false);

  return (
    <nav className="w-full border-b border-white/10 bg-[#0D0F14]">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6 sm:px-6">
        <Wordmark />

        {/* Desktop links */}
        <div className="hidden items-center gap-6 md:flex">
          {NAV_LINKS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-[13px] text-[#B7BAC4] transition-colors hover:text-[#E8E4DC]"
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
          className="md:hidden"
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="#B7BAC4"
            strokeWidth="1.75"
            strokeLinecap="round"
            aria-hidden="true"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
      </div>

      {/* Mobile full-screen overlay */}
      {open && (
        <div className="fixed inset-0 z-50 bg-[#0D0F14] md:hidden">
          <div className="flex h-14 items-center justify-between px-4 sm:px-6">
            <Wordmark onClick={() => setOpen(false)} />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setOpen(false)}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#B7BAC4"
                strokeWidth="1.75"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <line x1="5" y1="5" x2="19" y2="19" />
                <line x1="19" y1="5" x2="5" y2="19" />
              </svg>
            </button>
          </div>

          <div className="flex flex-col gap-1 px-4 pt-6 sm:px-6">
            {NAV_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="py-2 text-[15px] text-[#B7BAC4] transition-colors hover:text-[#E8E4DC]"
              >
                {item.label}
              </Link>
            ))}
          </div>
        </div>
      )}
    </nav>
  );
}
