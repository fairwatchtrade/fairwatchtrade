import type { DealStatus, LegStatus, TradeStatus } from "./trade.ts";
import type { WantedStatus } from "./wanted.ts";

/* Trade + Wanted state presentation, and nothing broader.

   These maps deliberately reuse the existing lifecycle palette without
   turning it into a universal status framework. The state label always
   renders on --surface: the light arm of --lc-published-badge is truthful
   green but misses the 4.5:1 small-text floor on --ink by a narrow margin;
   on the governed badge surface it clears in both appearances.

   A leg may describe one watch in motion. It never speaks for the whole
   deal, and its badge stays subordinate to the deal-level heading. */

export type StatePresentation = {
  governance: "settled" | "pending";
  meaning:
    | "open"
    | "committed"
    | "operational"
    | "complete"
    | "adverse"
    | "terminal-neutral"
    | "incomplete"
    | "live"
    | "engagement"
    | "held"
    | "unruled";
  text: string;
  line: string;
  surface: "var(--surface)";
};

const state = (
  meaning: StatePresentation["meaning"],
  text: string,
  line: string,
  governance: StatePresentation["governance"] = "settled",
): StatePresentation => ({ governance, meaning, text, line, surface: "var(--surface)" });

export const TRADE_OFFER_STATE_PRESENTATION = {
  pending: state("open", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"),
  /* Accepted means the agreement is committed, not physically completed. */
  accepted: state("committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"),
  declined: state("adverse", "var(--lc-rejected-badge)", "var(--lc-rejected-line)"),
  superseded: state("terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"),
  withdrawn: state("terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"),
} satisfies Record<TradeStatus, StatePresentation>;

export const DEAL_STATE_PRESENTATION = {
  pending: state("committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"),
  settling: state("operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"),
  completed: state("complete", "var(--lc-published-badge)", "var(--lc-published-line)"),
  /* Cancellation is terminal, but current law does not rule it adverse.
     Keep the word readable and the color neutral until that meaning exists. */
  cancelled: state("unruled", "var(--platinum-dim)", "var(--lc-neutral-line)", "pending"),
} satisfies Record<DealStatus, StatePresentation>;

export const LEG_STATE_PRESENTATION = {
  bound: state("committed", "var(--lc-reserved-badge)", "var(--lc-reserved-line)"),
  in_transit: state("operational", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"),
  /* Both words exist in the schema and label vocabulary, but current HEAD
     has no producer for either transition. Neutral, readable rendering is
     intentional; a future truth ruling must precede a semantic color. */
  delivered: state("unruled", "var(--platinum-dim)", "var(--lc-neutral-line)", "pending"),
  verified: state("unruled", "var(--platinum-dim)", "var(--lc-neutral-line)", "pending"),
  transferred: state("complete", "var(--lc-published-badge)", "var(--lc-published-line)"),
  cancelled: state("unruled", "var(--platinum-dim)", "var(--lc-neutral-line)", "pending"),
} satisfies Record<LegStatus, StatePresentation>;

export const WANTED_STATE_PRESENTATION = {
  draft: state("incomplete", "var(--lc-draft-badge)", "var(--lc-draft-line)"),
  active: state("live", "var(--lc-published-badge)", "var(--lc-published-line)"),
  /* An answer is engagement, not acquisition or success. */
  answered: state("engagement", "var(--lc-private_active-badge)", "var(--lc-private_active-line)"),
  paused: state("held", "var(--lc-pending_review-badge)", "var(--lc-pending_review-line)"),
  closed: state("terminal-neutral", "var(--lc-removed-badge)", "var(--lc-removed-line)"),
} satisfies Record<WantedStatus, StatePresentation>;

export type TradeStateInput =
  | { kind: "offer"; status: TradeStatus }
  | { kind: "deal"; status: DealStatus }
  | { kind: "leg"; status: LegStatus };

export function tradeStatePresentation(input: TradeStateInput): StatePresentation {
  switch (input.kind) {
    case "offer":
      return TRADE_OFFER_STATE_PRESENTATION[input.status];
    case "deal":
      return DEAL_STATE_PRESENTATION[input.status];
    case "leg":
      return LEG_STATE_PRESENTATION[input.status];
  }
}

export function wantedStatePresentation(status: WantedStatus): StatePresentation {
  return WANTED_STATE_PRESENTATION[status];
}

/* One presentation for every seller-visible fit word. Deliberately not a
   map: within, near, outside and absence may never become good/bad colors. */
export const WANTED_BUDGET_FIT_PRESENTATION = {
  governance: "advisory-privacy",
  meaning: "coarse-projection",
  text: "var(--muted)",
} as const;
export const wantedBudgetFitPresentation = WANTED_BUDGET_FIT_PRESENTATION;

/* Cash is consideration recorded in the deal, not an outcome. */
export const TRADE_CASH_PRESENTATION = {
  governance: "factual",
  meaning: "consideration",
  text: "var(--platinum-dim)",
} as const;
export const tradeCashPresentation = TRADE_CASH_PRESENTATION;
