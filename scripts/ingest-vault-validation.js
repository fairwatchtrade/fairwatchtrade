/**
 * Governed ingest validation for `fwt_admission` reference metadata.
 *
 * Hand-authored admission policy must never fail silently: a typo in a
 * policy value would otherwise ingest cleanly and then read as NOT ADMITTED
 * at runtime — the fail-closed parser doing exactly its job while the
 * author believes the reference is live. So malformation is caught HERE,
 * loudly, before any production write, naming the reference and the field.
 *
 * The runtime authority on meaning stays lib/admission/tudorReference.ts
 * (parseTudorAdmission). This validator must agree with it — the test suite
 * pins the two together on shared fixtures, so they cannot drift apart
 * unnoticed. CommonJS on purpose: the ingest script is CommonJS and this
 * helper must load with zero dependencies and zero environment.
 */

const ALLOWED_POLICIES = ["original_required", "enhanced_evidence_allowed"];

function isRecord(v) {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** One declared fwt_admission block → { ok: true } | { ok: false, field, reason }. */
function validateFwtAdmission(adm) {
  if (!isRecord(adm)) {
    return { ok: false, field: "fwt_admission", reason: "must be an object" };
  }
  if (adm.status !== "admitted") {
    return {
      ok: false,
      field: "fwt_admission.status",
      reason: `must be exactly "admitted" (got ${JSON.stringify(adm.status)})`,
    };
  }
  if (!ALLOWED_POLICIES.includes(adm.documentation_policy)) {
    return {
      ok: false,
      field: "fwt_admission.documentation_policy",
      reason: `must be one of ${ALLOWED_POLICIES.join(" | ")} (got ${JSON.stringify(adm.documentation_policy)})`,
    };
  }
  if (adm.documentation_policy === "enhanced_evidence_allowed") {
    const ie = adm.identity_evidence;
    if (!isRecord(ie) || !Array.isArray(ie.required_identifiers) || ie.required_identifiers.length === 0) {
      return {
        ok: false,
        field: "fwt_admission.identity_evidence.required_identifiers",
        reason: "enhanced_evidence_allowed requires at least one identifier requirement",
      };
    }
    for (let i = 0; i < ie.required_identifiers.length; i++) {
      const r = ie.required_identifiers[i];
      const at = `fwt_admission.identity_evidence.required_identifiers[${i}]`;
      if (!isRecord(r)) return { ok: false, field: at, reason: "must be an object" };
      if (typeof r.key !== "string" || !r.key.trim())
        return { ok: false, field: `${at}.key`, reason: "must be a non-empty string" };
      if (typeof r.label !== "string" || !r.label.trim())
        return { ok: false, field: `${at}.label`, reason: "must be a non-empty string" };
      if (typeof r.photo_required !== "boolean")
        return { ok: false, field: `${at}.photo_required`, reason: "must be a boolean" };
    }
  }
  return { ok: true };
}

/**
 * Deep-scan a parsed brand JSON for every object declaring `fwt_admission`
 * and validate each. Format-agnostic on purpose — the vault files carry two
 * generations of shape and will grow more; a scan keyed on the declaration
 * itself cannot be defeated by a future nesting change.
 *
 * Returns [{ reference, field, reason }] — empty means clean.
 */
function collectFwtAdmissionErrors(node, errors = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectFwtAdmissionErrors(item, errors);
    return errors;
  }
  if (!isRecord(node)) return errors;
  if ("fwt_admission" in node) {
    const verdict = validateFwtAdmission(node.fwt_admission);
    if (!verdict.ok) {
      errors.push({
        reference: typeof node.reference === "string" ? node.reference : "(unknown reference)",
        field: verdict.field,
        reason: verdict.reason,
      });
    }
  }
  for (const key of Object.keys(node)) {
    if (key === "fwt_admission") continue;
    collectFwtAdmissionErrors(node[key], errors);
  }
  return errors;
}

module.exports = { validateFwtAdmission, collectFwtAdmissionErrors };
