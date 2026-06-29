import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AccountSettings from "@/components/AccountSettings";

/* ────────────────────────────────────────────────────────────────────────
   ACCOUNT SETTINGS — app/account/settings/page.tsx   (v1.68)

   Thin server wrapper. Auth guard: redirects to /login if no user (no flash —
   the guard runs before render). Passes user id + email to the client
   component, which owns all form state. Same pattern as app/account/page.tsx
   and app/sellers/[id]/page.tsx.

   NOTE: assumes `@/lib/supabase/server` exposes `createClient()` (the SSR
   pattern used by the other server pages). Adjust only this import + call if
   the project's server helper differs.
   ──────────────────────────────────────────────────────────────────────── */

export default async function AccountSettingsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <AccountSettings
      userId={user.id}
      email={user.email ?? ""}
      createdAt={user.created_at ?? ""}
    />
  );
}
