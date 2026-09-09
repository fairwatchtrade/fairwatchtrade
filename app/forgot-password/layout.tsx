import type { Metadata } from "next";
import { authRouteMetadata } from "@/lib/seo/routeMetadata";

/* /forgot-password is a client component and cannot export metadata, so
   this pass-through segment layout carries it: title, clean canonical,
   noindex with links followable. Robots Readiness GRS-005/006. */

export const metadata: Metadata = authRouteMetadata("/forgot-password");

export default function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
