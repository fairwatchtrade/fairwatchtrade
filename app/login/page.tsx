"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

// v2.5 — same admin-email pattern used across the app (app/layout.tsx,
// admin gates). No new auth mechanism invented.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // v2.5 — Auth flow correction. The big law: login changes session state
    // only, no forced redirect. User intent (callbackUrl) is sovereign.
    //   1. callbackUrl present (e.g. bounced here from a protected page)
    //      → always honor it, admin included. Login never hijacks intent.
    //   2. No callbackUrl:
    //        - admin → /admin (the priority fix: William checks listing
    //          numbers constantly once live and shouldn't have to navigate
    //          there manually every login)
    //        - everyone else → /catalogue
    // NEVER default to /sell for anyone, and /sell is never intercepted —
    // it stays freely reachable at all times, admin included.
    const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl");
    const isAdmin = data.user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();
    const destination = callbackUrl || (isAdmin ? "/admin" : "/catalogue");

    router.push(destination);
    router.refresh();
  }

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      {/* ── LEFT PANEL — The statement. Never changes. ── */}
      <div className="relative hidden w-[320px] shrink-0 flex-col overflow-hidden border-r border-[var(--border-faint)] bg-[var(--ink)] px-10 py-12 md:flex">
        {/* Background movement art */}
        <svg
          className="pointer-events-none absolute bottom-[-60px] left-[-60px] h-[380px] w-[380px] opacity-[0.03]"
          viewBox="0 0 380 380"
          fill="none"
        >
          <circle cx="190" cy="190" r="178" stroke="white" strokeWidth="0.4" />
          <circle cx="190" cy="190" r="145" stroke="white" strokeWidth="0.4" />
          <circle cx="190" cy="190" r="112" stroke="white" strokeWidth="0.4" />
          <circle cx="190" cy="190" r="79" stroke="white" strokeWidth="0.4" />
          <circle cx="190" cy="190" r="46" stroke="white" strokeWidth="0.4" />
          <line x1="190" y1="12" x2="190" y2="48" stroke="white" strokeWidth="0.4" />
          <line x1="190" y1="332" x2="190" y2="368" stroke="white" strokeWidth="0.4" />
          <line x1="12" y1="190" x2="48" y2="190" stroke="white" strokeWidth="0.4" />
          <line x1="332" y1="190" x2="368" y2="190" stroke="white" strokeWidth="0.4" />
          <line x1="190" y1="190" x2="190" y2="72" stroke="white" strokeWidth="0.8" />
          <line x1="190" y1="190" x2="252" y2="190" stroke="white" strokeWidth="0.6" />
          <circle cx="190" cy="190" r="4" fill="white" />
        </svg>

        <div className="relative z-[1] mb-12 font-display text-[15px] font-normal tracking-[0.5px] text-[var(--platinum)]">
          Fair<span className="text-[var(--gold)]">Watch</span>Trade
        </div>

        {/* Small clock */}
        <div className="relative z-[1] mb-9">
          <svg viewBox="0 0 56 56" fill="none" width="44" height="44">
            <circle cx="28" cy="28" r="26" stroke="rgba(201,168,76,0.25)" strokeWidth="0.8" />
            <circle cx="28" cy="28" r="22" stroke="rgba(201,168,76,0.15)" strokeWidth="0.5" />
            <line x1="28" y1="6" x2="28" y2="10" stroke="#C9A84C" strokeWidth="1" opacity="0.7" />
            <line x1="28" y1="46" x2="28" y2="50" stroke="#C9A84C" strokeWidth="1" opacity="0.7" />
            <line x1="6" y1="28" x2="10" y2="28" stroke="#C9A84C" strokeWidth="1" opacity="0.7" />
            <line x1="46" y1="28" x2="50" y2="28" stroke="#C9A84C" strokeWidth="1" opacity="0.7" />
            <line x1="28" y1="28" x2="28" y2="12" stroke="#E8E4DC" strokeWidth="1" strokeLinecap="round" opacity="0.7" />
            <line x1="28" y1="28" x2="38" y2="28" stroke="#E8E4DC" strokeWidth="0.9" strokeLinecap="round" opacity="0.6" />
            <circle cx="28" cy="28" r="2" fill="#C9A84C" opacity="0.8" />
          </svg>
        </div>

        {/* The manifesto */}
        <div className="relative z-[1] flex flex-1 flex-col justify-center">
          <div className="mb-5 text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
            Why we are here
          </div>

          <div className="mb-7 font-display text-[14px] font-light leading-[1.8] text-[var(--muted)]">
            We started this because we were tired of the{" "}
            <span className="italic text-[var(--slate)]">Collector&apos;s Tax</span> — losing
            13% of our capital every time we wanted to move from one watch to the next.
          </div>

          <div className="mb-8">
            <div className="mb-[14px] flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-subtle)]">I</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[9px] uppercase tracking-[1.5px] text-[var(--slate)]">
                  Capital Efficiency
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--ghost)]">
                  Minimize the friction between collections.
                </div>
              </div>
            </div>
            <div className="mb-[14px] flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-subtle)]">II</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[9px] uppercase tracking-[1.5px] text-[var(--slate)]">
                  Collector-First Discovery
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--ghost)]">
                  We match watches to your DNA, not your search history.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-subtle)]">III</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[9px] uppercase tracking-[1.5px] text-[var(--slate)]">
                  Authenticity-First
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--ghost)]">
                  If the photo is stock, it doesn&apos;t get listed.
                </div>
              </div>
            </div>
          </div>

          <div className="mb-5 h-px w-[28px] bg-[var(--gold-subtle)]" />
          <div className="font-display text-[17px] font-light italic leading-[1.65] text-[var(--platinum-dim)]">
            We built this for the watch that nobody else recognizes — and the one person who
            does.
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL — Sign In ── */}
      <div className="flex flex-1 flex-col">
        <div className="border-b border-[var(--border-faint)] bg-[rgba(201,168,76,0.04)] py-[6px] text-center text-[8px] uppercase tracking-[3px] text-[var(--gold-subtle)]">
          Sign In
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-11 py-12">
          <div className="w-full max-w-[320px]">
            <div className="mb-[6px] font-display text-[26px] font-light tracking-[0.3px] text-[var(--platinum)]">
              Welcome back.
            </div>
            <div className="mb-8 font-display text-[14px] font-light italic leading-[1.6] text-[var(--muted)]">
              Your catalogue, your conversations, your listings — exactly where you left them.
            </div>
            <div className="mb-7 h-px bg-gradient-to-r from-[rgba(201,168,76,0.2)] to-transparent" />

            {/* A real <form> so Enter submits from either field — the same
                keyboard behavior every sign-in form owes its user. The button
                is type="submit"; onSubmit guards busy/empty exactly like the
                button's disabled state. */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy && email && password) handleSignIn();
              }}
            >
            <div className="mb-5">
              <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                Email
              </div>
              <input
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="fw-input"
              />
            </div>

            <div className="mb-5">
              <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                Password
              </div>
              <input
                type="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="fw-input"
              />
            </div>

            <div className="-mt-[10px] mb-7 text-right">
              <Link
                href="/forgot-password"
                className="text-[8.5px] tracking-[0.5px] text-[var(--ghost)]"
              >
                Forgot password?
              </Link>
            </div>

            <button
              type="submit"
              disabled={busy || !email || !password}
              className={`fw-btn-primary mb-4 w-full ${busy ? "cursor-wait" : ""}`}
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
            </form>

            {error && (
              <div className="mt-4 border border-[rgba(220,80,80,0.3)] bg-[rgba(220,80,80,0.08)] px-3 py-2 text-[13px] text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="text-center text-[9px] text-[var(--muted)]">
              New to FairWatchTrade?{" "}
              <Link href="/signup" className="text-[var(--slate)]">
                Join us →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
