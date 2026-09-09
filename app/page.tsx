import type { Metadata } from "next";
import CurrentHomepage from "@/components/CurrentHomepage";
import { homeMetadata } from "@/lib/seo/routeMetadata";

/* ────────────────────────────────────────────────────────────────────────
   HOMEPAGE — /  (server wrapper)

   Robots Readiness GRS-005/006: the page needed a canonical, and a client
   component cannot export metadata, so the homepage body moved verbatim to
   components/CurrentHomepage.tsx (the ticking clock keeps it a client
   component) and this thin server wrapper declares the clean identity. The
   governed title and specialty description stay in app/layout.tsx and are
   inherited unchanged — nothing about the rendered page moved or changed.

   components/HomepageClient.tsx is a DIFFERENT file: the staged future
   homepage rendered by marketplace/page.tsx outside app/, not routed.
   ──────────────────────────────────────────────────────────────────────── */

export const metadata: Metadata = homeMetadata();

export default function Home() {
  return <CurrentHomepage />;
}
