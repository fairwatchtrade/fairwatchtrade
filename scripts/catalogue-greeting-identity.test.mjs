/* ════════════════════════════════════════════════════════════════════════
   CATALOGUE GREETING IDENTITY — the six-state proof battery          (v7.5)

   The greeting has a third honest option the shared identity resolver does
   not have: name nobody. These assertions exist to keep it that way. The
   defect they guard against is not a crash — it is a greeting that reads a
   collector's own email address back at them, which is what happens the
   moment someone "simplifies" this by calling lib/signedInDisplayIdentity.

   Run:  node scripts/catalogue-greeting-identity.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert";
import { readFileSync } from "node:fs";
import { resolveCatalogueGreetingIdentity } from "../lib/catalogueGreetingIdentity.ts";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/* ── Case 1 · display name present, normal state ───────────────────────── */
{
  ok(
    "a display name with no override is the greeting name",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: null,
      displayName: "TestUser",
    }) === "TestUser"
  );
}

/* ── Case 2 · no display name, normal state → NOBODY ───────────────────── */
{
  for (const blank of [null, undefined, "", "   "]) {
    ok(
      `a blank display name (${JSON.stringify(blank)}) names nobody`,
      resolveCatalogueGreetingIdentity({
        greetingIdentity: null,
        displayName: blank,
      }) === null
    );
  }
  /* The whole point of a separate resolver: an email is never reachable
     here, because the resolver has no email input at all to fall through
     to. This asserts the SHAPE, not just the behaviour. */
  ok(
    "the resolver cannot fall through to an email — it takes no email",
    !/email/i.test(strip(read("lib/catalogueGreetingIdentity.ts")))
  );
  ok(
    'and never produces the literal "Collector"',
    !/"Collector"/.test(strip(read("lib/catalogueGreetingIdentity.ts")))
  );
}

/* ── Case 3 · dealer business override, resolvable ─────────────────────── */
{
  ok(
    "an honoured override greets by the business name",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: "business",
      displayName: "TestUser",
      businessName: "Acme Watches",
    }) === "Acme Watches"
  );
  ok(
    "the business name is trimmed, not echoed raw",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: "business",
      businessName: "  Acme Watches  ",
    }) === "Acme Watches"
  );
}

/* ── Case 4 · override stored, business identity unavailable ───────────── */
{
  ok(
    "an unresolvable override falls back to the display name",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: "business",
      displayName: "TestUser",
      businessName: null,
    }) === "TestUser"
  );
  ok(
    "a blank business name is unresolvable, not a blank greeting",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: "business",
      displayName: "TestUser",
      businessName: "   ",
    }) === "TestUser"
  );
}

/* ── Case 6 · orphaned override, and no display name either ────────────── */
{
  ok(
    "an orphaned override with no display name names nobody rather than erroring",
    resolveCatalogueGreetingIdentity({
      greetingIdentity: "business",
      displayName: null,
      businessName: null,
    }) === null
  );
  ok(
    "an entirely empty candidate set names nobody",
    resolveCatalogueGreetingIdentity({}) === null
  );
}

/* ── The vocabulary stays two words wide ───────────────────────────────── */
{
  /* 'personal' and 'none' are unrepresentable in the column. If they ever
     arrive anyway, they must behave as NULL does — never as a third state
     the reader silently invents a meaning for. */
  for (const bogus of ["personal", "none", "BUSINESS", "business "]) {
    ok(
      `${JSON.stringify(bogus)} is not treated as the override`,
      resolveCatalogueGreetingIdentity({
        greetingIdentity: bogus,
        displayName: "TestUser",
        businessName: "Acme Watches",
      }) === "TestUser"
    );
  }
}

/* ── The wiring the states depend on ───────────────────────────────────── */
{
  const page = strip(read("app/catalogue/page.tsx"));
  ok(
    "Catalogue resolves identity server-side and passes it down",
    /getCatalogueGreetingIdentity\(supabase, user\.id\)/.test(page) &&
      /greetingName=\{greetingName\}/.test(page)
  );
  ok(
    "Catalogue does NOT call the shared display-identity resolver",
    !/signedInDisplayIdentity/.test(page)
  );

  const client = strip(read("components/CatalogueClient.tsx"));
  ok(
    "the comma lives inside the conditional, so a bare greeting cannot render \"Good morning, .\"",
    /greetingName \? \(/.test(client)
  );
  ok(
    "the clock stays on the hydration-safe store, and identity is not routed through it",
    /useSyncExternalStore\(\s*subscribeToClock,\s*greeting,\s*getServerGreeting\s*\)/.test(
      client
    ) && !/useSyncExternalStore[\s\S]{0,120}greetingName/.test(client)
  );

  const settings = strip(read("components/AccountSettings.tsx"));
  ok(
    "the greeting control is gated on a real dealer_profiles row, not the looser isDealer",
    /hasDealerProfile\s*&&/.test(settings) &&
      /setHasDealerProfile\(Boolean\(dealerProfile\)\)/.test(settings)
  );
  ok(
    "unticking writes NULL rather than inventing a third value",
    /greeting_identity: next \? "business" : null/.test(settings)
  );
}

console.log(`catalogue-greeting-identity: ${n} assertions passed`);
