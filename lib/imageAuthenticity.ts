import {
  operationalRow,
  type ProviderResultCore,
} from "@/lib/integrity";

/* ════════════════════════════════════════════════════════════════════════
   THE AUBREY CHECK — PROVIDER BOUNDARY — lib/imageAuthenticity.ts   (v2.24)

   Google Cloud Vision Web Detection, wrapped so that every trust rule sits
   in ONE server-only module. SHIPPED INERT by explicit ruling:

     · AUBREY_ENFORCEMENT ('on'/'off', default OFF when absent) gates both
       execution AND the publish gate's coverage requirement. While off,
       nothing here is reachable and publishes behave exactly pre-Aubrey.
     · GOOGLE_CLOUD_VISION_API_KEY does not exist yet (no account, no key,
       no activation — prohibited this flight). If the flag were on without
       a key, every check returns an honest 'unavailable' row: the listing
       holds, the seller is never accused, nothing publishes unchecked.
     · T_HIGH / T_REVIEW are BLOCKED pending the separate live proof. They
       are null here, and executeImageAuthenticityCheck refuses to spend a
       provider call before they exist — thresholds invented from
       documentation are forbidden by ruling.

   Score semantics (Rulings 12–13): Google scores are EVIDENCE ONLY. The
   worst any classification can do is hold a listing at pending_review for
   human review. Nothing in this module — or anywhere — writes 'rejected'.

   Server-only. NEVER import from a client component: the key (when it one
   day exists) and the service-role write path both live behind this line.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** The one switch. Absent or anything but 'on' = fully inert. */
export function aubreyEnforcementEnabled(): boolean {
  return process.env.AUBREY_ENFORCEMENT === "on";
}

/* ── Thresholds — BLOCKED until the live proof (expendable public test
      images) fixes them. Do NOT assign numbers from documentation. ── */
export const T_HIGH: number | null = null; // full-match score ≥ T_HIGH   → high_confidence_match
export const T_REVIEW: number | null = null; // any match score ≥ T_REVIEW → review_suggested

export function thresholdsConfigured(): boolean {
  return typeof T_HIGH === "number" && typeof T_REVIEW === "number";
}

/* ── Bounded shapes for the detail jsonb — everything the evidence panel
      renders per photo, capped so a hostile response can't bloat a row. ── */
const MAX_MATCHES = 5;
const MAX_URL_LEN = 512;

type WebMatch = { url: string; score: number | null };
type WebPage = { url: string; title: string | null };

export type AubreyDetail = {
  verdict: "clean" | "match_partial" | "match_full";
  match_type: "full" | "partial" | null;
  best_score: number | null;
  matched_image_url: string | null;
  matched_source_url: string | null;
  matched_domain: string | null;
  full_matches: WebMatch[];
  partial_matches: WebMatch[];
  pages: WebPage[];
};

function bound(s: unknown): string | null {
  return typeof s === "string" && s.trim() !== "" ? s.slice(0, MAX_URL_LEN) : null;
}

function domainOf(url: string | null): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.slice(0, 128);
  } catch {
    return null;
  }
}

/* ── Google Web Detection response subset (images:annotate). ── */
type VisionWebImage = { url?: string; score?: number };
type VisionWebPage = { url?: string; pageTitle?: string };
type VisionWebDetection = {
  fullMatchingImages?: VisionWebImage[];
  partialMatchingImages?: VisionWebImage[];
  pagesWithMatchingImages?: VisionWebPage[];
};

function toMatches(images: VisionWebImage[] | undefined): WebMatch[] {
  return (images ?? [])
    .map((i) => ({ url: bound(i.url), score: typeof i.score === "number" ? i.score : null }))
    .filter((m): m is WebMatch => m.url !== null)
    .slice(0, MAX_MATCHES);
}

/* ── The one mapping from a Web Detection response to a schema-valid row.
      Only callable once thresholdsConfigured() — the guard lives in
      executeImageAuthenticityCheck. Classification shape (locked):
        full match  ≥ T_HIGH   → high_confidence_match
        any match   ≥ T_REVIEW → review_suggested
        otherwise              → passed                                   ── */
export function mapWebDetectionToRow(
  detection: VisionWebDetection,
  nowIso: string
): ProviderResultCore {
  const full = toMatches(detection.fullMatchingImages);
  const partial = toMatches(detection.partialMatchingImages);
  const pages: WebPage[] = (detection.pagesWithMatchingImages ?? [])
    .map((p) => ({ url: bound(p.url), title: bound(p.pageTitle) }))
    .filter((p): p is WebPage => p.url !== null)
    .slice(0, MAX_MATCHES);

  const bestFull = full.reduce<number | null>(
    (acc, m) => (m.score !== null && (acc === null || m.score > acc) ? m.score : acc),
    null
  );
  const bestPartial = partial.reduce<number | null>(
    (acc, m) => (m.score !== null && (acc === null || m.score > acc) ? m.score : acc),
    null
  );

  const tHigh = T_HIGH as number; // guarded by thresholdsConfigured() upstream
  const tReview = T_REVIEW as number;

  let matchType: "full" | "partial" | null = null;
  let bestScore: number | null = null;
  let classification: ProviderResultCore["classification"] = "passed";

  if (bestFull !== null && bestFull >= tHigh) {
    matchType = "full";
    bestScore = bestFull;
    classification = "high_confidence_match";
  } else if (bestFull !== null && bestFull >= tReview) {
    matchType = "full";
    bestScore = bestFull;
    classification = "review_suggested";
  } else if (bestPartial !== null && bestPartial >= tReview) {
    matchType = "partial";
    bestScore = bestPartial;
    classification = "review_suggested";
  }

  const primary = matchType === "partial" ? partial[0] : full[0];
  const sourcePage = pages[0]?.url ?? null;

  const detail: AubreyDetail = {
    verdict:
      classification === "passed"
        ? "clean"
        : matchType === "partial"
          ? "match_partial"
          : "match_full",
    match_type: classification === "passed" ? null : matchType,
    best_score: classification === "passed" ? null : bestScore,
    matched_image_url: classification === "passed" ? null : (primary?.url ?? null),
    matched_source_url: classification === "passed" ? null : (sourcePage ?? primary?.url ?? null),
    matched_domain:
      classification === "passed" ? null : domainOf(sourcePage ?? primary?.url ?? null),
    full_matches: full,
    partial_matches: partial,
    pages,
  };

  return {
    execution_status: "completed",
    classification,
    is_active: true,
    completed_at: nowIso,
    reason:
      classification === "passed"
        ? null
        : matchType === "full"
          ? "A visually identical image was located on an external source page."
          : "A partially matching image region was located on an external source page.",
    detail: detail as unknown as Record<string, unknown>,
  };
}

const CALL_TIMEOUT_MS = 6000;

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CALL_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ── Execute one check for one photo. Returns the row core to persist —
      the caller attaches provider/attempt/trigger/correlation columns and
      writes via the service client. NEVER callable while enforcement is
      off (hard guard: a disabled provider must not even be reachable). ── */
export async function executeImageAuthenticityCheck(
  photoUrl: string
): Promise<ProviderResultCore> {
  if (!aubreyEnforcementEnabled()) {
    throw new Error(
      "executeImageAuthenticityCheck called while AUBREY_ENFORCEMENT is off — callers must gate."
    );
  }

  const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
  if (!apiKey) {
    // Honest outage row: holds the listing, accuses no one, spends nothing.
    return operationalRow("unavailable", "missing_api_key");
  }
  if (!thresholdsConfigured()) {
    // Live proof hasn't fixed T_HIGH/T_REVIEW — refuse to spend a call or
    // invent a classification. The listing holds until thresholds exist.
    return operationalRow("unavailable", "thresholds_unset");
  }

  // Bytes-first: fetch the (public) blob server-side so Google-side fetch
  // flakiness can't masquerade as a clean result.
  let base64: string;
  try {
    const imgRes = await fetchWithTimeout(photoUrl);
    if (!imgRes.ok) {
      return operationalRow("unavailable", `image_fetch_status_${imgRes.status}`);
    }
    const buf = await imgRes.arrayBuffer();
    base64 = Buffer.from(buf).toString("base64");
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
              image: { content: base64 },
              features: [{ type: "WEB_DETECTION", maxResults: MAX_MATCHES }],
            },
          ],
        }),
      }
    );
  } catch {
    return operationalRow("unavailable", "provider_fetch_failed");
  }

  if (!response.ok) {
    return operationalRow("unavailable", `provider_status_${response.status}`);
  }

  try {
    const data = (await response.json()) as {
      responses?: { webDetection?: VisionWebDetection; error?: { message?: string } }[];
    };
    const first = data.responses?.[0];
    if (!first || first.error) {
      return operationalRow("invalid_response", first?.error?.message?.slice(0, 200) ?? "empty_response");
    }
    return mapWebDetectionToRow(first.webDetection ?? {}, new Date().toISOString());
  } catch {
    return operationalRow("invalid_response", "unparseable_body");
  }
}
