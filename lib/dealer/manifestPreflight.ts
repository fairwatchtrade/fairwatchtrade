/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — NDJSON MANIFEST PREFLIGHT  (lib/dealer/manifestPreflight.ts)

   PURE module: deterministic functions over bytes, no I/O, no secrets, no
   client. The server-only boundary the contract requires (§12) lives on
   the adapter module and the pinned fetch layer, which are the only
   callers; keeping this file pure lets the §18 exact-byte unit matrix run
   against the real implementation under plain node.

   The total preflight of Dealer Accelerator Flight 3 (contract v7 §4 + §8).
   Runs against the FROZEN ARCHIVED BYTES named by a manifest capture —
   never a remote URL — and precedes ALL item writes. A failed preflight
   means zero source items, observations, or photographs.

   Laws enforced here, byte-exactly:
   · NDJSON only; framing lf | crlf | none (none = final line only)
   · UTF-8 BOM rejected (manifest_bom_unsupported) — no silent byte
     transformation, ever
   · blank/whitespace-only lines rejected (blank_line_forbidden)
   · every line: valid UTF-8, valid JSON, top-level OBJECT (array, scalar,
     null → item_must_be_object)
   · duplicate JSON object keys rejected RECURSIVELY at the tokenizer level
     (top level, photographs, any nested object) — a parser silently
     keeping the last occurrence is not acceptable for governed evidence
   · item_id: required JSON string with ≥1 code point outside Unicode
     White_Space=yes. Validity is a TEST, never a transformation; the
     stored key is the exact decoded string, verbatim, case-sensitive.
     Unicode-normalization-distinct strings are NOT duplicates.
   · photographs: optional array of objects; url required nonblank string;
     pathname/category optional string-or-null; sequence = array position
   · unknown properties on item AND photograph objects: preserved verbatim
     in the payload bytes, read by nothing — accepted and ignored,
     symmetrically
   · caps: MAX_MANIFEST_BYTES / MAX_LINE_BYTES
   · byte offsets are ZERO-based, start inclusive / end exclusive, relative
     to the archived object exactly as stored; the terminator lies OUTSIDE
     the item span; line numbers are ONE-based
   ════════════════════════════════════════════════════════════════════════ */

/** Implementation-order constants (§8 caps). */
export const MAX_MANIFEST_BYTES = 50 * 1024 * 1024; // 50 MiB
export const MAX_LINE_BYTES = 1 * 1024 * 1024; // 1 MiB per physical line

/** §8 content-type allowlist, exact. */
export const MANIFEST_CONTENT_TYPES = [
  "application/x-ndjson",
  "application/jsonl",
  "text/plain",
] as const;

export type LineFraming = "lf" | "crlf" | "none";

export interface PreflightPhotograph {
  sourceUrl: string;
  sourcePathname: string | null;
  declaredCategory: string | null;
  sequenceIndex: number;
}

export interface PreflightItem {
  lineNumber: number; // one-based
  byteStart: number; // zero-based, inclusive
  byteEnd: number; // zero-based, exclusive — terminator outside the span
  framing: LineFraming;
  declaredItemId: string; // exact decoded string, verbatim
  photographs: PreflightPhotograph[];
  /** The exact line bytes — the whole line is the payload, unknowns included. */
  payloadBytes: Uint8Array;
}

export type PreflightResult =
  | { disposition: "accepted"; items: PreflightItem[] }
  | { disposition: "rejected"; reason: PreflightRejection; lineNumber: number | null };

export type PreflightRejection =
  | "empty_manifest"
  | "manifest_bom_unsupported"
  | "manifest_too_large"
  | "line_too_large"
  | "blank_line_forbidden"
  | "invalid_utf8"
  | "invalid_json"
  | "item_must_be_object"
  | "duplicate_json_key"
  | "item_id_missing"
  | "item_id_must_be_string"
  | "item_id_whitespace_only"
  | "duplicate_declared_item_id"
  | "photographs_must_be_array"
  | "photograph_declaration_must_be_object"
  | "photograph_url_missing"
  | "photograph_url_must_be_nonblank_string"
  | "photograph_pathname_invalid"
  | "photograph_category_invalid"
  | "unsupported_manifest_shape";

/* ── Strict UTF-8 decode: any ill-formed sequence is a failure, never a
   replacement character. TextDecoder(fatal) throws on invalid input. ── */
const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

/* ── Duplicate-key-detecting JSON parser ──────────────────────────────────
   A compact recursive-descent parser over the DECODED text. It exists for
   one reason JSON.parse cannot serve: JSON.parse silently keeps the last
   occurrence of a duplicated key, and §4 demands recursive rejection at the
   tokenizer level. It parses the full JSON grammar; on the first duplicate
   key at ANY depth it throws DuplicateKeyError. */
class DuplicateKeyError extends Error {}
class JsonSyntaxError extends Error {}

function parseJsonStrict(text: string): unknown {
  let i = 0;
  const n = text.length;

  const ws = () => {
    while (i < n) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };
  const fail = (): never => {
    throw new JsonSyntaxError(`invalid JSON at offset ${i}`);
  };

  function parseValue(): unknown {
    ws();
    if (i >= n) fail();
    const c = text[i];
    if (c === "{") return parseObject();
    if (c === "[") return parseArray();
    if (c === '"') return parseString();
    if (c === "t") return parseLiteral("true", true);
    if (c === "f") return parseLiteral("false", false);
    if (c === "n") return parseLiteral("null", null);
    return parseNumber();
  }

  function parseLiteral<T>(lit: string, v: T): T {
    if (text.startsWith(lit, i)) {
      i += lit.length;
      return v;
    }
    return fail();
  }

  function parseNumber(): number {
    const start = i;
    if (text[i] === "-") i++;
    if (text[i] === "0") i++;
    else if (text[i] >= "1" && text[i] <= "9") {
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    } else fail();
    if (text[i] === ".") {
      i++;
      if (!(text[i] >= "0" && text[i] <= "9")) fail();
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }
    if (text[i] === "e" || text[i] === "E") {
      i++;
      if (text[i] === "+" || text[i] === "-") i++;
      if (!(text[i] >= "0" && text[i] <= "9")) fail();
      while (i < n && text[i] >= "0" && text[i] <= "9") i++;
    }
    return Number(text.slice(start, i));
  }

  function parseString(): string {
    if (text[i] !== '"') fail();
    i++;
    let out = "";
    while (i < n) {
      const c = text[i];
      const code = text.charCodeAt(i);
      if (c === '"') {
        i++;
        return out;
      }
      if (c === "\\") {
        i++;
        const e = text[i];
        i++;
        switch (e) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = text.slice(i, i + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail();
            out += String.fromCharCode(parseInt(hex, 16));
            i += 4;
            break;
          }
          default:
            fail();
        }
      } else if (code < 0x20) {
        fail(); // raw control character inside a JSON string
      } else {
        out += c;
        i++;
      }
    }
    return fail();
  }

  function parseObject(): Record<string, unknown> {
    i++; // {
    const obj: Record<string, unknown> = Object.create(null);
    const seen = new Set<string>();
    ws();
    if (text[i] === "}") {
      i++;
      return obj;
    }
    for (;;) {
      ws();
      const key = parseString();
      // §4: duplicate keys rejected recursively — the whole point of this
      // parser. Comparison is on the exact decoded string.
      if (seen.has(key)) throw new DuplicateKeyError(key);
      seen.add(key);
      ws();
      if (text[i] !== ":") fail();
      i++;
      obj[key] = parseValue();
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") {
        i++;
        return obj;
      }
      fail();
    }
  }

  function parseArray(): unknown[] {
    i++; // [
    const arr: unknown[] = [];
    ws();
    if (text[i] === "]") {
      i++;
      return arr;
    }
    for (;;) {
      arr.push(parseValue());
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") {
        i++;
        return arr;
      }
      fail();
    }
  }

  const v = parseValue();
  ws();
  if (i !== n) fail(); // trailing garbage after the value
  return v;
}

/** §4: at least one code point outside Unicode White_Space=yes. A TEST,
    never a transformation — uses the exact Unicode property, not \s
    (which includes U+FEFF, a non-White_Space code point). */
const HAS_NON_WHITESPACE = /[^\p{White_Space}]/u;

/**
 * Total preflight over the frozen archived manifest bytes.
 * Pure: no I/O, no mutation of the input, deterministic.
 */
export function preflightManifest(bytes: Uint8Array): PreflightResult {
  if (bytes.length === 0) {
    return { disposition: "rejected", reason: "empty_manifest", lineNumber: null };
  }
  if (bytes.length > MAX_MANIFEST_BYTES) {
    return { disposition: "rejected", reason: "manifest_too_large", lineNumber: null };
  }
  // §8: UTF-8 BOM is rejected before anything else looks at the bytes.
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
    return { disposition: "rejected", reason: "manifest_bom_unsupported", lineNumber: 1 };
  }

  // ── Physical line scan over RAW BYTES (framing + offsets first) ──
  const items: PreflightItem[] = [];
  const seenIds = new Set<string>();
  let lineStart = 0;
  let lineNumber = 0;

  while (lineStart < bytes.length) {
    lineNumber++;
    // find the next LF from lineStart
    let lf = -1;
    for (let j = lineStart; j < bytes.length; j++) {
      if (bytes[j] === 0x0a) {
        lf = j;
        break;
      }
    }
    let byteEnd: number;
    let framing: LineFraming;
    let nextStart: number;
    if (lf === -1) {
      byteEnd = bytes.length;
      framing = "none"; // accepted final line with no terminating newline
      nextStart = bytes.length;
    } else if (lf > lineStart && bytes[lf - 1] === 0x0d) {
      byteEnd = lf - 1;
      framing = "crlf";
      nextStart = lf + 1;
    } else {
      byteEnd = lf;
      framing = "lf";
      nextStart = lf + 1;
    }

    const span = bytes.subarray(lineStart, byteEnd);

    // A terminator-only manifest (single empty final "line") is
    // empty_manifest; any other blank line is blank_line_forbidden.
    if (span.length === 0) {
      if (lineNumber === 1 && nextStart >= bytes.length && items.length === 0) {
        return { disposition: "rejected", reason: "empty_manifest", lineNumber: null };
      }
      return { disposition: "rejected", reason: "blank_line_forbidden", lineNumber };
    }
    if (span.length > MAX_LINE_BYTES) {
      return { disposition: "rejected", reason: "line_too_large", lineNumber };
    }

    let text: string;
    try {
      text = strictUtf8.decode(span);
    } catch {
      return { disposition: "rejected", reason: "invalid_utf8", lineNumber };
    }
    if (!HAS_NON_WHITESPACE.test(text)) {
      return { disposition: "rejected", reason: "blank_line_forbidden", lineNumber };
    }

    let value: unknown;
    try {
      value = parseJsonStrict(text);
    } catch (e) {
      if (e instanceof DuplicateKeyError) {
        return { disposition: "rejected", reason: "duplicate_json_key", lineNumber };
      }
      return { disposition: "rejected", reason: "invalid_json", lineNumber };
    }
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      return { disposition: "rejected", reason: "item_must_be_object", lineNumber };
    }
    const obj = value as Record<string, unknown>;

    // ── item_id (§4, exact) ──
    if (!("item_id" in obj)) {
      return { disposition: "rejected", reason: "item_id_missing", lineNumber };
    }
    const rawId = obj["item_id"];
    if (typeof rawId !== "string") {
      return { disposition: "rejected", reason: "item_id_must_be_string", lineNumber };
    }
    if (!HAS_NON_WHITESPACE.test(rawId)) {
      return { disposition: "rejected", reason: "item_id_whitespace_only", lineNumber };
    }
    // Exact-string duplicate law: two lexically different JSON strings that
    // DECODE to the same string are duplicates; normalization-form-distinct
    // strings are not.
    if (seenIds.has(rawId)) {
      return { disposition: "rejected", reason: "duplicate_declared_item_id", lineNumber };
    }
    seenIds.add(rawId);

    // ── photographs (§4, exact; Flight 2 conventions) ──
    const photographs: PreflightPhotograph[] = [];
    if ("photographs" in obj && obj["photographs"] !== undefined) {
      const arr = obj["photographs"];
      if (!Array.isArray(arr)) {
        return { disposition: "rejected", reason: "photographs_must_be_array", lineNumber };
      }
      for (let k = 0; k < arr.length; k++) {
        const p = arr[k];
        if (p === null || typeof p !== "object" || Array.isArray(p)) {
          return {
            disposition: "rejected",
            reason: "photograph_declaration_must_be_object",
            lineNumber,
          };
        }
        const po = p as Record<string, unknown>;
        const url = po["url"];
        if (url === undefined) {
          return { disposition: "rejected", reason: "photograph_url_missing", lineNumber };
        }
        if (typeof url !== "string" || url.trim() === "") {
          return {
            disposition: "rejected",
            reason: "photograph_url_must_be_nonblank_string",
            lineNumber,
          };
        }
        const pathname = po["pathname"];
        if (pathname !== undefined && pathname !== null && typeof pathname !== "string") {
          return { disposition: "rejected", reason: "photograph_pathname_invalid", lineNumber };
        }
        const category = po["category"];
        if (category !== undefined && category !== null && typeof category !== "string") {
          return { disposition: "rejected", reason: "photograph_category_invalid", lineNumber };
        }
        photographs.push({
          sourceUrl: url, // verbatim
          sourcePathname: (pathname ?? null) as string | null,
          declaredCategory: (category ?? null) as string | null,
          sequenceIndex: k, // zero-indexed array position — Flight 2 exactly
        });
        // Unknown photograph properties: accepted and ignored, symmetrically
        // with unknown item properties — they live on in payloadBytes.
      }
    }

    items.push({
      lineNumber,
      byteStart: lineStart,
      byteEnd,
      framing,
      declaredItemId: rawId,
      photographs,
      payloadBytes: span,
    });

    lineStart = nextStart;
  }

  if (items.length === 0) {
    return { disposition: "rejected", reason: "empty_manifest", lineNumber: null };
  }
  return { disposition: "accepted", items };
}

/**
 * §8 content-type allowlist check. `text/plain` is accepted only in its
 * UTF-8 family (bare, or an explicit utf-8 charset parameter).
 */
export function isAllowedManifestContentType(contentType: string): boolean {
  const [mime, ...params] = contentType.toLowerCase().split(";").map((s) => s.trim());
  if (mime === "application/x-ndjson" || mime === "application/jsonl") return true;
  if (mime !== "text/plain") return false;
  const charset = params.find((p) => p.startsWith("charset="));
  return charset === undefined || charset === "charset=utf-8" || charset === "charset=utf8";
}
