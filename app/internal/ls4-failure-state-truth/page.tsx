import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Ls4FailureStateTruthFixture from "@/components/Ls4FailureStateTruthFixture";

export const metadata: Metadata = {
  title: "LS-4 Failure-State Truth Fixture",
  robots: { index: false, follow: false, nocache: true },
};

/* This route is deliberately absent as a usable production room. It exists
   only while `next dev` runs, where Chromium intercepts every state-bearing
   request. A production request is redirected before the client fixture can
   mount or issue GET/POST/PATCH traffic. */
export default function Ls4FailureStateTruthFixturePage() {
  if (process.env.NODE_ENV !== "development") redirect("/");
  return <Ls4FailureStateTruthFixture />;
}
