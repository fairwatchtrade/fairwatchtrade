"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import WatchBlueprint from "@/components/WatchBlueprint";

type Role = "collector" | "seller" | "both";

/* ────────────────────────────────────────────────────────────────────────
   v2 — CODE-ONLY EMAIL CONFIRMATION (structural fix, not a mitigation)

   Diagnosed live: some mail providers (Yahoo confirmed tonight; Microsoft
   Defender Safe Links is the other well-documented one) automatically
   pre-visit links in incoming email for security scanning — silently
   consuming a single-use confirmation link before the real user ever
   clicks it. A typed code is structurally immune: a scanner can GET a
   link, it cannot read an email body and submit a form.

   NOT "link + code as a fallback" — deliberately code-ONLY. Supabase's
   {{ .ConfirmationURL }} embeds {{ .TokenHash }}, which is a hashed version
   of the same {{ .Token }} shown as the code. They are two representations
   of ONE shared one-time record — a scanner burning the link burns the
   code too. Keeping both in the email defeats the protection entirely, so
   the link comes out of the "Confirm signup" template (Supabase Dashboard
   → Authentication → Emails), not just out of this component.

   Flow now: signUp() → no session, no clickable link → same screen shows a
   code-entry form → supabase.auth.verifyOtp({ email, token, type: 'email' })
   establishes the session directly, client-side, right here.

   `emailRedirectTo` removed from the signUp() call — it only mattered for
   the link-based flow being retired; leaving it in would be dead
   configuration pointing at a redirect that no longer exists in the email.

   Also closes a pre-existing TODO: the profile row is now created on the
   OTP-confirmation path too (previously only happened on the immediate-
   session path), since verifyOtp success hands back a session in this same
   client context, exactly like the immediate-session branch already does.
   ──────────────────────────────────────────────────────────────────────── */

/* The emailed code's length is a project setting, not a constant of this form.
   It is adjustable from six to ten digits, so this field accepts the widest
   valid code and lets the verifier decide. Hardcoding a shorter length silently
   truncates a longer code and then reports the result as expired or invalid —
   blaming the credential for what the input box did. */
const CODE_MAX_LENGTH = 10;

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [role, setRole] = useState<Role>("collector");

  // ── Code-entry state (v2) ──
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const passwordsMatch = password === confirmPassword;
  const showMismatch = confirmPassword.length > 0 && !passwordsMatch;
  const canSubmit =
    !busy && email.length > 0 && password.length >= 8 && passwordsMatch;

  async function createProfileRow(userId: string) {
    // Same shape as the immediate-session branch below — one definition
    // would be nicer, but this file has exactly two call sites and no
    // shared module yet; noted rather than silently duplicated without
    // comment.
    await supabase.from("profiles").insert({
      id: userId,
      email: email,
      display_name: email.split("@")[0],
    });
  }

  async function handleSignUp() {
    setBusy(true);
    setError(null);

    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      setBusy(false);
      return;
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    if (data.session) {
      // Email confirmation is OFF at the project level — a session exists
      // immediately, no code needed.
      await createProfileRow(data.session.user.id);
      router.push("/sell");
      router.refresh();
    } else {
      // Confirmation required — show the code-entry form. No link exists
      // to click; the email carries only the code.
      setSent(true);
    }
    setBusy(false);
  }

  async function handleVerifyCode() {
    if (code.trim().length === 0) return;
    setVerifying(true);
    setVerifyError(null);

    const { data, error } = await supabase.auth.verifyOtp({
      email,
      token: code.trim(),
      type: "email", // current Supabase docs: 'signup'/'magiclink' are
      // deprecated for this email+token overload — flagged for a quick
      // confirm against the installed @supabase/supabase-js version; if
      // that version rejects 'email' here, this is a one-line swap.
    });

    if (error) {
      setVerifyError(error.message || "That code didn't work. Please check it and try again.");
      setVerifying(false);
      return;
    }

    if (data.session) {
      await createProfileRow(data.session.user.id);
      router.push("/sell");
      router.refresh();
    } else {
      setVerifyError("Something went wrong confirming your code. Please try again.");
    }
    setVerifying(false);
  }

  async function handleResendCode() {
    setResending(true);
    setResendMessage(null);
    setVerifyError(null);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email,
    });

    if (error) {
      setResendMessage(error.message || "Couldn't resend the code. Please try again.");
    } else {
      setResendMessage("A new code is on its way.");
    }
    setResending(false);
  }

  /* ── LEFT PANEL — The statement. Never changes. Shared with /login. ── */
  const leftPanel = (
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

      {/* Engineering plate — static Signup study; canonical Sell Flow artwork. */}
      <div className="pointer-events-none relative z-[1] mx-auto -mb-6 mt-[42.5px] w-[140px] shrink-0 overflow-visible">
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
        <div className="mb-5 text-[8px] uppercase tracking-[3px] text-[var(--gold-dim)]">
          Why we are here
        </div>

        <div className="mb-7 font-display text-[14px] font-light leading-[1.8] text-[var(--muted)]">
          We started this because we were tired of the{" "}
          <span className="italic text-[var(--slate)]">Collector’s Tax</span> — watching
          10–13% of our capital disappear whenever we moved from one watch to the next.
        </div>

        <div className="mb-8">
          <div className="mb-[14px] flex items-start gap-3">
            <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-dim)]">I</div>
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
            <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-dim)]">II</div>
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
            <div className="mt-[3px] w-4 shrink-0 text-[8px] text-[var(--gold-dim)]">III</div>
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
          We built this for the watch that nobody else recognizes — and the one person who does.
        </div>
      </div>
    </div>
  );

  if (sent) {
    return (
      <div className="flex min-h-screen bg-[var(--ink)]">
        {leftPanel}
        <div className="flex flex-1 flex-col">
          <div className="border-b border-[var(--border-faint)] bg-[rgba(255,255,255,0.015)] py-[6px] text-center text-[8px] uppercase tracking-[3px] text-[var(--ghost)]">
            Create Account
          </div>
          <div className="flex flex-1 flex-col items-center justify-center bg-[var(--ink-deep)] px-11 py-9">
            <div className="w-full max-w-[320px]">
              <div className="mb-[6px] text-center font-display text-[26px] font-light text-[var(--platinum)]">
                Check your email.
              </div>
              <div className="mb-7 text-center font-display text-[14px] font-light italic leading-[1.6] text-[var(--muted)]">
                We sent a confirmation code to{" "}
                <span className="text-[var(--platinum)]">{email}</span>. Enter it below to
                finish creating your account.
              </div>

              <div className="mb-5">
                <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                  Confirmation code
                </div>
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={CODE_MAX_LENGTH}
                  placeholder="Enter code"
                  value={code}
                  onChange={(e) =>
                    setCode(e.target.value.replace(/[^0-9]/g, "").slice(0, CODE_MAX_LENGTH))
                  }
                  className="fw-input text-center tracking-[6px]"
                />
              </div>

              <button
                onClick={handleVerifyCode}
                disabled={verifying || code.trim().length === 0}
                className={`fw-btn-primary mb-4 w-full ${verifying ? "cursor-wait" : ""}`}
              >
                {verifying ? "Confirming…" : "Confirm Code"}
              </button>

              {verifyError && (
                <div className="mb-4 border border-[rgba(220,80,80,0.3)] bg-[rgba(220,80,80,0.08)] px-3 py-2 text-[13px] text-[var(--danger)]">
                  {verifyError}
                </div>
              )}

              <div className="text-center text-[9px] text-[var(--muted)]">
                Didn&apos;t get a code?{" "}
                <button
                  type="button"
                  onClick={handleResendCode}
                  disabled={resending}
                  className={`text-[var(--slate)] underline ${resending ? "cursor-wait opacity-60" : ""}`}
                >
                  {resending ? "Sending…" : "Resend it"}
                </button>
              </div>

              {resendMessage && (
                <div className="mt-3 text-center text-[11px] text-[var(--muted)]">
                  {resendMessage}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      {leftPanel}

      {/* ── RIGHT PANEL — Sign Up ── */}
      <div className="flex flex-1 flex-col">
        <div className="border-b border-[var(--border-faint)] bg-[rgba(255,255,255,0.015)] py-[6px] text-center text-[8px] uppercase tracking-[3px] text-[var(--ghost)]">
          Create Account
        </div>

        <div className="flex flex-1 flex-col items-center justify-center bg-[var(--ink-deep)] px-11 py-9">
          <div className="w-full max-w-[320px]">
            <div className="mb-[6px] font-display text-[26px] font-light text-[var(--platinum)]">
              Join FairWatchTrade.
            </div>
            <div className="mb-7 font-display text-[14px] font-light italic text-[var(--muted)]">
              Tell us how you collect.
            </div>
            <div className="mb-7 h-px bg-gradient-to-r from-[rgba(201,168,76,0.2)] to-transparent" />

            {/* v2.56 — "What your account gives you" approved wording.
                Literal about channel, timing, and no-batch; honest that it is not
                yet Catalogue-targeted. The manifesto (left panel) stays unchanged. */}
            <div className="mb-6 border border-[var(--border-subtle)] bg-[rgba(255,255,255,0.015)] p-4">
              <div className="mb-3 text-[8px] uppercase tracking-[2.5px] text-[var(--gold)]">
                What your account gives you
              </div>
              <ul className="flex flex-col gap-2.5 text-[11px] leading-[1.5] text-[var(--muted)]">
                <li>Keep your saved watches, saved searches, offers, listings, and correspondence together in one place.</li>
                <li>See new listings in your FairWatchTrade notifications as soon as they are published — never held for a daily batch.</li>
                <li>Sell for 5% only when a sale is completed. No listing fees. No paid placement.</li>
              </ul>
            </div>

            {/* Role selector — does not affect auth logic */}
            <div className="mb-6 flex gap-[6px]">
              {(
                [
                  { id: "collector", label: "Collector", sub: "I browse & buy" },
                  { id: "seller", label: "Seller", sub: "I list & sell" },
                  { id: "both", label: "Both", sub: "I trade" },
                ] as { id: Role; label: string; sub: string }[]
              ).map((chip) => {
                const selected = role === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setRole(chip.id)}
                    className={`flex-1 cursor-pointer border px-2 py-[10px] text-center ${
                      selected
                        ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.05)]"
                        : "border-[var(--border-subtle)]"
                    }`}
                  >
                    <span
                      className={`mb-[3px] block text-[9px] uppercase tracking-[1.5px] ${
                        selected ? "text-[var(--gold)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {chip.label}
                    </span>
                    <span
                      className={`block font-display text-[11px] italic ${
                        selected ? "text-[var(--slate)]" : "text-[var(--muted)]"
                      }`}
                    >
                      {chip.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mb-5">
              <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                Email
              </div>
              <input
                type="email"
                autoComplete="email"
                placeholder="Your email address"
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
                autoComplete="new-password"
                placeholder="Create a password (8+ characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="fw-input"
              />
            </div>

            <div className="mb-5">
              <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                Confirm Password
              </div>
              <input
                type="password"
                autoComplete="new-password"
                placeholder="Confirm your password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="fw-input"
              />
              {showMismatch && (
                <p className="mt-2 text-[12px] text-[var(--danger)]">
                  Passwords don&apos;t match.
                </p>
              )}
            </div>

            <button
              onClick={handleSignUp}
              disabled={!canSubmit}
              className={`fw-btn-primary mb-4 w-full ${busy ? "cursor-wait" : ""}`}
            >
              {busy ? "Creating account…" : "Create Account"}
            </button>

            {error && (
              <div className="mb-4 border border-[rgba(220,80,80,0.3)] bg-[rgba(220,80,80,0.08)] px-3 py-2 text-[13px] text-[var(--danger)]">
                {error}
              </div>
            )}

            <div className="text-center text-[9px] text-[var(--muted)]">
              Already a member?{" "}
              <Link href="/login" className="text-[var(--slate)]">
                Sign in →
              </Link>
            </div>

            <div className="mt-3 text-center text-[8px] leading-[1.6] text-[var(--muted)]">
              By joining you agree to our{" "}
              <Link href="/terms" className="text-[var(--muted)]">
                Terms of Service
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-[var(--muted)]">
                Privacy Policy
              </Link>
              .
              <br />
              FairWatchTrade is a curated marketplace. All listings are reviewed.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
