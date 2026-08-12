/* ════════════════════════════════════════════════════════════════════════
   AUBREY CHECK FLIGHT 1 — helper and route contract tests (RT01–RT26)
   Run: node --experimental-strip-types scripts/aubrey-listing-photo-exact-hash.route.test.mjs

   Exercises the production helper through its dependency seams (Blob get,
   clock, service client) — no network, no database, no repository mutation.
   RT21–RT26 are static source-contract guards over the changed files.
   ════════════════════════════════════════════════════════════════════════ */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const {
  AUBREY_EXACT_HASH_MAX_BYTES,
  ensureExactHashAttempts,
  hashRetainedBytes,
  isRetainedListingsPath,
  sha256OfStream,
} = await import("../lib/aubrey/listingPhotoExactHash.ts");

let pass = 0;
const ok = (name, condition) => {
  assert.ok(condition, name);
  pass++;
};

/* ── Fakes ─────────────────────────────────────────────────────────────── */

const FIXTURE = Buffer.from(
  "aubrey flight one exact byte fixture — retained normalized bytes\n"
);
const FIXTURE_SHA = createHash("sha256").update(FIXTURE).digest("hex");

function streamOf(chunks, onConsume) {
  let i = 0;
  return new ReadableStream(
    {
      pull(controller) {
        if (onConsume) onConsume();
        if (i < chunks.length) controller.enqueue(new Uint8Array(chunks[i++]));
        else controller.close();
      },
    },
    { highWaterMark: 0 } // pull only on an actual read — never at construction
  );
}

function makeBlobGet({
  bytes = FIXTURE,
  chunks = null,
  declaredSize = null,
  pathnameOverride = null,
  throwName = null,
  onConsume = null,
} = {}) {
  const calls = [];
  const fn = async (path, opts) => {
    calls.push({ path, opts });
    if (throwName) {
      const err = new Error(throwName);
      err.name = throwName;
      throw err;
    }
    const body = chunks ?? [bytes];
    return {
      statusCode: 200,
      stream: streamOf(body, onConsume),
      headers: new Headers(),
      blob: {
        url: "",
        downloadUrl: "",
        pathname: pathnameOverride ?? path,
        contentDisposition: "",
        cacheControl: "",
        uploadedAt: new Date(0),
        etag: "",
        contentType: "image/jpeg",
        size: declaredSize ?? body.reduce((n, c) => n + c.length, 0),
      },
    };
  };
  fn.calls = calls;
  return fn;
}

function makeService({
  existingAttempts = [],
  rpcResult = null,
  rpcError = null,
  insertErrorCode = null,
  rpcResultByMedia = null,
} = {}) {
  const inserts = [];
  const rpcCalls = [];
  const service = {
    inserts,
    rpcCalls,
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq: async () => ({ data: existingAttempts, error: null }),
              };
            },
          };
        },
        insert: async (row) => {
          inserts.push(row);
          return insertErrorCode
            ? { error: { code: insertErrorCode, message: "duplicate" } }
            : { error: null };
        },
      };
    },
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      if (rpcError) return { data: null, error: { message: rpcError } };
      const data =
        rpcResultByMedia?.[args.p_media_id] ??
        rpcResult ?? {
          schema_version: "aubrey.exact_hash.rpc/v1",
          cross_listing_match_count: 0,
          matches: [],
          matches_truncated: false,
        };
      return { data, error: null };
    },
  };
  return service;
}

const deps = (blobGet, fetchImpl) => ({
  blobGet,
  // Unless a test provides one, the public-store fallback is unavailable —
  // pre-fallback assertions keep their original meaning.
  fetchImpl:
    fetchImpl ??
    (async () => {
      throw new Error("public store unavailable in this test");
    }),
  nowIso: () => "2026-08-04T00:00:00.000Z",
  timeoutMs: 500,
});

/** Fake public-store fetch returning the fixture bytes at the right URL. */
function makePublicFetch({
  bytes = FIXTURE,
  status = 200,
  finalUrlOverride = null,
  contentLength = null,
} = {}) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    return {
      ok: status >= 200 && status < 300,
      status,
      url: finalUrlOverride ?? url,
      headers: new Headers(
        contentLength === null ? {} : { "content-length": String(contentLength) }
      ),
      body: streamOf([bytes]),
    };
  };
  fn.calls = calls;
  return fn;
}

const mediaRow = (over = {}) => ({
  id: "media-1",
  listing_id: "listing-1",
  storage_path: "listings/fixture.jpg",
  capture_source: "desktop_upload",
  category: "Dial",
  capture_session_id: "cs-1",
  ...over,
});

/* ── RT01 · known fixture hashes to Node's expected SHA-256 ────────────── */
{
  const r = await hashRetainedBytes("listings/fixture.jpg", deps(makeBlobGet()));
  ok("RT01 known fixture digest matches node:crypto", r.ok && r.digest === FIXTURE_SHA);
}

/* ── RT02 · lowercase 64-hex; one changed byte changes the digest ──────── */
{
  const r = await hashRetainedBytes("listings/fixture.jpg", deps(makeBlobGet()));
  ok("RT02 digest is lowercase 64-hex", /^[0-9a-f]{64}$/.test(r.digest));
  const altered = Buffer.from(FIXTURE);
  altered[0] ^= 0xff;
  const r2 = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ bytes: altered }))
  );
  ok("RT02 one changed byte changes the digest", r2.ok && r2.digest !== r.digest);
}

/* ── RT03 · streamed chunks and one buffer produce identical digests ───── */
{
  const chunked = await sha256OfStream(
    streamOf([FIXTURE.subarray(0, 7), FIXTURE.subarray(7, 20), FIXTURE.subarray(20)]),
    AUBREY_EXACT_HASH_MAX_BYTES
  );
  const single = await sha256OfStream(streamOf([FIXTURE]), AUBREY_EXACT_HASH_MAX_BYTES);
  ok(
    "RT03 chunked and single-buffer digests identical",
    chunked.ok && single.ok && chunked.digest === single.digest && chunked.digest === FIXTURE_SHA
  );
}

/* ── RT04 · client original_hash / URL are ignored even when malicious ─── */
{
  const service = makeService();
  const blobGet = makeBlobGet();
  const malicious = mediaRow({
    original_hash: "f".repeat(64), // client-claimed digest — must be ignored
    url: "https://evil.example/steal.jpg",
  });
  await ensureExactHashAttempts(
    { service, media: [malicious], triggeredBy: "system_upload" },
    deps(blobGet)
  );
  ok(
    "RT04 digest derives from retained bytes, never client claims",
    service.rpcCalls.length === 1 &&
      service.rpcCalls[0].args.p_content_sha256 === FIXTURE_SHA
  );
  ok(
    "RT04 fetch used the authoritative pathname, not the client URL",
    blobGet.calls.length === 1 && blobGet.calls[0].path === "listings/fixture.jpg"
  );
}

/* ── RT05 · only authoritative listings/… pathnames reach Blob get ─────── */
{
  for (const bad of [
    "https://example.com/listings/x.jpg",
    "listings/../secrets.txt",
    "listings\\x.jpg",
    "",
    "avatars/x.jpg",
    "/listings/x.jpg",
  ]) {
    const blobGet = makeBlobGet();
    const r = await hashRetainedBytes(bad, deps(blobGet));
    ok(
      `RT05 refused without fetch: ${JSON.stringify(bad)}`,
      r.ok === false && blobGet.calls.length === 0
    );
  }
  ok("RT05 authoritative path accepted", isRetainedListingsPath("listings/ok.jpg") === true);
}

/* ── RT06 · blob pathname mismatch → invalid_response/blob_path_mismatch ─ */
{
  const r = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ pathnameOverride: "listings/other.jpg" }))
  );
  ok(
    "RT06 pathname mismatch maps to invalid_response/blob_path_mismatch",
    r.ok === false &&
      r.executionStatus === "invalid_response" &&
      r.incompleteReason === "blob_path_mismatch"
  );
}

/* ── RT07 · declared size over 8 MiB refused without stream consumption ── */
{
  let consumed = false;
  const r = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(
      makeBlobGet({
        declaredSize: AUBREY_EXACT_HASH_MAX_BYTES + 1,
        onConsume: () => {
          consumed = true;
        },
      })
    )
  );
  ok(
    "RT07 oversize declared refused as blob_too_large",
    r.ok === false && r.incompleteReason === "blob_too_large"
  );
  ok("RT07 stream never consumed", consumed === false);
}

/* ── RT08 · actual streamed bytes over the bound abort as too large ────── */
{
  const big = Buffer.alloc(1024 * 1024, 7);
  const chunks = Array.from({ length: 9 }, () => big); // 9 MiB actual
  const r = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ chunks, declaredSize: 1024 })) // lies small
  );
  ok(
    "RT08 actual oversize stream maps to blob_too_large",
    r.ok === false &&
      r.executionStatus === "unavailable" &&
      r.incompleteReason === "blob_too_large"
  );
}

/* ── RT09 · timeout/abort → blob_fetch_timeout, never a publish throw ──── */
{
  const service = makeService();
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet({ throwName: "AbortError" }))
  );
  const row = service.inserts[0];
  ok(
    "RT09 abort recorded as unavailable/blob_fetch_timeout without throwing",
    service.inserts.length === 1 &&
      row.execution_status === "unavailable" &&
      row.classification === null &&
      row.completed_at === null &&
      row.detail.incomplete_reason === "blob_fetch_timeout"
  );
}

/* ── RT10 · not-found maps to a stable code and persists no hash ───────── */
{
  const service = makeService();
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet({ throwName: "BlobNotFoundError" }))
  );
  ok(
    "RT10 blob_not_found recorded; hash RPC never called",
    service.inserts.length === 1 &&
      service.inserts[0].detail.incomplete_reason === "blob_not_found" &&
      service.rpcCalls.length === 0
  );
}

/* ── RT11 · desktop and live paths hash and keep distinct provenance ───── */
{
  const service = makeService();
  await ensureExactHashAttempts(
    {
      service,
      media: [
        mediaRow({ id: "m-desk", capture_source: "desktop_upload" }),
        mediaRow({
          id: "m-live",
          listing_id: "listing-2",
          storage_path: "listings/live.jpg",
          capture_source: "live_camera",
        }),
      ],
      triggeredBy: "system_upload",
    },
    deps(makeBlobGet())
  );
  const sources = service.inserts.map((r) => r.detail.capture_source).sort();
  ok(
    "RT11 both retained-byte paths hashed with distinct capture sources",
    service.inserts.length === 2 &&
      sources.join(",") === "desktop_upload,live_camera" &&
      service.inserts.every((r) => r.execution_status === "completed")
  );
}

/* ── RT12 · dealer-import URL never fetched; recorded as not retained ──── */
{
  const service = makeService();
  const blobGet = makeBlobGet();
  await ensureExactHashAttempts(
    {
      service,
      media: [
        mediaRow({
          capture_source: "dealer_import",
          storage_path: "https://dealer.example/inventory/1.jpg",
        }),
      ],
      triggeredBy: "system_upload",
    },
    deps(blobGet)
  );
  const row = service.inserts[0];
  ok(
    "RT12 dealer URL not fetched; source_bytes_not_retained recorded",
    blobGet.calls.length === 0 &&
      service.rpcCalls.length === 0 &&
      row.execution_status === "unavailable" &&
      row.detail.incomplete_reason === "source_bytes_not_retained" &&
      row.detail.capture_source === "dealer_import" &&
      row.detail.hash_scope === "retained_object_bytes"
  );
}

/* ── RT13 · zero recurrence → completed/passed/no-recurrence detail ────── */
{
  const service = makeService();
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet())
  );
  const row = service.inserts[0];
  ok(
    "RT13 completed/passed with no_cross_listing_recurrence",
    row.execution_status === "completed" &&
      row.classification === "passed" &&
      row.detail.outcome === "no_cross_listing_recurrence" &&
      row.detail.cross_listing_match_count === 0 &&
      Array.isArray(row.detail.matches) &&
      row.detail.matches.length === 0 &&
      row.detail.matches_truncated === false &&
      row.detail.content_sha256 === FIXTURE_SHA
  );
}

/* ── RT14 · recurrence → completed/passed with bounded matches ─────────── */
{
  const service = makeService({
    rpcResult: {
      schema_version: "aubrey.exact_hash.rpc/v1",
      cross_listing_match_count: 2,
      matches: [
        { media_id: "m-a", listing_id: "l-a", capture_source: "live_camera" },
        { media_id: "m-b", listing_id: "l-b", capture_source: "dealer_import" },
      ],
      matches_truncated: false,
    },
  });
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet())
  );
  const row = service.inserts[0];
  ok(
    "RT14 recurrence recorded as observation with matches",
    row.execution_status === "completed" &&
      row.classification === "passed" &&
      row.detail.outcome === "cross_listing_recurrence" &&
      row.detail.cross_listing_match_count === 2 &&
      row.detail.matches.length === 2
  );
}

/* ── RT15 · completed outcomes are inert: gate_effect, null reason ─────── */
{
  const service = makeService();
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet())
  );
  const row = service.inserts[0];
  ok(
    "RT15 completed row carries gate_effect none_flight_1, null reason, no confidence/source URL",
    row.detail.gate_effect === "none_flight_1" &&
      row.reason === null &&
      !("confidence" in row) &&
      !("matched_source_url" in row) &&
      row.detail.verdict === "observation_only"
  );
}

/* ── RT16 · active completed attempt → full skip ───────────────────────── */
{
  const service = makeService({
    existingAttempts: [
      { execution_status: "completed", is_active: true, attempt_number: 1 },
    ],
  });
  const blobGet = makeBlobGet();
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "retry" },
    deps(blobGet)
  );
  ok(
    "RT16 active completed attempt skips fetch, RPC, and insert",
    blobGet.calls.length === 0 &&
      service.rpcCalls.length === 0 &&
      service.inserts.length === 0
  );
}

/* ── RT17 · incomplete attempt retries with incremented number ─────────── */
{
  const service = makeService({
    existingAttempts: [
      { execution_status: "unavailable", is_active: true, attempt_number: 1 },
    ],
  });
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "retry" },
    deps(makeBlobGet())
  );
  const row = service.inserts[0];
  ok(
    "RT17 retry increments attempt number with triggered_by retry",
    row.attempt_number === 2 && row.triggered_by === "retry"
  );
}

/* ── RT18 · concurrent duplicate 23505 is a harmless winner ────────────── */
{
  const service = makeService({ insertErrorCode: "23505" });
  await ensureExactHashAttempts(
    { service, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(makeBlobGet())
  );
  ok("RT18 23505 resolves without throwing", service.inserts.length === 1);
}

/* ── RT19 · one photo's failure never blocks siblings ──────────────────── */
{
  const service = makeService();
  const failingGet = async (path, opts) => {
    if (path === "listings/fails.jpg") {
      const err = new Error("BlobNotFoundError");
      err.name = "BlobNotFoundError";
      throw err;
    }
    return makeBlobGet()(path, opts);
  };
  await ensureExactHashAttempts(
    {
      service,
      media: [
        mediaRow({ id: "m-1", storage_path: "listings/a.jpg" }),
        mediaRow({ id: "m-2", storage_path: "listings/fails.jpg", listing_id: "l-2" }),
        mediaRow({ id: "m-3", storage_path: "listings/c.jpg", listing_id: "l-3" }),
      ],
      triggeredBy: "system_upload",
    },
    deps(failingGet)
  );
  const completed = service.inserts.filter((r) => r.execution_status === "completed");
  const unavailable = service.inserts.filter((r) => r.execution_status === "unavailable");
  ok(
    "RT19 siblings complete despite one failure",
    service.inserts.length === 3 && completed.length === 2 && unavailable.length === 1
  );
}

/* ── RT20 · absent service client: no fabricated row, no throw ─────────── */
{
  const blobGet = makeBlobGet();
  await ensureExactHashAttempts(
    { service: null, media: [mediaRow()], triggeredBy: "system_upload" },
    deps(blobGet)
  );
  ok("RT20 null service produces no fetch and no rows", blobGet.calls.length === 0);
}

/* ── Static source guards (RT21–RT26) ──────────────────────────────────── */
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const routeSrc = read("app/api/listings/route.ts");
const integritySrc = read("lib/integrity.ts");
const helperSrc = read("lib/aubrey/listingPhotoExactHash.ts");

/* RT21 · hash runs after listing_media exists, before evidence promotion. */
{
  const mediaInsertIdx = routeSrc.indexOf('.from("listing_media")');
  const callIdx = routeSrc.indexOf("await ensureExactHashAttempts(");
  const promotionIdx = routeSrc.indexOf("evidence promotion — accepted findings only");
  ok(
    "RT21 call site sits after media insertion and before evidence promotion",
    mediaInsertIdx > -1 && callIdx > mediaInsertIdx && promotionIdx > callIdx
  );
}

/* RT22 · publish response carries no hash, match IDs, or new seller copy. */
{
  ok(
    "RT22 route response contains no exact-hash evidence",
    !routeSrc.includes("content_sha256") &&
      !/NextResponse\.json\([^)]*matches/.test(routeSrc) &&
      (routeSrc.match(/ensureExactHashAttempts\(/g) ?? []).length === 1
  );
}

/* RT23 · helper is not conditional on and never mutates AUBREY_ENFORCEMENT. */
{
  const callBlock = routeSrc.slice(
    routeSrc.indexOf("// 2b · Aubrey Flight 1"),
    routeSrc.indexOf("// 3 · evidence promotion")
  );
  ok(
    "RT23 exact-hash is unconditional on enforcement and never mutates it",
    // Guard against USE, not mention: no env read, no enforcement predicate,
    // and no enforcement gating around the route call site.
    !helperSrc.includes("process.env.AUBREY_ENFORCEMENT") &&
      !helperSrc.includes("aubreyEnforcementEnabled") &&
      !callBlock.includes("aubreyOn") &&
      !callBlock.includes("process.env.AUBREY_ENFORCEMENT") &&
      !callBlock.includes("aubreyEnforcementEnabled")
  );
}

/* RT24 · no client component imports the helper. */
{
  const offenders = [];
  const scan = (dir) => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        if (entry === "node_modules" || entry === ".next" || entry === ".git") continue;
        scan(full);
      } else if (/\.(tsx?|mjs)$/.test(entry)) {
        const text = readFileSync(full, "utf8");
        if (
          text.includes("listingPhotoExactHash") &&
          (text.startsWith('"use client"') || text.startsWith("'use client'"))
        ) {
          offenders.push(full);
        }
      }
    }
  };
  scan(new URL("../components", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"));
  scan(new URL("../app", import.meta.url).pathname.replace(/^\/([A-Za-z]):/, "$1:"));
  ok("RT24 no client component imports the helper", offenders.length === 0);
}

/* RT25 · the provider never appears in hold/coverage/status branches.

   Anchors are ASSERTED, not assumed. The original form sliced between two
   string anchors and silently produced a whole-file slice when one of them
   was later renamed — a guard that fails for the wrong reason is only one
   rename away from a guard that passes for the wrong reason. Each anchor is
   now proven present before it is used, and the provider-symbol checks are
   whole-file and therefore rename-proof. */
{
  const anchor = (src, needle, label) => {
    const at = src.indexOf(needle);
    ok(`RT25 anchor present: ${label}`, at !== -1);
    return at;
  };

  // Coverage: nothing from the aggregate onward may name the provider.
  const aggregateAt = anchor(
    integritySrc,
    "export async function aggregateIntegrityForListing",
    "aggregateIntegrityForListing"
  );
  const aggregateBody = integritySrc.slice(aggregateAt);
  ok(
    "RT25 the coverage gate never names the exact-hash provider",
    !aggregateBody.includes("AUBREY_EXACT_HASH")
  );

  // Regate: bounded by the next top-level declaration, which is structural
  // rather than cosmetic and therefore survives comment and helper renames.
  const regateAt = anchor(routeSrc, "async function regateHeldListing", "regateHeldListing");
  const regateEnd = anchor(
    routeSrc,
    "async function completePublishOrchestration",
    "completePublishOrchestration (regate end bound)"
  );
  ok("RT25 the regate bound is ordered", regateAt < regateEnd);
  const regateBody = routeSrc.slice(regateAt, regateEnd);
  ok(
    "RT25 the retry regate neither names nor invokes the exact-hash layer",
    !regateBody.includes("AUBREY_EXACT_HASH") &&
      !regateBody.includes("ensureExactHashAttempts") &&
      !regateBody.includes("buildPromotedEvidenceRows")
  );

  /* Status decisions: proven by whole-file symbol accounting instead of a
     slice, so no future rename can quietly widen or empty the region.
     ensureExactHashAttempts may occur exactly twice — its import and its one
     call site — and that call site must sit inside the orchestration, after
     the media rows exist and before evidence promotion. */
  const occurrences = (needle) => routeSrc.split(needle).length - 1;
  ok(
    "RT25 the provider constant appears nowhere in the publish route",
    !routeSrc.includes("AUBREY_EXACT_HASH")
  );
  ok(
    "RT25 no cause value is named in the publish route",
    !routeSrc.includes("cause_group") && !routeSrc.includes("distinctCauseCount")
  );
  ok(
    "RT25 the exact-hash layer is invoked exactly once",
    occurrences("ensureExactHashAttempts") === 2
  );
  const orchestrationAt = anchor(
    routeSrc,
    "async function completePublishOrchestration",
    "completePublishOrchestration (call-site home)"
  );
  ok(
    "RT25 that one invocation lives inside the orchestration",
    routeSrc.lastIndexOf("ensureExactHashAttempts") > orchestrationAt
  );
}

/* RT27 · the public-store fallback — the production blob_read_failed repair.
   The SDK path failing in the auth shape hands over to a server-constructed
   public URL with identical guards; authoritative refusals never fall back. */
{
  const { blobPublicBase } = await import("../lib/aubrey/listingPhotoExactHash.ts");

  // Auth-shaped SDK failure → fallback produces the digest.
  const goodFetch = makePublicFetch();
  const viaFallback = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ throwName: "BlobError" }), goodFetch)
  );
  ok(
    "RT27 auth-shaped SDK failure falls back and hashes the true bytes",
    viaFallback.ok && viaFallback.digest === FIXTURE_SHA
  );
  ok(
    "RT27 the fallback fetched the server-constructed public URL",
    goodFetch.calls.length === 1 &&
      goodFetch.calls[0] === `${blobPublicBase()}/listings/fixture.jpg`
  );

  // SDK success never consults the fallback.
  const untouched = makePublicFetch();
  const viaSdk = await hashRetainedBytes("listings/fixture.jpg", deps(makeBlobGet(), untouched));
  ok("RT27 SDK success never touches the public store", viaSdk.ok && untouched.calls.length === 0);

  // Authoritative refusals do NOT fall back.
  for (const [label, blobOpts, reason] of [
    ["not-found", { throwName: "BlobNotFoundError" }, "blob_not_found"],
    ["timeout", { throwName: "AbortError" }, "blob_fetch_timeout"],
    ["path mismatch", { pathnameOverride: "listings/other.jpg" }, "blob_path_mismatch"],
    ["oversize", { declaredSize: AUBREY_EXACT_HASH_MAX_BYTES + 1 }, "blob_too_large"],
  ]) {
    const spy = makePublicFetch();
    const r = await hashRetainedBytes("listings/fixture.jpg", deps(makeBlobGet(blobOpts), spy));
    ok(
      `RT27 authoritative ${label} answers directly (${reason}), no fallback`,
      r.ok === false && r.incompleteReason === reason && spy.calls.length === 0
    );
  }

  // Fallback guards are as strict as the SDK path's.
  const redirected = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(
      makeBlobGet({ throwName: "BlobError" }),
      makePublicFetch({ finalUrlOverride: `${blobPublicBase()}/listings/other.jpg` })
    )
  );
  ok(
    "RT27 a redirect cannot substitute bytes — path mismatch refused",
    redirected.ok === false && redirected.incompleteReason === "blob_path_mismatch"
  );

  const fallback404 = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ throwName: "BlobError" }), makePublicFetch({ status: 404 }))
  );
  ok(
    "RT27 fallback 404 records blob_not_found",
    fallback404.ok === false && fallback404.incompleteReason === "blob_not_found"
  );

  const fallbackOversize = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(
      makeBlobGet({ throwName: "BlobError" }),
      makePublicFetch({ contentLength: AUBREY_EXACT_HASH_MAX_BYTES + 1 })
    )
  );
  ok(
    "RT27 fallback declared oversize refused as blob_too_large",
    fallbackOversize.ok === false && fallbackOversize.incompleteReason === "blob_too_large"
  );

  const bothDown = await hashRetainedBytes(
    "listings/fixture.jpg",
    deps(makeBlobGet({ throwName: "BlobError" }))
  );
  ok(
    "RT27 both paths down still degrades to blob_read_failed, never a throw",
    bothDown.ok === false && bothDown.incompleteReason === "blob_read_failed"
  );
}

/* RT26 · banned language scan over changed runtime files. */
{
  const banned = /stolen|theft|fraud|scam|copied image|guilty/i;
  const files = [
    "app/api/listings/route.ts",
    "lib/integrity.ts",
    "lib/aubrey/listingPhotoExactHash.ts",
    "supabase/migrations/20260804150000_aubrey_listing_photo_exact_hash.sql",
    "supabase/rollbacks/20260804150000_aubrey_listing_photo_exact_hash.down.sql",
  ];
  const hits = files.filter((f) => banned.test(read(f)));
  ok(`RT26 no banned language in changed runtime files`, hits.length === 0);
}

console.log(`aubrey-listing-photo-exact-hash.route: ${pass} assertions PASS`);
