/* ────────────────────────────────────────────────────────────────────────
   ADMIN — /api/admin/vault-upgrade/research

   The one place the Specification Upgrade room is allowed to look anything
   up. Founder-only, fail-closed, and deliberately narrow:

   - it answers only the exact JSON pointers the caller lists;
   - it never reads or writes Vault taxonomy, never reconciles, never
     applies, never touches Galaxy state, never persists anything;
   - the provider credential is read from the server environment and never
     leaves it — no key, no header, and no request body is ever logged;
   - no response this route returns ever names the provider, the model, or
     the credential. Configuration stays server-side. The room is told what
     happened, never who did it — do not add an identifying field back.

   The room is Machine 1 (Specification Upgrade). Producing a candidate is
   the whole job; a candidate is still only a candidate.

   Canary: PFC274 = 62 lives in the evaluate route — not touched here.
   ──────────────────────────────────────────────────────────────────────── */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { VAULT_LOCK_V3_2_MANIFEST } from "@/lib/vault-upgrade/contracts/vault-lock-v3.2.manifest.ts";
import {
  addUsage,
  applyMessageCacheBreakpoints,
  assembleAnswer,
  buildResearchUserContent,
  EMPTY_USAGE,
  extractJsonObject,
  usageOfTurn,
  type ProviderTurn,
  MAX_REQUESTS_PER_CALL,
  MAX_REQUEST_BYTES,
  RESEARCH_SYSTEM_PROMPT,
  validateResearchPayload,
} from "@/lib/vault-upgrade/research.ts";
import type { ResearchRequest } from "@/lib/vault-upgrade/types.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/* Sourced research runs a server-side search loop; give it room rather than
   returning a half-finished round the client would have to retry. */
export const maxDuration = 300;

/** Single-admin gate — must match /admin/vault-upgrade exactly. */
const ADMIN_EMAIL = "jmynatt74@gmail.com";

const MODEL = "claude-opus-5";
/* Thinking is on by default on this model and is charged against the same
   ceiling as the answer, so the budget has to cover both. A truncated
   reply is the one failure mode that looks like a bad answer rather than a
   configuration mistake, so the ceiling is generous and truncation is
   detected explicitly below. */
const MAX_TOKENS = 32000;
/** Server-side tool loops can pause; bound how many times we resume. */
const MAX_CONTINUATIONS = 4;

/* The instructions and the question shape live beside the validation
   that judges the answers — see lib/vault-upgrade/research.ts. */

type Body = {
  contractId?: unknown;
  specificationSha256?: unknown;
  sourceSha256?: unknown;
  brandName?: unknown;
  pass?: unknown;
  requests?: unknown;
};

function bad(code: string, detail: string, status: number) {
  return NextResponse.json({ ok: false, code, detail }, { status });
}

export async function POST(req: Request) {
  /* 1 — founder-only, before anything else happens. */
  let email: string | null = null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    email = user?.email ?? null;
  } catch {
    return bad("NOT_AUTHORIZED", "Authorization could not be established.", 403);
  }
  if (!email || email.toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return bad("NOT_AUTHORIZED", "This route is not available.", 403);
  }

  /* 2 — bounded body. */
  const raw = await req.text();
  if (raw.length > MAX_REQUEST_BYTES) {
    return bad(
      "REQUEST_TOO_LARGE",
      `Request body exceeds the ${MAX_REQUEST_BYTES}-byte limit.`,
      413
    );
  }
  let body: Body;
  try {
    body = JSON.parse(raw) as Body;
  } catch {
    return bad("BAD_REQUEST", "Request body was not valid JSON.", 400);
  }

  /* 3 — the caller must be on the same active contract this server knows. */
  if (
    body.contractId !== VAULT_LOCK_V3_2_MANIFEST.contractId ||
    body.specificationSha256 !== VAULT_LOCK_V3_2_MANIFEST.specificationSha256
  ) {
    return bad(
      "ACTIVE_CONTRACT_MISMATCH",
      "The request does not carry the active specification identity.",
      409
    );
  }

  if (typeof body.sourceSha256 !== "string" || !/^[0-9a-f]{64}$/.test(body.sourceSha256)) {
    return bad("BAD_REQUEST", "A source SHA-256 is required.", 400);
  }
  const pass = body.pass === "reference" ? "reference" : "hierarchy";

  const requests = Array.isArray(body.requests)
    ? (body.requests as ResearchRequest[])
    : null;
  if (!requests || requests.length === 0) {
    return bad("BAD_REQUEST", "No research requests were supplied.", 400);
  }
  if (requests.length > MAX_REQUESTS_PER_CALL) {
    return bad(
      "TOO_MANY_REQUESTS",
      `At most ${MAX_REQUESTS_PER_CALL} questions may be asked in one call.`,
      400
    );
  }
  for (const r of requests) {
    if (
      !r ||
      typeof r.path !== "string" ||
      typeof r.field !== "string" ||
      typeof r.kind !== "string"
    ) {
      return bad("BAD_REQUEST", "A research request was malformed.", 400);
    }
  }

  /* 4 — provider credential. Server-only; never echoed, never logged. */
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return bad(
      "VAULT_UPGRADE_RESEARCH_PROVIDER_AUTHORIZATION_REQUIRED",
      "The research provider credential is not configured in this server environment, so bounded research cannot run.",
      503
    );
  }

  const userContent = buildResearchUserContent(
    typeof body.brandName === "string" && body.brandName
      ? body.brandName
      : null,
    pass,
    requests
  );

  /* 5 — bounded sourced research. Web search runs server-side at the
     provider; this route holds no browsing capability of its own. */
  const messages: { role: string; content: unknown }[] = [
    { role: "user", content: userContent },
  ];

  /* The answer arrives in pieces whenever the server-side search loop
     pauses: the model writes part of it, pauses to search, then continues.
     Every piece is kept. Replacing the accumulated text with each new
     response discards everything written before the last pause, and what
     survives is half an object — which then surfaces as "the provider did
     not return parseable JSON", blaming the provider for this route's own
     bookkeeping. */
  const turns: ProviderTurn[] = [];
  let usage = { ...EMPTY_USAGE, model: MODEL };
  try {
    for (let attempt = 0; attempt <= MAX_CONTINUATIONS; attempt++) {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: MAX_TOKENS,
          /* Establishing sourced facts is search-and-report work, not a
             reasoning problem — medium effort keeps the thinking spend
             proportionate and leaves the budget for the answer. */
          output_config: { effort: "medium" },
          /* The instructions below are byte-identical on every request this
             room makes — every question, every round, every brand — and they
             render after the tools, so one breakpoint here covers both. The
             longer window is deliberate: a batch runs for hours, and an entry
             that expires between two files is a premium paid for nothing.
             It is a window, not a promise — a long enough gap still lets it
             lapse, and the next write pays again. */
          system: [
            {
              type: "text",
              text: RESEARCH_SYSTEM_PROMPT,
              cache_control: { type: "ephemeral", ttl: "1h" },
            },
          ],
          tools: [{ type: "web_search_20260209", name: "web_search" }],
          messages,
        }),
      });

      if (!res.ok) {
        const status = res.status;
        /* A bare status code is not an answer. When the provider refuses the
           call it is describing THIS REQUEST — a field it would not accept,
           a limit, a billing state — and nobody can act on "HTTP 400" alone.

           Only the error envelope's own message is surfaced, never the body
           we sent, and it is bounded so a long reply cannot become the UI.
           Withholding an answer's contents was always the right instinct; it
           was never a reason to keep the reason for a refusal secret. */
        let reason = "";
        try {
          const envelope = (await res.json()) as {
            error?: { type?: string; message?: string };
          };
          const message = envelope.error?.message;
          if (typeof message === "string" && message.trim().length > 0) {
            reason = ` ${message.trim().slice(0, 300)}`;
          }
        } catch {
          /* No readable envelope — the status has to stand on its own. */
        }
        return NextResponse.json(
          {
            ok: false,
            code: status === 429 || status >= 500 ? "RETRYABLE" : "PROVIDER_ERROR",
            detail: `The research provider returned HTTP ${status}.${reason}`,
          },
          { status: status === 429 || status >= 500 ? 503 : 502 }
        );
      }

      const data = (await res.json()) as ProviderTurn;
      turns.push(data);
      usage = addUsage(usage, usageOfTurn(data));

      /* The server-side search loop paused; resume it rather than accepting
         a partial answer. Running out of resumes is not an error here — the
         assembled answer reports that it is still unfinished. */
      if (data.stop_reason === "pause_turn") {
        if (attempt < MAX_CONTINUATIONS) {
          messages.push({ role: "assistant", content: data.content ?? [] });
          /* The resume re-sends this whole conversation, search results and
             all. Marking the most recent turns lets it be read back rather
             than paid for again at full price. */
          applyMessageCacheBreakpoints(messages);
          continue;
        }
        break;
      }
      if (data.stop_reason === "refusal") {
        return bad(
          "PROVIDER_REFUSAL",
          "The research provider declined this request.",
          502
        );
      }
      /* A cut-off answer is a capacity problem, not a bad answer — say so,
         so a retry is the obvious next step rather than a mystery. */
      if (data.stop_reason === "max_tokens") {
        return NextResponse.json(
          {
            ok: false,
            code: "RETRYABLE",
            detail:
              "The research answer was cut off before it finished. Retry; if it persists, the batch is too large for one call.",
          },
          { status: 503 }
        );
      }
      break;
    }
  } catch {
    return NextResponse.json(
      {
        ok: false,
        code: "RETRYABLE",
        detail: "The research provider could not be reached.",
      },
      { status: 503 }
    );
  }

  const { text, stillSearching } = assembleAnswer(turns);
  if (stillSearching) {
    /* This ceiling is ours. Reporting it as malformed provider output would
       blame the provider for a limit this route set, and send the operator
       hunting a fault that is not there. */
    return NextResponse.json(
      {
        ok: false,
        code: "RETRYABLE",
        detail:
          "The research pass was still searching when it reached this route's continuation limit, so its answer is unfinished. Retry; if it persists, the batch is too large for one call.",
        /* Tokens were spent getting this far. A failure that reports no
           usage makes the accounting lie about what a run cost. */
        usage,
      },
      { status: 503 }
    );
  }

  /* 6 — strict validation before anything is returned to the room. */
  const parsed = extractJsonObject(text);
  if (parsed === undefined) {
    return NextResponse.json(
      {
        ok: false,
        code: "INVALID_PROVIDER_OUTPUT",
        detail: "The research provider did not return parseable JSON.",
        usage,
      },
      { status: 502 }
    );
  }

  const validated = validateResearchPayload(parsed, requests);
  if (!validated.ok) {
    return NextResponse.json(
      { ok: false, code: "INVALID_PROVIDER_OUTPUT", detail: validated.detail, usage },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    pass,
    sourceSha256: body.sourceSha256,
    results: validated.results,
    unanswered: validated.unanswered,
    usage,
  });
}
