"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { SUPPORTED_CURRENCIES, isSupportedCurrency } from "@/lib/supportedCurrencies";

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

/* Device-side appearance persistence. The cookie is what the server layout
   reads to paint the first frame correctly; clearing it returns the device
   to System. Module-level: cookie writes belong to the event, not the
   render. */
function writeAppearanceCookie(next: "system" | "light" | "dark") {
  const root = document.documentElement;
  if (next === "system") {
    root.removeAttribute("data-theme");
    document.cookie = "fwt-appearance=; path=/; max-age=0; samesite=lax";
  } else {
    root.setAttribute("data-theme", next);
    document.cookie = `fwt-appearance=${next}; path=/; max-age=31536000; samesite=lax`;
  }
}

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

  // Appearance — System is the default; an explicit choice overrides the
  // device preference. The choice is applied in three coordinated places:
  // the live document (data-theme), the device cookie the server layout
  // reads for correct first paint, and the account row so a fresh device
  // inherits it. "system" is stored as NULL — absence of an override.
  const [appearance, setAppearance] = useState<"system" | "light" | "dark">("system");
  const [appearanceMsg, setAppearanceMsg] = useState<string | null>(null);

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

  // Money Truth Stage B — Selling section. THIS is the only surface that
  // persists a currency preference ("" = no preference, stored as NULL).
  // The seller flow reads it as a prefill; it never rewrites existing
  // listings. isDealer flips the label per the order ("Store currency" for
  // dealers, "Preferred listing currency" for private sellers) — dealer
  // identity is the repo's established signal: owning dealer_import media.
  const [prefCurrency, setPrefCurrency] = useState("");
  const [isDealer, setIsDealer] = useState(false);
  const [currencyMsg, setCurrencyMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Dealer Room identity is managed here, never on the public room. The logo
  // is dealer-selected data; the public seller route only reads the result.
  const [dealerName, setDealerName] = useState("");
  const [dealerSlug, setDealerSlug] = useState("");
  const [dealerLocation, setDealerLocation] = useState("");
  const [dealerTagline, setDealerTagline] = useState("");
  const [dealerLogoUrl, setDealerLogoUrl] = useState<string | null>(null);
  const [dealerBusy, setDealerBusy] = useState(false);
  const [dealerMsg, setDealerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function savePreferredCurrency(next: string) {
    setCurrencyMsg(null);
    const value = isSupportedCurrency(next) ? next : null;
    const { error } = await supabase
      .from("profiles")
      .update({ preferred_listing_currency: value })
      .eq("id", userId);
    if (error) {
      setCurrencyMsg({ ok: false, text: "Could not save — try again" });
    } else {
      setCurrencyMsg({
        ok: true,
        text: value === null ? "Preference cleared" : "Preference saved",
      });
      setTimeout(() => setCurrencyMsg(null), 2500);
    }
  }

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
        .select("display_name, notify_email, notify_sms, phone_number, preferred_listing_currency, appearance")
        .eq("id", userId)
        .single();
      if (active && profile) {
        if (profile.display_name) setDisplayName(profile.display_name);
        setNotifyEmail(profile.notify_email !== false); // default true
        setNotifySms(profile.notify_sms === true);
        if (profile.phone_number) setPhoneNumber(profile.phone_number);
        setPrefCurrency(
          isSupportedCurrency(profile.preferred_listing_currency)
            ? profile.preferred_listing_currency
            : ""
        );
        // The document attribute (rendered by the server from cookie/account
        // truth) is what the user is actually looking at — seed from it
        // first so the control never contradicts the room around it.
        const live = document.documentElement.getAttribute("data-theme");
        if (live === "light" || live === "dark") setAppearance(live);
        else if (profile.appearance === "light" || profile.appearance === "dark")
          setAppearance(profile.appearance);
      }
      // Dealer identity — RLS scopes this read to the user's own listings.
      const { data: dealerMedia } = await supabase
        .from("listing_media")
        .select("id")
        .eq("capture_source", "dealer_import")
        .limit(1);
      const { data: dealerProfile } = await supabase
        .from("dealer_profiles")
        .select("slug,business_name,logo_url,location,tagline")
        .eq("seller_id", userId)
        .maybeSingle();
      if (active) {
        setIsDealer(Boolean(dealerProfile) || (dealerMedia ?? []).length > 0);
        setDealerName(dealerProfile?.business_name || profile?.display_name || "");
        setDealerSlug(dealerProfile?.slug || "");
        setDealerLocation(dealerProfile?.location || "");
        setDealerTagline(dealerProfile?.tagline || "");
        setDealerLogoUrl(dealerProfile?.logo_url || null);
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function applyAppearance(next: "system" | "light" | "dark") {
    setAppearance(next);
    setAppearanceMsg(null);
    writeAppearanceCookie(next);
    const { error } = await supabase
      .from("profiles")
      .update({ appearance: next === "system" ? null : next })
      .eq("id", userId);
    // The room has already changed either way; the message only reports
    // whether the account will remember it on other devices.
    setAppearanceMsg(error ? "Applied here — could not save to your account" : "Saved");
    setTimeout(() => setAppearanceMsg(null), 2500);
  }

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

  async function saveDealerIdentity() {
    setDealerBusy(true);
    setDealerMsg(null);
    const response = await fetch("/api/account/dealer-profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        businessName: dealerName,
        slug: dealerSlug,
        location: dealerLocation,
        tagline: dealerTagline,
      }),
    });
    const result = (await response.json().catch(() => null)) as {
      dealer?: {
        slug?: string;
        business_name?: string;
        logo_url?: string | null;
        location?: string | null;
        tagline?: string | null;
      };
    } | null;
    if (!response.ok || !result?.dealer) {
      setDealerMsg({ ok: false, text: "Could not save — try again" });
    } else {
      setDealerSlug(result.dealer.slug || "");
      setDealerName(result.dealer.business_name || dealerName);
      setDealerLocation(result.dealer.location || "");
      setDealerTagline(result.dealer.tagline || "");
      setDealerLogoUrl(result.dealer.logo_url || dealerLogoUrl);
      setDealerMsg({ ok: true, text: "Dealer identity saved" });
    }
    setDealerBusy(false);
  }

  async function uploadDealerLogo(file: File) {
    setDealerBusy(true);
    setDealerMsg(null);
    const form = new FormData();
    form.set("logo", file);
    const response = await fetch("/api/account/dealer-profile", {
      method: "POST",
      body: form,
    });
    const result = (await response.json().catch(() => null)) as {
      dealer?: { logo_url?: string | null; slug?: string; business_name?: string };
    } | null;
    if (!response.ok || !result?.dealer?.logo_url) {
      setDealerMsg({ ok: false, text: "Could not upload that logo" });
    } else {
      setDealerLogoUrl(result.dealer.logo_url);
      setDealerSlug(result.dealer.slug || dealerSlug);
      setDealerName(result.dealer.business_name || dealerName);
      setDealerMsg({ ok: true, text: "Dealer logo saved" });
    }
    setDealerBusy(false);
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
            Account Settings
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

        {/* ── Section — Appearance ── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
              Appearance
            </span>
            {appearanceMsg && (
              <span className="text-[11px] italic text-[var(--success)]">{appearanceMsg}</span>
            )}
          </div>

          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Appearance">
            {(
              [
                { key: "system", label: "System" },
                { key: "light", label: "Light" },
                { key: "dark", label: "Dark" },
              ] as const
            ).map(({ key, label }) => (
              <button
                key={key}
                type="button"
                role="radio"
                aria-checked={appearance === key}
                onClick={() => applyAppearance(key)}
                className={`border px-4 py-2 text-[11px] uppercase tracking-[2px] transition ${
                  appearance === key
                    ? "border-[var(--border-gold)] bg-[var(--gold-whisper)] text-[var(--gold)]"
                    : "border-[var(--border-subtle)] text-[var(--slate)] hover:text-[var(--platinum-dim)]"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-2 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
            System follows your device&apos;s setting. Choosing Light or Dark keeps
            FairWatchTrade that way on every visit.
          </p>
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

        {/* ── Section — Selling (Money Truth Stage B, order §6.2) ── */}
        <section className="mb-10">
          <div className="mb-4 flex items-center gap-3">
            <span className="text-[8px] uppercase tracking-[3px] text-[var(--muted)]">
              Selling
            </span>
            {currencyMsg && (
              <span
                className={`text-[11px] italic ${
                  currencyMsg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                }`}
              >
                {currencyMsg.text}
              </span>
            )}
          </div>

          <div className="mb-2 text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
            {isDealer ? "Store currency" : "Preferred listing currency"}
          </div>
          <select
            value={prefCurrency}
            onChange={(e) => {
              setPrefCurrency(e.target.value);
              savePreferredCurrency(e.target.value);
            }}
            className="fw-input [&>option]:bg-[var(--surface-2)] [&>option]:text-[var(--platinum)]"
          >
            <option value="">No preference — USD suggested when you list</option>
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} — {c.displayName}
              </option>
            ))}
          </select>
          <p className="mt-2 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
            Pre-selects the currency when you create a new listing. You confirm it on every
            listing, and changing it here never alters a watch you have already listed.
          </p>

          {isDealer && (
            <div className="mt-8 border-t border-[var(--border-faint)] pt-8">
              <div className="mb-1 text-[8px] uppercase tracking-[2.5px] text-[var(--gold-subtle)]">
                Dealer Room identity
              </div>
              <p className="mb-5 font-display text-[12px] font-light italic leading-[1.6] text-[var(--muted)]">
                Choose the public identity shown in your Dealer Room and on your listings.
                Management stays here; the public room remains buyer-facing.
              </p>

              <div className="mb-5 flex items-center gap-4">
                <div className="flex h-20 w-20 shrink-0 items-center justify-center border border-[var(--border-subtle)] bg-[var(--ink-deep)] p-2">
                  {dealerLogoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={dealerLogoUrl}
                      alt="Current dealer logo"
                      className="h-full w-full object-contain"
                    />
                  ) : (
                    <span className="text-center text-[9px] uppercase tracking-[1.5px] text-[var(--muted)]">
                      No logo selected
                    </span>
                  )}
                </div>
                <label className="fw-btn-secondary cursor-pointer">
                  {dealerBusy ? "Saving…" : "Choose logo"}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="sr-only"
                    disabled={dealerBusy}
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) uploadDealerLogo(file);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              <div className="grid gap-5 sm:grid-cols-2">
                <label>
                  <span className="mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                    Business name
                  </span>
                  <input
                    value={dealerName}
                    onChange={(event) => setDealerName(event.target.value)}
                    className="fw-input"
                    maxLength={120}
                  />
                </label>
                <label>
                  <span className="mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                    Public room address
                  </span>
                  <div className="flex items-center border border-[var(--border-subtle)] bg-[var(--surface)] px-3 focus-within:border-[var(--border-gold)]">
                    <span className="shrink-0 text-[11px] text-[var(--muted)]">/sellers/</span>
                    <input
                      value={dealerSlug}
                      onChange={(event) => setDealerSlug(event.target.value)}
                      className="min-w-0 flex-1 bg-transparent py-3 text-[13px] text-[var(--platinum)] outline-none"
                      maxLength={80}
                    />
                  </div>
                </label>
                <label>
                  <span className="mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                    Location
                  </span>
                  <input
                    value={dealerLocation}
                    onChange={(event) => setDealerLocation(event.target.value)}
                    className="fw-input"
                    maxLength={120}
                  />
                </label>
                <label>
                  <span className="mb-2 block text-[8px] uppercase tracking-[2.5px] text-[var(--muted)]">
                    Positioning line
                  </span>
                  <input
                    value={dealerTagline}
                    onChange={(event) => setDealerTagline(event.target.value)}
                    className="fw-input"
                    maxLength={240}
                  />
                </label>
              </div>

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={saveDealerIdentity}
                  disabled={dealerBusy || !dealerName.trim()}
                  className={`fw-btn-primary ${dealerBusy ? "cursor-wait" : ""}`}
                >
                  {dealerBusy ? "Saving…" : "Save Dealer Identity"}
                </button>
                {dealerMsg && (
                  <span
                    className={`text-[11px] ${
                      dealerMsg.ok ? "text-[var(--success)]" : "text-[var(--danger)]"
                    }`}
                  >
                    {dealerMsg.text}
                  </span>
                )}
              </div>
            </div>
          )}
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
