import type { Metadata } from "next";
import { authRouteMetadata } from "@/lib/seo/routeMetadata";

/* /signup is a client component and cannot export metadata, so this
   pass-through segment layout carries it: title, clean canonical, noindex
   with links followable. Robots Readiness GRS-005/006; no rendering change. */

export const metadata: Metadata = authRouteMetadata("/signup");

export default function SignupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
