"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { parsePrice } from "@/lib/parsePrice";
import {
  classifyPurchaseResponse,
  draftKeyFor,
  type PurchaseRequestOutcome,
} from "@/lib/purchaseRequest";

/* ────────────────────────────────────────────────────────────────────────
   THE PURCHASE REQUEST CONTROLLER.

   One form-state model, one validator, one POST, one error taxonomy —
   shared by the dedicated route, the desktop right-rail expansion, and the
   narrow-desktop inline section. A surface decides where the form is drawn
   and nothing else; none of them may submit on their own.

   DRAFT PRESERVATION comes in two modes, because the surfaces need
   genuinely different things:

     · "handoff" — the dedicated route's shipped behaviour, unchanged: the
       draft is written only when a 401 sends the buyer to sign in, restored
       once on return, then removed. Nothing is persisted while typing.

     · "live" — the listing-page surfaces, where the collector is expected to
       close the form, open the Collector's Drawer, study the watch, and come
       back. The draft follows every keystroke so it survives the form being
       closed and unmounted, and is cleared on success.

   Both are session-scoped and listing-scoped, so a draft never carries into
   an unrelated listing, an unrelated session, or unrelated navigation.
   ──────────────────────────────────────────────────────────────────────── */

export type PurchaseRequestListing = {
  id: string;
  askingPrice: number;
  /** Null until the founder attestation records it. Never assumed to be USD. */
  askingCurrency: string | null;
};

export type PurchaseRequestView = "form" | "success" | "expired" | "unavailable" | "changed";

export type DraftMode = "handoff" | "live";

function readDraft(key: string): { offer?: string; message?: string } | null {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? (JSON.parse(raw) as { offer?: string; message?: string }) : null;
  } catch {
    return null;
  }
}

export function usePurchaseRequest(
  listing: PurchaseRequestListing,
  draftMode: DraftMode = "handoff"
) {
  const [offer, setOffer] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PurchaseRequestView>("form");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [changed, setChanged] = useState<{ old: number; current: number } | null>(null);
  const [submittedOffer, setSubmittedOffer] = useState<number | null>(null);
  const offerRef = useRef<HTMLInputElement>(null);

  const focusOffer = useCallback(() => {
    const visibleOffer = Array.from(
      document.querySelectorAll<HTMLInputElement>("[data-purchase-offer-for]")
    ).find(
      (input) =>
        input.dataset.purchaseOfferFor === listing.id &&
        input.getClientRects().length > 0
    );
    (visibleOffer ?? offerRef.current)?.focus();
  }, [listing.id]);

  const draftKey = draftKeyFor(listing.id);

  /* One-time hydration from sessionStorage — readable only on the client, and
     the exact "synchronise from an external system" case the set-state rule
     is meant to allow. In handoff mode the draft is consumed; in live mode it
     is left in place so a later remount finds it again. */
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const d = readDraft(draftKey);
    if (!d) return;
    if (d.offer) setOffer(d.offer);
    if (d.message) setMessage(d.message);
    if (draftMode === "handoff") {
      try {
        sessionStorage.removeItem(draftKey);
      } catch {
        /* nothing to clear */
      }
    }
  }, [draftKey, draftMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const persistDraft = useCallback(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ offer, message }));
    } catch {
      /* preservation is best-effort */
    }
  }, [draftKey, offer, message]);

  const clearDraft = useCallback(() => {
    try {
      sessionStorage.removeItem(draftKey);
    } catch {
      /* nothing to clear */
    }
  }, [draftKey]);

  /* Re-read the stored draft on demand.
     The listing page mounts BOTH in-page surfaces at once and lets the
     breakpoint hide one, so the hidden instance runs its mount-time restore
     while storage is still empty and would otherwise never look again — a
     collector who typed an offer in the rail and then narrowed the window
     met an empty field, even though their text was safely stored. Opening a
     surface asks for the draft again. It never overwrites text already in
     hand: only empty fields are filled. */
  const restoreDraft = useCallback(() => {
    const d = readDraft(draftKey);
    if (!d) return;
    setOffer((cur) => (cur === "" && d.offer ? d.offer : cur));
    setMessage((cur) => (cur === "" && d.message ? d.message : cur));
  }, [draftKey]);

  /* Live mode: the draft trails what has been typed, so closing the form —
     or losing it to an unmount — never costs the collector their work. */
  useEffect(() => {
    if (draftMode !== "live") return;
    if (offer === "" && message === "") return;
    persistDraft();
  }, [draftMode, offer, message, persistDraft]);

  const parsed = parsePrice(offer, listing.askingCurrency);
  const invalidOffer = offer.trim() !== "" && !parsed.ok;
  const showOfferError = fieldError !== null || invalidOffer;
  const parserMessage = parsed.ok
    ? null
    : parsed.reason === "empty"
      ? "Enter your offer."
      : parsed.message;
  const offerErrorText = fieldError ?? parserMessage ?? "Enter your offer.";

  const apply = useCallback(
    (outcome: PurchaseRequestOutcome) => {
      switch (outcome.kind) {
        case "success":
          setSubmittedOffer(outcome.proposedPurchasePrice);
          setView("success");
          clearDraft();
          return;
        case "expired":
          persistDraft();
          setView("expired");
          return;
        case "unavailable":
          setView("unavailable");
          return;
        case "changed":
          setChanged({ old: outcome.old, current: outcome.current });
          setView("changed");
          return;
        case "form_error":
          setFormError(outcome.detail);
          return;
        case "field_error":
          setFieldError(outcome.detail);
          focusOffer();
          return;
      }
    },
    [clearDraft, focusOffer, persistDraft]
  );

  const submit = useCallback(async () => {
    setFieldError(null);
    setFormError(null);
    const p = parsePrice(offer, listing.askingCurrency);
    if (!p.ok) {
      setFieldError(p.reason === "empty" ? "Enter your offer." : p.message);
      focusOffer();
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/purchase-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listingId: listing.id,
          proposedPurchasePrice: p.amount,
          notes: message.trim() || undefined,
          // Non-authoritative: lets the server detect a mid-session asking change.
          displayedAskingPrice: listing.askingPrice,
        }),
      });
      const data = res.status === 401 ? null : await res.json().catch(() => null);
      apply(classifyPurchaseResponse(res.status, data, p.amount));
    } catch {
      setFormError("Something went wrong sending your request. Please try again.");
    } finally {
      setBusy(false);
    }
  }, [apply, focusOffer, listing.askingCurrency, listing.askingPrice, listing.id, message, offer]);

  const keepEditing = useCallback(() => {
    setChanged(null);
    setView("form");
  }, []);

  return {
    offer,
    setOffer,
    message,
    setMessage,
    busy,
    view,
    fieldError,
    formError,
    changed,
    submittedOffer,
    offerRef,
    parsed,
    showOfferError,
    offerErrorText,
    submit,
    keepEditing,
    persistDraft,
    clearDraft,
    restoreDraft,
  };
}
