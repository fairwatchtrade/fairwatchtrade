"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

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

    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }

    router.push("/sell");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-16">
      <h1 className="text-[22px] font-semibold text-[#E8E4DC]">Sign in</h1>
      <p className="mt-1 text-[13px] text-[#8A8F9E]">
        Welcome back to FairWatchTrade.
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
          autoComplete="current-password"
          placeholder="Password"
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
        onClick={handleSignIn}
        disabled={busy || !email || !password}
        className={`mt-5 flex w-full items-center justify-center gap-2 rounded-md bg-[#C9A84C] px-5 py-2.5 text-[13px] font-medium text-black hover:opacity-90 disabled:opacity-40 ${
          busy ? "cursor-wait" : ""
        }`}
      >
        {busy && (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-black/30 border-t-black" />
        )}
        {busy ? "Signing in…" : "Sign in"}
      </button>

      <p className="mt-5 text-center text-[13px] text-[#8A8F9E]">
        Need an account?{" "}
        <Link href="/signup" className="text-[#C9A84C] hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}
