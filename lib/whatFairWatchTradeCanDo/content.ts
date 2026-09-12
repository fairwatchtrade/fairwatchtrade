/* ════════════════════════════════════════════════════════════════════════
   WHAT CAN FAIRWATCHTRADE DO FOR ME? — the published copy
   lib/whatFairWatchTradeCanDo/content.ts

   THE MISCONCEPTION THIS FILE EXISTS TO KILL:

     "This is a feature list, so it can be updated whenever a feature ships."

   It is not a feature list. It is a governed public statement of what the
   product does TODAY, where it deliberately stops, and what is not
   available yet — with every row carrying a settled capability
   classification. The words were written and corrected through a review
   chain (language pass → display corrections → precision restorations →
   the founder's verbatim payment wording) and are held here verbatim. The
   component renders them and never edits them. A new capability is not
   added here by the builder who shipped it; it is added through the same
   review, because a public claim is a promise.

   CLASSIFICATIONS. `live` and `bounded` are the settled capability basis of
   the 55 ordinary benefit rows (26 live, 29 bounded). `bounded` is the
   INTERNAL class name; its visible label is "Available with limits" — see
   STATUS_LABELS. Tax Time is the one `coming` block and is deliberately
   separate from the ordinary rows. Never promote a bounded row to live here
   because the feature "works"; that is a classification ruling, not a copy
   edit.

   Verified mechanically by scripts/what-fairwatchtrade-can-do.test.mjs.
   ════════════════════════════════════════════════════════════════════════ */

export type BenefitStatus = "live" | "bounded";

export type Benefit = {
  status: BenefitStatus;
  title: string;
  /** Optional emphasized lead-in for a benefit whose approved copy has one. */
  lead?: string;
  body: string;
};

export type BenefitGroup = {
  heading: string;
  benefits: Benefit[];
  /** One optional emphasised callout under the group (Browse › Search). */
  feature?: { big: string; body: string };
};

export type RoomId = "browse" | "buy" | "sell" | "dealer";

export type Room = {
  id: RoomId;
  /** Chooser: the small word above the choice. */
  choiceKicker: string;
  /** Chooser: the choice itself, in the visitor's words. */
  choice: string;
  /** Room head. */
  kicker: string;
  heading: string;
  intro: string;
  groups: BenefitGroup[];
};

/** Visible labels. `bounded` is never shown as "Bounded" to the public. */
export const STATUS_LABELS: Readonly<Record<BenefitStatus, string>> = Object.freeze({
  live: "Live",
  bounded: "Available with limits",
});

export const COMING_LABEL = "Coming / In development";

export const ROOM_IDS: readonly RoomId[] = Object.freeze(["browse", "buy", "sell", "dealer"]);

export const PAGE_TITLE = "What Can FairWatchTrade Do For Me?";

export const HERO = Object.freeze({
  eyebrow: "Start with why you came",
  title: PAGE_TITLE,
  intro:
    "Choose what you came to do and see how FairWatchTrade can help today—including what it does not handle and what is still being built.",
});

const b = (status: BenefitStatus, title: string, body: string): Benefit => ({ status, title, body });

export const ROOMS: readonly Room[] = Object.freeze([
  {
    id: "browse",
    choiceKicker: "Explore",
    choice: "I want to browse watches",
    kicker: "Browse",
    heading: "Find the watch. Learn the watch. Keep the hunt intact.",
    intro:
      "Browse is for collectors who want to explore, inspect, and understand watches—and return to the hunt later—without being pushed to buy.",
    groups: [
      {
        heading: "Search",
        benefits: [
          b("live", "Exact reference and permanent listing-code search",
            "Search an exact manufacturer reference or permanent FWT listing code. If that exact watch is not here, FWT says so instead of swapping in a look-alike."),
          b("live", "Search and filters that work together",
            "Use search and watch-specific filters together, and see every filter you have applied. FWT understands some common collector terms, while exact references and listing codes take priority."),
          b("live", "Keep your place in Browse",
            "Share or reload a Browse search without losing it. Open a watch and return to the same search, filters, and view."),
        ],
        feature: {
          big: "Related stays related.",
          body: "If related watches are shown, they stay clearly labeled as related; none is presented as the exact reference or listing code you asked for.",
        },
      },
      {
        heading: "Explore",
        benefits: [
          b("live", "Explore by brand, family, variant, and reference",
            "Explore watchmaking by brand, collection, family, variant, and reference—even when a watch is not currently for sale. The Vault helps identify and explore references; it does not certify the authenticity of a particular watch."),
          b("live", "Vault Galaxy",
            "Wander the Vault as a galaxy of makers and references instead of starting with a rigid results grid. Search also recognizes some common collector-style maker names."),
          b("bounded", "Watch DNA quiz",
            "Use the Watch DNA quiz to put words around your collecting taste. It is a starting point for self-discovery, not a promise that FWT can pick the right watch for everyone."),
        ],
      },
      {
        heading: "Inspect",
        benefits: [
          b("live", "Reviewed before it goes live",
            "Every listing is reviewed before it appears in Browse. Its Curation Review shows what FWT could check and what still needs an answer. The review helps decide whether the listing can go live; it does not mean FWT physically inspected or authenticated the watch."),
          b("bounded", "Quick Specs and full-photo inspection",
            "Check the facts the listing actually provides, then open the full photographs for a closer look. Zoom only goes as far as the original photo allows—a blurry source does not become new detail."),
          /* Dial Reveal stays bounded because it needs a designated dial
             photograph and can only reveal detail the source actually holds. */
          b("bounded", "Dial Reveal",
            "Use Dial Reveal while exploring a listing to bring out printing, texture, and surface variation already present in the dial photograph. It changes how the existing photo is displayed; it does not add missing detail or sharpen a poor source."),
          b("bounded", "Specifications without guesswork",
            "See specifications, condition, and documentation as clear watch facts. If FWT cannot confirm something, it can simply leave it unconfirmed instead of guessing."),
          b("live", "Story, provenance, and Story Photo",
            "Read the individual watch’s story separately from its technical specifications, with a dedicated Story Photo when one adds real context. A provenance claim still needs support; a good story alone does not make it fact."),
        ],
      },
      {
        heading: "Remember / keep hunting",
        benefits: [
          b("bounded", "Saved Search",
            "Sign in to save the exact search you built and come back to it later. Saving the search preserves the hunt; it does not promise an alert or a close match FWT cannot support."),
          b("live", "Wanted / Looking For",
            "Looking for a watch that is not listed? Create a Wanted request while keeping your private budget ceiling out of the seller’s view."),
          b("bounded", "Find public FWT listings through compatible AI assistants",
            "Compatible AI assistants can search FWT’s public inventory and return the real listing link. If an attribute is not confirmed, it stays labeled that way instead of being presented as a match."),
        ],
      },
      {
        heading: "A calmer way to browse",
        benefits: [
          b("live", "Browse without hype or pressure",
            "Browse without unrelated ads, viewer counters, popularity badges, or fake urgency. FWT is built to keep your attention on the watch, not on crowd pressure."),
        ],
      },
    ],
  },
  {
    id: "buy",
    choiceKicker: "Consider",
    choice: "I might buy a watch",
    kicker: "Buy",
    heading: "Know what you are looking at before you decide.",
    intro:
      "A buyer can review the watch’s details and full set of listing photos, ask questions tied to that listing, and see what FWT does—and does not—handle today.",
    groups: [
      {
        heading: "Find the exact watch",
        benefits: [
          b("live", "Exact reference and permanent listing-code search",
            "Search an exact manufacturer reference or permanent FWT listing code. If FWT does not have it, it says so instead of quietly substituting something similar."),
        ],
      },
      {
        heading: "Know what you are looking at",
        benefits: [
          b("live", "Public Curation Review",
            "Every listing is reviewed before it goes public. Its Curation Review shows what FWT could check and what still needs an answer. That review is not a physical inspection or an authenticity certificate."),
          b("bounded", "Condition, documentation, and service history",
            "See the watch’s identity, condition, documentation, and disclosed service history separately—not folded into one sales pitch. If FWT does not know something, it leaves it unknown rather than treating it as ‘no.’"),
          b("live", "Individual-watch story and provenance",
            "Read this watch’s story separately from the facts about its reference, with a Story Photo when it adds meaningful context. Being shown on the page does not certify the story; provenance still needs support."),
          b("bounded", "Know who is selling",
            "See who is offering the watch without making every private seller broadly searchable. Seller identity stays with the listing and its FWT conversation; where available, dealer profiles can also show the business and its active FWT inventory."),
        ],
      },
      {
        heading: "Inspect the evidence",
        benefits: [
          b("bounded", "Full-photo inspection",
            "Inspect the seller’s full photographs without pretending a low-resolution image contains detail it never captured. Zoom can reveal what is there; it cannot create sharpness that was never photographed."),
          /* Dial Reveal public parity (2026-09-11): the buyer wording adds
             the authentication refusal; classification stays bounded. */
          b("bounded", "Dial Reveal",
            "Use Dial Reveal on the dial photograph to bring out printing, texture, and surface variation already present in the image. It changes how the existing photo is displayed; it does not add missing detail, sharpen a poor source, or authenticate the watch."),
        ],
      },
      {
        heading: "Talk and act on one exact watch",
        benefits: [
          b("live", "Conversation stays with the watch",
            "Ask the seller questions in a conversation tied to the exact listing and its permanent FWT code, so the watch and the discussion stay together."),
          b("bounded", "Purchase Request",
            "Send the seller an amount and message tied to the exact listing. A Purchase Request is not checkout: buyer and seller still arrange payment and hand-off directly, and FWT does not provide escrow or handle transaction disputes."),
          b("bounded", "Private Listing for a named buyer",
            "A seller can share a non-public listing with a named buyer instead of placing it in Browse. Private visibility is not the same thing as a reservation or completed deal."),
          b("bounded", "Watch-for-watch Trade offers",
            "Propose a watch-for-watch Trade with an optional recorded cash adjustment, separate movement of both watches, and receipt confirmations. FWT tracks the exchange, but today it does not move or escrow the cash adjustment."),
        ],
      },
      {
        heading: "Keep options open",
        benefits: [
          b("bounded", "Saved watches, Saved Search, and Wanted",
            "Save a watch, preserve a search, or create a Wanted request when the right example is not here yet. None of those actions reserves a watch or guarantees an alert or response."),
          b("live", "Take your time without pressure",
            "Decide from the watch and its evidence—not viewer counters, popularity badges, urgency meters, or unrelated ads. Less pressure is useful, but it is not the same thing as buyer protection."),
        ],
      },
    ],
  },
  {
    id: "sell",
    choiceKicker: "Move one along",
    choice: "I might sell once in a while",
    kicker: "Occasional seller",
    heading: "Sell one watch without becoming a dealer.",
    intro:
      "List one watch step by step, correct it after review, share it privately or trade it, and take it off the market when needed—without running a storefront.",
    groups: [
      {
        heading: "Create the listing",
        benefits: [
          b("live", "List a watch in five steps",
            "Sell one watch through five clear steps: Curation, Photos, Details, Description, and Review."),
          b("bounded", "Start on your phone, continue on another device",
            "Use the phone-friendly selling flow for photographs, then continue the same listing on another device."),
          b("bounded", "Autosave and saved drafts",
            "FWT saves an in-progress listing to your account, so an interruption does not erase your work. It also avoids creating an empty draft just because you opened Sell."),
          b("bounded", "Help identifying the watch",
            "FWT helps match your watch to its place in the reference catalogue before you write the listing. That can help identify what you have, but it does not authenticate the physical watch."),
          b("bounded", "Leave unknowns unknown",
            "If you do not know a specification, leave it unknown. FWT would rather show an honest gap than a guessed fact."),
          b("live", "Guided watch photos",
            "FWT guides you toward the watch photos buyers actually need, and a listing cannot go public without real photos of the watch."),
        ],
      },
      {
        heading: "Protect and present the watch honestly",
        benefits: [
          b("bounded", "Serial privacy and private service photos",
            "FWT provides a way to blur visible serials and keeps Service Evidence photographs out of the public gallery. You still review the images before submission."),
          b("live", "Story, provenance, and Story Photo",
            "Tell the individual watch’s story and add a dedicated Story Photo without burying that history inside the specifications."),
        ],
      },
      {
        heading: "Review, correct, and keep track of it",
        benefits: [
          b("live", "Reviewed before it goes live",
            "Every submitted listing is reviewed before it goes public. The review shows what cleared and what still needs attention."),
          b("live", "Fix and resubmit the same listing",
            "If the listing needs work, correct and resubmit the same record instead of creating the watch all over again."),
          b("bounded", "Track your listing from one place",
            "Track the listing in one seller room and keep the same permanent FWT code through review and correction. Important review and listing-status changes can also generate notices."),
        ],
      },
      {
        heading: "Choose how to sell—or take it off market",
        benefits: [
          b("bounded", "Private sale to a named buyer",
            "Already have a buyer? Use an existing FWT conversation to share a non-public listing instead of placing the watch in Browse."),
          b("bounded", "Watch-for-watch Trade option",
            "Open your listing to watch-for-watch Trade offers and use FWT’s two-leg exchange workflow. Any cash adjustment is recorded, not moved by FWT."),
          b("bounded", "Take a listing down or delete it permanently",
            "Remove takes a listing off the market but keeps its record. Permanent Delete is separate and may be unavailable while other active FWT activity still depends on the listing."),
        ],
      },
    ],
  },
  {
    id: "dealer",
    choiceKicker: "Operate",
    choice: "I’m a dealer",
    kicker: "Dealer",
    heading: "Run your inventory and client conversations in the same watch-first place.",
    intro:
      "Dealers get business identity, inventory organization, collector demand, and ways to handle purchase requests and trades—without lowering the standards every FWT listing has to meet.",
    groups: [
      {
        heading: "Identity and standards",
        benefits: [
          b("bounded", "Business name and logo",
            "Approved dealer accounts can operate under their business name and basic logo instead of presenting as a generic private seller."),
          b("bounded", "Public dealer profile and active inventory",
            "Where available, a public dealer profile can show the business and its active FWT inventory, so one listing can lead collectors to the dealer’s other watches. The current dealer profile is not yet a sold-history or reputation platform."),
          b("live", "Same listing standard for everyone",
            "Dealer inventory has to meet the same review and evidence standard as other FWT listings. Being a dealer does not make missing evidence disappear."),
          b("bounded", "Dealer statements stay attributed",
            "When a dealer makes a statement about a listing, FWT can record that it came from that dealer and when it was made. That records who said it; it does not authenticate the watch."),
        ],
      },
      {
        heading: "Manage inventory",
        benefits: [
          b("live", "Dealer access to the five-step SellFlow",
            "Add one watch through the same five clear steps: Curation, Photos, Details, Description, and Review."),
          {
            status: "live",
            title: "Dealer Accelerator",
            lead: "Already have your inventory online? Don’t build it again.",
            body: "Give FairWatchTrade your existing dealer inventory source. We prepare private draft listings from the work you have already done. You confirm the commercial truth. Nothing is published until you submit and FairWatchTrade reviews it.",
          },
          b("live", "Manage listings by status",
            "See your FWT listings grouped by their current status in one signed-in room, rather than opening each listing separately."),
          b("live", "Public inventory can be found through compatible AI assistants",
            "Compatible AI assistants can search your public FWT inventory and return the real FWT listing page. Unconfirmed details stay separate from confirmed matches."),
        ],
      },
      {
        heading: "Demand and client relationships",
        benefits: [
          b("live", "See what collectors are looking for",
            "See eligible Wanted requests from collectors looking for watches that are not currently listed. Their private budget ceiling stays private from the dealer."),
          b("bounded", "Private listings for individual clients",
            "Share a non-public listing with a buyer you are already speaking with instead of placing the watch in Browse. Private visibility is not a reservation or completed sale."),
          b("live", "Keep client conversations tied to each watch",
            "Keep each buyer conversation attached to the exact watch and permanent listing code, with unread messages easy to spot inside FWT."),
        ],
      },
      {
        heading: "Transactions",
        benefits: [
          b("bounded", "Structured watch-for-watch Trade",
            "Use a structured Trade workflow that tracks both watches separately and can record an agreed cash adjustment. Today, FWT records that adjustment but does not move the money."),
          b("bounded", "Purchase Requests stay tied to the listing",
            "Receive a Purchase Request with the proposed amount, message, and exact listing kept together. Today, buyer and seller still handle payment and hand-off directly."),
        ],
      },
    ],
  },
]);

/** The one COMING block. Separate from the ordinary rows on purpose; it
    renders at the end of the Dealer room. Reporting is not available. */
export const TAX_TIME = Object.freeze({
  heading: "Tax Time",
  status: COMING_LABEL,
  lead: "Reporting is not available yet.",
  body:
    "Tax Time is being built to organize completed FWT business, gross sales, FWT fees, refunds or adjustments, net proceeds, and transaction detail, with future PDF and CSV exports.",
  boundary:
    "Tax Time is being built to support record preparation. It is not tax advice, a tax filing service, an accounting system, a profit-and-loss engine, or an official tax-form generator.",
});

export type Refusal = { heading: string; body: string };

export const REFUSALS_SECTION = Object.freeze({
  eyebrow: "WHAT FWT WON’T FAKE",
  heading: "Where FairWatchTrade draws the line",
  lead:
    "Some of FairWatchTrade’s most useful safeguards are the things it refuses to fake: an answer it does not know, pressure you did not ask for, or protection it does not provide today.",
});

export const REFUSALS: readonly Refusal[] = Object.freeze([
  {
    heading: "No fake exact match.",
    body: "If an exact reference or listing code is absent, FWT says so instead of passing a related watch off as the answer.",
  },
  {
    heading: "Unknown stays unknown.",
    body: "If FWT does not know a watch fact, it can leave it unconfirmed instead of guessing.",
  },
  {
    heading: "Couldn’t check does not mean all clear.",
    body: "If a review check could not be completed, FWT says that. It does not turn an unanswered question into a clean bill of health, and review is not physical inspection or authentication.",
  },
  {
    heading: "No publication while review is blocked—or without watch photos.",
    body: "A listing stays out of Browse while a review issue blocks publication or it lacks real watch photos.",
  },
  {
    heading: "Private does not mean reserved.",
    body: "A private listing is visible only to its intended buyer, but visibility alone does not lock the watch or complete a deal.",
  },
  {
    heading: "No imaginary payment protection.",
    body: "Today, buyers and sellers arrange payment directly. FairWatchTrade does not currently hold escrow, provide buyer protection, or move Trade cash adjustments. If FWT offers a payment option in the future, its fees, protections, limits, and responsibilities will be stated explicitly.",
  },
  {
    heading: "Trade has clear rules, not blanket guarantees.",
    body: "When a Trade is accepted, FWT reserves both watches and tracks both sides through completion. It cannot prevent every conflict or automatically resolve every problem afterward.",
  },
  {
    heading: "No ads, crowd pressure, or fake urgency.",
    body: "FWT does not use viewer counts, popularity badges, or urgency tricks to make a watch seem more interesting.",
  },
]);

export const CLOSING = Object.freeze({
  heading: "Start where you actually are.",
  body:
    "Browse without buying. Ask questions before you commit. Sell an occasional watch without running a store. If you are a dealer, manage inventory and client conversations in one place.",
});

/** Real destinations with their normal signed-out / signed-in behaviour.
    The dealer path goes to the account workspace where dealer tools live;
    it grants nothing — a signed-out visitor meets the ordinary sign-in
    door, and dealer-only rooms keep their own server gates. */
export const CLOSING_PATHS: readonly { label: string; href: string }[] = Object.freeze([
  { label: "Browse watches", href: "/browse" },
  { label: "Sell a watch", href: "/sell" },
  { label: "Dealer workspace", href: "/account" },
]);

export const SPECIALTY = Object.freeze({
  lead: "FairWatchTrade’s specialty:",
  body:
    "Independent and boutique watchmakers are the heart of FairWatchTrade. Selected historic and collector-worthy references from larger manufacturers may also enter through stricter curation.",
});

/* ── Mechanical inventory helpers (used by the test and nothing else) ── */

export function allBenefits(): Benefit[] {
  return ROOMS.flatMap((r) => r.groups.flatMap((g) => g.benefits));
}

export function roomBenefitCount(id: RoomId): number {
  const room = ROOMS.find((r) => r.id === id);
  return room ? room.groups.reduce((n, g) => n + g.benefits.length, 0) : 0;
}
