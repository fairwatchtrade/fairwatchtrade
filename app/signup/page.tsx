"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function SignUpPage() {
  const router = useRouter();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSignUp() {
    setBusy(true);
    setError(null);

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/confirm`,
      },
    });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    // If email confirmation is ON, there's no active session yet — tell the
    // seller to check their inbox. If it's OFF, a session exists; go home.
    if (data.session) {
      router.push("/sell");
      router.refresh();
    } else {
      setSent(true);
    }
    setBusy(false);
  }

  if (sent) {
    return (
      <div className="mx-auto max-w-sm px-6 py-16 text-center" style={{ textAlign: "center" }}>
        <h1 className="text-[20px] font-semibold text-[#E8E4DC]">Check your email</h1>
        <p className="mt-3 text-[14px] leading-relaxed text-[#B7BAC4]">
          We sent a confirmation link to <span className="text-[#E8E4DC]">{email}</span>.
          Click it to finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[22px] font-semibold text-[#E8E4DC]">Create your account</h1>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        Sellers need an account to publish and manage listings.
      </p>

      <div className="mt-6 space-y-3">
        <input
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-[#0D0F14] px-3 py-2.5 text-[14px] text-[#E8E4DC] outline-none focus:border-[#C9A84C]/50"
        />
        <input
          type="password"
          autoComplete="new-password"
          placeholder="Password (8+ characters)"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full rounded-md border border-white/10 bg-[#0D0F14] px-3 py-2.5 text-[14px] text-[#E8E4DC] outline-none focus:border-[#C9A84C]/50"
        />
      </div>

      {error && (
        <p
          className="mt-4 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-[13px] text-[#E8B4B4]"
        >
          {error}
        </p>
      )}

      <button
        onClick={handleSignUp}
        disabled={busy || !email || password.length < 8}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-[#C9A84C] px-5 py-2.5 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-40 ${
          busy ? "cursor-wait" : ""
        }`}
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        )}
        {busy ? "Creating account…" : "Create account"}
      </button>

      <p className="mt-5 text-center text-[13px] text-[#8A8F9E]">
        Already have an account?{" "}
        <Link href="/login" className="text-[#C9A84C] hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}
