#!/usr/bin/env node
// Continuity Spine — integrity validation.
//
// Exits non-zero ONLY on structural defects that would make compilation
// unsafe: things that could cause a packet to state something false.
//
// Staleness is not a structural defect. A continuity gap, an unverifiable
// external source, or a system with no home are all reported as warnings and
// degrade coverage — they do not fail the process. Confusing the two would
// either block the build on ordinary drift or hide a real lie.

import { existsSync } from 'node:fs';
import path from 'node:path';

import {
  REPO_ROOT,
  makeGitRunner,
  discoverSystemHomes,
  loadCatalog,
  AUTHORITY_STATES,
  CURRENT_AUTHORITY_STATES,
  COULD_NOT_VERIFY,
} from './derive.mjs';

import { evaluateFixtureSignature } from './fixtures/cases.mjs';

const ARTIFACT_TYPES = ['decision', 'build_order', 'discovery', 'design', 'incident', 'law'];
const SOURCE_CLASSES = ['repo', 'repo_permalink', 'drive', 'production_proof', 'external_handoff'];

export const CATALOG_PATH = 'continuity/ARTIFACT_CATALOG.json';

// ---------------------------------------------------------------------------
// Catalog structure. Pure — takes data, returns defects. Fixtures drive it.
// ---------------------------------------------------------------------------

export function validateCatalogStructure(data, { root = REPO_ROOT, verifySources = true } = {}) {
  const hard = [];
  const warn = [];

  if (!data || typeof data !== 'object') {
    hard.push('catalog is not an object');
    return { hard, warn };
  }

  const artifacts = Array.isArray(data.artifacts) ? data.artifacts : null;
  if (!artifacts) {
    hard.push('catalog.artifacts is missing or not an array');
    return { hard, warn };
  }

  const systems = Array.isArray(data.systems) ? data.systems : [];
  const seenSystem = new Set();
  for (const s of systems) {
    if (!s?.system_id) { hard.push('catalog.systems entry missing system_id'); continue; }
    if (seenSystem.has(s.system_id)) hard.push(`duplicate system_id in catalog.systems: ${s.system_id}`);
    seenSystem.add(s.system_id);
  }

  const byId = new Map();
  for (const a of artifacts) {
    if (!a?.id) { hard.push('artifact missing id'); continue; }
    if (byId.has(a.id)) hard.push(`duplicate artifact id: ${a.id}`);
    byId.set(a.id, a);
  }

  for (const a of artifacts) {
    if (!a?.id) continue;
    const where = `artifact ${a.id}`;

    if (!AUTHORITY_STATES.includes(a.authority_state)) {
      hard.push(`${where}: unknown authority state "${a.authority_state}"`);
    }
    if (a.type && !ARTIFACT_TYPES.includes(a.type)) {
      hard.push(`${where}: unknown artifact type "${a.type}"`);
    }

    // Incompatible authority: something cannot be current authority and also
    // be recorded as superseded. That is the exact shape of a poisoned answer.
    if (a.superseded_by && CURRENT_AUTHORITY_STATES.includes(a.authority_state)) {
      hard.push(`${where}: authority_state "${a.authority_state}" but carries superseded_by "${a.superseded_by}"`);
    }
    if (a.authority_state === 'superseded' && !a.superseded_by) {
      hard.push(`${where}: marked superseded but names no superseded_by target`);
    }

    // Dangling supersession edges, either direction.
    for (const target of a.supersedes || []) {
      if (!byId.has(target)) hard.push(`${where}: supersedes dangling target "${target}"`);
    }
    if (a.superseded_by && !byId.has(a.superseded_by)) {
      hard.push(`${where}: superseded_by dangling target "${a.superseded_by}"`);
    }

    // Source location.
    const src = a.source;
    if (!src || !src.class) {
      hard.push(`${where}: missing source.class`);
    } else if (!SOURCE_CLASSES.includes(src.class)) {
      hard.push(`${where}: unknown source class "${src.class}"`);
    } else if (src.class === 'repo' && verifySources) {
      // Local verification is possible for repo sources, so a missing target
      // is a structural defect rather than a warning.
      if (!src.location || !existsSync(path.join(root, src.location))) {
        hard.push(`${where}: repo source target does not exist: ${src.location}`);
      }
    } else if (src.class === 'external_handoff' || src.class === 'drive') {
      if (src.location_verified !== true) {
        warn.push(`${where}: ${src.class} source is not independently verifiable by the compiler (${src.location})`);
      }
    }
  }

  // Circular supersession over the normalized newer -> older graph.
  const cycle = findSupersessionCycle(byId);
  if (cycle) hard.push(`circular supersession: ${cycle.join(' -> ')}`);
  for (const p of findInverseDisagreements(byId)) hard.push(`inverse supersession disagreement: ${p}`);

  // Contract: exactly one current authority where declared.
  for (const rule of data.contract?.single_current_authority || []) {
    const matches = artifacts.filter(
      (a) => a.system === rule.system && a.type === rule.type && CURRENT_AUTHORITY_STATES.includes(a.authority_state)
    );
    if (matches.length > 1) {
      hard.push(
        `multiple current authorities for system "${rule.system}" type "${rule.type}": ${matches.map((m) => m.id).join(', ')}`
      );
    }
    if (matches.length === 0) {
      warn.push(`no current authority for system "${rule.system}" type "${rule.type}"`);
    }
  }

  return { hard, warn };
}

// `supersedes` and `superseded_by` are INVERSE DESCRIPTIONS OF ONE EDGE, not
// two edges. Walking both as outgoing turns every correctly-mirrored pair into
// a false 2-cycle. Normalize to a single direction first: newer -> older.
export function buildSupersessionGraph(byId) {
  const edges = new Map(); // newer -> Set(older)
  const add = (newer, older) => {
    if (!byId.has(newer) || !byId.has(older)) return;
    if (!edges.has(newer)) edges.set(newer, new Set());
    edges.get(newer).add(older);
  };
  for (const [id, a] of byId) {
    for (const older of a.supersedes || []) add(id, older);
    if (a.superseded_by) add(a.superseded_by, id);
  }
  return edges;
}

// Where both directions are recorded, they must agree. A one-sided or
// contradictory mirror is a real defect: it makes "what superseded this?"
// answerable two different ways.
export function findInverseDisagreements(byId) {
  const problems = [];
  for (const [id, a] of byId) {
    for (const older of a.supersedes || []) {
      const t = byId.get(older);
      if (!t) continue;
      if (t.superseded_by && t.superseded_by !== id) {
        problems.push(
          `artifact ${id} supersedes ${older}, but ${older} records superseded_by "${t.superseded_by}"`
        );
      }
    }
  }
  return problems;
}

function findSupersessionCycle(byId) {
  const graph = buildSupersessionGraph(byId);
  const WHITE = 0, GREY = 1, BLACK = 2;
  const color = new Map();
  for (const id of byId.keys()) color.set(id, WHITE);

  const stack = [];
  let found = null;

  function visit(id) {
    if (found) return;
    color.set(id, GREY);
    stack.push(id);
    for (const n of graph.get(id) || []) {
      if (!byId.has(n)) continue;
      if (color.get(n) === GREY) {
        const at = stack.indexOf(n);
        found = [...stack.slice(at), n];
        return;
      }
      if (color.get(n) === WHITE) visit(n);
      if (found) return;
    }
    stack.pop();
    color.set(id, BLACK);
  }

  for (const id of byId.keys()) {
    if (color.get(id) === WHITE) visit(id);
    if (found) break;
  }
  return found;
}

// ---------------------------------------------------------------------------
// Full repository validation
// ---------------------------------------------------------------------------

export function runValidation({ root = REPO_ROOT, git = makeGitRunner() } = {}) {
  const hard = [];
  const warn = [];
  const info = [];

  // 1. Catalog
  const cat = loadCatalog(CATALOG_PATH, { root });
  if (!cat.ok) {
    hard.push(...cat.errors);
  } else {
    const r = validateCatalogStructure(cat.data, { root });
    hard.push(...r.hard);
    warn.push(...r.warn);
  }

  // 2. System Homes
  const discovered = discoverSystemHomes(git, { root });
  if (discovered.state === COULD_NOT_VERIFY) {
    warn.push('README corpus COULD_NOT_VERIFY — git derivation unavailable; System Home checks skipped');
  } else {
    info.push(`README corpus: ${discovered.corpus.count} file(s). Scope: ${discovered.corpus.scope}`);
    info.push(`System Homes discovered: ${discovered.homes.length}`);

    const seen = new Map();
    for (const h of discovered.homes) {
      hard.push(...h.errors.map((e) => `malformed System Home metadata — ${e}`));
      if (!h.system_id) continue;
      if (seen.has(h.system_id)) {
        hard.push(`duplicate system_id "${h.system_id}" in ${seen.get(h.system_id)} and ${h.path}`);
      }
      seen.set(h.system_id, h.path);

      for (const p of h.owns || []) {
        if (!existsSync(path.join(root, p))) {
          warn.push(`${h.path}: owned path does not exist on disk: ${p}`);
        }
      }
    }

    // A home whose system is not declared in the catalog cannot participate in
    // coverage, so it is reported rather than silently ignored.
    if (cat.ok) {
      const declared = new Set((cat.data.systems || []).map((s) => s.system_id));
      for (const h of discovered.homes) {
        if (h.system_id && !declared.has(h.system_id)) {
          warn.push(`System Home "${h.system_id}" (${h.path}) is not declared in catalog.systems`);
        }
      }
    }
  }

  // 3. Compiler/validator fixture agreement.
  const mine = evaluateFixtureSignature();
  let theirs = null;
  try {
    theirs = process.env.FWT_CONTINUITY_COMPILER_SIGNATURE || null;
  } catch { theirs = null; }
  if (theirs && theirs !== mine) {
    hard.push(`compiler/validator fixture disagreement:\n  validator: ${mine}\n  compiler:  ${theirs}`);
  }
  info.push(`fixture signature: ${mine}`);

  return { hard, warn, info };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main() {
  const { hard, warn, info } = runValidation();

  console.log('FairWatchTrade — Continuity Spine validation\n');
  for (const i of info) console.log(`  info  ${i}`);
  if (info.length) console.log('');

  if (warn.length) {
    console.log(`WARNINGS (${warn.length}) — these degrade coverage; they do not fail validation:`);
    for (const w of warn) console.log(`  warn  ${w}`);
    console.log('');
  }

  if (hard.length) {
    console.log(`STRUCTURAL DEFECTS (${hard.length}) — compilation is unsafe:`);
    for (const h of hard) console.log(`  FAIL  ${h}`);
    console.log('\nVALIDATION FAILED');
    process.exit(1);
  }

  console.log('VALIDATION PASSED — no structural defects. Warnings above (if any) are coverage facts, not failures.');
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('validate.mjs')) {
  main();
}
