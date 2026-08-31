/* Sell resume/recovery — the progress model and the departure flush.

   The governing property: restoring a saved position may never place the
   seller further along than the draft's CURRENT content justifies, and
   leaving a draft may never discard the edit still sitting in the debounce.

   Run: node scripts/sell-resume-progress.test.mjs */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { readProgress, LAST_STEP, FRESH_PROGRESS } from "../lib/sellProgress.ts";

let pass = 0;
const ok = (n, c) => { assert.ok(c, n); pass++; };

// ── The position round-trips when the draft still supports it ────────────
{
  const p = readProgress({ reached: 3, at: 2 }, LAST_STEP);
  ok("a supported position restores exactly", p.reached === 3 && p.at === 2);
}
{
  const p = readProgress({ reached: 4, at: 4 }, LAST_STEP);
  ok("the last step restores", p.reached === LAST_STEP && p.at === LAST_STEP);
}
{
  const p = readProgress(undefined, LAST_STEP);
  ok("no stored progress starts at the beginning",
    p.reached === FRESH_PROGRESS.reached && p.at === FRESH_PROGRESS.at);
}

// ── Never manufacture advancement ────────────────────────────────────────
{
  /* Reached Details, then removed the photographs that got them there. The
     stored 2 is no longer earned and must not be handed back. */
  const p = readProgress({ reached: 2, at: 2 }, 1);
  ok("progress clamps to what the draft now supports", p.reached === 1);
  ok("the cursor clamps with it", p.at === 1);
}
{
  const p = readProgress({ reached: 4, at: 4 }, 0);
  ok("a draft that lost curation returns to the beginning", p.reached === 0 && p.at === 0);
}
{
  const p = readProgress({ reached: 99, at: 99 }, LAST_STEP);
  ok("nothing can exceed the last step", p.reached === LAST_STEP && p.at === LAST_STEP);
}

// ── The cursor can never outrun the progress that justifies it ───────────
{
  const p = readProgress({ reached: 1, at: 4 }, LAST_STEP);
  ok("a cursor beyond reached is pulled back", p.at === 1 && p.reached === 1);
}
{
  const p = readProgress({ reached: 0, at: 3 }, LAST_STEP);
  ok("a cursor with no progress behind it is zero", p.at === 0);
}

// ── Malformed or hostile envelopes degrade, never throw ─────────────────
for (const [label, raw] of [
  ["null", null],
  ["a string", "reached:3"],
  ["an array", [3, 2]],
  ["a number", 3],
  ["missing fields", {}],
  ["non-numeric fields", { reached: "3", at: "2" }],
  ["negative values", { reached: -5, at: -2 }],
  ["fractional values", { reached: 2.9, at: 1.9 }],
  ["NaN", { reached: NaN, at: NaN }],
  ["Infinity", { reached: Infinity, at: Infinity }],
]) {
  const p = readProgress(raw, LAST_STEP);
  ok(`${label} yields a valid position`,
    Number.isInteger(p.reached) && Number.isInteger(p.at));
  ok(`${label} stays in range`,
    p.reached >= 0 && p.reached <= LAST_STEP && p.at >= 0 && p.at <= p.reached);
}
{
  const p = readProgress({ reached: 2.9, at: 1.9 }, LAST_STEP);
  ok("fractions floor rather than round up", p.reached === 2 && p.at === 1);
}

// ── STRUCTURAL: leaving a draft flushes rather than discards ─────────────
{
  const sf = readFileSync("components/SellFlow.tsx", "utf8");

  ok("a flush exists", /const flushPendingSave = useCallback/.test(sf));
  ok("it writes through the same revision-guarded save", /flushPendingSave[\s\S]{0,1400}saveContent\(/.test(sf));
  ok("it re-anchors on STALE rather than dropping the edit",
    /flushPendingSave[\s\S]{0,1600}res\.state === "STALE"[\s\S]{0,300}fetchDraftRow/.test(sf));

  /* Every departure must flush BEFORE it moves, and must stop if the flush
     failed — losing the edit quietly is the defect being fixed. */
  const sw = /async function switchToDraft[\s\S]{0,900}/.exec(sf)?.[0] ?? "";
  ok("switching flushes first", /const safe = await flushPendingSave\(\)/.test(sw));
  ok("switching aborts when the flush failed", /if \(!safe\)[\s\S]{0,220}return;/.test(sw));
  ok("switching no longer just clears the timer",
    !/switchToDraft[\s\S]{0,400}clearTimeout\(saveTimerRef\.current\)/.test(sf));

  const sn = /async function startNewListing[\s\S]{0,900}/.exec(sf)?.[0] ?? "";
  ok("start-new / set-aside flushes first", /const safe = await flushPendingSave\(\)/.test(sn));
  ok("start-new aborts when the flush failed", /if \(!safe\)[\s\S]{0,220}return;/.test(sn));
  ok("nothing is set aside before the flush",
    sn.indexOf("flushPendingSave") < sn.indexOf("setAsideDraft"));

  ok("an outstanding edit is tracked", /dirtyRef\.current = true/.test(sf));

  // ── Progress rides in the saved envelope, beside the draft ─────────────
  ok("progress is saved with the draft", /\{ draft, progress: \{ reached: maxStep, at: step \} \}/.test(sf));
  ok("progress is hydrated on adopt", /readProgress\(row\.content\?\.progress, supportedStep\(adopted\)\)/.test(sf));
  ok("the supported bound uses the flow's own gates",
    /d\.curationDecision !== "pass"[\s\S]{0,80}mandatoryDone\(d\)/.test(sf));
  ok("switching no longer zeroes the restored position",
    !/adoptRow\(row\)[\s\S]{0,400}setStepRaw\(0\);\s*\n\s*setMaxStep\(0\);/.test(sf));

  // ── Advancing lands on the work, not the page entrance ────────────────
  ok("step transitions no longer scroll the document to zero",
    !/window\.scrollTo\(0, 0\)/.test(sf));
  ok("step transitions target the flow anchor",
    /flowTopRef\.current\?\.scrollIntoView\(\{ behavior: "auto"/.test(sf));

  /* A hydrate is not a transition, and the suppression matches by VALUE so a
     restore onto the current step cannot swallow the next real advance. */
  ok("hydration is suppressed by value, not a boolean flag",
    /const hydrateToRef = useRef<number \| null>/.test(sf) &&
    /hydratedTo !== null && hydratedTo === step/.test(sf));
  ok("the hydration marker is consumed on every run",
    /const hydratedTo = hydrateToRef\.current;\s*\n\s*hydrateToRef\.current = null;/.test(sf));
}

console.log(`sell-resume-progress: ${pass} assertions PASS`);
