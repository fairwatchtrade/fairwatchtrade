// Shared fixtures.
//
// The validator and the compiler both evaluate these. If they ever disagree,
// validate.mjs fails hard — that is the drift guard. Do not fork these cases
// into either tool.
//
// Every fixture id is obviously synthetic. Real current state is never seeded
// here: a continuity system born with stale "current" data is worse than one
// with none.

import {
  deriveVersionFromSubject,
  compareVersionClaim,
  VERSION_DERIVED,
  VERSION_UNDERIVABLE,
  VERSION_MISMATCH,
  VERSION_AGREES,
} from '../derive.mjs';

// ---------------------------------------------------------------------------
// Version derivation cases
// ---------------------------------------------------------------------------

export const VERSION_CASES = [
  {
    id: 'A',
    label: 'clean leading version',
    subject: 'v7.53 - Account Settings tabs in beneath the collector’s name, and the composition finally says what it means.',
    modeled_on: 'real commit 80138f5',
    expect: { state: VERSION_DERIVED, version: 'v7.53' },
  },
  {
    id: 'B',
    label: 'noisy non-alphanumeric prefix before the version',
    subject: '@ v6.81 - Imported Drafts stops handing a phone a 30px workbench',
    modeled_on: 'real commit 6b5ab0b',
    expect: { state: VERSION_DERIVED, version: 'v6.81' },
  },
  {
    id: 'C',
    label: 'no version token anywhere',
    subject: 'chore: update dependencies and regenerate lockfile',
    modeled_on: 'modeled on proven unversioned commits',
    expect: { state: VERSION_UNDERIVABLE, version: null },
  },
  {
    id: 'C2',
    label: 'version mentioned only after prose has begun',
    subject: 'chore: trigger deployment for v3.25 (empty commit, no code change)',
    modeled_on: 'real commit 172ad57',
    expect: { state: VERSION_UNDERIVABLE, version: null },
  },
  {
    id: 'C2b',
    label: 'merge subject mentioning another build’s version',
    subject: 'Merge main into watchblueprint-depth-rotation (brings v2.40 /list + app/.tsx removal)',
    modeled_on: 'real commit 71afa4f',
    expect: { state: VERSION_UNDERIVABLE, version: null },
  },
  {
    id: 'C2c',
    label: 'prose subject naming a candidate version',
    subject: 'Galaxy descendant publication model v3.26 candidate — concurrency-corrected for independent rereview',
    modeled_on: 'real commit 81ee366',
    expect: { state: VERSION_UNDERIVABLE, version: null },
  },
  {
    id: 'A2',
    label: 'leading version, later prose mentions a different version',
    subject: 'v7.17 - the strip holds its line, restoring the prior v6.86 posture',
    modeled_on: 'the forward-scan hazard',
    expect: { state: VERSION_DERIVED, version: 'v7.17' },
  },
];

// Fixture D — an explicit human/catalog claim that disagrees with a derived
// commit version.
export const CLAIM_CASES = [
  {
    id: 'D',
    label: 'human label disagrees with derived commit version',
    subject: 'v7.53 - Account Settings tabs in beneath the collector’s name',
    claimed: 'v7.34',
    expect: VERSION_MISMATCH,
  },
  {
    id: 'D2',
    label: 'human label agrees with derived commit version',
    subject: 'v7.53 - Account Settings tabs in beneath the collector’s name',
    claimed: 'v7.53',
    expect: VERSION_AGREES,
  },
  {
    id: 'D3',
    label: 'claim against an underivable subject never becomes agreement',
    subject: 'chore: trigger deployment for v3.25 (empty commit, no code change)',
    claimed: 'v3.25',
    expect: VERSION_UNDERIVABLE,
  },
];

// ---------------------------------------------------------------------------
// Fixture E — authority poisoning.
// A plausible old order must never compile as current.
// ---------------------------------------------------------------------------

export const FIXTURE_CATALOG_POISON = {
  catalog_version: 1,
  contract: { single_current_authority: [{ system: 'fixture-system', type: 'build_order' }] },
  systems: [{ system_id: 'fixture-system', title: 'Synthetic fixture system', material_paths: ['fixture/only'] }],
  artifacts: [
    {
      id: 'FIXTURE-ORDER-OLD',
      type: 'build_order',
      system: 'fixture-system',
      title: 'Synthetic superseded order that looks plausible and current',
      authority_state: 'superseded',
      superseded_by: 'FIXTURE-ORDER-NEW',
      source: { class: 'repo', location: 'continuity/fixtures/cases.mjs' },
      writer: 'fixture',
      date: '2026-01-01',
    },
    {
      id: 'FIXTURE-ORDER-REJECTED',
      type: 'build_order',
      system: 'fixture-system',
      title: 'Synthetic rejected order',
      authority_state: 'rejected',
      source: { class: 'repo', location: 'continuity/fixtures/cases.mjs' },
      writer: 'fixture',
      date: '2026-01-02',
    },
    {
      id: 'FIXTURE-ORDER-NEW',
      type: 'build_order',
      system: 'fixture-system',
      title: 'Synthetic current order',
      authority_state: 'authorized',
      supersedes: ['FIXTURE-ORDER-OLD'],
      source: { class: 'repo', location: 'continuity/fixtures/cases.mjs' },
      writer: 'fixture',
      date: '2026-01-03',
    },
  ],
};

// Catalogs that MUST fail validation. Each isolates one structural defect.
export const INVALID_CATALOGS = [
  {
    id: 'dup-artifact-id',
    expectDefect: 'duplicate artifact id',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'X', type: 'law', system: 's', title: 't', authority_state: 'current', source: { class: 'production_proof', location: 'n/a' } },
        { id: 'X', type: 'law', system: 's', title: 't', authority_state: 'current', source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
  {
    id: 'dangling-supersedes',
    expectDefect: 'dangling supersession target',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'X', type: 'law', system: 's', title: 't', authority_state: 'current', supersedes: ['NOPE'], source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
  {
    id: 'circular-supersession',
    expectDefect: 'circular supersession',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'A', type: 'law', system: 's', title: 't', authority_state: 'superseded', superseded_by: 'B', source: { class: 'production_proof', location: 'n/a' } },
        { id: 'B', type: 'law', system: 's', title: 't', authority_state: 'superseded', superseded_by: 'A', source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
  {
    id: 'superseded-but-current',
    expectDefect: 'incompatible authority state',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'A', type: 'law', system: 's', title: 't', authority_state: 'current', superseded_by: 'B', source: { class: 'production_proof', location: 'n/a' } },
        { id: 'B', type: 'law', system: 's', title: 't', authority_state: 'current', source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
  {
    id: 'multiple-current-authorities',
    expectDefect: 'multiple current authorities',
    catalog: {
      catalog_version: 1,
      contract: { single_current_authority: [{ system: 's', type: 'build_order' }] },
      systems: [],
      artifacts: [
        { id: 'A', type: 'build_order', system: 's', title: 't', authority_state: 'authorized', source: { class: 'production_proof', location: 'n/a' } },
        { id: 'B', type: 'build_order', system: 's', title: 't', authority_state: 'authorized', source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
  {
    id: 'missing-repo-source',
    expectDefect: 'missing source target',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'A', type: 'law', system: 's', title: 't', authority_state: 'current', source: { class: 'repo', location: 'does/not/exist/anywhere.md' } },
      ],
    },
  },
  {
    id: 'unknown-authority-state',
    expectDefect: 'unknown authority state',
    catalog: {
      catalog_version: 1,
      systems: [],
      artifacts: [
        { id: 'A', type: 'law', system: 's', title: 't', authority_state: 'probably_fine', source: { class: 'production_proof', location: 'n/a' } },
      ],
    },
  },
];

// ---------------------------------------------------------------------------
// Fixture F — stale System Home, and Fixture H — git unavailable.
// Both are driven by injected git runners so the tests are hermetic.
// ---------------------------------------------------------------------------

const U = '\x1f';

export function makeStubGit(spec) {
  return function stubGit(args) {
    if (spec.fail) return { ok: false, reason: 'GIT_UNAVAILABLE', detail: 'stub failure' };
    const joined = args.join(' ');
    if (args[0] === 'log' && args[1] === '-1') {
      if (!spec.homeCommit) return { ok: true, out: '' };
      const c = spec.homeCommit;
      return { ok: true, out: `${c.sha}${U}${c.date}${U}${c.subject}` };
    }
    if (args[0] === 'log' && joined.includes('..HEAD')) {
      const rows = (spec.newerCommits || []).map((c) => `${c.sha}${U}${c.date}${U}${c.subject}`);
      return { ok: true, out: rows.join('\n') };
    }
    if (args[0] === 'ls-files') {
      return { ok: true, out: (spec.trackedFiles || []).join('\n') };
    }
    return { ok: true, out: '' };
  };
}

export const FIXTURE_STALE_HOME = {
  id: 'F',
  label: 'owned implementation moved after the home was last updated',
  home: {
    path: 'fixture/system/README.md',
    system_id: 'fixture-stale',
    owns: ['fixture/system'],
  },
  git: {
    homeCommit: {
      sha: '1111111111111111111111111111111111111111',
      date: '2026-08-01T00:00:00+00:00',
      subject: 'v7.00 - synthetic home update',
    },
    newerCommits: [
      { sha: '2222222222222222222222222222222222222222', date: '2026-08-20T00:00:00+00:00', subject: 'v7.40 - synthetic owned-path change' },
      { sha: '3333333333333333333333333333333333333333', date: '2026-08-25T00:00:00+00:00', subject: 'v7.50 - synthetic owned-path change' },
    ],
  },
  expect: { gapState: 'CONTINUITY_GAP', newerCount: 2, coverage: 'DEGRADED' },
};

export const FIXTURE_FRESH_HOME = {
  id: 'F2',
  label: 'home is current with its owned paths',
  home: {
    path: 'fixture/system/README.md',
    system_id: 'fixture-fresh',
    owns: ['fixture/system'],
  },
  git: {
    homeCommit: {
      sha: '4444444444444444444444444444444444444444',
      date: '2026-08-28T00:00:00+00:00',
      subject: 'v7.52 - synthetic home update',
    },
    newerCommits: [],
  },
  expect: { gapState: 'NO_GAP', coverage: 'COVERED' },
};

// Fixture G — a declared system with material implementation and no home.
export const FIXTURE_UNCOVERED = {
  id: 'G',
  label: 'material implementation exists with no governed System Home',
  system: { system_id: 'fixture-uncovered', material_paths: ['fixture/uncovered'] },
  trackedFiles: ['fixture/uncovered/route.ts', 'fixture/uncovered/lib.ts'],
  expect: { coverage: 'UNCOVERED', materialFiles: 2 },
};

// ---------------------------------------------------------------------------
// Shared evaluation. Both validate.mjs and compile.mjs call this and compare
// signatures; a mismatch is a hard failure.
// ---------------------------------------------------------------------------

export function evaluateFixtureSignature() {
  const parts = [];
  for (const c of VERSION_CASES) {
    const got = deriveVersionFromSubject(c.subject);
    parts.push(`${c.id}=${got.state}:${got.version ?? '-'}`);
  }
  for (const c of CLAIM_CASES) {
    const got = compareVersionClaim(deriveVersionFromSubject(c.subject), c.claimed);
    parts.push(`${c.id}=${got.state}`);
  }
  return parts.join('|');
}
