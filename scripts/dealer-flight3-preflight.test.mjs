/* ════════════════════════════════════════════════════════════════════════
   FLIGHT 3 — §18 SCHEMA AND EXACT-BYTE UNIT MATRIX (static portion)
   scripts/dealer-flight3-preflight.test.mjs

   Runs the contract's exact-byte cases against the REAL implementation
   (lib/dealer/manifestPreflight.ts + originGovernance.ts, imported
   directly under node's native type-stripping).

   Run: node scripts/dealer-flight3-preflight.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import {
  preflightManifest,
  isAllowedManifestContentType,
} from "../lib/dealer/manifestPreflight.ts";
import {
  canonicalizeUrl,
  pathPrefixMatches,
  urlMatchesGovernedOrigin,
  isIpLiteral,
} from "../lib/dealer/originGovernance.ts";

let passed = 0;
let failed = 0;
const t = (name, cond, detail = "") => {
  if (cond) passed++;
  else {
    failed++;
    console.error(`FAIL: ${name} ${detail}`);
  }
};
const enc = new TextEncoder();
const bytes = (s) => enc.encode(s);
const reject = (input, reason, name) => {
  const r = preflightManifest(input instanceof Uint8Array ? input : bytes(input));
  t(name, r.disposition === "rejected" && r.reason === reason,
    `→ ${r.disposition}/${r.disposition === "rejected" ? r.reason : ""}`);
  return r;
};
const accept = (input, name) => {
  const r = preflightManifest(input instanceof Uint8Array ? input : bytes(input));
  t(name, r.disposition === "accepted", `→ ${JSON.stringify(r)}`);
  return r;
};

/* ── framing: lf / crlf / none, optional single final terminator ── */
{
  const r = accept('{"item_id":"a"}\n{"item_id":"b"}\n', "LF framing, final terminator");
  if (r.disposition === "accepted") {
    t("LF spans exclude terminator", r.items[0].byteEnd === 15 && r.items[0].framing === "lf");
    t("second line offset", r.items[1].byteStart === 16 && r.items[1].lineNumber === 2);
  }
}
{
  const r = accept('{"item_id":"a"}\r\n{"item_id":"b"}', "CRLF then unterminated final (none)");
  if (r.disposition === "accepted") {
    t("crlf recorded", r.items[0].framing === "crlf" && r.items[0].byteEnd === 15);
    t("none only on final line", r.items[1].framing === "none" && r.items[1].byteStart === 17);
  }
}
accept('{"item_id":"only"}', "single line, no terminator (none)");

/* ── empty / terminator-only / blank lines / BOM ── */
reject("", "empty_manifest", "zero bytes");
reject("\n", "empty_manifest", "terminator-only manifest");
reject('{"item_id":"a"}\n\n{"item_id":"b"}', "blank_line_forbidden", "interior blank line");
reject('{"item_id":"a"}\n   \n', "blank_line_forbidden", "whitespace-only line");
reject("﻿" + '{"item_id":"a"}', "manifest_bom_unsupported", "UTF-8 BOM");

/* ── UTF-8 / JSON / shape ── */
reject(new Uint8Array([0xff, 0xfe, 0x22]), "invalid_utf8", "invalid UTF-8 line");
reject('{"item_id": }', "invalid_json", "malformed JSON");
reject('["not","an","object"]', "item_must_be_object", "top-level array");
reject('"scalar"', "item_must_be_object", "top-level scalar");
reject("null", "item_must_be_object", "top-level null");

/* ── duplicate keys, recursively, tokenizer-level ── */
reject('{"item_id":"a","item_id":"b"}', "duplicate_json_key", "top-level duplicate key");
reject('{"item_id":"a","x":{"y":1,"y":2}}', "duplicate_json_key", "nested duplicate key");
reject(
  '{"item_id":"a","photographs":[{"url":"https://x/y","url":"https://x/z"}]}',
  "duplicate_json_key",
  "duplicate key inside photograph object"
);

/* ── item_id law (§4) ── */
reject('{"x":1}', "item_id_missing", "item_id missing");
reject('{"item_id":42}', "item_id_must_be_string", "item_id non-string");
reject('{"item_id":"   "}', "item_id_whitespace_only", "whitespace-only id (spaces)");
reject('{"item_id":"\\u00a0\\u2028"}', "item_id_whitespace_only", "Unicode White_Space-only id");
{
  // U+FEFF is NOT White_Space=yes — an id of just U+FEFF is VALID (the \s
  // shortcut would wrongly reject it; the contract's exact property rules).
  accept('{"item_id":"\\ufeff"}', "U+FEFF alone is not White_Space → valid id");
}
reject('{"item_id":"dup"}\n{"item_id":"dup"}', "duplicate_declared_item_id", "exact-string duplicate");
{
  // lexically different escapes decoding to the SAME string → duplicates
  reject('{"item_id":"caf\\u00e9"}\n{"item_id":"café"}', "duplicate_declared_item_id",
    "escape vs literal decode to same string");
  // NFC vs NFD (é vs e+combining) → NOT duplicates, deliberately
  const r = accept('{"item_id":"café"}\n{"item_id":"cafe\\u0301"}', "NFC/NFD distinct ids both accepted");
  if (r.disposition === "accepted") {
    t("stored ids verbatim, untransformed",
      r.items[0].declaredItemId === "café" && r.items[1].declaredItemId === "café");
  }
}

/* ── photographs (§4) ── */
reject('{"item_id":"a","photographs":{"url":"x"}}', "photographs_must_be_array", "photographs non-array");
reject('{"item_id":"a","photographs":["str"]}', "photograph_declaration_must_be_object", "photo non-object");
reject('{"item_id":"a","photographs":[{"pathname":"p"}]}', "photograph_url_missing", "photo url missing");
reject('{"item_id":"a","photographs":[{"url":"  "}]}', "photograph_url_must_be_nonblank_string", "photo url blank");
reject('{"item_id":"a","photographs":[{"url":"https://x/1","pathname":7}]}', "photograph_pathname_invalid", "pathname wrong type");
reject('{"item_id":"a","photographs":[{"url":"https://x/1","category":[]}]}', "photograph_category_invalid", "category wrong type");
{
  const r = accept(
    '{"item_id":"a","photographs":[{"url":"https://x/1","category":null},{"url":"https://x/2","pathname":"p","category":"Dial side"}],"unknown_prop":{"deep":true}}',
    "valid photographs + unknown item property ignored"
  );
  if (r.disposition === "accepted") {
    const p = r.items[0].photographs;
    t("sequence from array position", p[0].sequenceIndex === 0 && p[1].sequenceIndex === 1);
    t("category verbatim, nullable", p[0].declaredCategory === null && p[1].declaredCategory === "Dial side");
    t("payload bytes preserve unknown props verbatim",
      new TextDecoder().decode(r.items[0].payloadBytes).includes('"unknown_prop"'));
  }
  const r2 = accept(
    '{"item_id":"b","photographs":[{"url":"https://x/1","extra_photo_prop":9}]}',
    "unknown PHOTOGRAPH property accepted symmetrically"
  );
  t("zero-photograph item valid",
    accept('{"item_id":"zero"}', "item with no photographs").disposition === "accepted");
  void r2;
}

/* ── content-type allowlist (§8) ── */
t("ndjson allowed", isAllowedManifestContentType("application/x-ndjson"));
t("jsonl allowed", isAllowedManifestContentType("application/jsonl; charset=utf-8"));
t("text/plain utf-8 allowed", isAllowedManifestContentType("text/plain; charset=UTF-8"));
t("text/plain bare allowed", isAllowedManifestContentType("text/plain"));
t("text/plain latin1 refused", !isAllowedManifestContentType("text/plain; charset=iso-8859-1"));
t("application/json refused (monolithic JSON unsupported)", !isAllowedManifestContentType("application/json"));

/* ── §15 origin canonicalization table ── */
{
  const c = canonicalizeUrl("https://SHOP.Example.COM./Inventory/./x/../items");
  t("case + trailing dot + dot-segments", c !== null && c.hostname === "shop.example.com" && c.path === "/Inventory/items");
  t("absent port → 443", c !== null && c.port === 443);
  const c443 = canonicalizeUrl("https://shop.example.com:443/a");
  t("explicit :443 equals absent", c443 !== null && c443.port === 443);
  const c8443 = canonicalizeUrl("https://shop.example.com:8443/a");
  t("other port preserved", c8443 !== null && c8443.port === 8443);
  t("http refused", canonicalizeUrl("http://shop.example.com/") === null);
  t("credentials refused", canonicalizeUrl("https://user:pw@shop.example.com/") === null);
  t("IPv4 literal refused", canonicalizeUrl("https://192.168.0.10/x") === null);
  t("IPv6 literal refused", canonicalizeUrl("https://[::1]/x") === null);
  t("isIpLiteral v4/v6", isIpLiteral("10.0.0.1") && isIpLiteral("[2001:db8::1]") && !isIpLiteral("example.com"));
  const idn = canonicalizeUrl("https://bücher.example/x");
  t("IDNA punycode before comparison", idn !== null && idn.hostname === "xn--bcher-kva.example");
  const pct = canonicalizeUrl("https://x.example/inv%65ntory/it%2Fem");
  t("percent-decode unreserved ONLY", pct !== null && pct.path === "/inventory/it%2Fem");

  t("segment boundary: /inventory matches /inventory/x", pathPrefixMatches("/inventory", "/inventory/x"));
  t("segment boundary: /inventory matches itself", pathPrefixMatches("/inventory", "/inventory"));
  t("segment boundary: never /inventoryx", !pathPrefixMatches("/inventory", "/inventoryx"));
  t("root prefix matches all", pathPrefixMatches("/", "/anything/at/all"));

  const origins = [
    { purpose: "manifest", hostname: "shop.example.com", port: 443, pathPrefix: "/feeds", state: "approved" },
    { purpose: "manifest", hostname: "old.example.com", port: 443, pathPrefix: "/", state: "revoked" },
  ];
  t("governed match", urlMatchesGovernedOrigin("https://Shop.Example.com/feeds/main.ndjson", origins, "manifest"));
  t("revoked origin never matches", !urlMatchesGovernedOrigin("https://old.example.com/x", origins, "manifest"));
  t("wrong purpose never matches", !urlMatchesGovernedOrigin("https://shop.example.com/feeds/a", origins, "photographs"));
  t("port mismatch refused", !urlMatchesGovernedOrigin("https://shop.example.com:8443/feeds/a", origins, "manifest"));
  t("prefix escape refused", !urlMatchesGovernedOrigin("https://shop.example.com/feedsx/a", origins, "manifest"));
  t("dot-segment escape refused", !urlMatchesGovernedOrigin("https://shop.example.com/feeds/../admin", origins, "manifest"));
}

/* ── caps ── */
{
  const big = "x".repeat(1024 * 1024 + 10);
  reject(`{"item_id":"a","pad":"${big}"}`, "line_too_large", "line over cap");
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
