import type { CSSProperties, ReactNode } from "react";
import {
  acceptedPurchaseStatePresentation,
  type AcceptedPurchaseStateInput,
  type AcceptedPurchaseStatePresentation,
} from "@/lib/payments/acceptedPurchaseStatePresentation";

/* The real state renderer shared by Shopping Bag, Buyer Purchases and the
   founder fixture gallery. Copy and actions stay with their owning surfaces;
   this component owns only axis-qualified semantic color. */

function markerStyle(presentation: AcceptedPurchaseStatePresentation): CSSProperties {
  /* State markers are compact 11px functional text. Match the shipped LS-2
     daylight treatment without altering global tokens; Dark resolves to the
     exact governed token arm. */
  const lightHue = `color-mix(in srgb, ${presentation.text} 65%, var(--platinum) 35%)`;
  const lightText = `color-mix(in srgb, ${lightHue} 85%, black 15%)`;
  return { color: `light-dark(${lightText}, ${presentation.text})` };
}

export function AcceptedPurchaseStateMarker({
  input,
  children,
  className,
}: {
  input: AcceptedPurchaseStateInput;
  children: ReactNode;
  className?: string;
}) {
  const presentation = acceptedPurchaseStatePresentation(input);
  return (
    <span
      className={className}
      style={markerStyle(presentation)}
      data-payment-state-axis={presentation.axis}
      data-payment-state={presentation.state}
      data-payment-state-context={presentation.context}
      data-payment-state-governance={presentation.governance}
      data-payment-state-meaning={presentation.meaning}
    >
      {children}
    </span>
  );
}
