// Continuity Spine — deterministic derivation.
//
// Everything in this file is derived from Git or from files on disk. Nothing
// here is hand-maintained truth, and nothing here writes a derived value back
// into a hand-maintained field.
//
// Read continuity/README.md before changing the version parser. Its behaviour
// is a governed contract, not an implementation detail.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..');

// ---------------------------------------------------------------------------
// Result states. These are vocabulary, not booleans, because the whole point
// of this machinery is that "could not verify" and "no difference found" are
// different answers.
// ---------------------------------------------------------------------------

export const VERSION_DERIVED = 'VERSION_DERIVED';
export const VERSION_UNDERIVABLE = 'VERSION_UNDERIVABLE';
export const VERSION_MISMATCH = 'VERSION_MISMATCH';
export const VERSION_AGREES = 'VERSION_AGREES';
export const NO_CLAIM = 'NO_CLAIM';

export const COULD_NOT_VERIFY = 'COULD_NOT_VERIFY';
export const CONTINUITY_GAP = 'CONTINUITY_GAP';
export const COVERED = 'COVERED';
export const DEGRADED = 'DEGRADED';
export const UNCOVERED = 'UNCOVERED';

// ---------------------------------------------------------------------------
// VERSION DERIVATION LAW
//
// A commit subject may carry this commit's own version only at the
// subject-leading position. A version-shaped token appearing after prose has
// begun belongs to another build, deployment, merge, or spec — it is a
// reference, never this commit's version.
//
// Therefore: permit a leading run of non-alphanumeric characters and
// whitespace, then require the first alphanumeric content to BE the version.
// Never scan forward. A parser that scans forward fails silently and
// confidently, which is worse than failing loudly.
// ---------------------------------------------------------------------------

export function deriveVersionFromSubject(subject) {
  if (typeof subject !== 'string' || subject.length === 0) {
    return { state: VERSION_UNDERIVABLE, version: null, reason: 'no subject' };
  }

  // The permitted prefix is structurally bounded to the run before the first
  // alphanumeric character. We do not "skip" anything else looking for a match.
  const firstAlnum = subject.search(/[A-Za-z0-9]/);
  if (firstAlnum === -1) {
    return { state: VERSION_UNDERIVABLE, version: null, reason: 'no alphanumeric content' };
  }

  const leading = subject.slice(firstAlnum);
  const m = /^v(\d+)\.(\d+)/.exec(leading);
  if (!m) {
    return {
      state: VERSION_UNDERIVABLE,
      version: null,
      reason: 'prose begins before any version token at the subject-leading position',
    };
  }

  return {
    state: VERSION_DERIVED,
    version: `v${m[1]}.${m[2]}`,
    prefix: subject.slice(0, firstAlnum),
  };
}

// A human/catalog claim is only ever compared against a SUCCESSFULLY derived
// version. Undecidable never collapses into agreement.
export function compareVersionClaim(derived, claimed) {
  if (!derived || derived.state !== VERSION_DERIVED) {
    return { state: VERSION_UNDERIVABLE, derived: null, claimed: claimed ?? null };
  }
  if (claimed === null || claimed === undefined || String(claimed).trim() === '') {
    return { state: NO_CLAIM, derived: derived.version, claimed: null };
  }
  const norm = String(claimed).trim();
  return {
    state: norm === derived.version ? VERSION_AGREES : VERSION_MISMATCH,
    derived: derived.version,
    claimed: norm,
  };
}

// ---------------------------------------------------------------------------
// Git access. Always injectable so the fail-closed path can be exercised.
// ---------------------------------------------------------------------------

export function makeGitRunner({ cwd = REPO_ROOT, disabled = false } = {}) {
  const off = disabled || process.env.FWT_CONTINUITY_NO_GIT === '1';
  return function git(args) {
    if (off) return { ok: false, reason: 'GIT_UNAVAILABLE', detail: 'git derivation disabled' };
    try {
      const out = execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 64 * 1024 * 1024,
      });
      return { ok: true, out: out.replace(/\r?\n$/, '') };
    } catch (err) {
      const detail = String(err?.stderr || err?.message || 'git failed').trim();
      return { ok: false, reason: 'GIT_UNAVAILABLE', detail };
    }
  };
}

const REC = '%H\x1f%cI\x1f%s';

function parseLogRecords(out) {
  if (!out) return [];
  return out
    .split(/\r?\n/)
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const [sha, date, ...rest] = l.split('\x1f');
      return { sha, date, subject: rest.join('\x1f') };
    });
}

// Last commit touching any of the given repo-relative paths.
export function lastTouch(git, paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) {
    return { state: COULD_NOT_VERIFY, reason: 'no paths declared' };
  }
  const r = git(['log', '-1', `--format=${REC}`, '--', ...list]);
  if (!r.ok) return { state: COULD_NOT_VERIFY, reason: r.reason, detail: r.detail };
  const recs = parseLogRecords(r.out);
  if (recs.length === 0) {
    // Genuinely no commits — this is a real answer, not a verification failure.
    return { state: 'NO_COMMITS', paths: list };
  }
  const rec = recs[0];
  return {
    state: 'DERIVED',
    sha: rec.sha,
    shortSha: rec.sha.slice(0, 7),
    date: rec.date,
    subject: rec.subject,
    version: deriveVersionFromSubject(rec.subject),
  };
}

// Does the tracked implementation this home owns carry commits newer than the
// home itself? The home's own file is excluded — a documentation edit is not
// implementation drift.
export function deriveContinuityGap(git, { homePath, owns }) {
  const home = lastTouch(git, [homePath]);
  if (home.state === COULD_NOT_VERIFY) {
    return { state: COULD_NOT_VERIFY, reason: home.reason, detail: home.detail };
  }
  if (home.state === 'NO_COMMITS') {
    return { state: COULD_NOT_VERIFY, reason: 'home file has no commit history' };
  }

  const owned = (owns || []).filter(Boolean);
  if (owned.length === 0) {
    return { state: COULD_NOT_VERIFY, reason: 'home declares no owned paths' };
  }

  const r = git([
    'log',
    `--format=${REC}`,
    `${home.sha}..HEAD`,
    '--',
    ...owned,
    `:(exclude)${homePath}`,
  ]);
  if (!r.ok) return { state: COULD_NOT_VERIFY, reason: r.reason, detail: r.detail };

  const newer = parseLogRecords(r.out);
  if (newer.length === 0) {
    return {
      state: 'NO_GAP',
      homeSha: home.sha,
      homeShortSha: home.shortSha,
      homeDate: home.date,
    };
  }
  return {
    state: CONTINUITY_GAP,
    homeSha: home.sha,
    homeShortSha: home.shortSha,
    homeDate: home.date,
    newerCount: newer.length,
    newer: newer.map((n) => ({
      sha: n.sha,
      shortSha: n.sha.slice(0, 7),
      date: n.date,
      subject: n.subject,
      version: deriveVersionFromSubject(n.subject),
    })),
  };
}

// Does a declared path exist in tracked Git content? Used for "material
// implementation exists but no governed home".
export function pathsTracked(git, paths) {
  const list = (paths || []).filter(Boolean);
  if (list.length === 0) return { state: COULD_NOT_VERIFY, reason: 'no paths declared' };
  const r = git(['ls-files', '--', ...list]);
  if (!r.ok) return { state: COULD_NOT_VERIFY, reason: r.reason, detail: r.detail };
  const files = (r.out || '').split(/\r?\n/).filter((l) => l.trim() !== '');
  return { state: 'DERIVED', count: files.length, files };
}

// The README corpus must be discovered, never hard-coded, and every count must
// name the exact enumeration scope that produced it.
export const README_SCOPE =
  'git ls-files (tracked files only), basename README.md, whole repository, no path filter';

export function deriveReadmeCorpus(git) {
  const r = git(['ls-files']);
  if (!r.ok) return { state: COULD_NOT_VERIFY, reason: r.reason, scope: README_SCOPE };
  const files = (r.out || '')
    .split(/\r?\n/)
    .filter((l) => /(^|\/)README\.md$/.test(l.trim()));
  return { state: 'DERIVED', scope: README_SCOPE, count: files.length, files };
}

export function deriveHead(git) {
  const r = git(['log', '-1', `--format=${REC}`]);
  if (!r.ok) return { state: COULD_NOT_VERIFY, reason: r.reason, detail: r.detail };
  const rec = parseLogRecords(r.out)[0];
  if (!rec) return { state: COULD_NOT_VERIFY, reason: 'no HEAD commit' };
  const br = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  return {
    state: 'DERIVED',
    sha: rec.sha,
    shortSha: rec.sha.slice(0, 7),
    date: rec.date,
    subject: rec.subject,
    branch: br.ok ? br.out : null,
    version: deriveVersionFromSubject(rec.subject),
  };
}

// ---------------------------------------------------------------------------
// Minimal frontmatter reader.
//
// Deliberately a small strict subset, not a YAML engine: scalars, scalar
// lists, lists of flat objects, and one level of nested map. Anything it
// cannot parse becomes a reported error rather than a guess, because a
// frontmatter parser that guesses is a continuity system that lies.
// ---------------------------------------------------------------------------

const indentOf = (line) => line.match(/^ */)[0].length;
const isSkippable = (line) => line.trim() === '' || line.trim().startsWith('#');

function scalar(raw) {
  const v = raw.trim();
  if (v.length > 1 && ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))) {
    return v.slice(1, -1);
  }
  return v;
}

const KEY_RE = /^([A-Za-z0-9_]+):\s?(.*)$/;

function parseMap(lines, i, indent, errors) {
  const out = {};
  while (i < lines.length) {
    const line = lines[i];
    if (isSkippable(line)) { i++; continue; }
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      errors.push(`unexpected indentation: "${line.trim()}"`);
      return [out, lines.length];
    }
    const t = line.slice(indent);
    if (t.startsWith('- ')) break;
    const m = KEY_RE.exec(t);
    if (!m) { errors.push(`unparseable line: "${line.trim()}"`); i++; continue; }
    const key = m[1];
    const rest = m[2];
    if (rest.trim() !== '') { out[key] = scalar(rest); i++; continue; }

    let j = i + 1;
    while (j < lines.length && isSkippable(lines[j])) j++;
    if (j >= lines.length || indentOf(lines[j]) <= indent) { out[key] = null; i++; continue; }
    const childIndent = indentOf(lines[j]);
    if (lines[j].slice(childIndent).startsWith('- ')) {
      const [list, ni] = parseList(lines, j, childIndent, errors);
      out[key] = list; i = ni;
    } else {
      const [map, ni] = parseMap(lines, j, childIndent, errors);
      out[key] = map; i = ni;
    }
  }
  return [out, i];
}

function parseList(lines, i, indent, errors) {
  const out = [];
  while (i < lines.length) {
    const line = lines[i];
    if (isSkippable(line)) { i++; continue; }
    const ind = indentOf(line);
    if (ind < indent) break;
    if (ind > indent) {
      errors.push(`unexpected indentation: "${line.trim()}"`);
      return [out, lines.length];
    }
    const t = line.slice(indent);
    if (!t.startsWith('- ')) break;
    const rest = t.slice(2);
    const m = KEY_RE.exec(rest);
    if (!m) { out.push(scalar(rest)); i++; continue; }

    const obj = { [m[1]]: m[2].trim() === '' ? null : scalar(m[2]) };
    i++;
    const itemIndent = indent + 2;
    while (i < lines.length) {
      const l2 = lines[i];
      if (l2.trim() === '') { i++; continue; }
      if (indentOf(l2) !== itemIndent) break;
      const t2 = l2.slice(itemIndent);
      if (t2.startsWith('- ')) break;
      const m2 = KEY_RE.exec(t2);
      if (!m2) { errors.push(`unparseable list-object line: "${l2.trim()}"`); i++; continue; }
      obj[m2[1]] = m2[2].trim() === '' ? null : scalar(m2[2]);
      i++;
    }
    out.push(obj);
  }
  return [out, i];
}

export function parseFrontmatter(text) {
  const errors = [];
  const lines = String(text).split(/\r?\n/);
  if (lines[0]?.trim() !== '---') {
    return { present: false, data: null, errors };
  }
  if (/\t/.test(text.slice(0, text.indexOf('\n---', 3) + 1))) {
    errors.push('frontmatter contains a tab character; use spaces');
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { end = i; break; }
  }
  if (end === -1) {
    errors.push('frontmatter opened with --- but never closed');
    return { present: true, data: null, errors };
  }
  const body = lines.slice(1, end);
  const [data] = parseMap(body, 0, 0, errors);
  return { present: true, data, errors, endLine: end };
}

// ---------------------------------------------------------------------------
// System Homes and Artifact Catalog
// ---------------------------------------------------------------------------

export const REQUIRED_HOME_KEYS = ['system_id', 'owns'];

export function loadSystemHome(repoRelPath, { root = REPO_ROOT } = {}) {
  const abs = path.join(root, repoRelPath);
  if (!existsSync(abs)) {
    return { path: repoRelPath, ok: false, errors: [`System Home file not found: ${repoRelPath}`] };
  }
  const text = readFileSync(abs, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm.present) {
    return { path: repoRelPath, ok: false, errors: [`no frontmatter block in ${repoRelPath}`] };
  }
  const errors = [...fm.errors];
  const d = fm.data || {};
  for (const k of REQUIRED_HOME_KEYS) {
    if (d[k] === undefined || d[k] === null) errors.push(`${repoRelPath}: missing required key "${k}"`);
  }
  if (d.owns && !Array.isArray(d.owns)) errors.push(`${repoRelPath}: "owns" must be a list`);
  if (d.watches && !Array.isArray(d.watches)) errors.push(`${repoRelPath}: "watches" must be a list`);
  if (d.traps && !Array.isArray(d.traps)) errors.push(`${repoRelPath}: "traps" must be a list`);
  if (d.open && !Array.isArray(d.open)) errors.push(`${repoRelPath}: "open" must be a list`);
  if (d.protected && !Array.isArray(d.protected)) errors.push(`${repoRelPath}: "protected" must be a list`);

  return {
    path: repoRelPath,
    ok: errors.length === 0,
    errors,
    system_id: d.system_id ?? null,
    owns: d.owns ?? [],
    watches: d.watches ?? [],
    protected: d.protected ?? [],
    open: d.open ?? [],
    production_proof: d.production_proof ?? null,
    traps: d.traps ?? [],
  };
}

export function loadCatalog(catalogPath, { root = REPO_ROOT } = {}) {
  const abs = path.isAbsolute(catalogPath) ? catalogPath : path.join(root, catalogPath);
  if (!existsSync(abs)) {
    return { ok: false, errors: [`Artifact Catalog not found: ${catalogPath}`], data: null };
  }
  let data;
  try {
    data = JSON.parse(readFileSync(abs, 'utf8'));
  } catch (err) {
    return { ok: false, errors: [`Artifact Catalog is not valid JSON: ${err.message}`], data: null };
  }
  return { ok: true, errors: [], data, path: catalogPath };
}

// Authority resolution. A catalog entry does not make its target
// authoritative; only an authority state does, and superseded/rejected
// artifacts can never resolve as current.
export const AUTHORITY_STATES = [
  'current',
  'superseded',
  'draft',
  'rejected',
  'for_review',
  'authorized',
  'final',
];

export const CURRENT_AUTHORITY_STATES = ['current', 'authorized', 'final'];
export const NON_AUTHORITY_STATES = ['superseded', 'rejected', 'draft', 'for_review'];

export function resolvesAsCurrentAuthority(artifact) {
  return CURRENT_AUTHORITY_STATES.includes(artifact?.authority_state);
}

// A README becomes a System Home by carrying frontmatter with a system_id.
// Nothing registers it anywhere else — the corpus is discovered, never
// hard-coded, and every count carries the scope that produced it.
export function discoverSystemHomes(git, { root = REPO_ROOT } = {}) {
  const corpus = deriveReadmeCorpus(git);
  if (corpus.state === COULD_NOT_VERIFY) {
    return { corpus, homes: [], errors: [], state: COULD_NOT_VERIFY };
  }
  const homes = [];
  const errors = [];
  for (const rel of corpus.files) {
    const abs = path.join(root, rel);
    if (!existsSync(abs)) continue;
    const head = readFileSync(abs, 'utf8').slice(0, 4096);
    if (!head.startsWith('---')) continue; // not a System Home; ordinary README
    const home = loadSystemHome(rel, { root });
    if (!home.system_id && home.errors.length === 0) continue;
    homes.push(home);
    errors.push(...home.errors);
  }
  return { corpus, homes, errors, state: 'DERIVED' };
}

export function todayStamp(d = new Date()) {
  return d.toISOString().slice(0, 10);
}
