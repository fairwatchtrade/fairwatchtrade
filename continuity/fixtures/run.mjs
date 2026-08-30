#!/usr/bin/env node
// Continuity Spine — fixture harness.
//
// Run UNPIPED. The exit code is the result; a shell pipeline whose last
// program is a formatter will mask it.
//
//   node continuity/fixtures/run.mjs

import {
  deriveVersionFromSubject,
  compareVersionClaim,
  deriveContinuityGap,
  pathsTracked,
  lastTouch,
  makeGitRunner,
  resolvesAsCurrentAuthority,
  COULD_NOT_VERIFY,
  CONTINUITY_GAP,
  UNCOVERED,
  DEGRADED,
  COVERED,
} from '../derive.mjs';

import { validateCatalogStructure } from '../validate.mjs';
import { compilePacket } from '../compile.mjs';
import { evaluateFixtureSignature } from './cases.mjs';

import {
  VERSION_CASES,
  CLAIM_CASES,
  FIXTURE_CATALOG_POISON,
  INVALID_CATALOGS,
  FIXTURE_STALE_HOME,
  FIXTURE_FRESH_HOME,
  FIXTURE_UNCOVERED,
  makeStubGit,
} from './cases.mjs';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, ok, detail) {
  if (ok) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; failures.push(`${name} — ${detail}`); console.log(`  FAIL  ${name} — ${detail}`); }
}

console.log('FairWatchTrade — Continuity Spine fixtures\n');

// ---------------------------------------------------------------------------
console.log('Fixtures A / B / C / C2 — version derivation (Drill 7)');
for (const c of VERSION_CASES) {
  const got = deriveVersionFromSubject(c.subject);
  check(
    `[${c.id}] ${c.label}`,
    got.state === c.expect.state && got.version === c.expect.version,
    `expected ${c.expect.state}:${c.expect.version} got ${got.state}:${got.version}`
  );
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Fixture D — version mismatch (Drill 6)');
for (const c of CLAIM_CASES) {
  const got = compareVersionClaim(deriveVersionFromSubject(c.subject), c.claimed);
  check(`[${c.id}] ${c.label}`, got.state === c.expect, `expected ${c.expect} got ${got.state}`);
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Fixture E — authority poisoning (Drill 2)');
{
  const r = validateCatalogStructure(FIXTURE_CATALOG_POISON, { verifySources: false });
  check('poison catalog is structurally valid', r.hard.length === 0, r.hard.join('; '));

  const old = FIXTURE_CATALOG_POISON.artifacts.find((a) => a.id === 'FIXTURE-ORDER-OLD');
  const rej = FIXTURE_CATALOG_POISON.artifacts.find((a) => a.id === 'FIXTURE-ORDER-REJECTED');
  const cur = FIXTURE_CATALOG_POISON.artifacts.find((a) => a.id === 'FIXTURE-ORDER-NEW');
  check('superseded order does NOT resolve as current', resolvesAsCurrentAuthority(old) === false, 'superseded resolved as current');
  check('rejected order does NOT resolve as current', resolvesAsCurrentAuthority(rej) === false, 'rejected resolved as current');
  check('current order DOES resolve as current', resolvesAsCurrentAuthority(cur) === true, 'authorized failed to resolve');
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Structural defect catalogs — validator must fail each');
for (const bad of INVALID_CATALOGS) {
  const r = validateCatalogStructure(bad.catalog, { verifySources: true });
  check(`[${bad.id}] rejected (${bad.expectDefect})`, r.hard.length > 0, 'validator reported no structural defect');
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Fixture F — stale System Home (Drill 3)');
{
  const git = makeStubGit(FIXTURE_STALE_HOME.git);
  const gap = deriveContinuityGap(git, {
    homePath: FIXTURE_STALE_HOME.home.path,
    owns: FIXTURE_STALE_HOME.home.owns,
  });
  check('stale home reports CONTINUITY_GAP', gap.state === CONTINUITY_GAP, `got ${gap.state}`);
  check('gap reports the correct newer-commit count', gap.newerCount === FIXTURE_STALE_HOME.expect.newerCount, `got ${gap.newerCount}`);
  check('gap names the newer SHAs', Array.isArray(gap.newer) && gap.newer.length === 2 && !!gap.newer[0].shortSha, 'newer SHAs missing');
  const coverage = gap.state === CONTINUITY_GAP ? DEGRADED : COVERED;
  check('coverage degrades to DEGRADED', coverage === DEGRADED, `got ${coverage}`);
}
{
  const git = makeStubGit(FIXTURE_FRESH_HOME.git);
  const gap = deriveContinuityGap(git, {
    homePath: FIXTURE_FRESH_HOME.home.path,
    owns: FIXTURE_FRESH_HOME.home.owns,
  });
  check('fresh home reports NO_GAP', gap.state === 'NO_GAP', `got ${gap.state}`);
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Fixture G — uncovered system (Drill 4 mechanism)');
{
  const git = makeStubGit({ trackedFiles: FIXTURE_UNCOVERED.trackedFiles });
  const tracked = pathsTracked(git, FIXTURE_UNCOVERED.system.material_paths);
  check('material implementation is detected', tracked.count === FIXTURE_UNCOVERED.expect.materialFiles, `got ${tracked.count}`);
  const coverage = tracked.count > 0 ? UNCOVERED : 'DECLARED_ONLY';
  check('no home + material files = UNCOVERED', coverage === UNCOVERED, `got ${coverage}`);
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Fixture H — git unavailable, fail closed (Drill 5)');
{
  const git = makeGitRunner({ disabled: true });
  const lt = lastTouch(git, ['anything']);
  check('lastTouch returns COULD_NOT_VERIFY', lt.state === COULD_NOT_VERIFY, `got ${lt.state}`);
  check('lastTouch never returns NO_DIFFERENCE_FOUND', JSON.stringify(lt).includes('NO_DIFFERENCE_FOUND') === false, 'forbidden state present');

  const gap = deriveContinuityGap(git, { homePath: 'x/README.md', owns: ['x'] });
  check('continuity gap returns COULD_NOT_VERIFY', gap.state === COULD_NOT_VERIFY, `got ${gap.state}`);

  const tracked = pathsTracked(git, ['x']);
  check('pathsTracked returns COULD_NOT_VERIFY', tracked.state === COULD_NOT_VERIFY, `got ${tracked.state}`);

  const stub = makeStubGit({ fail: true });
  const lt2 = lastTouch(stub, ['anything']);
  check('a failing git process also fails closed', lt2.state === COULD_NOT_VERIFY, `got ${lt2.state}`);

  // Regression guard. A packet compiled without git once reported UNCOVERED —
  // asserting a system had no System Home when it had merely never looked.
  // "Could not verify" must never collapse into a definite negative answer.
  const packet = compilePacket('identity', 'builder', { git });
  check(
    'packet with git unavailable reports COULD_NOT_VERIFY, never UNCOVERED',
    packet.ok && packet.coverage === COULD_NOT_VERIFY,
    `got ok=${packet.ok} coverage=${packet.coverage}`
  );
  check(
    'that packet does not claim the home is absent',
    packet.ok && !/no governed System Home/i.test(packet.markdown),
    'packet asserted absence of a home it never checked for'
  );
}
console.log('');

// ---------------------------------------------------------------------------
console.log('Validator / compiler fixture agreement');
{
  const a = evaluateFixtureSignature();
  const b = evaluateFixtureSignature();
  check('fixture signature is deterministic', a === b, 'signature is not stable');
  check('signature covers every case', a.split('|').length === VERSION_CASES.length + CLAIM_CASES.length, `got ${a.split('|').length} parts`);
}
console.log('');

console.log(`${pass} passed, ${fail} failed`);
if (fail > 0) {
  console.log('\nFAILURES:');
  for (const f of failures) console.log(`  ${f}`);
  process.exit(1);
}
process.exit(0);
