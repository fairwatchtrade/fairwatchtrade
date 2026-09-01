/* Return to Draft — the seller's work survives the round trip.

   Run: node --experimental-strip-types scripts/listing-draft-recovery.test.mjs

   THE DEFECT THIS PINS. Return to Draft set listings.status = 'draft' and
   stopped. Sell reads listing_drafts, so the watch vanished from the only
   workspace that could edit it, and the seller was told to fix something they
   could no longer open. This mapping is the missing half — and it is the half
   that can silently eat a description, a photo set, or a redaction record, so
   every field is asserted individually rather than by a shape check.

   Guards:
     · every field the LISTING holds arrives unchanged;
     · draft-only state (photoRedactions, curationReasoning, strikes) carries
       from a surviving draft and defaults honestly without one;
     · the listing wins over a stale draft for anything both could hold;
     · curation is derived from the listing's own status, so a returned watch
       does not get sent back through a gate it already passed;
     · tudorAdmission is never reconstructed;
     · and a field added to ListingDraft later cannot be silently forgotten. */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { draftContentFromListing } from "../lib/listingDraftRecovery.ts";

let pass = 0;
const ok = (label, cond) => {
  assert.ok(cond, label);
  pass++;
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

/** A listing carrying something in every column the mapping reads. */
const full = {
  brand: "Parmigiani Fleurier",
  custom_brand_flag: false,
  model: "Tonda Métrographe",
  reference: "PFC274-0000600-B33002",
  year: "2019",
  condition: "Excellent",
  asking_price: 11111,
  asking_price_raw: "11,111",
  asking_currency: "USD",
  provenance_note: "Purchased from an authorised dealer.",
  vault_reference_id: "aa71f4a5-1a5e-4488-b4b2-5f3206c9a411",
  significance_score: 62,
  photos: [{ photo: { url: "https://example.test/a.jpg" }, category: "Dial" }],
  has_bracelet: true,
  open_to_trades: true,
  photo_presentation: { heroPathname: "a.jpg" },
  details: { caseSizeMm: "40", complications: ["Chronograph"] },
  description: "A first-hand account of living with this watch.",
  description_passed_ai: true,
};

/* ── 1 · Everything the listing holds comes back unchanged ─────────────── */
{
  const { draft } = draftContentFromListing(full, null);

  ok("brand survives", draft.brand === full.brand);
  ok("model survives", draft.model === full.model);
  ok("reference survives", draft.reference === full.reference);
  ok("year survives", draft.year === full.year);
  ok("condition survives", draft.condition === full.condition);
  ok("provenance note survives", draft.provenanceNote === full.provenance_note);
  ok("description survives", draft.description === full.description);
  ok(
    "the description gate result survives, so the seller is not re-judged",
    draft.descriptionPassedAI === true
  );
  ok("details survive whole", JSON.stringify(draft.details) === JSON.stringify(full.details));
  ok("photos survive whole", JSON.stringify(draft.photos) === JSON.stringify(full.photos));
  ok("the bracelet declaration survives", draft.hasBracelet === true);
  ok("the trade declaration survives", draft.openToTrades === true);
  ok(
    "hero framing survives",
    JSON.stringify(draft.photoPresentation) === JSON.stringify(full.photo_presentation)
  );
  ok("the canonical identity link survives", draft.vaultReferenceId === full.vault_reference_id);
  /* v7.82 emitted a raw brand|model|reference join here and this test asserted
     it against the very function that produced it — which passes for any
     format, including a wrong one. The wizard normalises all three parts, so
     the emitted key never matched and the canonical link was discarded every
     time. Emitting nothing is honest; emitting a context that never matches is
     not. A self-referential assertion is not a test. */
  ok(
    "no identity key is emitted, because a wrong one is worse than none",
    draft.vaultReferenceKey === undefined
  );
  ok("the score is copied, never recomputed", draft.significanceScore === 62);
}

/* ── 2 · Money keeps the exact text the parser accepted ────────────────── */
{
  const { draft } = draftContentFromListing(full, null);
  ok("the raw amount is preferred over the number", draft.askingPrice === "11,111");
  ok("the currency survives", draft.askingCurrency === "USD");
  ok("a complete pair reads as confirmed", draft.askingConfirmed === true);

  const older = { ...full, asking_price_raw: null };
  ok(
    "a row predating the raw column still recovers an amount",
    draftContentFromListing(older, null).draft.askingPrice === "11111"
  );

  const priceless = { ...full, asking_price: null, asking_price_raw: null, asking_currency: null };
  const p = draftContentFromListing(priceless, null).draft;
  ok("no amount means nothing to confirm", p.askingConfirmed === false);
  ok("and no invented currency", p.askingCurrency === "");
}

/* ── 3 · Curation is never manufactured ────────────────────────────────
   The rejected shortcut: deriving "pass" from the listing having reached
   review. True of the wizard, false of exactly the API/script listings that
   need reconstructing — so it would forge a verdict from a subsystem that may
   never have run, purely to satisfy a step gate. */
{
  const { draft, progress } = draftContentFromListing(full, null);
  ok(
    "an unknown curation verdict stays unknown, never 'pass'",
    draft.curationDecision === "pending"
  );
  ok(
    "a surviving draft's real verdict is used instead",
    draftContentFromListing(full, { draft: { curationDecision: "pass" } }).draft
      .curationDecision === "pass"
  );
  ok(
    "and a real failure is not laundered into a pass either",
    draftContentFromListing(full, { draft: { curationDecision: "fail" } }).draft
      .curationDecision === "fail"
  );
  ok(
    "every step is reachable, because the watch had been through all of them",
    progress.reached === 4
  );
  ok("and it opens on the work rather than on chrome", progress.at === 4);
  ok(
    "SellFlow gates steps on curation, which is why the caller must unlock on the listing binding",
    /curationDecision !== "pass"/.test(read("components/SellFlow.tsx"))
  );
  ok(
    "and the module tells the caller so rather than lying for it",
    /CONSEQUENCE FOR THE CALLER/.test(read("lib/listingDraftRecovery.ts"))
  );
}

/* ── 4 · Draft-only state carries when a draft survives ────────────────── */
{
  const redaction = { original: "orig.jpg", strokes: [[1, 2, 3, 4]] };
  const prior = {
    draft: {
      photoRedactions: { "a.jpg": redaction },
      curationReasoning: "Admitted on collector merit.",
      strikes: 2,
      // Deliberately stale — the listing must win over all of these.
      brand: "STALE BRAND",
      description: "stale description",
      photos: [],
    },
  };
  const { draft } = draftContentFromListing(full, prior);

  ok(
    "a redaction record survives, because the listing cannot hold one",
    JSON.stringify(draft.photoRedactions) === JSON.stringify({ "a.jpg": redaction })
  );
  ok("curation reasoning survives", draft.curationReasoning === "Admitted on collector merit.");
  ok("strike count survives", draft.strikes === 2);

  ok("but a stale draft never overwrites the listing's brand", draft.brand === full.brand);
  ok("nor its description", draft.description === full.description);
  ok("nor its photographs", draft.photos.length === 1);
}

/* ── 4b · PRECEDENCE, pinned in both directions ────────────────────────
   The whole rule in one place, because getting it half right produces one of
   two silent failures: reopening stale content over a founder correction, or
   flattening away work that exists only in the draft.

   Every listing-owned field is given a DIFFERENT value in the prior draft, and
   every one must still come from the listing. The founder's canonical-reference
   route writes vault_reference_id to the listing and never to the draft, so
   this is a reachable path today, not a hypothetical. */
{
  const stale = {
    draft: {
      brand: "STALE", customBrandFlag: true, model: "STALE", reference: "STALE",
      year: "1999", condition: "Poor", askingPrice: "1", askingCurrency: "GBP",
      provenanceNote: "STALE", vaultReferenceId: "00000000-0000-0000-0000-000000000000",
      vaultReferenceKey: "STALE|STALE|STALE", significanceScore: 1,
      photos: [], hasBracelet: false, openToTrades: false,
      photoPresentation: { heroPathname: "STALE.jpg" },
      details: { caseSizeMm: "99" }, description: "STALE",
      descriptionPassedAI: false,
      // draft-only — these MUST survive
      photoRedactions: { "a.jpg": { original: "keep.jpg", strokes: [] } },
      curationReasoning: "KEEP ME",
      strikes: 3,
      curationDecision: "pass",
    },
  };
  const { draft } = draftContentFromListing(full, stale);

  const listingOwned = {
    brand: full.brand, customBrandFlag: false, model: full.model,
    reference: full.reference, year: full.year, condition: full.condition,
    askingPrice: "11,111", askingCurrency: "USD",
    provenanceNote: full.provenance_note,
    vaultReferenceId: full.vault_reference_id,

    significanceScore: 62, hasBracelet: true, openToTrades: true,
    description: full.description, descriptionPassedAI: true,
  };
  for (const [field, expected] of Object.entries(listingOwned)) {
    ok(`the listing wins for ${field}`, draft[field] === expected);
  }
  ok("the listing wins for details", JSON.stringify(draft.details) === JSON.stringify(full.details));
  ok("the listing wins for photos", JSON.stringify(draft.photos) === JSON.stringify(full.photos));
  ok(
    "the listing wins for hero framing",
    JSON.stringify(draft.photoPresentation) === JSON.stringify(full.photo_presentation)
  );

  ok("the draft wins for photoRedactions", draft.photoRedactions?.["a.jpg"]?.original === "keep.jpg");
  ok("the draft wins for curationReasoning", draft.curationReasoning === "KEEP ME");
  ok("the draft wins for strikes", draft.strikes === 3);
  ok("the draft wins for curationDecision", draft.curationDecision === "pass");
}

/* ── 5 · No surviving draft is not a failure ───────────────────────────── */
{
  const { draft } = draftContentFromListing(full, null);
  ok("redactions are simply absent, never invented", draft.photoRedactions === undefined);
  ok("reasoning defaults to empty", draft.curationReasoning === "");
  ok("strikes default to zero", draft.strikes === 0);

  for (const junk of [undefined, {}, { draft: null }, { draft: "nonsense" }, 42]) {
    ok(
      `malformed prior content (${JSON.stringify(junk) ?? "undefined"}) degrades to defaults`,
      draftContentFromListing(full, junk).draft.strikes === 0
    );
  }
}

/* ── 6 · What is deliberately not carried ──────────────────────────────── */
{
  const { draft } = draftContentFromListing(full, {
    draft: { tudorAdmission: { key: "stale|key|here", value: {} } },
  });
  ok(
    "tudorAdmission is never reconstructed — an absent key reads as stale",
    draft.tudorAdmission === undefined
  );
  ok(
    "and the module says so where the next person will look",
    read("lib/listingDraftRecovery.ts").includes("is dropped, always")
  );
}

/* ── 7 · An empty listing produces a usable draft, not undefined soup ──── */
{
  const empty = Object.fromEntries(Object.keys(full).map((k) => [k, null]));
  const { draft } = draftContentFromListing(empty, null);
  ok("text fields become empty strings, never undefined", draft.brand === "");
  ok("photos become an empty array, never null", Array.isArray(draft.photos));
  ok("details become an object, never null", typeof draft.details === "object");
  ok("booleans become false, never null", draft.hasBracelet === false);
  ok(
    "and no value in the draft is undefined except the optional ones",
    Object.entries(draft)
      .filter(([k]) => !["photoPresentation", "photoRedactions", "tudorAdmission"].includes(k))
      .every(([, v]) => v !== undefined)
  );
}

/* ── 8 · DRIFT GUARD — a new ListingDraft field cannot be forgotten ─────
   Reads the type itself. If somebody adds a field to ListingDraft and does
   not decide what a recovered listing should put in it, this fails and names
   the field rather than shipping a draft with a hole in it. */
{
  const src = read("lib/listing.ts");
  const block = src.slice(src.indexOf("export type ListingDraft"));
  const body = block.slice(0, block.indexOf("\n};"));
  const declared = [...body.matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);

  ok("the ListingDraft type was actually found", declared.length > 10);

  /* Present only when their source has them — asserted individually above. */
  const conditional = ["photoPresentation", "photoRedactions"];
  /* Deliberately never reconstructed. tudorAdmission because rebuilding it
     would assert a summary nobody recomputed; vaultReferenceKey because a
     context that never matches the wizard's is worse than none at all. */
  const omitted = ["tudorAdmission", "vaultReferenceKey"];

  const { draft } = draftContentFromListing(full, null);
  const missing = declared.filter(
    (k) => !(k in draft) && !conditional.includes(k) && !omitted.includes(k)
  );
  ok(
    `every declared ListingDraft field is decided${missing.length ? " — missing: " + missing.join(", ") : ""}`,
    missing.length === 0
  );

  const unexpected = Object.keys(draft).filter((k) => !declared.includes(k));
  ok(
    `and the mapping invents no field the type does not declare${unexpected.length ? " — extra: " + unexpected.join(", ") : ""}`,
    unexpected.length === 0
  );
}

/* ── 9 · The scoring path is not touched ───────────────────────────────── */
{
  const src = read("lib/listingDraftRecovery.ts");
  ok(
    "the module performs no evaluation and imports no scorer",
    !/\/api\/evaluate/.test(src) && !/evaluateListing|runEvaluation/.test(src)
  );
  ok(
    "and says so where it copies the stored score",
    /copied from the column the listing already stores/.test(src)
  );
}

console.log(`listing-draft-recovery: ${pass} assertions PASS`);
