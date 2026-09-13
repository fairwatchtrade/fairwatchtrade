import type { Metadata } from "next";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";

/* Every /admin/* room is founder-only. This segment layout emits noindex for
   all of them at once and owns the route family's permanent-dark appearance.
   The display:contents wrapper is an appearance scope only: it creates no
   layout box and adds no authorization gate. Each room keeps its own
   server-side founder check. Robots Readiness GRS-005. */

export const metadata: Metadata = privateRouteMetadata();

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div data-admin-dark="" style={{ display: "contents" }}>
      {children}
    </div>
  );
}
