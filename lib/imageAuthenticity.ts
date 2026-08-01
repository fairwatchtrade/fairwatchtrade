import sharp from "sharp";
/* Relative + .ts extension, following lib/curationSubmission.ts: the "@/"
   alias is a bundler feature, and this module must also be loadable by the
   bare-node test runner that proves it. */
import { operationalRow, type ProviderResultCore } from "./integrity.ts";

/* ════════════════════════════════════════════════════════════════════════
   THE AUBREY CHECK — PROVIDER BOUNDARY — lib/imageAuthenticity.ts   (v3.8)

   Does this photograph already exist somewhere on the public web?

   ── WHY THIS IS TWO STAGES AND NOT ONE ─────────────────────────────────
   Google Cloud Vision WEB_DETECTION is a SEARCH ENGINE, not a verdict. Live
   proof against real data (scripts/aubrey-live-proof.mjs) established three
   facts that a one-stage design gets wrong:

     1. Google returns NO usable score. Every fullMatchingImages and
        partialMatchingImages entry came back score:null. Any classifier that
        thresholds on score can never fire — it silently calls everything
        clean. That was the v2.24 defect: a photograph lifted from an eBay
        listing would have been recorded 'passed'.

     2. A CROP defeats full matching entirely. A borrowed photo cropped to
        hide the room around the watch returned ZERO full matches and one
        partial. This is the exact test that was run and failed: the check
        could not see a crop, so the listing went through.

     3. partialMatchingImages ALONE cannot be trusted. A genuine seller
        photograph matched an unrelated dealer's photo of a similar watch.
        Acting on that would have accused an honest seller. The
        pagesWithMatchingImages list is worse — it returned YouTube, Amazon,
        and a dictionary definition of "analog watch". It is semantic
        similarity, not provenance.

   So: Google finds CANDIDATES. FairWatchTrade VERIFIES them itself, by
   fetching each candidate and asking one narrow question — is this the same
   photograph, possibly cropped? A crop is a sub-region of the original, so
   the seller's image is compared against sub-windows of the candidate across
   several scales and offsets.

   Measured separation (scripts/aubrey-verifier-proof.mjs):

     re-uploaded untouched .......  1.2   ← theft
     cropped to the watch ........  2.8   ← theft (the case that failed before)
     different watch, same model .. 31.4  ← innocent
     two unrelated seller photos .. 64.5  ← innocent

   T_SAME = 17 sits in a gap of 28.6. It is measured, not invented.

   ── IT IS EVIDENCE, NEVER A VERDICT ────────────────────────────────────
   The worst outcome any classification can produce is a listing held at
   pending_review for a human to look at. Nothing here writes 'rejected',
   nothing accuses, nothing strikes. A seller whose photograph genuinely
   appears elsewhere may have a perfectly good reason, and the system's job
   is to put it in front of a person, not to decide.

   ── FAIL-OPEN, ALWAYS ──────────────────────────────────────────────────
   Provider outage, timeout, malformed response, or a candidate that cannot
   be fetched must NEVER produce 'passed'. Failure produces an honest
   operational row: the listing holds, the seller is never accused.

   Server-only. NEVER import from a client component — the API key lives
   behind this line.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

/** The one switch. Absent or anything but 'on' = fully inert. */
export function aubreyEnforcementEnabled(): boolean {
  return process.env.AUBREY_ENFORCEMENT === "on";
}

/* ── Verification threshold — MEASURED, not assumed. See the header table.
      Raising it toward 31 starts accusing honest sellers; lowering it toward
      3 starts missing crops. Re-run scripts/aubrey-verifier-proof.mjs before
      touching this number. ── */
export const T_SAME = 17;

/** Comparison grid. 32x32 greyscale is enough to identify a photograph and
    small enough that a hostile image cannot cost real CPU. */
const SIG_N = 32;

const MAX_MATCHES = 5; // matches retained per list, for the evidence panel
const MAX_VERIFY = 6; // candidates actually downloaded and compared
const MAX_URL_LEN = 512;
const MAX_CANDIDATE_BYTES = 12 * 1024 * 1024;
const CALL_TIMEOUT_MS = 6000;
const VERIFY_TIMEOUT_MS = 5000;

type WebMatch = { url: string; score: number | null };
type WebPage = { url: string; title: string | null };

export type AubreyDetail = {
  verdict: "clean" | "unverified_candidates" | "match_partial" | "match_full";
  /** True only when FairWatchTrade itself confirmed the same photograph. */
  verified: boolean;
  /** Perceptual distance to the verified candidate. Lower = more certain. */
  verified_distance: number | null;
  /** Where inside the candidate the seller's image was located, when cropped. */
  verified_window: string | null;
  match_type: "full" | "partial" | null;
  matched_image_url: string | null;
  matched_source_url: string | null;
  matched_domain: string | null;
  /* Retained even on a clean verdict. The old build discarded these the
     moment it decided 'passed', throwing away the only evidence a human
     would have needed to disagree with it. */
  full_matches: WebMatch[];
  partial_matches: WebMatch[];
  pages: WebPage[];
  candidates_verified: number;
  verification_errors: number;
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
export type VisionWebDetection = {
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

async function fetchWithTimeout(url: string, init?: RequestInit, ms = CALL_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/* ════════════════════════════════════════════════════════════════════════
   STAGE 2 — VERIFICATION
   ════════════════════════════════════════════════════════════════════════ */

/** Normalized greyscale signature. normalize() is what lets this survive the
    recompression, resizing, and brightness drift of a re-uploaded photograph. */
async function signature(
  buf: Buffer,
  region?: { left: number; top: number; width: number; height: number }
): Promise<Buffer> {
  let img = sharp(buf, { failOn: "none" });
  if (region) img = img.extract(region);
  return img.greyscale().normalize().resize(SIG_N, SIG_N, { fit: "fill" }).raw().toBuffer();
}

function meanAbsDiff(a: Buffer, b: Buffer): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += Math.abs(a[i] - b[i]);
  return d / a.length;
}

export type VerificationHit = { distance: number; window: string };

/* Is `sellerBuf` the same photograph as `candidateBuf`, possibly cropped out
   of it? Scale 1.0 is the plain "identical image" test; the smaller scales
   are the crop search — a scammer's crop is a sub-region of the original, so
   we look for the seller's frame inside the candidate.

   Returns the best (lowest) distance found, regardless of threshold, so the
   caller can record how close a near-miss was. */
export async function compareToCandidate(
  sellerBuf: Buffer,
  candidateBuf: Buffer
): Promise<VerificationHit | null> {
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>["metadata"]>>;
  try {
    meta = await sharp(candidateBuf, { failOn: "none" }).metadata();
  } catch {
    return null;
  }
  if (!meta.width || !meta.height) return null;

  let sellerSig: Buffer;
  try {
    sellerSig = await signature(sellerBuf);
  } catch {
    return null;
  }

  let best = Infinity;
  let bestWindow = "";

  for (const scale of [1, 0.9, 0.8, 0.7, 0.6, 0.5]) {
    const w = Math.round(meta.width * scale);
    const h = Math.round(meta.height * scale);
    if (w < 8 || h < 8) continue;

    /* Centre first — the overwhelmingly common crop — then the four corners,
       so an off-centre crop is still found without a full sliding search. */
    const offsets: [number, number][] =
      scale === 1
        ? [[0, 0]]
        : [
            [(meta.width - w) / 2, (meta.height - h) / 2],
            [0, 0],
            [meta.width - w, 0],
            [0, meta.height - h],
            [meta.width - w, meta.height - h],
          ];

    for (const [left, top] of offsets) {
      try {
        const candSig = await signature(candidateBuf, {
          left: Math.max(0, Math.round(left)),
          top: Math.max(0, Math.round(top)),
          width: w,
          height: h,
        });
        const d = meanAbsDiff(sellerSig, candSig);
        if (d < best) {
          best = d;
          bestWindow = `scale=${scale} off=${Math.round(left)},${Math.round(top)}`;
        }
      } catch {
        /* Region rejected by the decoder — try the next window. */
      }
    }
  }

  return Number.isFinite(best) ? { distance: Math.round(best * 10) / 10, window: bestWindow } : null;
}

async function fetchCandidate(url: string): Promise<Buffer | null> {
  try {
    const res = await fetchWithTimeout(url, undefined, VERIFY_TIMEOUT_MS);
    if (!res.ok) return null;
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > MAX_CANDIDATE_BYTES) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    return buf.byteLength > MAX_CANDIDATE_BYTES ? null : buf;
  } catch {
    return null;
  }
}

/* ════════════════════════════════════════════════════════════════════════
   CLASSIFICATION
   ════════════════════════════════════════════════════════════════════════ */

export type ClassifyInput = {
  detection: VisionWebDetection;
  verified: (VerificationHit & { url: string; kind: "full" | "partial" }) | null;
  candidatesVerified: number;
  verificationErrors: number;
  nowIso: string;
};

/* The locked shape:

     verified same photograph        → high_confidence_match   (hold, human looks)
     Google asserts a FULL match but
       we could not confirm it       → review_suggested        (hold, human looks)
     partial candidates only,
       none verified                 → passed, evidence RETAINED
     nothing found                   → passed, clean

   A verified hit is the strong signal precisely because WE proved it, rather
   than trusting a search result. */
export function classifyAubrey(input: ClassifyInput): ProviderResultCore {
  const { detection, verified, candidatesVerified, verificationErrors, nowIso } = input;

  const full = toMatches(detection.fullMatchingImages);
  const partial = toMatches(detection.partialMatchingImages);
  const pages: WebPage[] = (detection.pagesWithMatchingImages ?? [])
    .map((p) => ({ url: bound(p.url), title: bound(p.pageTitle) }))
    .filter((p): p is WebPage => p.url !== null)
    .slice(0, MAX_MATCHES);

  const sourcePage = pages[0]?.url ?? null;

  let classification: ProviderResultCore["classification"];
  let verdict: AubreyDetail["verdict"];
  let reason: string | null;

  if (verified) {
    classification = "high_confidence_match";
    verdict = verified.kind === "partial" ? "match_partial" : "match_full";
    reason =
      verified.kind === "partial"
        ? "This photograph appears to be a cropped portion of an image published elsewhere on the web."
        : "This exact photograph was located on an external web page.";
  } else if (full.length > 0) {
    /* Google says identical but we could not confirm it — usually because the
       candidate could not be fetched. Not proof, and not dismissible either:
       a person should look. Never 'passed'. */
    classification = "review_suggested";
    verdict = "unverified_candidates";
    reason = "A possible identical image was reported on the web but could not be independently confirmed.";
  } else if (partial.length > 0) {
    /* Similar-looking watches are ordinary and innocent. This is the case
       that would have wrongly accused a real seller, so it passes — but the
       candidates are kept on the row so a reviewer can disagree. */
    classification = "passed";
    verdict = "clean";
    reason = null;
  } else {
    classification = "passed";
    verdict = "clean";
    reason = null;
  }

  /* On a clean verdict there is no finding, so there is no headline match to
     name. Reporting the first page Google returned would put a YouTube link
     or a dictionary entry in front of a reviewer under the heading "matched
     source" — an accusation manufactured out of noise. The raw lists below
     are still retained in full; they are just not promoted to a claim. */
  const isFinding = classification !== "passed";

  const detail: AubreyDetail = {
    verdict,
    verified: verified !== null,
    verified_distance: verified?.distance ?? null,
    verified_window: verified?.window ?? null,
    match_type: verified ? verified.kind : full.length > 0 ? "full" : null,
    matched_image_url: isFinding ? (verified?.url ?? full[0]?.url ?? null) : null,
    matched_source_url: isFinding
      ? (verified ? (sourcePage ?? verified.url) : (sourcePage ?? full[0]?.url ?? null))
      : null,
    matched_domain: isFinding
      ? domainOf(verified?.url ?? sourcePage ?? full[0]?.url ?? null)
      : null,
    full_matches: full,
    partial_matches: partial,
    pages,
    candidates_verified: candidatesVerified,
    verification_errors: verificationErrors,
  };

  return {
    execution_status: "completed",
    classification,
    is_active: true,
    completed_at: nowIso,
    reason,
    detail: detail as unknown as Record<string, unknown>,
  };
}

/* ════════════════════════════════════════════════════════════════════════
   EXECUTION — one check, one photograph
   ════════════════════════════════════════════════════════════════════════ */

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

  /* Bytes-first: fetch the seller's photograph server-side so Google-side
     fetch flakiness can't masquerade as a clean result — and so the same
     bytes are available for verification without a second download. */
  let sellerBuf: Buffer;
  try {
    const imgRes = await fetchWithTimeout(photoUrl);
    if (!imgRes.ok) return operationalRow("unavailable", `image_fetch_status_${imgRes.status}`);
    sellerBuf = Buffer.from(await imgRes.arrayBuffer());
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
              image: { content: sellerBuf.toString("base64") },
              features: [{ type: "WEB_DETECTION", maxResults: 10 }],
            },
          ],
        }),
      }
    );
  } catch {
    return operationalRow("unavailable", "provider_fetch_failed");
  }

  if (!response.ok) return operationalRow("unavailable", `provider_status_${response.status}`);

  let detection: VisionWebDetection;
  try {
    const data = (await response.json()) as {
      responses?: { webDetection?: VisionWebDetection; error?: { message?: string } }[];
    };
    const first = data.responses?.[0];
    if (!first || first.error) {
      return operationalRow(
        "invalid_response",
        first?.error?.message?.slice(0, 200) ?? "empty_response"
      );
    }
    detection = first.webDetection ?? {};
  } catch {
    return operationalRow("invalid_response", "unparseable_body");
  }

  /* ── Verify. Full matches first: they are the strongest claim, so they get
        the budget before partial candidates. Stop at the first confirmed hit
        — one proven theft is all the evidence a reviewer needs. ── */
  const candidates: { url: string; kind: "full" | "partial" }[] = [
    ...toMatches(detection.fullMatchingImages).map((m) => ({ url: m.url, kind: "full" as const })),
    ...toMatches(detection.partialMatchingImages).map((m) => ({
      url: m.url,
      kind: "partial" as const,
    })),
  ].slice(0, MAX_VERIFY);

  let verified: (VerificationHit & { url: string; kind: "full" | "partial" }) | null = null;
  let checked = 0;
  let errors = 0;

  for (const c of candidates) {
    const buf = await fetchCandidate(c.url);
    if (!buf) {
      errors += 1;
      continue;
    }
    checked += 1;
    const hit = await compareToCandidate(sellerBuf, buf);
    if (hit && hit.distance <= T_SAME) {
      verified = { ...hit, url: c.url, kind: c.kind };
      break;
    }
  }

  return classifyAubrey({
    detection,
    verified,
    candidatesVerified: checked,
    verificationErrors: errors,
    nowIso: new Date().toISOString(),
  });
}
