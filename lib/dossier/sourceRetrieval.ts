/* ════════════════════════════════════════════════════════════════════════
   COLLECTOR DOSSIER — SOURCE RETRIEVAL (server-only)

   A citation is not evidence merely because its URL looks plausible.

   The v4.45 evidence contract proved SHAPE: the URL parses, the host is not
   a known placeholder, the source name is not obvious prose, the date is
   ISO. A fabricated but well-formed source object passes all four. This
   module closes that gap by actually fetching the source and producing a
   durable record of what came back.

   Deliberately bounded — this is not a crawler. One request, redirects
   recorded rather than hidden, HTML reduced to text, the text capped, and a
   hash of the normalized text so a later reader can prove the material
   reviewed is the material retrieved.

   RETRIEVAL PROOF IS NOT TRUTH PROOF. A successful retrieval establishes
   only that the source was obtained. Whether the source is good enough for
   a given claim class remains entirely downstream, with the admission
   contracts.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

import { createHash } from "node:crypto";
// Explicit extension so this module is importable by the node proof
// harnesses as well as Next — the same convention lib/vault/
// enrichmentAuthoring.ts already uses for exactly that reason.
import { normalizeForComparison } from "./claimAdmission.ts";

/** Bounded retained representation — enough to prove support, not a blob store. */
export const MAX_EVIDENCE_TEXT = 120_000;
const FETCH_TIMEOUT_MS = 20_000;

const FORBIDDEN_HOSTS = ["example.com", "example.org", "example.net", "localhost"];
/** SSRF guard: never let a "source" point back inside the network. */
const PRIVATE_HOST = /^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|0\.0\.0\.0$)/;

export type RetrievalFailure =
  | "SOURCE_URL_INVALID"
  | "SOURCE_HOST_FORBIDDEN"
  | "SOURCE_UNREACHABLE"
  | "SOURCE_RETRIEVAL_FAILED"
  | "SOURCE_REDIRECT_REFUSED"
  | "SOURCE_CONTENT_UNUSABLE";

/**
 * Is this URL a permissible retrieval target? Validating the FIRST hop is
 * not enough on its own — see the redirect posture in retrieveSource.
 */
export function retrievalTargetRefusal(
  url: string
): { failure: RetrievalFailure; detail: string } | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { failure: "SOURCE_URL_INVALID", detail: "URL did not parse." };
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return { failure: "SOURCE_URL_INVALID", detail: "Only http(s) sources are retrievable." };
  }
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");
  if (
    FORBIDDEN_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)) ||
    PRIVATE_HOST.test(parsed.hostname)
  ) {
    return {
      failure: "SOURCE_HOST_FORBIDDEN",
      detail: `Host "${parsed.hostname}" cannot be a governed source.`,
    };
  }
  return null;
}

export type RetrievalResult =
  | { ok: false; requestedUrl: string; failure: RetrievalFailure; detail: string }
  | {
      ok: true;
      requestedUrl: string;
      resolvedUrl: string;
      host: string;
      httpStatus: number;
      contentType: string | null;
      sourceTitle: string | null;
      /** Bounded, normalized, tag-stripped text of the retrieved document. */
      text: string;
      contentSha256: string;
      contentBytes: number;
      retrievedAt: string;
    };

/** HTML → readable text. Scripts, styles and markup go; entities are decoded. */
export function htmlToText(html: string): string {
  const withoutHead = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  const separated = withoutHead
    .replace(/<(br|\/p|\/div|\/li|\/tr|\/h[1-6]|\/td|\/th)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(separated).replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number(dec)))
    .replace(/&(nbsp|amp|quot|apos|lt|gt|mdash|ndash|rsquo|lsquo|ldquo|rdquo);/gi, (_, name) => {
      const map: Record<string, string> = {
        nbsp: " ", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">",
        mdash: "—", ndash: "–", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”",
      };
      return map[name.toLowerCase()] ?? " ";
    });
}

function titleOf(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!m) return null;
  const t = decodeEntities(m[1]).replace(/\s+/g, " ").trim();
  return t.length > 0 ? t.slice(0, 300) : null;
}

/**
 * Fetch one source. Failure is always NAMED and never silently substituted
 * with a similar source — the caller gets a refusal, not a fallback.
 */
export async function retrieveSource(requestedUrl: string): Promise<RetrievalResult> {
  const targetRefusal = retrievalTargetRefusal(requestedUrl);
  if (targetRefusal) return { ok: false, requestedUrl, ...targetRefusal };
  const parsed = new URL(requestedUrl);
  const host = parsed.hostname.toLowerCase().replace(/^www\./, "");

  let response: Response;
  try {
    /* REDIRECTS ARE NOT FOLLOWED.
       Validating only the first hop and then following redirects would
       leave an SSRF-through-redirect seam: a perfectly public-looking host
       can answer 302 with a private destination, and the guard above would
       never see it. FairWatchTrade already settled this exact question —
       /api/presentation-thumb fetches with redirect: "error" for the same
       reason — so retrieval takes the same no-follow posture.

       "manual" rather than "error" only so the refusal can be NAMED: a
       redirecting source is a URL worth correcting, not a network fault,
       and an operator should be told which it was. Nothing is followed
       either way, so no hop after the first can ever be requested. */
    response = await fetch(parsed.toString(), {
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        "user-agent": "FairWatchTrade reference evidence retriever/1.0",
        accept: "text/html,application/xhtml+xml",
      },
    });
  } catch (error) {
    return {
      ok: false, requestedUrl, failure: "SOURCE_UNREACHABLE",
      detail: error instanceof Error ? error.message.slice(0, 160) : "fetch failed",
    };
  }

  // A redirect — including the opaque form — is refused, never chased.
  if ((response.status >= 300 && response.status < 400) || response.type === "opaqueredirect") {
    const location = response.headers.get("location");
    return {
      ok: false, requestedUrl, failure: "SOURCE_REDIRECT_REFUSED",
      detail: location
        ? `Source redirected to "${location.slice(0, 120)}"; supply the canonical URL.`
        : "Source redirected; supply the canonical URL.",
    };
  }

  if (!response.ok) {
    return {
      ok: false, requestedUrl, failure: "SOURCE_RETRIEVAL_FAILED",
      detail: `HTTP ${response.status}`,
    };
  }

  const contentType = response.headers.get("content-type");
  const body = await response.text();
  const text = htmlToText(body).slice(0, MAX_EVIDENCE_TEXT);
  if (normalizeForComparison(text).length < 200) {
    return {
      ok: false, requestedUrl, failure: "SOURCE_CONTENT_UNUSABLE",
      detail: "Retrieved document carried too little text to support evidence.",
    };
  }

  return {
    ok: true,
    requestedUrl,
    resolvedUrl: response.url || parsed.toString(),
    host,
    httpStatus: response.status,
    contentType,
    sourceTitle: titleOf(body),
    text,
    // Hash the NORMALIZED text: presentation churn must not look like a
    // content change, but a factual edit must.
    contentSha256: createHash("sha256").update(normalizeForComparison(text), "utf8").digest("hex"),
    contentBytes: body.length,
    retrievedAt: new Date().toISOString(),
  };
}
