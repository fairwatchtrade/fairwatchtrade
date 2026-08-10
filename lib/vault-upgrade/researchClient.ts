/* ────────────────────────────────────────────────────────────────────────
   VAULT SPECIFICATION UPGRADE — browser research transport

   The room's side of the research boundary. It carries questions to the
   founder-gated server route and brings validated answers back. It holds no
   credential and performs no research of its own: if this file were read by
   anyone, it would reveal nothing but the shape of the questions.
   ──────────────────────────────────────────────────────────────────────── */

import type { ResearchTransport } from "./complete.ts";

export const RESEARCH_ENDPOINT = "/api/admin/vault-upgrade/research";

export function createBrowserResearchTransport(): ResearchTransport {
  return async (payload) => {
    let res: Response;
    try {
      res = await fetch(RESEARCH_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch {
      return {
        ok: false,
        code: "RETRYABLE",
        detail:
          "The research route could not be reached. Check the connection and retry.",
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return {
        ok: false,
        code: res.ok ? "INVALID_PROVIDER_OUTPUT" : "RETRYABLE",
        detail: `The research route returned an unreadable response (HTTP ${res.status}).`,
      };
    }

    const parsed = body as {
      ok?: boolean;
      code?: string;
      detail?: string;
      results?: unknown;
      unanswered?: unknown;
    };

    if (!res.ok || !parsed.ok) {
      return {
        ok: false,
        code: parsed.code ?? "RETRYABLE",
        detail:
          parsed.detail ?? `The research route returned HTTP ${res.status}.`,
      };
    }

    return {
      ok: true,
      results: Array.isArray(parsed.results) ? (parsed.results as never) : [],
      unanswered: Array.isArray(parsed.unanswered)
        ? (parsed.unanswered as string[])
        : [],
    };
  };
}
