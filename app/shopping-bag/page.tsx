import { Suspense } from "react";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";
import { resolveShoppingBag } from "@/lib/purchases/shoppingBag";
import ShoppingBagRoom from "@/components/ShoppingBagRoom";

/* ────────────────────────────────────────────────────────────────────────
   /shopping-bag — the buyer's home for accepted purchases still inside the
   payment / funding phase (Accepted Purchase Continuity, 2026-09-11)

   The Bag is a projection, resolved on the server from transaction and
   payment truth for the signed-in buyer (lib/purchases/shoppingBag.ts).
   This page owns two decisions and hands the rest to the room:

   1 · SIGNED-IN ONLY. An accepted purchase is owned commerce; a visitor is
       sent to sign in and brought straight back here, query intact, so a
       Stripe return or an acceptance summons that lands on a cold session
       still arrives at the right purchase.

   2 · STRIPE RETURN ROUTING AT ARRIVAL TIME (§13). Checkout's success and
       cancel URLs both come back here with ?transaction=<id>&payment=…
       That redirect is navigation, never payment authority. The page asks
       the resolver whether the transaction is STILL a Bag member:
         · member ............ render the Bag, focused on that purchase; the
                                room shows Confirming payment until the
                                webhook lands
         · not a member ...... the webhook won the race and the watch has
                                already left the Bag. Do not resurrect it:
                                land on the same transaction in persistent
                                Your Purchases, where the confirmed truth is
         · could not read .... render the Bag's unavailable state, no
                                redirect, no guess

   Canary: PFC274 = 62 — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

export const dynamic = "force-dynamic";

export const metadata: Metadata = privateRouteMetadata("Shopping Bag");

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ShoppingBagPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => {
    const v = sp[k];
    return typeof v === "string" && v ? v : null;
  };
  const transaction = one("transaction");
  const payment = one("payment");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    const qs = new URLSearchParams();
    if (transaction) qs.set("transaction", transaction);
    if (payment) qs.set("payment", payment);
    const back = qs.toString() ? `/shopping-bag?${qs}` : "/shopping-bag";
    redirect(`/login?callbackUrl=${encodeURIComponent(back)}`);
  }

  /* One server read: the whole Bag. The room receives it as its first truth
     so nothing flashes, then re-reads on its own for payment confirmation. */
  const read = await resolveShoppingBag(user.id);

  /* Stripe return, resolved against current membership at arrival time. */
  if (transaction && UUID.test(transaction) && read.ok) {
    const stillMember = read.members.some((m) => m.transactionId === transaction);
    if (!stillMember) {
      const dest = new URLSearchParams({ module: "dashboard", transaction });
      if (payment) dest.set("payment", payment);
      redirect(`/account?${dest}`);
    }
  }

  return (
    <main className="min-h-[60vh] px-6 py-8 sm:px-8">
      <Suspense fallback={null}>
        <ShoppingBagRoom
          initial={read.ok ? { ok: true, members: read.members } : { ok: false }}
          focusTransactionId={transaction && UUID.test(transaction) ? transaction : null}
          returned={payment === "return" ? "return" : payment === "cancel" ? "cancel" : null}
        />
      </Suspense>
    </main>
  );
}
