import type { Metadata } from "next";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";

/* /internal/* is founder tooling. This pass-through segment layout emits
   noindex for every page beneath it; the one existing page already
   declares its own stricter directive and keeps it (the page segment
   wins). Robots Readiness GRS-005. */

export const metadata: Metadata = privateRouteMetadata();

export default function InternalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
