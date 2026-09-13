import type { ReactNode } from "react";
import {
  DEAL_STATUS_LABELS,
  LEG_STATUS_LABELS,
  TRADE_STATUS_LABELS,
} from "@/lib/trade";
import { STATUS_LABELS, type WantedStatus } from "@/lib/wanted";
import {
  tradeStatePresentation,
  wantedStatePresentation,
  type TradeStateInput,
} from "@/lib/tradeWantedStatePresentation";

/* The only shared renderer introduced by this flight. It is intentionally
   Trade/Wanted-specific: no global status framework and no string matching.
   The explicit label remains the primary carrier; color is redundant
   semantic reinforcement. */

type SharedProps = {
  className?: string;
  label?: ReactNode;
};

type TradeStateBadgeProps = SharedProps & TradeStateInput;

function tradeLabel(input: TradeStateInput): string {
  switch (input.kind) {
    case "offer":
      return TRADE_STATUS_LABELS[input.status];
    case "deal":
      return DEAL_STATUS_LABELS[input.status];
    case "leg":
      return LEG_STATUS_LABELS[input.status];
  }
}

export function TradeStateBadge(props: TradeStateBadgeProps) {
  const presentation = tradeStatePresentation(props);
  return (
    <span
      className={`fw-lifecycle-label inline-flex border px-2 py-1 uppercase ${props.className ?? ""}`}
      style={{
        color: presentation.text,
        borderColor: presentation.line,
        backgroundColor: presentation.surface,
      }}
      data-state-domain={`trade-${props.kind}`}
      data-state={props.status}
      data-state-governance={presentation.governance}
    >
      {props.label ?? tradeLabel(props)}
    </span>
  );
}

export function WantedStateBadge({
  status,
  className,
  label,
}: SharedProps & { status: WantedStatus }) {
  const presentation = wantedStatePresentation(status);
  return (
    <span
      className={`fw-lifecycle-label inline-flex border px-2 py-1 uppercase ${className ?? ""}`}
      style={{
        color: presentation.text,
        borderColor: presentation.line,
        backgroundColor: presentation.surface,
      }}
      data-state-domain="wanted"
      data-state={status}
      data-state-governance={presentation.governance}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
