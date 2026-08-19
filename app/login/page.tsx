"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import WatchBlueprint from "@/components/WatchBlueprint";

// v2.5 — same admin-email pattern used across the app (app/layout.tsx,
// admin gates). No new auth mechanism invented.
const ADMIN_EMAIL = "jmynatt74@gmail.com";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  // v2.26b — MOBILE AUTOFILL FIX (confirmed launch blocker, reproduced):
  // phone autofill/password managers write values into the DOM without
  // firing the events controlled inputs rely on, so the old email/password
  // state stayed empty while the fields LOOKED full — leaving Sign In
  // derived-disabled and the form guard refusing keyboard submits too.
  // The inputs are now UNCONTROLLED (refs); submit reads the DOM, which is
  // the only truth autofill actually writes to. The button disables only
  // while busy; emptiness is validated at submit with honest copy.
  const emailRef = useRef<HTMLInputElement | null>(null);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    const email = emailRef.current?.value.trim() ?? "";
    const password = passwordRef.current?.value ?? "";
    if (!email || !password) {
      setError("Enter your email and password.");
      return;
    }
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

        {/* Engineering plate — the same canonical artwork, geometry and layer
            state Join uses, so the two doors of the same house open on the
            same drawing. It replaces a 44px hand-drawn clock face that read
            as a stray icon beside Join's 140px plate: the panel is one
            composition, and the object at its head has to carry it. */}
        <div className="relative z-[1] mx-auto -mb-6 mt-[42.5px] w-[140px] shrink-0 overflow-visible">
          <WatchBlueprint
            completed={[
              "strap",
              "clasp",
              "lugs",
              "case",
              "crown",
              "dial",
              "hands",
              "movement",
              "glass",
            ]}
            active={["dial", "hands"]}
          />
        </div>

        {/* The manifesto */}
        <div className="relative z-[1] flex flex-1 flex-col justify-center">
          <div className="mb-5 text-[11px] uppercase tracking-[1.4px] text-[var(--gold-dim)]">
            Why we are here
          </div>

          <div className="mb-7 font-display text-[14px] font-light leading-[1.8] text-[var(--muted)]">
            Built for collectors whose collections are always evolving.
          </div>

          <div className="mb-8">
            <div className="mb-[14px] flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[11px] text-[var(--gold-dim)]">I</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[11px] uppercase tracking-[1.2px] text-[var(--slate)]">
                  Capital Efficiency
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--muted)]">
                  Minimize the friction between collections.
                </div>
              </div>
            </div>
            <div className="mb-[14px] flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[11px] text-[var(--gold-dim)]">II</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[11px] uppercase tracking-[1.2px] text-[var(--slate)]">
                  Collector-First Discovery
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--muted)]">
                  We match watches to your DNA, not your search history.
                </div>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="mt-[3px] w-4 shrink-0 text-[11px] text-[var(--gold-dim)]">III</div>
              <div className="flex-1">
                <div className="mb-[2px] text-[11px] uppercase tracking-[1.2px] text-[var(--slate)]">
                  Authenticity-First
                </div>
                <div className="font-display text-[12px] font-light italic leading-[1.5] text-[var(--muted)]">
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
        <div className="border-b border-[var(--border-faint)] bg-[var(--gold-whisper)] py-[6px] text-center text-[11px] uppercase tracking-[1.4px] text-[var(--gold-subtle)]">
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
                // v2.26b — no value guard here: the DOM is read (and
                // validated) inside handleSignIn, so autofilled values that
                // React state never saw still sign in.
                if (!busy) handleSignIn();
              }}
            >
            <div className="mb-5">
              <div className="mb-2 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                Email
              </div>
              <input
                ref={emailRef}
                type="email"
                name="email"
                autoComplete="email"
                placeholder="you@example.com"
                onChange={() => {
                  if (error) setError(null);
                }}
                className="fw-input"
              />
            </div>

            <div className="mb-5">
              <div className="mb-2 text-[11px] uppercase tracking-[1.6px] text-[var(--muted)]">
                Password
              </div>
              <input
                ref={passwordRef}
                type="password"
                name="password"
                autoComplete="current-password"
                placeholder="••••••••••"
                onChange={() => {
                  if (error) setError(null);
                }}
                className="fw-input"
              />
            </div>

            {/* Was 8.5px in --slate: the smallest text on the page, in one of
                its dimmest tokens, on the one control a locked-out collector
                actually needs to find. Lifted to the platform's readable
                secondary size with a gold hover and a visible focus ring. */}
            <div className="-mt-[6px] mb-7 text-right">
              <Link
                href="/forgot-password"
                className="text-[11px] tracking-[0.3px] text-[var(--muted)] underline decoration-[rgba(201,168,76,0.28)] underline-offset-[3px] transition-colors hover:text-[var(--gold)] hover:decoration-[var(--gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-[3px]"
              >
                Forgot password?
              </Link>
            </div>

            {/* v2.26b — disabled derives from busy ONLY. Value-derived
                disabling is what stranded mobile autofill users: state never
                saw the autofilled values, so the button never woke up. */}
            <button
              type="submit"
              disabled={busy}
              className={`fw-btn-primary mb-4 w-full ${busy ? "cursor-wait" : ""}`}
            >
              {busy ? "Signing in…" : "Sign In"}
            </button>
            </form>

            {error && (
              <div className="mt-4 border border-[color:light-dark(rgba(160,59,51,0.42),rgba(220,80,80,0.3))] bg-[color:light-dark(rgba(160,59,51,0.07),rgba(220,80,80,0.08))] px-3 py-2 text-[13px] text-[var(--danger)]">
                {error}
              </div>
            )}

            {/* Same 1px lift and gold hover as above. Join carries the mirror
                of this line at 9px/--slate; both deserve the same treatment,
                but that page is this flight's reference, not its subject. */}
            <div className="text-center text-[12px] text-[var(--muted)]">
              New to FairWatchTrade?{" "}
              <Link
                href="/signup"
                className="text-[var(--platinum-dim)] transition-colors hover:text-[var(--gold)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--gold)] focus-visible:outline-offset-[3px]"
              >
                Join us →
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
