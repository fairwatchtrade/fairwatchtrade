import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountRail from "@/components/AccountRail";
import AccountSettings from "@/components/AccountSettings";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT SETTINGS — app/account/settings/page.tsx   (v3.21)

   Thin server wrapper. Auth guard: redirects to /login if no user (no flash —
   the guard runs before render). Passes user id + email to the client
   component, which owns all form state. Same pattern as app/account/page.tsx
   and app/sellers/[id]/page.tsx.

   v3.21 — Settings continuity (v3 rail order §6.2): the page now mounts the
   persistent AccountRail beside the form, so /account/settings reads as
   Account → Settings, never an orphaned standalone form. Settings is the
   rail's active destination; module items link back into the workspace. The
   rail fetches its own badge truth here (the same established reads —
   order §4). AccountSettings' form internals are untouched (Layout's scope
   boundary); it keeps its own heading and centered column inside the
   remaining width. The rail hides itself below md — mobile is unchanged.
   ──────────────────────────────────────────────────────────────────────── */

export default async function AccountSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="flex min-h-screen bg-[var(--ink)]">
      <AccountRail
        surface="settings"
        marketplaceControl={user.id === "77a6893a-54fe-4373-9bf7-3327d0ba69cf"}
      />
      <div className="min-w-0 flex-1">
        <AccountSettings
          userId={user.id}
          email={user.email ?? ""}
          createdAt={user.created_at ?? ""}
        />
      </div>
    </div>
  );
}
