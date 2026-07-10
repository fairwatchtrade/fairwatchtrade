import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/service";
import {
  PROVIDER_AI_PHOTO_QUALITY,
  TRIGGERED_BY_UPLOAD,
  completedVerdictToRow,
  operationalRow,
  type PhotoVerdict,
  type ProviderResultCore,
} from "@/lib/integrity";

/* ════════════════════════════════════════════════════════════════════════
   WIZARD PHOTO REVIEW — app/api/wizard-photo-review/route.ts   (v2.3 · Integrity Wiring)

   Lightweight per-photo quality verdict for the mobile wizard:
     passed    → advance
     soft_fail → advance, badge forfeited, admin review
     hard_fail → block, plain-language message, retake

   Pattern-faithful to /api/validate-description: same model, same headers,
   same fence-stripping, same fail-open law — an infra failure NEVER blocks
   an honest seller. All three fail-open branches return safe defaults.

   ── v2.3 addition: Integrity Engine persistence ─────────────────────────
   Every identifiable attempt is now written to listing_integrity_provider_results
   via the trusted service-role client, correlated pre-publish by
   (capture_session_id + storage_path). This is APPENDED after the verdict is
   decided and is strictly NON-BLOCKING to that verdict: a DB failure logs and
   returns the same verdict the seller would have gotten anyway. The write is
   awaited (not fire-and-forget) so the downstream blur-serial swap can find
   the row to re-point.

   Governing law (chain ruling): every identifiable attempt is preserved; an
   attempt that cannot truthfully be attached to an object must NOT be
   fabricated into the database. When no valid pre-publish correlation path
   exists (no capture_session_id or no storage_path), persistence is skipped
   with a structured log — never an orphan row, never a false pass.

   The URL-as-text vision limitation (Phase 5b) is unchanged and unrelated.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

const MODEL = "claude-sonnet-4-6"; // match /api/validate-description

const SYSTEM_PROMPT = `You are a photo quality reviewer for a curated watch marketplace.
Your job is to determine whether a seller's photo is usable for the
declared category. Be fair and generous — a slightly imperfect photo
that shows the watch clearly PASSES. Only flag genuine problems.

Hard fail (block, retake required):
- No watch visible — empty frame, hand only, background only, blur so
  severe the watch is unrecognizable
- Completely wrong subject — not a watch at all
- Exact same photo submitted twice for different categories (duplicate)

Soft fail (allow submission, withhold badge, route to admin):
- Watch is present but significantly obscured, cut off, or at an angle
  that makes the category unverifiable
- Severe glare or reflection covering more than half the watch face

Pass: watch is clearly present and the category is reasonably verifiable.
When in doubt, pass. A borderline photo is always better reviewed by a
human than blocked by AI.

Respond with ONLY a JSON object, no prose, no markdown fences:
{"result": "passed" | "soft_fail" | "hard_fail", "reason": string}
If passed, reason may be empty. If failed, reason must be plain English
the seller can understand — never technical jargon.`;

type Verdict = PhotoVerdict;
const VERDICTS: Verdict[] = ["passed", "soft_fail", "hard_fail"];

/* ── The verdict outcome, split so persistence can tell a completed verdict
      apart from an operational non-completion (provider down / unparseable).
      The client-facing verdict fail-opens to "passed" in both operational
      cases, exactly as before — but the persisted execution_status records
      the truth. ── */
type ReviewOutcome =
  | { kind: "completed"; verdict: Verdict; reason: string }
  | { kind: "unavailable"; note: string }
  | { kind: "invalid_response"; note: string };

async function reviewPhoto(photoUrl: string, category: string): Promise<ReviewOutcome> {
  let response: Response;
  try {
    response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: "user",
            // v2.2: URL as text per the locked ruling. Phase 5b swaps this
            // single content string for an image block — nothing else changes.
            content: `Category: ${category}\nPhoto URL: ${photoUrl}`,
          },
        ],
      }),
    });
  } catch {
    return { kind: "unavailable", note: "provider_fetch_failed" };
  }

  if (!response.ok) {
    return { kind: "unavailable", note: `provider_status_${response.status}` };
  }

  try {
    const data = await response.json();
    const rawText = (data.content ?? [])
      .map((block: { type: string; text?: string }) =>
        block.type === "text" ? block.text ?? "" : ""
      )
      .join("");

    // Strip any markdown fences if present (pattern from validate-description).
    const clean = rawText.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(clean) as { result?: unknown; reason?: unknown };

    if (!VERDICTS.includes(parsed.result as Verdict)) {
      // Recognized-shape miss → operational invalid_response. Client still
      // fail-opens to passed below; the record stays honest.
      return { kind: "invalid_response", note: "unrecognized_verdict" };
    }

    const reason = typeof parsed.reason === "string" ? parsed.reason.slice(0, 400) : "";
    return { kind: "completed", verdict: parsed.result as Verdict, reason };
  } catch {
    return { kind: "invalid_response", note: "unparseable_body" };
  }
}

/* ── Persist one attempt. Non-blocking to the verdict: any failure is logged
      and swallowed. Awaited by the caller so the blur-serial swap finds the
      row. Skips entirely (with a structured log) when no valid pre-publish
      correlation path exists — never an orphan row, never a false pass. ── */
async function persistAttempt(params: {
  outcome: ReviewOutcome;
  category: string;
  captureSessionId: string;
  storagePath: string;
}): Promise<void> {
  const { outcome, category, captureSessionId, storagePath } = params;

  let core: ProviderResultCore;
  if (outcome.kind === "completed") {
    core = completedVerdictToRow(outcome.verdict, outcome.reason, new Date().toISOString());
  } else {
    core = operationalRow(outcome.kind, outcome.note);
  }

  const row = {
    provider: PROVIDER_AI_PHOTO_QUALITY,
    attempt_number: 1,
    triggered_by: TRIGGERED_BY_UPLOAD,
    capture_session_id: captureSessionId,
    storage_path: storagePath,
    category: category || null,
    media_id: null,
    ...core,
  };

  try {
    const service = createServiceClient();
    const { error } = await service.from("listing_integrity_provider_results").insert(row);
    if (error) {
      // 23505 → an identical attempt already recorded (double-fire / resume).
      // Idempotent by design; anything else is logged and swallowed.
      if ((error as { code?: string }).code !== "23505") {
        console.error("[integrity] provider result insert failed:", error.message);
      }
    }
  } catch (e) {
    // Missing service-role config or any other error: the verdict already
    // stands. Fail loud in the log, never fabricate — but never block.
    console.error("[integrity] provider result persistence skipped (client/config error):", e);
  }
}

export async function POST(req: Request) {
  let photoUrl = "";
  let category = "";
  let captureSessionId = "";
  let storagePath = "";

  try {
    const body = await req.json();
    photoUrl = typeof body.photoUrl === "string" ? body.photoUrl.trim() : "";
    category = typeof body.category === "string" ? body.category.slice(0, 64) : "";
    // v2.3 additive correlation fields — the wizard's photo-review call site
    // now passes these through. Absent = older client = persistence skipped.
    captureSessionId =
      typeof body.capture_session_id === "string" ? body.capture_session_id.trim().slice(0, 64) : "";
    storagePath =
      typeof body.storage_path === "string" ? body.storage_path.trim().slice(0, 512) : "";
  } catch {
    // Unreadable body → nothing to review; soft_fail keeps the badge honest
    // without blocking the seller. No correlation identity → nothing to persist.
    return NextResponse.json({
      result: "soft_fail",
      reason: "Photo could not be reviewed.",
    });
  }

  if (!photoUrl) {
    return NextResponse.json({
      result: "soft_fail",
      reason: "Photo could not be reviewed.",
    });
  }

  const outcome = await reviewPhoto(photoUrl, category);

  // Persist the attempt ONLY when a truthful pre-publish correlation path
  // exists. Awaited so the downstream blur-serial swap can re-point the row.
  if (captureSessionId && storagePath) {
    await persistAttempt({ outcome, category, captureSessionId, storagePath });
  } else {
    console.warn(
      "[integrity] provider result persistence skipped: no correlation identity " +
        `(capture_session_id=${captureSessionId ? "present" : "absent"}, ` +
        `storage_path=${storagePath ? "present" : "absent"}, category=${category || "?"}).`
    );
  }

  // Client-facing verdict — fail-open unchanged. Operational non-completions
  // present to the seller as "passed" exactly as before.
  if (outcome.kind !== "completed") {
    return NextResponse.json({ result: "passed", reason: "" });
  }

  const result = outcome.verdict;
  return NextResponse.json({ result, reason: result === "passed" ? "" : outcome.reason });
}
