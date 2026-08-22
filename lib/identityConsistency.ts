import { operationalRow, type ProviderResultCore } from "./integrity.ts";
import { BRANDS_MODELS } from "./brandsModels.ts";

/* ════════════════════════════════════════════════════════════════════════
   IDENTITY CONSISTENCY — PROVIDER BOUNDARY — lib/identityConsistency.ts

   Does the photograph visibly contradict the watch the listing claims?

   The third provider on the post-upload integrity seam, and a DIFFERENT
   QUESTION from its neighbours: image_authenticity asks "does this
   photograph already exist on the public web?"; aubrey_exact_hash asks
   "have these exact bytes appeared in another FairWatchTrade listing?".
   Neither asks whether the photographed watch is the claimed watch — the
   gap a founder-controlled test proved by activating a Parmigiani-claimed
   listing carrying unmistakable Rolex photographs, clean on all eleven
   provenance passes. The passes were CORRECT: the photos were the
   seller's own originals. Nothing asked the identity question.

   ── A CONTRADICTION DETECTOR, NOT AN IDENTIFICATION ORACLE ─────────────
   V1 raises its hand for exactly one thing: another manufacturer's
   unmistakable branding — wordmark text or logo insignia — visible in a
   photograph attached to a listing that claims a different manufacturer.
   It never concludes what the watch IS. "The dial visibly contains the
   ROLEX wordmark" is an observation this provider may make; "this is a
   Rolex Datejust 116234" is oracle behavior and is out of scope, as are
   case material, bezel, era, movement, reference, family, and any
   color/finish judgment that lighting could distort. When the evidence
   is not unmistakable, the provider is QUIET — silence is the designed
   output for ambiguity, not a failure to detect.

   ── MECHANISM ──────────────────────────────────────────────────────────
   Google Cloud Vision — the SAME service and key the authenticity
   provider already uses, different features: TEXT_DETECTION (OCR) and
   LOGO_DETECTION. Bytes-first like its neighbour: the photograph is
   fetched server-side and sent as content, so Google-side fetch flakiness
   cannot masquerade as a clean result.

   Detected text and logo descriptions are matched against the Vault's own
   brand vocabulary (BRANDS_MODELS — the 319 admitted names), normalized
   for case and diacritics. Guards that keep "unmistakable" honest:

     · whole-word / whole-phrase matches only — "ROLEX" inside a longer
       token does not count;
     · single-word brand names must be ≥ 5 characters, so short names
       cannot collide with incidental dial text (RADO stays quiet in V1 —
       deliberate narrowness, not oversight);
     · the claimed brand and anything sharing its tokens is exempt;
     · logo matches must clear the API's own detection threshold —
       an internal calibration, never a user-facing confidence number;
     · if the CLAIMED brand's own branding is ALSO visible, V1 stays
       quiet: two brandings in one frame is ambiguity (a watch beside
       another maker's box), and ambiguity is a quiet case by law.

   ── FAILURE IS OPERATIONAL TRUTH, NEVER ADVERSE EVIDENCE ──────────────
   Missing key, fetch failure, timeout, unparseable response → the same
   honest operationalRow convention the authenticity provider uses. The
   integrity gate's unavailability holds are PROVIDER_IMAGE_AUTHENTICITY-
   scoped by construction, so an unavailable identity row can never hold a
   listing or feed Needs Attention. The checker falling over is not
   evidence against the seller.

   ── EVIDENCE, NEVER VERDICT ────────────────────────────────────────────
   An adverse result is classification "review_suggested" whose reason
   carries the five-part grammar (CLAIM / VISIBLE OBSERVATION /
   CONTRADICTION / WHAT POINTS THE OTHER WAY / DECISION: none). It rides
   the existing promotion path into listing_integrity_evidence and the
   existing finding_review witness hold — the founder decides, this file
   never does. No listing_integrity_reviews row is created here.

   PFC274 = 62 — the evaluate route is untouched; this module imports only
   the confirmed integrity graph.
   ════════════════════════════════════════════════════════════════════════ */

/** Own enablement flag, mirroring the AUBREY_ENFORCEMENT convention —
    "on" enables; anything else leaves the provider entirely inert (no
    rows, no calls, no holds). Deliberately NOT tied to Aubrey's flag: the
    founder can run, pause, or kill this provider without touching the
    provenance machinery, and shipping inert-until-enabled is the same
    precedent the Aubrey Check itself established. */
export function identityConsistencyEnabled(): boolean {
  return process.env.IDENTITY_CONSISTENCY === "on";
}

const CALL_TIMEOUT_MS = 20_000;

async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
  ms = CALL_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── Brand vocabulary ────────────────────────────────────────────────────
   Normalization: uppercase, diacritics stripped (Genève → GENEVE),
   punctuation folded to spaces, whitespace collapsed. Applied identically
   to vocabulary names and detected text, so matching is one comparison in
   one alphabet. */
export function normalizeBrandText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, " ")
    .trim();
}

type VocabEntry = { name: string; norm: string };

/** Built once at module load. Single-word names shorter than 5 characters
    are excluded up front — they can never produce an "unmistakable" match
    under the V1 guards, so they are not even candidates. */
const BRAND_VOCAB: VocabEntry[] = BRANDS_MODELS.map((b) => ({
  name: b.name,
  norm: normalizeBrandText(b.name),
})).filter((v) => v.norm.length > 0 && (v.norm.includes(" ") || v.norm.length >= 5));

/** Whole-word / whole-phrase presence of `phrase` inside normalized text. */
function containsPhrase(normText: string, phrase: string): boolean {
  return ` ${normText} `.includes(` ${phrase} `);
}

/** Vision's logo threshold — internal calibration for "unmistakable",
    never surfaced as a confidence number anywhere. */
const LOGO_MIN_SCORE = 0.6;

type VisionIdentityResponse = {
  responses?: {
    error?: { message?: string };
    textAnnotations?: { description?: string }[];
    logoAnnotations?: { description?: string; score?: number }[];
  }[];
};

/* ── The classification core, pure and separately testable ─────────────── */
export function classifyIdentityConsistency(input: {
  claimedBrand: string;
  category: string | null;
  ocrText: string;
  logos: { description: string; score: number }[];
}): ProviderResultCore {
  const { claimedBrand, category, ocrText, logos } = input;
  const claimedNorm = normalizeBrandText(claimedBrand);
  const normText = normalizeBrandText(ocrText);

  const claimedTokens = new Set(claimedNorm.split(" ").filter(Boolean));

  /* A vocabulary brand is exempt when it IS the claim or overlaps it in
     either direction — "Universal Genève" claimed must exempt "Universal
     Genève" detected, and a claim of "Rolex" exempts "Rolex". Token
     overlap is the conservative test: sharing ANY token with the claim
     disqualifies a brand from being "foreign", which can only make V1
     quieter, never louder. */
  const isExempt = (v: VocabEntry): boolean => {
    if (v.norm === claimedNorm) return true;
    if (containsPhrase(claimedNorm, v.norm) || containsPhrase(v.norm, claimedNorm)) return true;
    return v.norm.split(" ").some((t) => claimedTokens.has(t));
  };

  const strongLogos = logos.filter((l) => (l.score ?? 0) >= LOGO_MIN_SCORE);

  const foreignText: string[] = [];
  const foreignLogo: string[] = [];
  let claimedVisible = false;

  for (const v of BRAND_VOCAB) {
    const inText = containsPhrase(normText, v.norm);
    const inLogo = strongLogos.some((l) => normalizeBrandText(l.description) === v.norm);
    if (!inText && !inLogo) continue;
    if (isExempt(v)) {
      claimedVisible = claimedVisible || v.norm === claimedNorm ||
        containsPhrase(claimedNorm, v.norm) || containsPhrase(v.norm, claimedNorm);
      continue;
    }
    if (inText) foreignText.push(v.name);
    if (inLogo && !inText) foreignLogo.push(v.name);
  }
  /* The claim can also be visible without being a vocabulary entry
     (custom-brand admissions) — check the claim's own phrase directly. */
  if (!claimedVisible && claimedNorm.length >= 5) {
    claimedVisible =
      containsPhrase(normText, claimedNorm) ||
      strongLogos.some((l) => normalizeBrandText(l.description) === claimedNorm);
  }

  const foreign = [...new Set([...foreignText, ...foreignLogo])];
  const completedAt = new Date().toISOString();

  if (foreign.length === 0) {
    return {
      execution_status: "completed",
      classification: "passed",
      is_active: true,
      completed_at: completedAt,
      reason:
        "No manufacturer branding contradicting the claimed identity is visible in this photograph.",
      detail: { check: "identity_consistency_v1", claimed_brand: claimedBrand },
    };
  }

  if (claimedVisible) {
    /* Both brandings visible = ambiguity, and ambiguity is quiet in V1.
       The observation is preserved in detail for a future governed flight;
       it creates no evidence and no hold today. */
    return {
      execution_status: "completed",
      classification: "passed",
      is_active: true,
      completed_at: completedAt,
      reason:
        "Branding from more than one manufacturer appears in this photograph, including the claimed manufacturer. V1 does not judge mixed-branding scenes; no contradiction is recorded.",
      detail: {
        check: "identity_consistency_v1",
        claimed_brand: claimedBrand,
        note: "both_claimed_and_other_branding_visible",
        other_branding: foreign,
      },
    };
  }

  const catLabel = category ? `${category}-tagged photograph` : "photograph";
  const observed = foreign.join(", ");
  const via =
    foreignLogo.length > 0 && foreignText.length === 0
      ? "logo insignia"
      : foreignLogo.length > 0
        ? "wordmark text and logo insignia"
        : "wordmark text";

  /* The five-part grammar, verbatim structure. Observation names only what
     is visible; the uncertainty section states the oracle boundary out
     loud so the reason can never silently harden into identification. */
  const reason = [
    `CLAIM: ${claimedBrand}.`,
    `VISIBLE OBSERVATION: The uploaded ${catLabel} visibly contains ${observed} branding (${via}).`,
    `CONTRADICTION: The visible manufacturer branding materially conflicts with the claimed manufacturer.`,
    `WHAT POINTS THE OTHER WAY / UNCERTAINTY: No model or reference conclusion is drawn from this photograph. Visible branding alone cannot establish what the watch is — only that what is visible conflicts with the claim. The claimed manufacturer's own branding was not identified in this photograph, which may reflect image framing rather than the watch itself.`,
    `DECISION: None — human review required.`,
  ].join("\n");

  return {
    execution_status: "completed",
    classification: "review_suggested",
    is_active: true,
    completed_at: completedAt,
    reason,
    detail: {
      check: "identity_consistency_v1",
      claimed_brand: claimedBrand,
      observed_branding: foreign,
      detection: via,
      category: category ?? null,
    },
  };
}

/* ════════════════════════════════════════════════════════════════════════
   EXECUTION — one check, one photograph
   ════════════════════════════════════════════════════════════════════════ */

export async function executeIdentityConsistencyCheck(params: {
  photoUrl: string;
  claimedBrand: string;
  category: string | null;
}): Promise<ProviderResultCore> {
  if (!identityConsistencyEnabled()) {
    throw new Error(
      "executeIdentityConsistencyCheck called while IDENTITY_CONSISTENCY is off — callers must gate."
    );
  }
  const { photoUrl, claimedBrand, category } = params;

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    // Honest outage row: accuses no one, spends nothing, holds nothing —
    // identity rows are outside the gate's coverage requirement by design.
    return operationalRow("unavailable", "missing_api_key");
  }

  let photoBuf: Buffer;
  try {
    const imgRes = await fetchWithTimeout(photoUrl);
    if (!imgRes.ok) return operationalRow("unavailable", `image_fetch_status_${imgRes.status}`);
    photoBuf = Buffer.from(await imgRes.arrayBuffer());
  } catch {
    return operationalRow("unavailable", "image_fetch_failed");
  }

  let response: Response;
  try {
    response = await fetchWithTimeout(
      `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              image: { content: photoBuf.toString("base64") },
              features: [
                { type: "TEXT_DETECTION", maxResults: 1 },
                { type: "LOGO_DETECTION", maxResults: 5 },
              ],
            },
          ],
        }),
      }
    );
  } catch {
    return operationalRow("unavailable", "provider_fetch_failed");
  }

  if (!response.ok) return operationalRow("unavailable", `provider_status_${response.status}`);

  let ocrText = "";
  let logos: { description: string; score: number }[] = [];
  try {
    const data = (await response.json()) as VisionIdentityResponse;
    const first = data.responses?.[0];
    if (!first || first.error) {
      return operationalRow(
        "invalid_response",
        first?.error?.message?.slice(0, 200) ?? "empty_response"
      );
    }
    // textAnnotations[0] is the full-image aggregate; the rest are words.
    ocrText = first.textAnnotations?.[0]?.description ?? "";
    logos = (first.logoAnnotations ?? [])
      .filter((l) => typeof l.description === "string")
      .map((l) => ({ description: l.description as string, score: l.score ?? 0 }));
  } catch {
    return operationalRow("invalid_response", "unparseable_body");
  }

  return classifyIdentityConsistency({ claimedBrand, category, ocrText, logos });
}
