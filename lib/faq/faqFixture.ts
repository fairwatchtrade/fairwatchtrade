/* ════════════════════════════════════════════════════════════════════════
   FAQ IMPLEMENTATION FIXTURE — lib/faq/faqFixture.ts

   NOT CUSTOMER COPY. This file exists to prove the FAQ shell — subject
   switching, accordions, cross-subject search, the reading measure — and
   nothing else.

   THE ANSWERS HERE ARE DELIBERATELY NOT ANSWERS.

   The accepted HTML mockup carried answers produced by mechanically
   stripping labels out of the internal FAQ master. Those fragments still
   contained drafting instructions, and one of them still carried an internal
   register heading verbatim — exactly the material the implementation brief
   forbids from reaching customer UI. (The specific strings are deliberately
   not reproduced here: this file is bundled to the browser.) Cleaning them up
   was never an option: the brief is explicit that mechanically transformed
   internal prose must not be published, and that customer copy is written
   deliberately AFTER truth closure.

   So every answer below is a visibly non-authoritative placeholder. Each one
   says so in its own words, and the room stamps a fixture notice on every
   answer it renders. When approved customer copy arrives, only `answer`
   values change — the shell does not.

   The QUESTIONS are the accepted shell's questions and are carried through
   verbatim (minus HTML entity encoding). They are what the subject rail's
   counts and the search behaviour are measured against.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** Rendered beside every fixture answer so no reader can mistake one for a
    published FairWatchTrade answer. */
export const FIXTURE_NOTICE = "Answer not yet published";

export interface FaqQuestion {
  id: string;
  question: string;
  answer: string;
}

export interface FaqSubject {
  id: string;
  label: string;
  /** Plain-language stand-in used by the placeholder bodies, so answer text
      differs per subject and cross-subject search is actually provable. */
  topic: string;
  questions: FaqQuestion[];
}

/** One placeholder body, varied by subject. Long enough that the 780px
    reading cap is visible on a wide monitor, which is the whole point of
    having fixture prose at all. */
function placeholder(topic: string): string {
  return (
    `The published answer to this question has not been written yet. This paragraph is ` +
    `layout fixture text — it exists so the FAQ shell can be measured and tested, and it ` +
    `will be replaced in full once the customer wording for ${topic} is approved. Nothing ` +
    `here states FairWatchTrade's position, and nothing here should be relied on.`
  );
}

function subject(id: string, label: string, topic: string, questions: string[]): FaqSubject {
  return {
    id,
    label,
    topic,
    questions: questions.map((question, i) => ({
      id: `${id}-${i}`,
      question,
      answer: placeholder(topic),
    })),
  };
}

export const FAQ_SUBJECTS: FaqSubject[] = [
  subject("buying", "Buying", "buying on FairWatchTrade", [
    "Do I need an account to browse?",
    "How do I find a watch?",
    "What does a listing code look like, and does it always point to the same watch?",
    "Can I save a search and get notified about new matches?",
    "How do I make an offer on a watch?",
    "What happens after my offer is accepted?",
    "Does FairWatchTrade offer buyer protection, escrow, or a money-back guarantee?",
    "Can I see auction comp data for a watch I'm considering?",
    "Is every watch authenticated before it's listed?",
    "What currencies can I buy in?",
  ]),
  subject("selling", "Selling", "selling on FairWatchTrade", [
    "How do I list a watch for sale?",
    "Does my listing go live immediately when I submit it?",
    "Who reviews my listing, and what happens if it's rejected or needs more information?",
    "Is there a fee to sell?",
    "What do I need to include with my watch — do I need the box and papers?",
    "Can I withdraw or edit a listing after it's published?",
  ]),
  subject("payments", "Payments & Transactions", "payments and transactions", [
    "Does FairWatchTrade process payment for a sale?",
    "How does payment actually work between buyer and seller right now?",
    "What payment methods are supported?",
    "Does FairWatchTrade hold funds in escrow?",
    "Who handles shipping and insurance?",
    "What happens if a sale falls through after an offer is accepted?",
    "How is the 5% fee collected — deducted from the sale, billed separately, or something else?",
    "Are there currency conversion fees?",
  ]),
  subject("listings", "Listings & Review", "listings and the review process", [
    'What does "Pending Review" mean?',
    "What review does a listing go through before it's public?",
    "Who reviews listings?",
    'What does "Rejected" mean, and can I fix it and resubmit?',
    "Why would a listing be sent back to draft instead of rejected outright?",
    "Will I always be told why an adverse decision was made?",
    'What does "Sale Pending" mean?',
    "Can I edit a listing after it's published?",
  ]),
  subject("trust", "Trust & Verification", "trust and verification", [
    "How does FairWatchTrade verify a watch is genuine?",
    "Does the platform check for duplicate or reused photos?",
    "What is the Market Evidence panel?",
    "Are Rolex and Tudor allowed on the platform?",
  ]),
  subject("dealers", "Dealers", "dealer accounts", [
    "Does FairWatchTrade have a dealer program?",
    "Can a dealer bring in existing inventory in bulk?",
    "Can a dealer list multiple watches at once?",
  ]),
  subject("account", "Account & Privacy", "your account and your privacy", [
    "How do I sign in?",
    "Can I see the status of all my listings and offers in one place?",
    "Does FairWatchTrade sell my data or run ads?",
    "How do I delete my account?",
    "Who can see my account information?",
    "Does FairWatchTrade share my information with third parties?",
    "How is my data secured?",
  ]),
];
