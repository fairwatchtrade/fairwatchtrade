import type { Metadata } from "next";
import { authRouteMetadata } from "@/lib/seo/routeMetadata";

/* /login is a client component and cannot export metadata, so this
   pass-through segment layout carries it: title, clean canonical (a
   ?callbackUrl= variant is navigation, not identity), noindex with links
   followable. Robots Readiness GRS-005/006; no rendering change. */

export const metadata: Metadata = authRouteMetadata("/login");

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
