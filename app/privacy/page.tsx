/* ────────────────────────────────────────────────────────────────────────
   PRIVACY POLICY — /privacy  (server component, static)
   ──────────────────────────────────────────────────────────────────────── */

export default function PrivacyPage() {
  return (
    <main className="min-h-screen bg-[#0D0F14] text-[#E8E4DC]">
      <div className="mx-auto max-w-3xl px-6 py-16 sm:px-8">
        <div className="text-[11px] uppercase tracking-[0.15em] text-[#C9A84C]">
          FairWatchTrade
        </div>
        <h1 className="text-3xl font-light text-[#E8E4DC]">Privacy Policy</h1>
        <p className="mt-2 text-[12px] text-[#8A8F9E]">Last updated: June 2026</p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          1. Our Commitment
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          FairWatchTrade is built on the principle that your data is yours. We
          collect only what&rsquo;s necessary to operate the marketplace. No
          advertising. No tracking pixels. No data sold to third parties. Ever.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          2. Information We Collect
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          Email address (for account and listing notifications), listing content
          you submit (photos, descriptions, pricing), and basic usage data to
          keep the platform running.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          3. How We Use Your Information
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          To operate your account, publish your listings, send transactional
          emails (listing confirmations, sale notifications), and improve the
          platform.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          4. What We Don&rsquo;t Do
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          We do not sell your data. We do not serve ads. We do not use tracking
          pixels or behavioral advertising. We do not share your information with
          third parties except as required to operate the platform (payment
          processing, email delivery).
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          5. Cookies
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          We use only essential cookies required for authentication and session
          management. No advertising cookies. No third-party tracking cookies.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          6. Data Security
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          Your data is stored securely via Supabase. Passwords are never stored
          in plain text.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          7. Your Rights
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          You may request deletion of your account and associated data at any
          time by emailing{" "}
          <a
            href="mailto:hello@fairwatchtrade.com"
            className="text-[#C9A84C] hover:underline"
          >
            hello@fairwatchtrade.com
          </a>
          .
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          8. Changes to This Policy
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          We may update this policy. We&rsquo;ll notify registered users of
          material changes by email.
        </p>

        <h2 className="mt-8 mb-2 text-[15px] font-medium text-[#E8E4DC]">
          9. Contact
        </h2>
        <p className="text-[14px] leading-relaxed text-[#B7BAC4]">
          Privacy questions? Email{" "}
          <a
            href="mailto:hello@fairwatchtrade.com"
            className="text-[#C9A84C] hover:underline"
          >
            hello@fairwatchtrade.com
          </a>
          .
        </p>
      </div>
    </main>
  );
}
