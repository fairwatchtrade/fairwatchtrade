import { redirect } from "next/navigation";

export default function OldDashboardRedirect() {
  redirect("/catalogue");
}
