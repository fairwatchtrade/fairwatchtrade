#!/usr/bin/env node
// Continuity Spine — coverage and recovery-packet compiler.
//
// A packet is a RECOVERY VIEW. It is not present-day truth by existence.
// Every section either points at evidence or names what it could not prove.
//
// The packet deliberately leads with WHAT IS NOT PROVEN. A recovery reader
// who scrolls only the first screen must see the reasons to distrust the rest
// before seeing the rest.

import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

import {
  REPO_ROOT,
  makeGitRunner,
  discoverSystemHomes,
  loadCatalog,
  lastTouch,
  deriveContinuityGap,
  pathsTracked,
  deriveHead,
  compareVersionClaim,
  resolvesAsCurrentAuthority,
  todayStamp,
  COULD_NOT_VERIFY,
  CONTINUITY_GAP,
  COVERED,
  DEGRADED,
  UNCOVERED,
  VERSION_DERIVED,
  VERSION_UNDERIVABLE,
  VERSION_MISMATCH,
} from './derive.mjs';

import { evaluateFixtureSignature } from './fixtures/cases.mjs';

const CATALOG_PATH = 'continuity/ARTIFACT_CATALOG.json';
const PACKET_DIR = 'continuity/packets';
export const ROLES = ['builder', 'founder'];

// ---------------------------------------------------------------------------
// Coverage
// ---------------------------------------------------------------------------

export function computeCoverage({ root = REPO_ROOT, git = makeGitRunner() } = {}) {
  const cat = loadCatalog(CATALOG_PATH, { root });
  const discovered = discoverSystemHomes(git, { root });

  const rows = [];
  const notes = [];

  if (!cat.ok) {
    return { state: 'ERROR', errors: cat.errors, rows, notes, corpus: discovered.corpus };
  }

  const homesBySystem = new Map();
  const gitUnavailable = discovered.state === COULD_NOT_VERIFY;
  if (!gitUnavailable) {
    for (const h of discovered.homes) if (h.system_id) homesBySystem.set(h.system_id, h);
  } else {
    notes.push('README corpus COULD_NOT_VERIFY — git derivation unavailable. Coverage below is incomplete.');
  }

  for (const sys of cat.data.systems || []) {
    const home = homesBySystem.get(sys.system_id);

    // Git being unavailable means we could not LOOK for a home. It must never
    // be reported as having found no home.
    if (gitUnavailable) {
      rows.push({
        system_id: sys.system_id,
        title: sys.title,
        coverage: COULD_NOT_VERIFY,
        reason: 'git derivation unavailable — System Home presence and implementation could not be determined',
        missing: 'nothing is claimed; re-run where git is available',
      });
      continue;
    }

    if (!home) {
      // No governed home. "No home" is never "no risk" — prove whether real
      // implementation exists and say exactly what is missing.
      const tracked = pathsTracked(git, sys.material_paths || []);
      if (tracked.state === COULD_NOT_VERIFY) {
        rows.push({
          system_id: sys.system_id,
          title: sys.title,
          coverage: COULD_NOT_VERIFY,
          reason: 'no governed System Home, and git could not confirm whether implementation exists',
          missing: 'a System Home README carrying frontmatter with system_id',
        });
        continue;
      }
      rows.push({
        system_id: sys.system_id,
        title: sys.title,
        coverage: tracked.count > 0 ? UNCOVERED : 'DECLARED_ONLY',
        materialFiles: tracked.count,
        sampleFiles: tracked.files.slice(0, 8),
        reason:
          tracked.count > 0
            ? `${tracked.count} tracked file(s) of material implementation exist with no governed System Home`
            : 'declared in the catalog but no tracked implementation found',
        missing: 'a System Home README carrying frontmatter with system_id',
      });
      continue;
    }

    const gap = deriveContinuityGap(git, { homePath: home.path, owns: home.owns });
    let coverage = COVERED;
    let reason = 'System Home is current with its owned paths';
    if (gap.state === COULD_NOT_VERIFY) {
      coverage = COULD_NOT_VERIFY;
      reason = `git derivation unavailable: ${gap.reason}`;
    } else if (gap.state === CONTINUITY_GAP) {
      coverage = DEGRADED;
      reason = `${gap.newerCount} commit(s) touched owned paths after the home was last updated`;
    }

    rows.push({
      system_id: sys.system_id,
      title: sys.title,
      home: home.path,
      coverage,
      reason,
      gap,
    });
  }

  // Homes with no catalog declaration cannot be requested by system id.
  for (const [id, h] of homesBySystem) {
    if (!(cat.data.systems || []).some((s) => s.system_id === id)) {
      notes.push(`System Home "${id}" (${h.path}) exists but is not declared in catalog.systems — it cannot be compiled by system id.`);
    }
  }

  return { state: 'DERIVED', rows, notes, corpus: discovered.corpus, errors: [] };
}

// ---------------------------------------------------------------------------
// Packet compilation
// ---------------------------------------------------------------------------

export function compilePacket(systemId, role, { root = REPO_ROOT, git = makeGitRunner() } = {}) {
  if (!ROLES.includes(role)) {
    return { ok: false, error: `unknown role "${role}". Known roles: ${ROLES.join(', ')}` };
  }

  const cat = loadCatalog(CATALOG_PATH, { root });
  if (!cat.ok) return { ok: false, error: cat.errors.join('; ') };

  const discovered = discoverSystemHomes(git, { root });
  const gitUnavailable = discovered.state === COULD_NOT_VERIFY;
  const home = gitUnavailable
    ? null
    : discovered.homes.find((h) => h.system_id === systemId) || null;

  const declared = (cat.data.systems || []).find((s) => s.system_id === systemId) || null;
  if (!home && !declared && !gitUnavailable) {
    return {
      ok: false,
      error: `unknown system "${systemId}". Declared systems: ${(cat.data.systems || []).map((s) => s.system_id).join(', ') || '(none)'}`,
    };
  }

  const head = deriveHead(git);
  const notProven = [];
  const verifyFirst = [];

  // ---- coverage for this system
  let coverage = UNCOVERED;
  let gap = null;
  if (gitUnavailable) {
    // Could not look. Saying UNCOVERED here would assert a fact we never
    // checked — the exact collapse this machinery exists to prevent.
    coverage = COULD_NOT_VERIFY;
    notProven.push(
      `COVERAGE: ${COULD_NOT_VERIFY} — git derivation was unavailable, so this packet could not determine whether "${systemId}" has a governed System Home, what it owns, or whether it is stale. Nothing below is a claim that a home is absent. This is NOT "no difference found".`
    );
    verifyFirst.push('Re-run this packet where git is available before relying on any of it.');
  } else if (home) {
    gap = deriveContinuityGap(git, { homePath: home.path, owns: home.owns });
    if (gap.state === COULD_NOT_VERIFY) {
      coverage = COULD_NOT_VERIFY;
      notProven.push(
        `COVERAGE: ${COULD_NOT_VERIFY} — git derivation was unavailable (${gap.reason}). This is NOT "no difference found". Nothing below about freshness has been verified.`
      );
    } else if (gap.state === CONTINUITY_GAP) {
      coverage = DEGRADED;
      notProven.push(
        `${CONTINUITY_GAP}: ${gap.newerCount} commit(s) touched this system's owned paths after its System Home was last updated (home ${gap.homeShortSha}, ${gap.homeDate}). The home's prose may describe an older implementation.`
      );
      verifyFirst.push('Read the newer commits listed under SYSTEM before trusting the home’s description.');
    } else {
      coverage = COVERED;
    }
  } else {
    const tracked = pathsTracked(git, declared?.material_paths || []);
    const n = tracked.state === 'DERIVED' ? tracked.count : '?';
    notProven.push(
      `COVERAGE: ${UNCOVERED} — this system has material implementation (${n} tracked file(s)) and NO governed System Home. There is no recorded open work, no recorded trap, and no recorded production proof for it. Absence of a home is not evidence of absence of risk.`
    );
    verifyFirst.push('Nothing in this packet describes this system’s behaviour. Read the implementation directly, and consider writing a System Home.');
  }

  // ---- version derivation on HEAD
  if (head.state === COULD_NOT_VERIFY) {
    notProven.push(`HEAD: ${COULD_NOT_VERIFY} — git derivation unavailable. No commit identity in this packet is proven.`);
  } else if (head.version.state === VERSION_UNDERIVABLE) {
    notProven.push(
      `${VERSION_UNDERIVABLE}: HEAD commit ${head.shortSha} carries no FWT version at the subject-leading position. This is not a repository defect, not agreement, and not a mismatch — the version simply cannot be derived from this subject.`
    );
  }

  // ---- artifacts for this system
  const artifacts = (cat.data.artifacts || []).filter((a) => a.system === systemId);
  const currentArtifacts = artifacts.filter(resolvesAsCurrentAuthority);
  const supersededArtifacts = artifacts.filter((a) => !resolvesAsCurrentAuthority(a));

  for (const a of artifacts) {
    const src = a.source || {};
    if ((src.class === 'external_handoff' || src.class === 'drive') && src.location_verified !== true) {
      notProven.push(
        `UNVERIFIED SOURCE: artifact ${a.id} points at ${src.class} location "${src.location}", which the compiler cannot independently locate. Its content is claimed, not proven.`
      );
    }
    if (a.type === 'incident' && resolvesAsCurrentAuthority(a)) {
      notProven.push(`CONTRADICTION (unresolved): ${a.title} — ${a.note || 'see artifact record'}. Status: unresolved. Obtain a ruling or verify before mutation.`);
    }
    if (a.claimed_version) {
      const lt = lastTouch(git, [src.location].filter(Boolean));
      if (lt.state === 'DERIVED') {
        const cmp = compareVersionClaim(lt.version, a.claimed_version);
        if (cmp.state === VERSION_MISMATCH) {
          notProven.push(
            `${VERSION_MISMATCH}: artifact ${a.id} claims ${cmp.claimed} but its source's last commit derives ${cmp.derived}.`
          );
        }
      }
    }
  }

  // ---- production proof freshness
  let proofNote = null;
  if (home?.production_proof) {
    const pp = home.production_proof;
    if (gap?.state === CONTINUITY_GAP) {
      proofNote = 'LAST KNOWN, NOT CURRENT';
      notProven.push(
        `LAST-KNOWN-BUT-NOT-CURRENT PROOF: the recorded production proof (${pp.when || 'undated'}) predates ${gap.newerCount} later change(s) to owned paths. It proves what was true then, not what is true now.`
      );
    }
  } else if (home) {
    notProven.push('NO RECORDED PRODUCTION PROOF for this system. Nothing here establishes that it currently works in production.');
  }

  // ---- not built
  const notBuilt = home?.not_built || [];
  if (notBuilt.length) {
    notProven.push(
      `NOT BUILT / DO NOT INFER: ${notBuilt.length} item(s) are recorded as deliberately absent. Do not infer them from adjacent machinery. See the NOT BUILT list under SYSTEM.`
    );
  }

  verifyFirst.push('Confirm current Git state (branch, HEAD, dirty files) before any mutation.');
  verifyFirst.push('This packet is a recovery view compiled from repository evidence. It is not production truth and it is not a founder ruling.');
  if (role === 'builder') {
    verifyFirst.push('Read every TRAPS entry below before editing this system. Each one is mechanical and costly if forgotten.');
  }

  const md = renderPacket({
    systemId, role, head, coverage, home, declared, gap,
    notProven, verifyFirst, currentArtifacts, supersededArtifacts, notBuilt, proofNote,
    corpus: discovered.corpus,
  });

  return { ok: true, markdown: md, coverage, systemId, role };
}

function bullet(list, empty) {
  if (!list || list.length === 0) return `_${empty}_\n`;
  return list.map((l) => `- ${l}`).join('\n') + '\n';
}

function renderPacket(ctx) {
  const {
    systemId, role, head, coverage, home, declared, gap,
    notProven, verifyFirst, currentArtifacts, supersededArtifacts, notBuilt, proofNote, corpus,
  } = ctx;

  const L = [];
  L.push(`# Recovery Packet — ${systemId} (${role})`);
  L.push('');
  L.push(`Compiled ${todayStamp()} from repository evidence.`);
  if (head.state === 'DERIVED') {
    L.push(`Repository HEAD: \`${head.shortSha}\` on \`${head.branch}\` (${head.date})`);
    L.push(
      head.version.state === VERSION_DERIVED
        ? `HEAD version derived from commit subject: **${head.version.version}**`
        : `HEAD version: **${VERSION_UNDERIVABLE}**`
    );
  } else {
    L.push(`Repository HEAD: **${COULD_NOT_VERIFY}**`);
  }
  L.push('');
  L.push('> A packet points at evidence. It is not authority by existence, and it is');
  L.push('> not present-day truth. Verify before you mutate anything.');
  L.push('');

  L.push('## 1. WHAT IS NOT PROVEN');
  L.push('');
  L.push(bullet(notProven, 'Nothing is flagged unproven for this system. Coverage is COVERED and every checked derivation succeeded.'));

  L.push('## 2. VERIFY BEFORE ACTING');
  L.push('');
  L.push(bullet(verifyFirst, 'Nothing additional.'));

  L.push('## 3. SYSTEM');
  L.push('');
  L.push(`- **system_id:** \`${systemId}\``);
  if (declared?.title) L.push(`- **title:** ${declared.title}`);
  L.push(`- **coverage:** \`${coverage}\``);
  if (home) {
    L.push(`- **System Home:** [\`${home.path}\`](../${home.path})`);
    L.push(`- **owns:** ${home.owns.map((o) => `\`${o}\``).join(', ') || '_none declared_'}`);
    if (home.watches?.length) L.push(`- **watches:** ${home.watches.map((o) => `\`${o}\``).join(', ')}`);
    if (home.protected?.length) {
      L.push('- **protected seams** (a recorded seam and reason; this grants and revokes nothing):');
      for (const p of home.protected) L.push(`  - \`${p.path}\` — ${p.reason}`);
    }
  } else {
    L.push('- **System Home:** _none — this system is UNCOVERED_');
    if (declared?.material_paths?.length) {
      L.push(`- **declared material paths:** ${declared.material_paths.map((o) => `\`${o}\``).join(', ')}`);
    }
  }
  if (gap?.state === CONTINUITY_GAP) {
    L.push('');
    L.push(`### ${CONTINUITY_GAP} — commits after the home was last updated`);
    L.push('');
    L.push(`Home last updated at \`${gap.homeShortSha}\` (${gap.homeDate}).`);
    L.push('');
    for (const n of gap.newer) {
      const v = n.version.state === VERSION_DERIVED ? n.version.version : VERSION_UNDERIVABLE;
      L.push(`- \`${n.shortSha}\` ${n.date} — [${v}] ${n.subject.slice(0, 140)}`);
    }
  }
  if (notBuilt.length) {
    L.push('');
    L.push('### NOT BUILT / DO NOT INFER');
    L.push('');
    for (const n of notBuilt) L.push(`- ${n}`);
  }
  L.push('');

  L.push('## 4. OPEN');
  L.push('');
  if (home?.open?.length) {
    for (const o of home.open) L.push(`- **${o.id}** \`${o.state}\` — ${o.what}`);
    L.push('');
  } else if (home) {
    L.push('_No open work recorded in the System Home. That means none was recorded — not that none exists._\n');
  } else {
    L.push('_No System Home, therefore no recorded open work. Absence here proves nothing._\n');
  }

  L.push('## 5. ARTIFACTS');
  L.push('');
  if (currentArtifacts.length) {
    L.push('**Resolving as current authority:**');
    L.push('');
    for (const a of currentArtifacts) {
      L.push(`- \`${a.id}\` (${a.type}, ${a.authority_state}) — ${a.title}`);
      L.push(`  - source: \`${a.source?.class}\` → ${a.source?.location}`);
      if (a.note) L.push(`  - note: ${a.note}`);
    }
    L.push('');
  } else {
    L.push('_No artifact resolves as current authority for this system._\n');
  }
  if (supersededArtifacts.length) {
    L.push('**Superseded / rejected / draft — MUST NOT be treated as current:**');
    L.push('');
    for (const a of supersededArtifacts) {
      const to = a.superseded_by ? ` → superseded by \`${a.superseded_by}\`` : '';
      L.push(`- \`${a.id}\` (${a.type}, **${a.authority_state}**)${to} — ${a.title}`);
    }
    L.push('');
  }

  L.push('## 6. TRAPS');
  L.push('');
  if (home?.traps?.length) {
    for (const t of home.traps) L.push(`- ${t}`);
    L.push('');
  } else {
    L.push('_No traps recorded. This means none were written down, not that none exist._\n');
  }

  L.push('## 7. LAST PRODUCTION PROOF');
  L.push('');
  if (home?.production_proof) {
    const pp = home.production_proof;
    if (proofNote) L.push(`**${proofNote}**`);
    L.push(`- **what:** ${pp.what ?? '_not recorded_'}`);
    L.push(`- **when:** ${pp.when ?? '_not recorded_'}`);
    L.push(`- **how:** ${pp.how ?? '_not recorded_'}`);
    L.push('');
    L.push('_A recorded proof establishes what was true at that moment. It is not a claim about now._');
  } else {
    L.push('_No production proof recorded for this system._');
  }
  L.push('');
  L.push('---');
  L.push('');
  L.push(`README corpus at compile time: ${corpus?.count ?? '?'} file(s). Scope: ${corpus?.scope ?? 'unknown'}.`);
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function renderCoverage(cov) {
  const L = [];
  L.push('FairWatchTrade — Continuity Spine coverage\n');
  if (cov.state === 'ERROR') {
    L.push('ERROR:');
    for (const e of cov.errors) L.push(`  ${e}`);
    return L.join('\n');
  }
  L.push(`README corpus: ${cov.corpus?.count ?? '?'} file(s)`);
  L.push(`Enumeration scope: ${cov.corpus?.scope ?? 'unknown'}\n`);
  for (const r of cov.rows) {
    L.push(`  ${r.coverage.padEnd(17)} ${r.system_id}`);
    L.push(`  ${''.padEnd(17)} ${r.reason}`);
    if (r.home) L.push(`  ${''.padEnd(17)} home: ${r.home}`);
    if (r.missing) L.push(`  ${''.padEnd(17)} missing: ${r.missing}`);
    if (r.sampleFiles?.length) L.push(`  ${''.padEnd(17)} e.g. ${r.sampleFiles.slice(0, 4).join(', ')}`);
    L.push('');
  }
  if (cov.notes.length) {
    L.push('Notes:');
    for (const n of cov.notes) L.push(`  - ${n}`);
  }
  return L.join('\n');
}

function main() {
  const argv = process.argv.slice(2);
  const arg = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i === -1 ? null : argv[i + 1] ?? null;
  };

  if (argv.includes('--fixture-signature')) {
    process.stdout.write(evaluateFixtureSignature());
    process.exit(0);
  }

  if (argv.includes('--coverage')) {
    console.log(renderCoverage(computeCoverage()));
    process.exit(0);
  }

  const system = arg('system');
  const role = arg('role') || 'builder';

  if (!system) {
    console.log('Usage:');
    console.log('  node continuity/compile.mjs --coverage');
    console.log('  node continuity/compile.mjs --system <system> --role <builder|founder>');
    process.exit(2);
  }

  const res = compilePacket(system, role);
  if (!res.ok) {
    console.error(`compile failed: ${res.error}`);
    process.exit(1);
  }

  const dir = path.join(REPO_ROOT, PACKET_DIR);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const out = path.join(dir, `${system}-${role}-${todayStamp()}.md`);
  writeFileSync(out, res.markdown, 'utf8');

  console.log(`Recovery packet written: ${PACKET_DIR}/${path.basename(out)}`);
  console.log(`Coverage: ${res.coverage}`);
  process.exit(0);
}

if (process.argv[1]?.endsWith('compile.mjs')) main();
