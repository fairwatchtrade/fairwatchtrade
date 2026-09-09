import type { Metadata } from "next";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";

/* /account and every module and sub-route beneath it are a signed-in
   personal workspace — Listings, Settings, Tax Time, the account FAQ. This
   pass-through segment layout emits noindex for all of them at once. It
   renders nothing of its own and adds no gate: each page keeps its own
   auth redirect. Robots Readiness GRS-005. */

export const metadata: Metadata = privateRouteMetadata();

export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return children;
}
