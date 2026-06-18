/* ════════════════════════════════════════════════════════════════════════
   WATCH DNA QUIZ — ENGINE (3-bucket architecture, FINAL LOCKED wording)

   Buckets: CRAFT / PRESENCE / HERITAGE.
   5 questions, 3 options each (one per bucket). Tally across all five;
   highest bucket wins. Q1 is the anchor (2 points); Q2–Q5 are 1 point each.
   Tie-break: Craft → Heritage → Presence.

   Pure / deterministic / no network. Question + archetype copy is the locked
   v1.1 set (vetted with William, Claude, Gemini). Archetype names/brands for
   the result cards are still tunable flavor.
   ════════════════════════════════════════════════════════════════════════ */

export type ArchetypeKey = "craft" | "presence" | "heritage";

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

/* ── Questions (FINAL LOCKED v1.1). Q1 anchor = 2 pts; Q2–Q5 = 1 pt. ────── */
export const QUESTIONS: Question[] = [
  {
    id: "q1",
    prompt:
      "Someone notices your watch and asks about it. What do you actually want them to say next?",
    subtext: "The anchor question.",
    options: [
      {
        id: "q1-craft",
        label: "\u201CAsk me about the movement, that's the real story.\u201D",
        points: { craft: 2 },
      },
      {
        id: "q1-presence",
        label: "\u201CJust tell me it looks good, that's enough.\u201D",
        points: { presence: 2 },
      },
      {
        id: "q1-heritage",
        label:
          "\u201CAsk me where it's from, there's a real story behind it.\u201D",
        points: { heritage: 2 },
      },
    ],
  },
  {
    id: "q2",
    prompt: "Day to day, you connect with a watch through\u2026",
    options: [
      {
        id: "q2-presence",
        label: "how it wears and how it looks on the wrist",
        points: { presence: 1 },
      },
      {
        id: "q2-craft",
        label: "the engineering underneath and how it's built",
        points: { craft: 1 },
      },
      {
        id: "q2-heritage",
        label: "the story you tell when someone asks about it",
        points: { heritage: 1 },
      },
    ],
  },
  {
    id: "q3",
    prompt: "Would you rather own a watch that\u2026",
    subtext: "The soul question \u2014 the platform's real differentiator.",
    options: [
      {
        id: "q3-craft",
        label: "starts a conversation with the one person who notices",
        points: { craft: 1 },
      },
      {
        id: "q3-presence",
        label: "gets noticed from across the room",
        points: { presence: 1 },
      },
      {
        id: "q3-heritage",
        label: "has a history worth knowing",
        points: { heritage: 1 },
      },
    ],
  },
  {
    id: "q4",
    prompt: "What makes a watch feel valuable to you?",
    options: [
      {
        id: "q4-presence",
        label: "the look, the case shape, the overall aesthetic",
        points: { presence: 1 },
      },
      {
        id: "q4-craft",
        label: "the movement, the engineering, how it's put together",
        points: { craft: 1 },
      },
      {
        id: "q4-heritage",
        label: "a history you can trace and a story you're proud to continue",
        points: { heritage: 1 },
      },
    ],
  },
  {
    id: "q5",
    prompt: "Twenty years from now, what makes this watch matter?",
    options: [
      {
        id: "q5-presence",
        label: "it still turns heads",
        points: { presence: 1 },
      },
      {
        id: "q5-craft",
        label: "it's still a benchmark of how it was made",
        points: { craft: 1 },
      },
      {
        id: "q5-heritage",
        label: "it's a legacy that's still being written",
        points: { heritage: 1 },
      },
    ],
  },
];

/* ── Archetypes (3). Names/brands are tunable flavor for the result card. ── */
export const ARCHETYPES: Record<ArchetypeKey, Archetype> = {
  craft: {
    key: "craft",
    name: "The Connoisseur",
    tagline: "The dial is just the cover of the book.",
    description:
      "You buy for what's underneath \u2014 the movement, the finishing, the architecture only a few will ever notice. Substance over signal, every time.",
    exampleBrands: [
      "Voutilainen",
      "Parmigiani Fleurier",
      "Breguet (guilloch\u00E9 & finishing)",
    ],
  },
  presence: {
    key: "presence",
    name: "The Statement",
    tagline: "If it won't start a conversation, what's it for?",
    description:
      "A watch should read \u2014 on the wrist and across the room. You want design and presence you don't have to explain, and you're not interested in apologizing for it.",
    exampleBrands: [
      "Patek Philippe Calatrava",
      "Rolex",
      "Richard Mille",
      "Antoine Martin",
    ],
  },
  heritage: {
    key: "heritage",
    name: "The Storyteller",
    tagline: "You collect provenance as much as product.",
    description:
      "The watch matters, but the story matters more \u2014 who wore it, where it's been, the paperwork that proves it. A documented past is half of what you're buying, and you're proud to continue it.",
    exampleBrands: [
      "Auction-sourced vintage",
      "Inherited & documented pieces",
      "Heritage references with archives",
    ],
  },
};

/* Tie-break: Craft -> Heritage -> Presence (per locked spec). */
const PRIORITY: ArchetypeKey[] = ["craft", "heritage", "presence"];

export type QuizResult = {
  archetype: Archetype;
  ranking: { archetype: Archetype; score: number }[];
  scores: Record<ArchetypeKey, number>;
};

export function scoreQuiz(selected: QuizOption[]): QuizResult {
  const scores: Record<ArchetypeKey, number> = {
    craft: 0,
    presence: 0,
    heritage: 0,
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
