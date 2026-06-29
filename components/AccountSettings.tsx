"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT SETTINGS — components/AccountSettings.tsx   (v1.68)

   Client component. Receives the authenticated user's id/email/createdAt from
   the server wrapper (which already guarded auth), and owns all form state:
   Profile (display_name), Security (password), Account info (read-only).
   Readability floors per Readability-Floor-Governance.md — labels & copy at
   --muted minimum.
   ──────────────────────────────────────────────────────────────────────── */

function memberSince(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function AccountSettings({
  userId,
  email,
  createdAt,
}: {
  userId: string;
  email: string;
  createdAt: string;
}) {
  const supabase = createClient();

  // Profile section
  const [displayName, setDisplayName] = useState("");
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Security section
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const pwMatch = newPassword === confirmPassword;
  const pwShowMismatch = confirmPassword.length > 0 && !pwMatch;

  // Pre-fill display name from the profile row.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();
      if (active && profile?.display_name) setDisplayName(profile.display_name);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function saveProfile() {
    setProfileBusy(true);
    setProfileMsg(null);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userId);
    if (error) {
      setProfileMsg({ ok: false, text: error.message });
    } else {
      setProfileMsg({ ok: true, text: "Saved." });
    }
    setProfileBusy(false);
  }

  async function savePassword() {
    setPwBusy(true);
    setPwMsg(null);
    if (newPassword !== confirmPassword) {
      setPwMsg({ ok: false, text: "Passwords don't match." });
      setPwBusy(false);
      return;
    }
    if (newPassword.length < 8) {
      setPwMsg({ ok: false, text: "Password must be at least 8 characters." });
      setPwBusy(false);
      return;
    }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPwMsg({ ok: false, text: error.message });
    } else {
      setPwMsg({ ok: true, text: "Password updated. Sign in again to continue." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPwBusy(false);
  }

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-12 text-[var(--platinum)]">
      <div className="mx-auto max-w-2xl">
        <div className="mb-8">
          <div className="text-[8px] uppercase tracking-[4px] text-[var(--gold-subtle)]">
            Account
          </div>
          <h1 className="mt-2 font-display text-[28px] font-light text-[var(--platinum)]">
            Settings
          </h1>
        </div>

        {/* ── Section 1 — Profile ── */}
        <section className="mb-10">
          <div className="mb-4 text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
            Profile
          </div>
          <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
            Display name
          </div>
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Your display name"
            className="fw-input"
          />
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={saveProfile}
              disabled={profileBusy}
              className={`fw-btn-primary ${profileBusy ? "cursor-wait" : ""}`}
            >
              {profileBusy ? "Saving…" : "Save"}
            </button>
            {profileMsg && (
              <span
                className={`text-[12px] ${
                  profileMsg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {profileMsg.text}
              </span>
            )}
          </div>
        </section>

        <div className="fw-rule mb-10" />

        {/* ── Section 2 — Security ── */}
        <section className="mb-10">
          <div className="mb-4 text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
            Security
          </div>

          <div className="mb-5">
            <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
              Current password
            </div>
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="••••••••••"
              className="fw-input"
            />
          </div>

          <div className="mb-5">
            <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
              New password
            </div>
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Create a password (8+ characters)"
              className="fw-input"
            />
          </div>

          <div className="mb-5">
            <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
              Confirm new password
            </div>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              className="fw-input"
            />
            {pwShowMismatch && (
              <p className="mt-2 text-[12px] text-[var(--danger)]">
                Passwords don&apos;t match.
              </p>
            )}
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={savePassword}
              disabled={pwBusy}
              className={`fw-btn-primary ${pwBusy ? "cursor-wait" : ""}`}
            >
              {pwBusy ? "Saving…" : "Update Password"}
            </button>
            {pwMsg && (
              <span
                className={`text-[12px] ${
                  pwMsg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {pwMsg.text}
              </span>
            )}
          </div>

          <p className="mt-3 font-display text-[12px] font-light italic text-[var(--muted)]">
            You&apos;ll need to sign in again after changing your password.
          </p>
        </section>

        <div className="fw-rule mb-10" />

        {/* ── Section 3 — Account info (read-only) ── */}
        <section>
          <div className="mb-4 text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
            Account
          </div>

          <div className="flex items-baseline justify-between border-b border-[var(--border-faint)] py-2">
            <span className="text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
              Email
            </span>
            <span className="text-[13px] text-[var(--slate)]">{email}</span>
          </div>
          <div className="flex items-baseline justify-between py-2">
            <span className="text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
              Member since
            </span>
            <span className="font-display text-[14px] font-light text-[var(--platinum-dim)]">
              {memberSince(createdAt)}
            </span>
          </div>

          <p className="mt-4 font-display text-[12px] font-light italic text-[var(--muted)]">
            To change your email address, contact hello@fairwatchtrade.com
          </p>
        </section>
      </div>
    </main>
  );
}
