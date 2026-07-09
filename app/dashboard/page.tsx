import { redirect } from "next/navigation";

// v2.5c — cosmetic rename only (was OldDashboardRedirect). The redirect
// itself was already live and correct before this change — the July 6
// restore-note claim that this "never actually committed" was wrong.
export default function DashboardPage() {
  redirect("/catalogue");
}
