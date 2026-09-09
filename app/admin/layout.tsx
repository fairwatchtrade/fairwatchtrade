import type { Metadata } from "next";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";

/* Every /admin/* room is founder-only. This pass-through segment layout
   emits noindex for all of them at once — a new admin page inherits it
   without remembering to. It renders nothing of its own and adds no gate:
   each room keeps its own server-side founder check. Robots Readiness
   GRS-005. */

export const metadata: Metadata = privateRouteMetadata();

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
