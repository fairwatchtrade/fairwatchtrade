import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { isIdentifierType, type IdentifierType } from "@/lib/identity/identifierNormalization";
import {
  IdentifierTokenUnavailable,
  identifierTokenKeyConfigured,
  tokenizeIdentifier,
} from "@/lib/identity/identifierToken";

/* ════════════════════════════════════════════════════════════════════════
   /api/admin/identifiers — the only door that records identifier evidence

   POST  record an observation (optionally superseding an earlier one)
   GET   list observations for one physical watch — METADATA ONLY

   ── THE RAW VALUE IS EPHEMERAL PROCESSING MATERIAL ─────────────────────
   The submitted identifier exists in this function's memory for exactly as
   long as it takes to normalize and tokenize it, and then it is gone. It is
   never written to a row, never echoed in a response, never attached to an
   error, and never logged — note that nothing in this file logs the request
   body, and that no failure path interpolates the value into a message.
   A validation failure says WHICH rule failed, never what was submitted.

   That discipline is the point. A serial that reaches an error log is a
   serial the platform is storing, whatever the schema says.

   ── NO CALLER-SUPPLIED FREE TEXT ON THIS PATH ──────────────────────────
   This route accepts NO free-text field. `sourceReference` in particular is
   REJECTED with a 400 rather than quietly dropped — a silent drop is the
   worse of the two failures, because the founder writes a provenance note,
   receives a success, and believes something was recorded that never was.

   The reason is narrow and worth stating, because the field looked
   harmless: a free-text column on this table is a second, unprotected way
   to store an identifier. Someone types "serial 8Z12345" into a provenance
   note and the platform now holds a recoverable serial in plaintext,
   sitting beside the very tokens built to prevent exactly that. The token
   machinery would be intact and completely bypassed.

   V1 does not try to filter such text. No validator can prove arbitrary
   prose contains no identifier, and a filter that is wrong once is worse
   than no field at all, because it looks like it worked. So the field is
   simply not accepted, a database CHECK keeps the column NULL, and a
   future named source integration may earn a non-user-supplied opaque
   reference under its own contract.

   ── THE BROWSER CANNOT MINT A TOKEN ────────────────────────────────────
   There is no request field through which a caller can supply an equality
   token, and this route never reads one. Tokenization happens here, with a
   server-held key the browser has never seen. A caller who sends a
   precomputed token is simply ignored — the stored token is the one this
   route computed.

   ── WHAT THIS ROUTE REFUSES TO CONCLUDE ────────────────────────────────
   Nothing. It records evidence. It does not search for matching tokens, it
   does not report whether another watch shares one, and it does not link
   anything to anything. Two contradictory observations may be recorded
   about one watch and both stand. Deciding what equal tokens MEAN belongs
   to a later governed round.

   ── FAIL CLOSED ────────────────────────────────────────────────────────
   No token key configured → 503 and nothing is written. There is no
   unkeyed fallback, because a weak token is indistinguishable from a real
   one once it is in the table, and it cannot be recomputed afterwards.

   Founder-gated by a hardcoded literal in THIS file, independent of any
   other gate. The write itself uses the service client: the observation
   table denies every client role structurally.

   PFC274 = 62 — the evaluate route is untouched.
   ════════════════════════════════════════════════════════════════════════ */

export const runtime = "nodejs";

const ADMIN_USER_ID = "77a6893a-54fe-4373-9bf7-3327d0ba69cf";

const SOURCE_CLASSES = [
  "seller_stated",
  "dealer_attested",
  "auction_catalogue",
  "provider_extracted",
  "founder_entered",
] as const;
type SourceClass = (typeof SOURCE_CLASSES)[number];
const isSourceClass = (v: unknown): v is SourceClass =>
  typeof v === "string" && (SOURCE_CLASSES as readonly string[]).includes(v);

/** Exactly the columns a human may see. The token is absent by
    construction, not by filtering — it is never selected. */
const METADATA_COLUMNS =
  "id, physical_watch_id, identifier_type, normalization_version, token_key_version, source_class, source_actor_id, observed_at, recorded_at, recorded_by, supersedes_id, chain_root_id, is_current";

async function requireFounder() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: "not_authenticated" }, { status: 401 }) };
  if (user.id !== ADMIN_USER_ID) {
    return { error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  }
  return { user };
}

export async function GET(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  const physicalWatchId = (request.nextUrl.searchParams.get("physicalWatchId") ?? "").trim();
  if (!physicalWatchId) {
    return NextResponse.json({ error: "bad_request", detail: "physicalWatchId required." }, { status: 400 });
  }

  const db = createServiceClient();
  const { data, error } = await db
    .from("physical_watch_identifier_observations")
    .select(METADATA_COLUMNS)
    .eq("physical_watch_id", physicalWatchId)
    .order("recorded_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: "read_failed" }, { status: 500 });
  }

  return NextResponse.json({
    physicalWatchId,
    tokenKeyConfigured: identifierTokenKeyConfigured(),
    /* Evidence, presented as evidence. Several unsuperseded observations of
       one identifier type may appear here and contradict each other; that is
       a legitimate state, not a bug, and this route draws no conclusion
       from it. */
    observations: data ?? [],
  });
}

export async function POST(request: NextRequest) {
  const gate = await requireFounder();
  if (gate.error) return gate.error;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const physicalWatchId =
    typeof body.physicalWatchId === "string" ? body.physicalWatchId.trim() : "";
  const identifierType = body.identifierType;
  const sourceClass = body.sourceClass;
  const sourceActorId =
    typeof body.sourceActorId === "string" && body.sourceActorId.trim() !== ""
      ? body.sourceActorId.trim()
      : null;
  const supersedesId =
    typeof body.supersedesId === "string" && body.supersedesId.trim() !== ""
      ? body.supersedesId.trim()
      : null;
  const observedAt = typeof body.observedAt === "string" ? body.observedAt : null;

  /* REFUSED, LOUDLY. `sourceReference` was a caller-supplied free-text field
     that persisted in plaintext beside the tokens — a second, unprotected
     way to store exactly what the token machinery exists to protect.

     It is rejected rather than quietly dropped. A silent drop is the worse
     failure of the two: the founder writes a provenance note, gets a 201,
     and believes the platform recorded something it discarded. Better to
     refuse the write than to let someone trust a record that does not
     exist. */
  if (body.sourceReference !== undefined) {
    return NextResponse.json(
      {
        error: "unsupported_field",
        field: "sourceReference",
        detail:
          "Free-text provenance is not accepted on this path and was NOT recorded. Nothing was written.",
      },
      { status: 400 }
    );
  }

  /* The one piece of sensitive material in this request. Held in a local,
     used twice, and never referenced again. NOTE: `body.equalityToken` and
     anything like it is deliberately NOT read — a caller cannot supply a
     token. */
  const rawValue = typeof body.value === "string" ? body.value : "";

  if (!physicalWatchId) {
    return NextResponse.json({ error: "bad_request", detail: "physicalWatchId required." }, { status: 400 });
  }
  if (!isIdentifierType(identifierType)) {
    return NextResponse.json(
      { error: "bad_request", detail: "identifierType is not a governed identifier type." },
      { status: 400 }
    );
  }
  if (!isSourceClass(sourceClass)) {
    return NextResponse.json(
      { error: "bad_request", detail: "sourceClass is not a governed source class." },
      { status: 400 }
    );
  }
  if (rawValue === "") {
    // Says which rule failed. Never what was submitted.
    return NextResponse.json({ error: "bad_request", detail: "value required." }, { status: 400 });
  }

  let tokenized;
  try {
    tokenized = tokenizeIdentifier({
      identifierType: identifierType as IdentifierType,
      rawValue,
    });
  } catch (e) {
    if (e instanceof IdentifierTokenUnavailable) {
      /* Fail closed. The message names the environment variable, never any
         key material and never the submitted value. */
      return NextResponse.json(
        { error: "token_key_unavailable", detail: e.message },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: "tokenization_failed" }, { status: 500 });
  }

  if (!tokenized.ok) {
    return NextResponse.json(
      {
        error: "bad_request",
        detail:
          tokenized.reason === "too_long"
            ? "value is longer than a plausible identifier."
            : "value normalizes to nothing.",
      },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  const { data, error } = await db.rpc("record_identifier_observation", {
    p_physical_watch_id: physicalWatchId,
    p_identifier_type: identifierType,
    p_equality_token: tokenized.value.equalityToken,
    p_normalization_version: tokenized.value.normalizationVersion,
    p_token_key_version: tokenized.value.tokenKeyVersion,
    p_source_class: sourceClass,
    p_source_actor_id: sourceActorId,
    /* ALWAYS NULL IN V1 — see the free-text ruling above. A database CHECK
       enforces it too, so this is belt and braces rather than a promise. */
    p_source_reference: null,
    p_observed_at: observedAt,
    p_supersedes_id: supersedesId,
    p_recorded_by: gate.user!.id,
  });

  if (error) {
    /* The RPC's own message is a bounded set of governed codes, but it is a
       database string on a path that handles sensitive input, and a future
       constraint could put echoed row content into it. Map to a fixed code
       instead of forwarding it: the caller learns the write failed, and the
       detail stays server-side. */
    const known = new Set([
      "superseded_observation_not_found",
      "supersession_crosses_physical_watch",
      "supersession_crosses_identifier_type",
      "superseded_observation_not_current",
    ]);
    const reason = known.has(error.message) ? error.message : "write_rejected";
    return NextResponse.json({ error: "write_failed", reason }, { status: 400 });
  }

  const { data: recorded } = await db
    .from("physical_watch_identifier_observations")
    .select(METADATA_COLUMNS)
    .eq("id", data as string)
    .maybeSingle();

  /* Metadata only. No token, no value, nothing from which either could be
     reconstructed — the caller learns THAT evidence was recorded and
     nothing about what it says. */
  return NextResponse.json({ ok: true, observation: recorded ?? { id: data } }, { status: 201 });
}
