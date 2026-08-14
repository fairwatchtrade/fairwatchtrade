"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { redeemHandoff } from "@/lib/listingDraft";

/* ────────────────────────────────────────────────────────────────────────
   CONTINUE REDEEM — phone-side handoff redemption (client)

   Runs once for the authenticated seller: redeems the scoped handoff token,
   which atomically transfers active editing authority to this phone, then opens
   the mobile wizard on the same server draft. Failure states are calm and
   truthful — a wrong account never reveals draft details, and an expired or
   invalid link offers a safe path back to the desktop. It never implies work
   was saved or moved when it was not.
   ──────────────────────────────────────────────────────────────────────── */

type Phase = "redeeming" | "wrong_account" | "expired" | "invalid" | "error";

export default function ContinueRedeem({ token }: { token: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("redeeming");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return; // redeem exactly once
    ran.current = true;
    (async () => {
      const res = await redeemHandoff(token);
      switch (res.state) {
        case "REDEEMED":
          if (res.draft_id) {
            router.replace(`/sell/mobile?draft=${encodeURIComponent(res.draft_id)}`);
          } else {
            setPhase("error");
          }
          return;
        case "WRONG_ACCOUNT":
          setPhase("wrong_account");
          return;
        case "EXPIRED":
          setPhase("expired");
          return;
        case "INVALID":
        case "NOT_ACTIVE":
          setPhase("invalid");
          return;
        default:
          setPhase("error");
      }
    })();
  }, [token, router]);

  async function signInWithCorrectAccount() {
    // Sign out, then return here so the seller can authenticate as the owner.
    try {
      await createClient().auth.signOut();
    } catch {
      /* ignore */
    }
    router.replace(`/login?callbackUrl=${encodeURIComponent(`/sell/continue/${token}`)}`);
  }

  const shell = "w-full max-w-[360px] border border-[var(--border-subtle)] bg-[color:light-dark(#FFFDF8,#0d1118)] p-6 text-center";

  if (phase === "redeeming") {
    return (
      <div className={shell}>
        <div className="text-[11px] uppercase tracking-[2px] text-[var(--muted)]">
          Opening your listing…
        </div>
      </div>
    );
  }

  if (phase === "wrong_account") {
    return (
      <div className={shell}>
        <h2 className="font-display text-[18px] font-light text-[var(--platinum)]">
          Different account
        </h2>
        <p className="mt-2 text-[12px] leading-[1.5] text-[var(--muted)]">
          This listing belongs to another FairWatchTrade account. For your
          security, we won’t show it here.
        </p>
        <button
          type="button"
          onClick={signInWithCorrectAccount}
          className="mt-5 w-full border border-[var(--border-gold)] bg-[var(--gold-whisper)] px-4 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--gold)] transition-colors hover:bg-[color:light-dark(rgba(122,95,32,0.12),rgba(201,168,76,0.1))]"
        >
          Sign in with the correct account
        </button>
      </div>
    );
  }

  const backToDesktop =
    phase === "expired"
      ? "This handoff link has expired. Your listing is safe — pick it back up on your desktop."
      : phase === "invalid"
        ? "This handoff link is no longer valid. Your listing is safe — continue from your desktop."
        : "Something went wrong opening the listing. Your work is safe — try again from your desktop.";

  return (
    <div className={shell}>
      <h2 className="font-display text-[18px] font-light text-[var(--platinum)]">
        Link no longer active
      </h2>
      <p className="mt-2 text-[12px] leading-[1.5] text-[var(--muted)]">{backToDesktop}</p>
      <Link
        href="/sell"
        className="mt-5 inline-block w-full border border-[var(--border-subtle)] px-4 py-2.5 text-[10px] uppercase tracking-[2px] text-[var(--slate)] transition-colors hover:text-[var(--platinum)]"
      >
        Go to Sell
      </Link>
    </div>
  );
}
