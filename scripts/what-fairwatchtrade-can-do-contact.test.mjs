import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { resolveContact, CONTACT_LIMITS } from "../lib/contact/composeContact.ts";

/* ── In-FWT contact composer on the benefits page (2026-09-10) ──
   One doorway per audience room, one composer, one send path. A signed-in
   visitor sends Subject + Message with the account reply identity; a
   signed-out visitor is asked for one reply address. Never a mailto. The
   governed page copy is byte-stable.
   Run: node scripts/what-fairwatchtrade-can-do-contact.test.mjs
   ─────────────────────────────────────────────────────────────────────── */

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:\\])\/\/[^\n]*/g, "$1");

const room = read("components/WhatFairWatchTradeCanDo.tsx");
const page = read("app/what-fairwatchtrade-can-do/page.tsx");
const composer = read("components/ContactComposer.tsx");
const doorway = read("components/ContactDoorway.tsx");
const route = read("app/api/contact/route.ts");
const transport = read("lib/sellerEmail.ts");

/* ── Identity rule (pure) ─────────────────────────────────────────────── */

test("signed in: reply identity is the account email; a client email is ignored", () => {
  const r = resolveContact({ subject: "About a Datejust", message: "Hello", email: "someone@else.example" }, "owner@account.example");
  assert.equal(r.ok, true);
  assert.equal(r.honeypot, false);
  assert.equal(r.identity, "account");
  assert.equal(r.replyTo, "owner@account.example");
  assert.equal(r.subject, "About a Datejust");
  assert.equal(r.message, "Hello");
  // No email at all from the browser is also fine when signed in.
  const r2 = resolveContact({ subject: "s", message: "m" }, "owner@account.example");
  assert.equal(r2.ok && r2.replyTo, "owner@account.example");
});

test("signed out: one valid reply email is required and becomes the reply identity", () => {
  const r = resolveContact({ subject: "s", message: "m", email: " guest@example.com " }, null);
  assert.equal(r.ok && r.identity, "guest");
  assert.equal(r.ok && r.replyTo, "guest@example.com");
  for (const bad of [undefined, "", "   ", "not-an-address", "a@b", "x".repeat(255) + "@e.com"]) {
    const refused = resolveContact({ subject: "s", message: "m", email: bad }, null);
    assert.equal(refused.ok, false, String(bad));
    assert.match(refused.error, /^email_(required|too_long)$/);
  }
  // A blank session email is "signed out", never a blank reply address.
  assert.equal(resolveContact({ subject: "s", message: "m" }, "   ").ok, false);
});

test("Subject and Message are the visitor's own, trimmed and bounded; the legacy form keeps its generated subject", () => {
  const r = resolveContact({ subject: "  My subject  ", message: "  body  ", email: "g@example.com" }, null);
  assert.equal(r.ok && r.subject, "My subject");
  assert.equal(r.ok && r.message, "body");
  assert.equal(resolveContact({ subject: "x".repeat(CONTACT_LIMITS.subject + 1), message: "m", email: "g@example.com" }, null).error, "subject_too_long");
  assert.equal(resolveContact({ subject: "s", message: "x".repeat(CONTACT_LIMITS.message + 1), email: "g@example.com" }, null).error, "message_too_long");
  assert.equal(resolveContact({ subject: "s", message: "", email: "g@example.com" }, null).error, "message_required");
  // Legacy /contact sends no subject.
  const legacy = resolveContact({ email: "g@example.com", name: "G", message: "m" }, null);
  assert.equal(legacy.ok && legacy.subject, "Contact form — g@example.com");
  assert.equal(legacy.ok && legacy.name, "G");
  // The visitor's subject is never replaced with the generated line.
  assert.doesNotMatch(r.subject, /^Contact form/);
});

test("the honeypot short-circuits before any identity or content check", () => {
  const r = resolveContact({ website: "http://spam", message: "", email: "" }, null);
  assert.deepEqual(r, { ok: true, honeypot: true });
});

/* ── Route and transport ─────────────────────────────────────────────── */

test("the route derives identity from the session and passes the reply identity to the transport", () => {
  const src = stripComments(route);
  assert.match(src, /import \{ resolveContact, type ContactInput \} from "@\/lib\/contact\/composeContact"/);
  assert.match(src, /sessionEmail = user\?\.email \?\? null/);
  assert.match(src, /resolveContact\(body, sessionEmail\)/);
  assert.match(src, /replyTo,\s*\}\);/);
  assert.match(src, /subject,\s*html,\s*kind: "contact"/);
  // Success only when the transport says so.
  assert.match(src, /if \(!sent\.ok\)/);
  assert.match(src, /status: 502/);
  assert.doesNotMatch(src, /name === ""|Please give us your name/);
});

test("reply-to is an optional, backward-compatible transport parameter", () => {
  const src = stripComments(transport);
  assert.match(src, /replyTo\?: string;/);
  assert.match(src, /\.\.\.\(replyTo \? \{ reply_to: replyTo \} : \{\}\)/);
  // Every existing caller is untouched: none passes replyTo.
  for (const f of ["app/api/listings/[id]/decision/route.ts", "lib/sellerEmail.ts"]) {
    try {
      const other = read(f);
      if (f !== "lib/sellerEmail.ts") assert.doesNotMatch(other, /replyTo/);
    } catch {
      /* file may not exist in this tree; the pin is on the parameter shape */
    }
  }
});

/* ── Doorway placement on the benefits page ──────────────────────────── */

test("every audience room carries the doorway once, after its own content, dealer after Tax Time", () => {
  const src = stripComments(room);
  // Rendered inside ROOMS.map, so all four panels carry it; inactive panels are hidden.
  const mapStart = src.indexOf("{ROOMS.map((r) => (");
  const doorwayAt = src.indexOf("<ContactDoorway onOpen={openComposer} />");
  const taxAt = src.indexOf("{TAX_TIME.boundary}");
  const sectionEnd = src.indexOf("</section>", doorwayAt);
  const mapEnd = src.indexOf("))}", doorwayAt);
  assert.ok(mapStart > 0 && doorwayAt > mapStart, "doorway is inside the rooms map");
  assert.ok(taxAt > mapStart && taxAt < doorwayAt, "doorway comes after the dealer's Tax Time block");
  assert.ok(sectionEnd > doorwayAt && sectionEnd < mapEnd, "doorway is the last thing in each panel");
  assert.equal((src.match(/<ContactDoorway /g) ?? []).length, 1, "one doorway element, rendered per room");
  assert.match(src, /hidden=\{r\.id !== room\}/);
  // The shared refusals / closing material below the rooms carries no second doorway.
  assert.doesNotMatch(src.slice(mapEnd), /<ContactDoorway|hello@fairwatchtrade\.com/);
});

test("one composer for the page, opened from any room, focus returned to the doorway that opened it", () => {
  const src = stripComments(room);
  assert.equal((src.match(/<ContactComposer /g) ?? []).length, 1);
  assert.match(src, /<ContactComposer open=\{composerOpen\} signedIn=\{signedIn\} onClose=\{closeComposer\} \/>/);
  assert.match(src, /composerTrigger\.current = trigger;/);
  assert.match(src, /composerTrigger\.current\?\.focus\(\);/);
  assert.match(src, /\{ signedIn = false \}: \{ signedIn\?: boolean \}/);
  // The server page decides signedIn from the session, never the browser.
  assert.match(page, /supabase\.auth\.getUser\(\)/);
  assert.match(page, /<WhatFairWatchTradeCanDo signedIn=\{signedIn\} \/>/);
});

test("the doorway is the address as a button: no mailto, no icon, no card", () => {
  const src = stripComments(doorway);
  assert.match(src, /export const CONTACT_ADDRESS = "hello@fairwatchtrade\.com"/);
  assert.match(src, /<button\s+type="button"/);
  assert.match(src, /text-\[14px\][^"]*text-\[var\(--gold\)\][^"]*underline/);
  assert.match(src, /focus-visible:outline/);
  for (const f of [doorway, composer, room]) assert.doesNotMatch(f, /mailto:/);
  assert.doesNotMatch(src, /<svg|rounded-|border-\[|bg-\[|Contact us|Questions\?/);
});

/* ── Composer ───────────────────────────────────────────────────────── */

test("composer copy is exact and nothing else is said", () => {
  assert.match(composer, /title: "Send us a message"/);
  assert.match(composer, /intro: "Stay right here\. We’ll get your message to the right place\."/);
  assert.match(composer, /emailLabel: "Your email address"/);
  assert.match(composer, /subjectLabel: "Subject"/);
  assert.match(composer, /messageLabel: "Message"/);
  assert.match(composer, /send: "Send message"/);
  assert.match(composer, /sent: "Message sent\."/);
  assert.match(composer, /failed: "We couldn’t send your message\. Nothing you wrote was lost\. Try again\."/);
  const src = stripComments(composer);
  assert.doesNotMatch(src, /Reply[- ]to|"To:|Your name|\bName\b|From:|hello@fairwatchtrade\.com|write to|directly/);
});

test("signed in shows Subject + Message; signed out adds Your email address first; no other fields", () => {
  const src = stripComments(composer);
  assert.match(src, /\{!signedIn && \(\s*<label className=\{LABEL\}>\s*\{COMPOSER_COPY\.emailLabel\}\s*<input\s+ref=\{firstFieldRef\}\s+type="email"/);
  assert.match(src, /<input\s+ref=\{signedIn \? firstFieldRef : undefined\}\s+type="text"\s+name="subject"/);
  assert.match(src, /<textarea\s+name="message"/);
  const visibleInputs = (src.match(/name="(email|subject|message|website)"/g) ?? []).map((m) => m.replace(/name=|"/g, ""));
  assert.deepEqual(visibleInputs, ["email", "subject", "message", "website"]);
  // The honeypot is not a visible field.
  assert.match(src, /name="website"\s+tabIndex=\{-1\}\s+autoComplete="off"\s+aria-hidden="true"/);
  // A signed-in submit carries no email; a signed-out submit carries one.
  assert.match(src, /signedIn \? \{ subject, message, website \} : \{ email, subject, message, website \}/);
});

test("send truth: success only from the server, failure keeps every typed value, no external fallback", () => {
  const src = stripComments(composer);
  assert.match(src, /setPhase\(res\.ok && data\.ok === true \? "sent" : "failed"\)/);
  assert.match(src, /catch \{\s*setPhase\("failed"\);\s*\}/);
  // The only place fields are cleared is after a confirmed send, on close.
  const clears = [...src.matchAll(/set(Email|Subject|Message)\(""\)/g)].length;
  assert.equal(clears, 3);
  assert.match(src, /if \(phase === "sent"\) \{\s*setEmail\(""\);\s*setSubject\(""\);\s*setMessage\(""\);/);
  assert.doesNotMatch(src, /data\.detail|mailto|window\.open|location\.href/);
});

test("dialog semantics: named, modal, initial focus, Tab contained, Escape closes, close control named", () => {
  const src = stripComments(composer);
  assert.match(src, /role="dialog"/);
  assert.match(src, /aria-modal="true"/);
  assert.match(src, /aria-labelledby=\{titleId\}/);
  assert.match(src, /<h2 id=\{titleId\}[^>]*>\s*\{COMPOSER_COPY\.title\}/);
  assert.match(src, /firstFieldRef\.current\?\.focus\(\)/);
  assert.match(src, /if \(e\.key === "Escape"\)/);
  assert.match(src, /if \(e\.key !== "Tab" \|\| !dialogRef\.current\) return;/);
  assert.match(src, /aria-label=\{COMPOSER_COPY\.close\}/);
  // After a confirmed send the form is gone: focus moves to Close so Escape still works.
  assert.match(src, /if \(open && phase === "sent"\) closeRef\.current\?\.focus\(\);/);
  assert.match(src, /ref=\{closeRef\}/);
  assert.match(src, /<label className=\{LABEL\}>/);
  assert.match(src, /focus-visible:outline/);
  // Narrow: the panel scrolls inside the viewport instead of overflowing it.
  assert.match(src, /max-h-full w-full max-w-\[520px\] overflow-y-auto/);
});

/* ── Preservation ───────────────────────────────────────────────────── */

test("the v8.42 public wording is byte-stable", () => {
  const sha = createHash("sha256").update(readFileSync(new URL("../lib/whatFairWatchTradeCanDo/content.ts", import.meta.url))).digest("hex");
  assert.equal(sha, "a232e95e9b13d70a04986e76894c1720b78026961d298ea08080ba8670fee05e");
});

test("robots stay closed", () => {
  assert.match(read("app/robots.ts"), /disallow: "\/"/);
});
