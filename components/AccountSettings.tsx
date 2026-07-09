"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT SETTINGS — components/AccountSettings.tsx   (v2.6)

   Client component. Receives the authenticated user's id/email/createdAt from
   the server wrapper (which already guarded auth), and owns all form state:
   Profile (display_name), Security (password), Notification Preferences
   (v2.6 — notify_email / notify_sms / phone_number; SMS is preference-capture
   only, Twilio not wired), Account info (read-only).
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

  // v2.6 — Notification preferences (Correspondence). Email ON by default,
  // SMS OFF by default, mirroring the column defaults. SMS is a captured
  // preference only — Twilio is NOT wired (Phase 2); the toggle and phone
  // number save so the wiring can turn on later without another ask.
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [notifySms, setNotifySms] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [prefsMsg, setPrefsMsg] = useState<string | null>(null);

  async function savePrefs(next: {
    notify_email?: boolean;
    notify_sms?: boolean;
    phone_number?: string;
  }) {
    setPrefsMsg(null);
    const { error } = await supabase.from("profiles").update(next).eq("id", userId);
    if (!error) {
      setPrefsMsg("Preferences saved");
      setTimeout(() => setPrefsMsg(null), 2500);
    } else {
      setPrefsMsg("Could not save — try again");
    }
  }

  const pwMatch = newPassword === confirmPassword;
  const pwShowMismatch = confirmPassword.length > 0 && !pwMatch;

  // Pre-fill display name + notification preferences from the profile row.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("display_name, notify_email, notify_sms, phone_number")
        .eq("id", userId)
        .single();
      if (active && profile) {
        if (profile.display_name) setDisplayName(profile.display_name);
        setNotifyEmail(profile.notify_email !== false); // default true
        setNotifySms(profile.notify_sms === true);
        if (profile.phone_number) setPhoneNumber(profile.phone_number);
      }
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

        {/* ── Section 3 — Notification Preferences (v2.6, Correspondence) ── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
              Notification Preferences
            </span>
            {prefsMsg && (
              <span className="text-[11px] italic text-[var(--success)]">{prefsMsg}</span>
            )}
          </div>

          {/* Email — ON by default */}
          <div className="flex items-start justify-between gap-6 border-b border-[var(--border-faint)] py-4">
            <div>
              <div className="text-[13px] text-[var(--platinum-dim)]">Email notifications</div>
              <p className="mt-1 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
                Receive an email when a buyer messages you or replies to your message.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifyEmail}
              onClick={() => {
                const next = !notifyEmail;
                setNotifyEmail(next);
                savePrefs({ notify_email: next });
              }}
              className={`relative mt-1 h-5 w-10 shrink-0 border transition ${
                notifyEmail
                  ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.12)]"
                  : "border-[var(--border-subtle)] bg-transparent"
              }`}
            >
              <span
                className={`absolute top-[3px] h-3 w-3 transition-all ${
                  notifyEmail ? "left-[22px] bg-[var(--gold)]" : "left-[3px] bg-[var(--ghost)]"
                }`}
              />
            </button>
          </div>

          {/* SMS — OFF by default; Twilio not wired (preference capture only) */}
          <div className="flex items-start justify-between gap-6 py-4">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] text-[var(--platinum-dim)]">
                SMS / Text notifications
              </div>
              <p className="mt-1 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
                Receive a text for new correspondence. Standard carrier rates may apply.
              </p>
              {notifySms && (
                <div className="mt-3 max-w-[240px]">
                  <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                    Phone number
                  </div>
                  <input
                    type="tel"
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    onBlur={() => savePrefs({ phone_number: phoneNumber.trim() })}
                    placeholder="+1 ___-___-____"
                    className="fw-input"
                  />
                </div>
              )}
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notifySms}
              onClick={() => {
                const next = !notifySms;
                setNotifySms(next);
                savePrefs({ notify_sms: next });
              }}
              className={`relative mt-1 h-5 w-10 shrink-0 border transition ${
                notifySms
                  ? "border-[var(--border-gold)] bg-[rgba(201,168,76,0.12)]"
                  : "border-[var(--border-subtle)] bg-transparent"
              }`}
            >
              <span
                className={`absolute top-[3px] h-3 w-3 transition-all ${
                  notifySms ? "left-[22px] bg-[var(--gold)]" : "left-[3px] bg-[var(--ghost)]"
                }`}
              />
            </button>
          </div>
        </section>

        <div className="fw-rule mb-10" />

        {/* ── Section 4 — Account info (read-only) ── */}
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
