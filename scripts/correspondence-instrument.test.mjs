/* ════════════════════════════════════════════════════════════════════════
   CORRESPONDENCE INSTRUMENT — one treatment, three roles kept apart

   Every buyer↔seller free-text message body wears .fw-correspondence. The
   offer AMOUNT beside it does not: a transactional instrument and a
   correspondence instrument are different things and must not converge.

   These assertions locate their subject before asserting about it. A guard
   that cannot find what it guards must fail loudly rather than pass on an
   empty string.
   ════════════════════════════════════════════════════════════════════════ */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.join(HERE, rel), "utf8");

let n = 0;
const ok = (label) => console.log(`  PASS ${++n}  ${label}`);

/* ── 1 · The treatment exists, and is a real surface in BOTH appearances ── */
{
  const css = read("../app/globals.css");
  const start = css.indexOf(".fw-correspondence {");
  assert.ok(start > 0, "the shared class exists in globals.css");
  const block = css.slice(start, css.indexOf("}", start));

  const background = /background:\s*light-dark\(([^,]+),\s*([^)]+)\)/.exec(block);
  assert.ok(background, "background is declared once, as light-dark(light, dark)");

  const [, lightArm, darkArm] = background;
  assert.ok(
    !/transparent/i.test(lightArm),
    "the light arm is a real surface — a transparent field dissolves into the ivory card"
  );
  assert.ok(
    !/#10131a/i.test(lightArm),
    "the light arm is not Galaxy material dropped into a Daylight room"
  );
  assert.notEqual(lightArm.trim(), darkArm.trim(), "the two appearances differ");

  assert.ok(/border:\s*1px solid/.test(block), "a visible edge, so the eye finds where writing goes");
  assert.ok(/font-size:\s*13px/.test(block), "one message size across every surface");

  const focus = css.slice(css.indexOf(".fw-correspondence:focus"), css.indexOf("}", css.indexOf(".fw-correspondence:focus")));
  assert.ok(/box-shadow/.test(focus) && /border-color/.test(focus), "focus is obvious, not a hairline shift");
}
ok("shared treatment: a real surface in both appearances, visible edge, obvious focus");

/* ── 2 · Every buyer↔seller message body wears it ────────────────────── */
{
  const surfaces = {
    "../components/ListingCorrespondence.tsx": 2, // Ask the Seller + thread composer
    "../components/InlinePurchaseRequest.tsx": 1, // Note with your offer
    "../components/PurchaseRequestForm.tsx": 1, // Note with your offer, dedicated route
    "../components/AccountDashboard.tsx": 1, // Correspondence reply
  };

  for (const [file, expected] of Object.entries(surfaces)) {
    const src = read(file);
    const count = (src.match(/fw-correspondence/g) ?? []).length;
    assert.equal(count, expected, `${file}: ${expected} correspondence field(s)`);

    /* The two failure modes this replaced, kept out by name. Scoped to
       textarea markup so an unrelated container keeps its own material. */
    const textareas = [...src.matchAll(/<textarea[\s\S]*?(?:\/>|<\/textarea>)/g)].map((m) => m[0]);
    assert.ok(textareas.length > 0, `${file}: textareas located`);
    for (const t of textareas) {
      if (!t.includes("fw-correspondence")) continue;
      assert.ok(!/bg-transparent/.test(t), `${file}: no dissolved field`);
      assert.ok(!/bg-\[#/.test(t), `${file}: no hardcoded appearance-blind material`);
    }
  }
}
ok("every buyer↔seller message body wears the shared treatment");

/* ── 3 · The money field is a different instrument ───────────────────── */
{
  for (const file of ["../components/InlinePurchaseRequest.tsx", "../components/PurchaseRequestForm.tsx"]) {
    const src = read(file);
    /* Exactly one correspondence field per offer surface: the message body.
       If the amount input ever adopted this class the count would rise, and
       the two instruments would have quietly become one. */
    assert.equal(
      (src.match(/fw-correspondence/g) ?? []).length,
      1,
      `${file}: the offer amount did not take the correspondence treatment`
    );
  }
}
ok("the offer amount stays a transactional instrument — the roles do not converge");

/* ── 4 · Dealer contact reuses the thread, rather than a fourth patch ── */
{
  const actions = read("../components/DealerRoomActions.tsx");
  assert.ok(actions.includes("?contact=1"), "Contact Dealer enters the listing conversation");
  assert.ok(!actions.includes("<textarea"), "no parallel dealer composer exists to style separately");
}
ok("dealer contact bodies inherit the treatment through the listing conversation");

console.log(`\n  correspondence-instrument: ${n} sections, all assertions passed`);
