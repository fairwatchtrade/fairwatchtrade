import type { CSSProperties, ReactNode } from "react";
import {
  DEAL_STATUS_LABELS,
  LEG_STATUS_LABELS,
  TRADE_STATUS_LABELS,
} from "@/lib/trade";
import { STATUS_LABELS, type WantedStatus } from "@/lib/wanted";
import {
  tradeStatePresentation,
  wantedStatePresentation,
  type StatePresentation,
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

/* Human SEE-it found the compact marker too faint in Daylight even though
   its glyphs technically cleared AA. Deepen only this badge's Light arm:
   the typed semantic source still owns the hue, while Dark resolves to the
  exact shipped text and line tokens. The neutral governance stops use a
  slightly quieter edge so an unruled state cannot outrank settled truth. */
function stateBadgeStyle(presentation: StatePresentation): CSSProperties {
  const lightText = `color-mix(in srgb, ${presentation.text} 65%, var(--platinum) 35%)`;
  const mappedLineShare = presentation.governance === "settled" ? 35 : 45;
  const lightLine = `color-mix(in srgb, ${presentation.line} ${mappedLineShare}%, ${lightText})`;

  return {
    color: `light-dark(${lightText}, ${presentation.text})`,
    borderColor: `light-dark(${lightLine}, ${presentation.line})`,
    backgroundColor: presentation.surface,
  };
}

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
      style={stateBadgeStyle(presentation)}
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
      style={stateBadgeStyle(presentation)}
      data-state-domain="wanted"
      data-state={status}
      data-state-governance={presentation.governance}
    >
      {label ?? STATUS_LABELS[status]}
    </span>
  );
}
