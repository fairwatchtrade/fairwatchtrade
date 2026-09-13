import type { Metadata } from "next";
import { redirect } from "next/navigation";

/* Preserve the reviewed /internal gallery doorway while ensuring the actual
   fixture renders under the one lawful route-family data-admin-dark owner. */
export const metadata: Metadata = {
  title: "LS-2 Admin Status Parity Gallery",
  robots: { index: false, follow: false, nocache: true },
};

export default function AdminStatusParityGalleryDoorway() {
  redirect("/admin/internal/ls2-admin-status-parity-gallery");
}
