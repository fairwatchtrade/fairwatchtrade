import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Ls5ResponsiveActionGeographyFixture from "@/components/Ls5ResponsiveActionGeographyFixture";

export const metadata: Metadata = {
  title: "LS-5 Responsive Action Geography Fixture",
  robots: { index: false, follow: false, nocache: true },
};

/* Geometry proof equipment only. Production redirects before the real owner
   components mount, so the fixture cannot become an admin room or issue any
   state-bearing request outside `next dev`. */
export default function Ls5ResponsiveActionGeographyFixturePage() {
  if (process.env.NODE_ENV !== "development") redirect("/");
  return <Ls5ResponsiveActionGeographyFixture />;
}
