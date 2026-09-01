/* ════════════════════════════════════════════════════════════════════════
   SELL — ARRIVING IS NOT WORKING

   Opening /sell and doing nothing must not create a listing_drafts row.

   The defect this guards: the currency prefill runs on every fresh open and
   went through patch(), which marks userTouchedRef. The autosave effect gates
   on exactly that ref, so a default the PRODUCT chose opened the gate, and
   ~700ms after arrival createDraft() minted a shell for a seller who had done
   nothing but load the page. Every visit left one behind — which is also why
   purging drafts never stayed purged.

   Two halves, and the second is only worth anything because of the first:

     PART A pins the real source structure — which door sets the intent flag,
     which door the prefill uses, and that the autosave still gates on it.

     PART B runs the three-step lifecycle. Its inputs are NOT hand-written:
     whether each door marks intent is READ OUT OF THE SOURCE by Part A. If
     someone later adds userTouchedRef to patchSystem, the simulation flips
     and this suite fails rather than quietly passing on a stale assumption.

   What this does NOT prove: that Supabase inserted no row. That is a live
   walk on production and belongs to Jason's eyes. This proves the decision
   that precedes the insert, which is where the defect actually lived.

   Run: node scripts/sell-empty-draft.test.mjs
   ════════════════════════════════════════════════════════════════════════ */

import { readFileSync } from "node:fs";
import assert from "node:assert";

let n = 0;
const ok = (label, cond) => {
  n += 1;
  assert.ok(cond, label);
};

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const src = read("components/SellFlow.tsx");

/* Pull one function body out of the source by brace matching, so an
   assertion about "what patchSystem does" is about the real body and not
   about a substring that happens to sit near it. */
function bodyOf(name) {
  const start = src.indexOf(`function ${name}(`);
  assert.ok(start !== -1, `source declares function ${name}`);
  const open = src.indexOf("{", start);
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === "{") depth += 1;
    else if (src[i] === "}") {
      depth -= 1;
      if (depth === 0) return src.slice(open + 1, i);
    }
  }
  throw new Error(`unbalanced braces reading ${name}`);
}

const TOUCH = "userTouchedRef.current = true";

/* ── PART A — the source really is shaped the way Part B assumes ───────── */

const patchBody = bodyOf("patch");
const systemBody = bodyOf("patchSystem");
const applyBody = bodyOf("applyPatch");

const sellerDoorMarksIntent = patchBody.includes(TOUCH);
const systemDoorMarksIntent = systemBody.includes(TOUCH);

ok("the seller's door records intent", sellerDoorMarksIntent);
ok("the system's door does not record intent", !systemDoorMarksIntent);

ok(
  "both doors route through one transform, so there is still one reset seam",
  patchBody.includes("applyPatch(") && systemBody.includes("applyPatch(")
);
ok(
  "the reset seam still lives in that shared transform",
  applyBody.includes("resetIdentityBoundState")
);
ok(
  "the shared transform claims no intent of its own",
  !applyBody.includes(TOUCH)
);

/* The prefill itself. Requirement 4: it is neither disabled nor deferred —
   it still runs, still on mount, still with a real currency; only its claim
   to be the seller changed. */
const prefill = src.slice(
  src.indexOf("if (!isSupportedCurrency(draft.askingCurrency))"),
  src.indexOf("if (!isSupportedCurrency(draft.askingCurrency))") + 500
);
ok(
  "the currency prefill goes through the system door",
  /patchSystem\(\{ askingCurrency:/.test(prefill)
);
ok(
  "the currency prefill is not routed through the seller door",
  !/[^m]patch\(\{ askingCurrency: pref/.test(prefill)
);
ok(
  "the prefill still assigns a real currency — it was not disabled",
  /askingCurrency: pref \?\? RECOMMENDED_CURRENCY/.test(prefill)
);
ok(
  "the prefill was not deferred behind a timer",
  !/setTimeout/.test(prefill)
);

/* The gate the whole defect ran through. */
ok(
  "the autosave still refuses to act before intent exists",
  src.includes("if (!userTouchedRef.current) return; // nothing meaningful yet")
);

/* Creation must stay downstream of that gate. Slice from the gate to the end
   of the autosave effect and confirm createDraft lives inside it. */
const gateAt = src.indexOf("if (!userTouchedRef.current) return; // nothing meaningful yet");
const autosave = src.slice(gateAt, gateAt + 1400);
ok(
  "draft creation sits behind the gate, not beside it",
  autosave.includes("await createDraft(content)")
);
ok(
  "creation is still conditional on there being no server draft yet",
  autosave.includes("if (!serverDraftId)")
);

/* The prefill was the only system mutation reaching the seller's door on
   mount. The canonical-staleness effect also patches, but it returns early
   unless a vaultReferenceId already exists, which an untouched draft never
   has — assert that guard is still what stands in front of it. */
const staleAt = src.indexOf("if (!draft.vaultReferenceId) return;");
ok(
  "the canonical staleness clear still cannot fire on an untouched draft",
  staleAt !== -1 &&
    src.slice(staleAt, staleAt + 400).includes("patch({ vaultReferenceId: null")
);

/* ── PART B — the lifecycle, driven by what Part A read out of the source ─ */

function makeFlow() {
  return {
    touched: false,
    serverDraftId: null,
    dirty: false,
    created: [],
    saves: 0,
    nextId: 1,

    /* The two doors, marking intent exactly as the SOURCE says they do. */
    sellerEdit() {
      if (sellerDoorMarksIntent) this.touched = true;
    },
    systemPrefill() {
      if (systemDoorMarksIntent) this.touched = true;
    },

    /* The autosave effect plus its debounce, reduced to the decision it
       makes: refuse before intent; create once; update thereafter. */
    autosaveSettles() {
      if (!this.touched) return;
      this.dirty = true;
      if (!this.serverDraftId) {
        const id = `draft-${this.nextId++}`;
        this.created.push(id);
        this.serverDraftId = id;
        this.dirty = false;
        return;
      }
      this.saves += 1;
      this.dirty = false;
    },
  };
}

/* 1 — open /sell and do nothing */
{
  const flow = makeFlow();
  flow.systemPrefill();
  flow.autosaveSettles();
  flow.autosaveSettles(); // and it stays quiet, not merely late

  ok("an untouched open creates no draft row", flow.created.length === 0);
  ok("an untouched open leaves no server draft id", flow.serverDraftId === null);
  ok("an untouched open queues no unsaved work", flow.dirty === false);
  ok("an untouched open writes nothing at all", flow.saves === 0);
}

/* 2 — the first genuine seller edit */
{
  const flow = makeFlow();
  flow.systemPrefill();
  flow.autosaveSettles();
  flow.sellerEdit();
  flow.autosaveSettles();

  ok("the first real edit creates exactly one draft", flow.created.length === 1);
  ok("that draft becomes the flow's server draft", flow.serverDraftId === flow.created[0]);
}

/* 3 — continued editing updates the same draft */
{
  const flow = makeFlow();
  flow.systemPrefill();
  flow.autosaveSettles();
  flow.sellerEdit();
  flow.autosaveSettles();
  const first = flow.serverDraftId;

  flow.sellerEdit();
  flow.autosaveSettles();
  flow.sellerEdit();
  flow.autosaveSettles();

  ok("continued edits create no further drafts", flow.created.length === 1);
  ok("continued edits stay on the same draft", flow.serverDraftId === first);
  ok("continued edits do reach the server", flow.saves === 2);
}

/* 4 — the regression itself, stated as a test.
   If the system door ever starts marking intent again, step 1 mints a row.
   This asserts the failure mode directly rather than trusting step 1 to
   notice it. */
{
  const flow = makeFlow();
  flow.touched = true; // what the old patch() did on prefill
  flow.autosaveSettles();
  ok(
    "the old behaviour would have created a row — this is the defect, pinned",
    flow.created.length === 1
  );
}

console.log(`sell-empty-draft: ${n} checks passed`);
