import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import DealerRoomPublicationControl from "@/components/DealerRoomPublicationControl";

export const dynamic = "force-dynamic";
const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

export default async function DealerRoomsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.id !== ADMIN_USER_ID) redirect("/");
  const service = createServiceClient();
  const { data, error } = await service.from("dealer_profiles")
    .select("seller_id,slug,business_name,admitted_at,public_room_enabled")
    .order("business_name");

  return (
    <main className="min-h-screen bg-[var(--ink)] px-6 py-8 text-[var(--platinum)]">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin" className="text-sm text-[var(--slate)]">← Marketplace Control</Link>
        <h1 className="mt-6 text-3xl">Dealer Rooms</h1>
        <p className="mt-3 text-[var(--slate)]">Dealer admission and public Dealer Room publication are separate. Control public access here; admitted Dealers keep their private workspace.</p>
        {error ? <p role="alert" className="mt-6 text-[var(--slate)]">Dealer Rooms could not be loaded. Reload to confirm publication state.</p>
          : !data?.length ? <p className="mt-6 text-[var(--slate)]">No admitted Dealers.</p>
          : <ul className="mt-8 divide-y divide-[var(--border-subtle)]">
            {data.map((dealer) => (
              <li key={dealer.seller_id} className="py-6">
                <h2 className="break-words text-xl">{dealer.business_name}</h2>
                <p className="mt-2 break-all text-sm text-[var(--slate)]">{dealer.slug}</p>
                <p className="mt-2 text-sm text-[var(--slate)]">Admitted Dealer · {new Date(dealer.admitted_at).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })}</p>
                <Link href={`/sellers/${dealer.slug}`} className="mt-3 inline-block text-sm text-[var(--slate)]">{dealer.public_room_enabled ? "View Dealer Room →" : "Preview Dealer Room →"}</Link>
                <DealerRoomPublicationControl sellerId={dealer.seller_id} enabled={dealer.public_room_enabled === true} />
              </li>
            ))}
          </ul>}
      </div>
    </main>
  );
}
