/* ════════════════════════════════════════════════════════════════════════
   FAQ CONTENT — lib/faq/faqContent.ts

   THE PUBLISHED CUSTOMER COPY. This is the real thing, not a fixture: the
   questions and answers below are Jason's authoritative FAQ wording, carried
   through exactly as written.

   GENERATED, NOT TRANSCRIBED. The source markdown carries characters that are
   invisible in an editor but meaningful on the page — no-break spaces, narrow
   no-break spaces, and non-breaking hyphens — plus curly quotes and em dashes.
   Typing this by hand would have quietly replaced them with ASCII lookalikes,
   so every string here was emitted from the source file and every non-ASCII
   codepoint is written as an explicit \u escape. Anyone editing this file
   should change the source wording first, not these strings.

   Inline markers are the source's own and are rendered, never stripped:
     **bold**            → emphasis
     *italic*            → emphasis, including the *Planned:* labels
     a newline           → a hard line break the copy asked for

   "Planned:" means the answer describes intended behaviour that is not live
   yet. It is part of the approved wording and must not be removed or softened.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export interface FaqQuestion {
  id: string;
  question: string;
  answer: string;
}

export interface FaqSubject {
  id: string;
  label: string;
  questions: FaqQuestion[];
}

export const FAQ_SUBJECTS: FaqSubject[] = [
  {
    id: "buying",
    label: "Buying",
    questions: [
      {
        id: "buying-0",
        question:
          "Do I need an account to browse?",
        answer:
          "No. Anyone can browse listings. An account is required only to save searches, message a seller or submit a purchase request.",
      },
      {
        id: "buying-1",
        question:
          "How do I find a watch?",
        answer:
          "Browse freely, or search by reference number, brand, or listing code. Exact identity wins; keyword similarity comes second.",
      },
      {
        id: "buying-2",
        question:
          "What does a listing code look like, and is it unique?",
        answer:
          "Every listing has a permanent code in the form **[letter][5\u202fdigits]** (for example\u00a0*k26573*). A code is never reused. *Planned:* once the sold\u2011listing archive is live the code will link to that permanent record.",
      },
      {
        id: "buying-3",
        question:
          "Can I save a search and get alerts?",
        answer:
          "Saved searches preserve your criteria today. *Planned:* optional notifications will be available once enabled.",
      },
      {
        id: "buying-4",
        question:
          "How do I make an offer?",
        answer:
          "Submit a purchase request from the listing. The seller can accept, decline or counter.",
      },
      {
        id: "buying-5",
        question:
          "What happens after my offer is accepted?",
        answer:
          "The listing moves to **Sale\u202fPending** and closes to new offers. Buyer and seller handle payment and hand\u2011off directly.",
      },
      {
        id: "buying-6",
        question:
          "Does FairWatchTrade offer buyer protection or escrow?",
        answer:
          "Not at this time.",
      },
      {
        id: "buying-7",
        question:
          "Can I see auction comps?",
        answer:
          "For some references, a Market Evidence panel shows verified auction results. It appears only when FairWatchTrade has an exact reference match.",
      },
    ],
  },
  {
    id: "selling",
    label: "Selling",
    questions: [
      {
        id: "selling-0",
        question:
          "How do I list a watch?",
        answer:
          "Use the **Sell** flow to enter details, upload photos, set a price and submit the listing for review.",
      },
      {
        id: "selling-1",
        question:
          "Does my listing go live right away?",
        answer:
          "No. Every submission is reviewed before it appears in Browse. Once approved, the listing will go live on the marketplace.",
      },
      {
        id: "selling-2",
        question:
          "What happens if my listing is rejected?",
        answer:
          "Every listing receives a review decision. A future update will add the reviewer\u2019s reason\u2014and a way to resubmit after corrections\u2014directly in the seller dashboard.",
      },
      {
        id: "selling-3",
        question:
          "Is there a fee to sell?",
        answer:
          "Yes\u202f\u2014\u202fa flat **5\u202f% fee on completed sales**. No listing fee.",
      },
      {
        id: "selling-4",
        question:
          "Do I need the box and papers?",
        answer:
          "It depends on the watch. For Rolex and Tudor, papers are required, but the box is optional\u2014and more original documentation always helps.",
      },
    ],
  },
  {
    id: "payments",
    label: "Payments\u00a0&\u00a0Transactions",
    questions: [
      {
        id: "payments-0",
        question:
          "Does FairWatchTrade process payments?",
        answer:
          "No. Buyer and seller arrange payment directly.",
      },
      {
        id: "payments-1",
        question:
          "Does FairWatchTrade hold funds in escrow?",
        answer:
          "No.",
      },
      {
        id: "payments-2",
        question:
          "Who handles shipping and insurance?",
        answer:
          "*Planned:* We are currently working on a formal shipping and insurance policy. Until we are able to bring it live, the buyer and seller will need to arrange shipping and insurance themselves.",
      },
    ],
  },
  {
    id: "listings",
    label: "Listings\u00a0&\u00a0Review",
    questions: [
      {
        id: "listings-0",
        question:
          "What does \u201cPending\u00a0Review\u201d mean?",
        answer:
          "Your listing was received and is waiting for review before it can go public.",
      },
      {
        id: "listings-1",
        question:
          "Who reviews listings?",
        answer:
          "Every listing is reviewed by FairWatchTrade before publication.",
      },
      {
        id: "listings-2",
        question:
          "What does \u201cSale\u00a0Pending\u201d mean?",
        answer:
          "A purchase request was accepted; the listing is reserved and closed to new offers.",
      },
    ],
  },
  {
    id: "trust",
    label: "Trust\u00a0&\u00a0Verification",
    questions: [
      {
        id: "trust-0",
        question:
          "How does FairWatchTrade verify authenticity?",
        answer:
          "Every listing is reviewed before publication, but sellers remain responsible for representing their watches accurately. FairWatchTrade does not provide independent third-party authentication.",
      },
      {
        id: "trust-1",
        question:
          "Does the platform detect duplicate photos?",
        answer:
          "Yes. Exact photo matches are recorded across listings as evidence for review; matches do not automatically block a listing.",
      },
      {
        id: "trust-2",
        question:
          "What is the Market Evidence panel?",
        answer:
          "Where available, Market Evidence shows verified auction results for the exact reference, helping collectors compare real historical sales without turning estimates or asking prices into facts.",
      },
      {
        id: "trust-3",
        question:
          "Are Rolex and Tudor admitted?",
        answer:
          "Rolex listings must pass a stricter evidence review; not every submission is accepted.\n*Planned:* selective Tudor admission is settled product policy but not yet live in production.",
      },
    ],
  },
  {
    id: "dealers",
    label: "Dealers",
    questions: [
      {
        id: "dealers-0",
        question:
          "Is there a dealer program?",
        answer:
          "Yes. Dealer inventory infrastructure is already in place. Direct dealer self-service will be added later.",
      },
    ],
  },
  {
    id: "account",
    label: "Account\u00a0&\u00a0Privacy",
    questions: [
      {
        id: "account-0",
        question:
          "Does FairWatchTrade sell my data or run ads?",
        answer:
          "No. FairWatchTrade does not sell your data or run ads. The marketplace is built around collectors and transactions, not monetizing your attention.",
      },
      {
        id: "account-1",
        question:
          "How do I delete my account?",
        answer:
          "Self-service account deletion is coming to Account Settings. Until then, account deletion is not available directly through the site.",
      },
    ],
  },
];
