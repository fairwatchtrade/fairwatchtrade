import type { Metadata } from "next";
import { privateRouteMetadata } from "@/lib/seo/routeMetadata";

/* /reset-password is the recovery landing (client component): a personal
   action surface reached from an emailed link, never a public resource.
   Noindex, no canonical. Robots Readiness GRS-005. */

export const metadata: Metadata = privateRouteMetadata();

export default function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  return children;
}
