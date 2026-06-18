/* ════════════════════════════════════════════════════════════════════════
   WATCH DNA QUIZ — ENGINE (3-bucket architecture)

   Locked model: 5 questions, 3 options each, one option per bucket —
   CRAFT / PRESENCE / STORY. Tally the buckets across all five; highest wins.
   Q1 is the anchor and carries extra weight. Provenance is NOT a separate
   archetype that needs its own question — it's the STORY pillar, reachable
   from every question, especially Q1.

   Pure / deterministic / no network. The questions and archetype copy are
   plain data — swap in finalized wording freely; the architecture stays.

   NOTE: the question wording below is a draft of the locked architecture.
   If you and Ducky 3 finalized exact phrasings, replace the strings — the
   bucket mappings (one option per bucket) are what matter.
   ════════════════════════════════════════════════════════════════════════ */

export type ArchetypeKey = "craft" | "presence" | "story";

export type QuizOption = {
  id: string;
  label: string;
  points: Partial<Record<ArchetypeKey, number>>;
};

export type Question = {
  id: string;
  prompt: string;
  subtext?: string;
  options: QuizOption[];
};

export type Archetype = {
  key: ArchetypeKey;
  name: string;
  tagline: string;
  description: string;
  exampleBrands: string[];
};

/* ── Questions: 5, three options each (Craft / Presence / Story).
   Q1 is the anchor — its options carry 2 points; the rest carry 1. ─────── */
export const QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt: "When a watch grabs you, what's really pulling you in?",
    subtext: "The single most important question.",
    options: [
      {
        id: "q1-presence",
        label: "The dial — it should land at a glance.",
        points: { presence: 2 },
      },
      {
        id: "q1-craft",
        label:
          "What's inside — the movement, the finishing, the things only you'll notice.",
        points: { craft: 2 },
      },
      {
        id: "q1-story",
        label: "Where it's been — who wore it, the history it carries.",
        points: { story: 2 },
      },
    ],
  },
  {
    id: "q2",
    prompt: "Would you rather own a watch that…",
    options: [
      {
        id: "q2-presence",
        label: "…turns heads across a room.",
        points: { presence: 1 },
      },
      {
        id: "q2-craft",
        label: "…rewards the one person who truly gets it.",
        points: { craft: 1 },
      },
      {
        id: "q2-story",
        label: "…comes with a past you can trace.",
        points: { story: 1 },
      },
    ],
  },
  {
    id: "q3",
    prompt: "What makes a watch feel valuable to you?",
    options: [
      {
        id: "q3-presence",
        label: "Presence and design — it looks like something.",
        points: { presence: 1 },
      },
      {
        id: "q3-craft",
        label: "The engineering — how it's built and finished.",
        points: { craft: 1 },
      },
      {
        id: "q3-story",
        label: "Provenance — papers, prior owners, a documented life.",
        points: { story: 1 },
      },
    ],
  },
  {
    id: "q4",
    prompt: "Day to day, you connect with a watch through…",
    options: [
      {
        id: "q4-presence",
        label: "…how it wears and how it looks on the wrist.",
        points: { presence: 1 },
      },
      {
        id: "q4-craft",
        label: "…the ritual and the mechanism — winding it, the caliber.",
        points: { craft: 1 },
      },
      {
        id: "q4-story",
        label: "…the story you tell when someone asks about it.",
        points: { story: 1 },
      },
    ],
  },
  {
    id: "q5",
    prompt: "Twenty years from now, what makes this watch matter?",
    options: [
      {
        id: "q5-presence",
        label: "It still turns heads.",
        points: { presence: 1 },
      },
      {
        id: "q5-craft",
        label: "It's still a benchmark of how it was made.",
        points: { craft: 1 },
      },
      {
        id: "q5-story",
        label: "It's been passed down with its history intact.",
        points: { story: 1 },
      },
    ],
  },
];

/* ── Archetypes (3). Brands are William's own; edit freely. ─────────────── */
export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  craft: {
    key: "craft",
    name: "The Connoisseur",
    tagline: "The dial is just the cover of the book.",
    description:
      "You buy for what's underneath — the movement, the finishing, the architecture only a few will ever notice. Substance over signal, every time.",
    exampleBrands: [
      "Voutilainen",
      "Parmigiani Fleurier",
      "Breguet (guilloché & finishing)",
    ],
  },
  presence: {
    key: "presence",
    name: "The Statement",
    tagline: "If it won't start a conversation, what's it for?",
    description:
      "A watch should read — on the wrist and across the room. You want design and presence you don't have to explain, and you're not interested in apologizing for it.",
    exampleBrands: [
      "Patek Philippe Calatrava",
      "Rolex",
      "Richard Mille",
      "Antoine Martin",
    ],
  },
  story: {
    key: "story",
    name: "The Storyteller",
    tagline: "You collect provenance as much as product.",
    description:
      "The watch matters, but the story matters more — who wore it, where it's been, the paperwork that proves it. A documented past is half of what you're buying.",
    exampleBrands: [
      "Auction-sourced vintage",
      "Inherited & documented pieces",
      "Heritage references with archives",
    ],
  },
};

/* Tie-break order — lean connoisseur for FairWatchTrade's audience. Tunable. */
const PRIORITY: ArchetypeKey[] = ["craft", "story", "presence"];

export type QuizResult = {
  archetype: Archetype;
  ranking: { archetype: Archetype; score: number }[];
  scores: Record<ArchetypeKey, number>;
};

export function scoreQuiz(selected: QuizOption[]): QuizResult {
  const scores: Record<ArchetypeKey, number> = {
    craft: 0,
    presence: 0,
    story: 0,
  };

  for (const opt of selected) {
    for (const key of Object.keys(opt.points) as ArchetypeKey[]) {
      scores[key] += opt.points[key] ?? 0;
    }
  }

  const ranking = (Object.keys(ARCHETYPES) as ArchetypeKey[])
    .map((k) => ({ archetype: ARCHETYPES[k], score: scores[k] }))
    .sort(
      (a, b) =>
        b.score - a.score ||
        PRIORITY.indexOf(a.archetype.key) - PRIORITY.indexOf(b.archetype.key)
    );

  return { archetype: ranking[0].archetype, ranking, scores };
}
