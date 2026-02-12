'use strict';

/**
 * Baseline tolerance set: the absolute minimum starting point.
 *
 * Only includes tolerances that are inarguably correct — things that are
 * not FHIR content at all, or trace output that differs by design.
 * Everything else should be discovered and validated by triage agents.
 *
 * To start a new triage job from this baseline:
 *   ./prompts/start-triage.sh <job-name> [comparison.ndjson]
 *
 * See AGENTS.md for full documentation of tolerance object shape,
 * context object, kinds, and phase ordering.
 */

// ---- Helpers ----

function getParamValue(params, name) {
  if (!params?.parameter) return undefined;
  const p = params.parameter.find(p => p.name === name);
  if (!p) return undefined;
  for (const key of Object.keys(p)) {
    if (key.startsWith('value')) return p[key];
    if (key === 'resource') return p[key];
  }
  return undefined;
}

function stripParams(body, ...names) {
  if (!body?.parameter) return body;
  return {
    ...body,
    parameter: body.parameter.filter(p => !names.includes(p.name)),
  };
}

function isParameters(obj) {
  return obj?.resourceType === 'Parameters' || Array.isArray(obj?.parameter);
}

function both(ctx, fn) {
  return { prod: fn(ctx.prod), dev: fn(ctx.dev) };
}

function sortAt(obj, path, ...keys) {
  // Navigate to the array at `path` (e.g. ['expansion', 'contains']) and sort
  // it in place by `keys` (e.g. 'system', 'code'). Returns obj for chaining.
  // No-op if the path doesn't resolve to an array.
  let target = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (!target || typeof target !== 'object') return obj;
    target = target[path[i]];
  }
  const last = path[path.length - 1];
  if (!target || !Array.isArray(target[last])) return obj;
  target[last] = [...target[last]].sort((a, b) => {
    for (const k of keys) {
      const cmp = String(a?.[k] ?? '').localeCompare(String(b?.[k] ?? ''));
      if (cmp !== 0) return cmp;
    }
    return 0;
  });
  return obj;
}

// ---- Baseline tolerances ----

const tolerances = [

  // Skips: drop non-FHIR-terminology records
  {
    id: 'skip-metadata-ops',
    description: 'CapabilityStatement/metadata responses differ by design between implementations',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ record }) {
      return /\/metadata/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-root-page',
    description: 'Root page (/) differs by design between implementations',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ record }) {
      return /^\/r[345]\/$/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-static-assets',
    description: 'Static asset requests like icons differ by design',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ record }) {
      return /\.(png|ico|css|js)$/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-prod-xml',
    description: 'Prod returned XML — we only compare JSON responses',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ record }) {
      return record.prodBody && record.prodBody.trimStart().startsWith('<') ? 'skip' : null;
    },
  },

  {
    id: 'expand-too-costly-succeeds',
    description: 'Prod returns 422 with OperationOutcome code "too-costly" for $expand of large code systems (LOINC, BCP-13 MIME types), refusing to expand >10000 codes. Dev returns 200 with a ValueSet expansion (either paginated results or empty). Responses are fundamentally incomparable (error vs success).',
    kind: 'temp-tolerance',
    bugId: '44d1916',
    tags: ['skip', 'expand', 'too-costly', 'status-mismatch'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$expand')) return null;
      if (record.prod.status !== 422 || record.dev.status !== 200) return null;
      // Check prod is OperationOutcome with too-costly issue code
      if (prod?.resourceType !== 'OperationOutcome') return null;
      const hasToosCostly = prod.issue?.some(i => i.code === 'too-costly');
      if (!hasToosCostly) return null;
      return 'skip';
    },
  },
  // Normalizations
  {
    id: 'strip-diagnostics',
    description: 'Trace diagnostics parameter has completely different formats between implementations (by design).',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'diagnostics'));
    },
  },

  {
    id: 'sort-parameters-by-name',
    description: 'Parameters.parameter array ordering differs between implementations but has no semantic meaning in FHIR. Sorts by name, then by value as tiebreaker for duplicate-named parameters (e.g. multiple version params).',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function paramSortValue(p) {
        // Extract a stable string value for tiebreaking duplicate-named params
        for (const key of Object.keys(p)) {
          if (key.startsWith('value')) return String(p[key] ?? '');
        }
        return '';
      }
      function sortParams(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: [...body.parameter].sort((a, b) => {
            const nameCmp = (a.name || '').localeCompare(b.name || '');
            if (nameCmp !== 0) return nameCmp;
            return paramSortValue(a).localeCompare(paramSortValue(b));
          }),
        };
      }
      return both(ctx, sortParams);
    },
  },

  {
    id: 'strip-oo-message-id-extension',
    description: 'OperationOutcome issue extensions for operationoutcome-message-id are server-generated message identifiers. Both servers include them inconsistently — sometimes both have matching IDs, sometimes they differ, sometimes only one side has them. These are implementation-specific metadata with no terminology significance. Listed in Known Cosmetic Differences. Affects ~264 delta records where the extension presence or value differs.',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    tags: ['normalize', 'operationoutcome', 'message-id-extension'],
    match({ prod, dev }) {
      function hasMessageIdExt(body) {
        if (!isParameters(body)) return false;
        const issues = getParamValue(body, 'issues');
        if (!issues?.issue) return false;
        return issues.issue.some(iss =>
          iss.extension?.some(ext =>
            ext.url === 'http://hl7.org/fhir/StructureDefinition/operationoutcome-message-id'
          )
        );
      }
      if (hasMessageIdExt(prod) || hasMessageIdExt(dev)) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function stripMessageIdExt(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: p.resource.issue.map(iss => {
                  if (!iss.extension) return iss;
                  const filtered = iss.extension.filter(ext =>
                    ext.url !== 'http://hl7.org/fhir/StructureDefinition/operationoutcome-message-id'
                  );
                  const result = { ...iss };
                  if (filtered.length === 0) {
                    delete result.extension;
                  } else {
                    result.extension = filtered;
                  }
                  return result;
                }),
              },
            };
          }),
        };
      }
      return both(ctx, stripMessageIdExt);
    },
  },

  {
    id: 'oo-missing-location-field',
    description: 'Dev omits deprecated `location` field on OperationOutcome issues. The `location` field is deprecated in FHIR R4 and prod has been populating it incorrectly, so stopping altogether is correct (GG adjudicated: "won\'t fix. location is deprecated and I\'ve been populating it wrong"). Normalizes by stripping `location` from prod when dev lacks it. Handles both flat validate-code and nested batch-validate-code structures.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'operationoutcome', 'missing-location'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      // Check OO issues for location mismatch (works for any Parameters body)
      function checkIssues(prodIssues, devIssues) {
        if (!prodIssues?.issue || !devIssues?.issue) return false;
        for (let i = 0; i < prodIssues.issue.length; i++) {
          const pi = prodIssues.issue[i];
          const di = devIssues.issue[i];
          if (!di) continue;
          if (pi.location && !di.location &&
              JSON.stringify(pi.location) === JSON.stringify(pi.expression)) {
            return true;
          }
        }
        return false;
      }
      // Top-level issues (regular validate-code)
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (checkIssues(prodIssues, devIssues)) return 'normalize';
      // Nested issues inside validation resources (batch-validate-code)
      if (prod.parameter && dev.parameter) {
        for (let i = 0; i < prod.parameter.length; i++) {
          const pp = prod.parameter[i];
          const dp = dev.parameter[i];
          if (!dp) continue;
          if (pp.name === 'validation' && dp.name === 'validation' &&
              pp.resource?.resourceType === 'Parameters' &&
              dp.resource?.resourceType === 'Parameters') {
            const nestedProdIssues = getParamValue(pp.resource, 'issues');
            const nestedDevIssues = getParamValue(dp.resource, 'issues');
            if (checkIssues(nestedProdIssues, nestedDevIssues)) return 'normalize';
          }
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      function stripLocationFromIssues(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            // Strip location from direct issues parameter
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.map(iss => {
                    if (!iss.location) return iss;
                    if (JSON.stringify(iss.location) === JSON.stringify(iss.expression)) {
                      const { location, ...rest } = iss;
                      return rest;
                    }
                    return iss;
                  }),
                },
              };
            }
            // Recurse into nested validation Parameters (batch-validate-code)
            if (p.name === 'validation' && p.resource?.resourceType === 'Parameters') {
              return { ...p, resource: stripLocationFromIssues(p.resource) };
            }
            return p;
          }),
        };
      }
      return { prod: stripLocationFromIssues(prod), dev };
    },
  },

  {
    id: 'invalid-display-message-format',
    description: 'Wrong Display Name error messages differ in format. Dev is correct (GG adjudicated: "Won\'t fix — Dev is correct"). Dev de-duplicates display options and appends language tags.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:cf90495',
    adjudication: ['gg'],
    adjudicationText: 'Won\'t fix — Dev is correct',
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      const prodHas = prodIssues.issue.some(i =>
        i.details?.coding?.some(c => c.code === 'invalid-display'));
      const devHas = devIssues.issue.some(i =>
        i.details?.coding?.some(c => c.code === 'invalid-display'));
      if (!prodHas || !devHas) return null;
      // Only normalize if messages actually differ
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (prodMsg === devMsg) return null;
      return 'normalize';
    },
    normalize({ prod, dev, record }) {
      // Canonicalize message and issues text to prod's versions
      const prodMsg = getParamValue(prod, 'message');
      const prodIssues = getParamValue(prod, 'issues');

      function canonicalize(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message' && prodMsg !== undefined) {
              return { ...p, valueString: prodMsg };
            }
            if (p.name === 'issues' && prodIssues?.issue && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.map((iss, idx) => {
                    const prodIss = prodIssues.issue[idx];
                    if (!prodIss) return iss;
                    const hasCoding = iss.details?.coding?.some(c => c.code === 'invalid-display');
                    const prodHasCoding = prodIss.details?.coding?.some(c => c.code === 'invalid-display');
                    if (!hasCoding || !prodHasCoding) return iss;
                    return {
                      ...iss,
                      details: { ...iss.details, text: prodIss.details?.text },
                    };
                  }),
                },
              };
            }
            return p;
          }),
        };
      }

      return { prod, dev: canonicalize(dev) };
    },
  },

  {
    id: 'batch-invalid-display-message-format',
    description: 'Batch $validate-code: Wrong Display Name error messages differ in format. Dev is correct (GG adjudicated: "Won\'t fix — Dev is correct"). Same root cause as invalid-display-message-format.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:cf90495',
    adjudication: ['gg'],
    adjudicationText: 'Won\'t fix — Dev is correct',
    tags: ['normalize', 'message-format', 'batch-validate-code', 'invalid-display'],
    match({ record, prod, dev }) {
      if (!record.url.includes('batch-validate-code')) return null;
      if (!prod?.parameter || !dev?.parameter) return null;
      // Check if any nested validation has invalid-display message diffs
      for (let i = 0; i < prod.parameter.length; i++) {
        const pv = prod.parameter[i];
        const dv = dev.parameter[i];
        if (pv?.name !== 'validation' || dv?.name !== 'validation') continue;
        const pres = pv.resource;
        const dres = dv.resource;
        if (!pres?.parameter || !dres?.parameter) continue;
        const prodIssues = getParamValue(pres, 'issues');
        const devIssues = getParamValue(dres, 'issues');
        if (!prodIssues?.issue || !devIssues?.issue) continue;
        const prodHas = prodIssues.issue.some(iss =>
          iss.details?.coding?.some(c => c.code === 'invalid-display'));
        const devHas = devIssues.issue.some(iss =>
          iss.details?.coding?.some(c => c.code === 'invalid-display'));
        if (!prodHas || !devHas) continue;
        const prodMsg = getParamValue(pres, 'message');
        const devMsg = getParamValue(dres, 'message');
        if (prodMsg !== devMsg) return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev, record }) {
      if (!prod?.parameter || !dev?.parameter) return { prod, dev };
      const newDevParams = dev.parameter.map((dv, i) => {
        const pv = prod.parameter[i];
        if (!pv || pv.name !== 'validation' || dv.name !== 'validation') return dv;
        const pres = pv.resource;
        const dres = dv.resource;
        if (!pres?.parameter || !dres?.parameter) return dv;
        const prodIssues = getParamValue(pres, 'issues');
        const devIssues = getParamValue(dres, 'issues');
        if (!prodIssues?.issue || !devIssues?.issue) return dv;
        const prodHas = prodIssues.issue.some(iss =>
          iss.details?.coding?.some(c => c.code === 'invalid-display'));
        const devHas = devIssues.issue.some(iss =>
          iss.details?.coding?.some(c => c.code === 'invalid-display'));
        if (!prodHas || !devHas) return dv;
        const prodMsg = getParamValue(pres, 'message');
        const devMsg = getParamValue(dres, 'message');
        if (prodMsg === devMsg) return dv;
        // Canonicalize message and issues text to prod's versions
        const newDresParams = dres.parameter.map(dp => {
          if (dp.name === 'message' && prodMsg !== undefined) {
            return { ...dp, valueString: prodMsg };
          }
          if (dp.name === 'issues' && prodIssues?.issue && dp.resource?.issue) {
            return {
              ...dp,
              resource: {
                ...dp.resource,
                issue: dp.resource.issue.map((iss, idx) => {
                  const prodIss = prodIssues.issue[idx];
                  if (!prodIss) return iss;
                  const hasCoding = iss.details?.coding?.some(c => c.code === 'invalid-display');
                  const prodHasCoding = prodIss.details?.coding?.some(c => c.code === 'invalid-display');
                  if (!hasCoding || !prodHasCoding) return iss;
                  return {
                    ...iss,
                    details: { ...iss.details, text: prodIss.details?.text },
                  };
                }),
              },
            };
          }
          return dp;
        });
        return {
          ...dv,
          resource: { ...dres, parameter: newDresParams },
        };
      });
      return { prod, dev: { ...dev, parameter: newDevParams } };
    },
  },

  {
    id: 'bcp47-display-format',
    description: 'BCP-47 display text format differs between prod and dev. Which format to use is arbitrary (GG adjudicated: "won\'t fix; it\'s arbitrary anyway"). Normalizes display text differences for urn:ietf:bcp:47 validate-code records.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'display-text', 'bcp47'],
    match({ record, prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodSystem = getParamValue(prod, 'system');
      if (prodSystem !== 'urn:ietf:bcp:47') return null;
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (!prodDisplay && !devDisplay) return null;
      if (prodDisplay === devDisplay) return null;
      return 'normalize';
    },
    normalize({ prod, dev, record }) {
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      const canonical = prodDisplay || devDisplay;
      function setDisplay(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'display' ? { ...p, valueString: canonical } : p
          ),
        };
      }
      return { prod: setDisplay(prod), dev: setDisplay(dev) };
    },
  },

  {
    id: 'snomed-version-skew',
    description: 'SNOMED CT edition version skew: dev loads different (generally older) SNOMED CT editions than prod. By design — an old version was added to better support VSAC (GG adjudicated). Normalizes version and display parameters to prod values.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:da50d17',
    adjudication: ['gg'],
    adjudicationText: 'By design — added an old version to better support VSAC',
    tags: ['normalize', 'version-skew', 'snomed'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodSystem = getParamValue(prod, 'system');
      const prodVersion = getParamValue(prod, 'version');
      const devVersion = getParamValue(dev, 'version');
      if (!prodVersion || !devVersion) return null;
      if (!prodVersion.includes('snomed.info/sct') || !devVersion.includes('snomed.info/sct')) return null;
      // Match when system is SNOMED, OR when system is absent but version URIs identify SNOMED
      if (prodSystem && prodSystem !== 'http://snomed.info/sct') return null;
      if (prodVersion === devVersion) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodVersion = getParamValue(prod, 'version');
      const prodDisplay = getParamValue(prod, 'display');
      function setVersionAndDisplay(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'version') return { ...p, valueString: prodVersion };
            if (p.name === 'display' && prodDisplay !== undefined) return { ...p, valueString: prodDisplay };
            return p;
          }),
        };
      }
      return { prod: setVersionAndDisplay(prod), dev: setVersionAndDisplay(dev) };
    },
  },

  {
    id: 'snomed-same-version-display-differs',
    description: 'SNOMED $validate-code: dev returns different display text (preferred term) than prod for the same SNOMED CT edition version. Fixed in dev, but both sides have the same bug — each randomly picks from synonyms (GG adjudicated). Normalizes display to prod value.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:8f739e9',
    adjudication: ['gg'],
    adjudicationText: 'Fixed — but won\'t achieve consistency with prod, since prod has the same bug (random which it chooses)',
    tags: ['normalize', 'display-text', 'snomed'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodSystem = getParamValue(prod, 'system');
      if (prodSystem !== 'http://snomed.info/sct') return null;
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (!prodDisplay || !devDisplay) return null;
      if (prodDisplay === devDisplay) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodDisplay = getParamValue(prod, 'display');
      function setDisplay(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'display' ? { ...p, valueString: prodDisplay } : p
          ),
        };
      }
      return { prod: setDisplay(prod), dev: setDisplay(dev) };
    },
  },

  {
    id: 'validate-code-display-text-differs',
    description: 'validate-code: display text differs for LOINC, ISO 3166, UCUM, BCP-13 codes with same version. Both servers agree on result, system, code, version — only the display parameter differs. Same class of issue as snomed-same-version-display-differs but for non-SNOMED, non-BCP47 systems. Normalizes both sides to prod display value.',
    kind: 'temp-tolerance',
    bugId: 'b9034b0',
    tags: ['normalize', 'display-text', 'validate-code'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system');
      // Skip systems already handled by other tolerances
      if (system === 'http://snomed.info/sct') return null;
      if (system === 'urn:ietf:bcp:47') return null;
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (!prodDisplay || !devDisplay) return null;
      if (prodDisplay === devDisplay) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodDisplay = getParamValue(prod, 'display');
      function setDisplay(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'display' ? { ...p, valueString: prodDisplay } : p
          ),
        };
      }
      return { prod: setDisplay(prod), dev: setDisplay(dev) };
    },
  },

  {
    id: 'batch-validate-snomed-display-differs',
    description: 'Batch $validate-code: SNOMED display text differs even with same edition version. Same root cause as snomed-same-version-display-differs — fixed in dev, but both sides randomly pick from synonyms (GG adjudicated).',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:8f739e9',
    adjudication: ['gg'],
    adjudicationText: 'Fixed — but won\'t achieve consistency with prod, since prod has the same bug (random which it chooses)',
    tags: ['normalize', 'display-text', 'snomed', 'batch-validate-code'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$batch-validate-code')) return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodValidations = (prod.parameter || []).filter(p => p.name === 'validation');
      const devValidations = (dev.parameter || []).filter(p => p.name === 'validation');
      if (prodValidations.length !== devValidations.length) return null;
      for (let i = 0; i < prodValidations.length; i++) {
        const pRes = prodValidations[i].resource;
        const dRes = devValidations[i].resource;
        if (!pRes?.parameter || !dRes?.parameter) continue;
        const pSystem = getParamValue(pRes, 'system');
        if (pSystem !== 'http://snomed.info/sct') continue;
        const pVersion = getParamValue(pRes, 'version');
        const dVersion = getParamValue(dRes, 'version');
        if (!pVersion || pVersion !== dVersion) continue;
        const pDisplay = getParamValue(pRes, 'display');
        const dDisplay = getParamValue(dRes, 'display');
        if (pDisplay && dDisplay && pDisplay !== dDisplay) return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      if (!prod?.parameter || !dev?.parameter) return { prod, dev };
      const newDevParams = dev.parameter.map((dp, i) => {
        if (dp.name !== 'validation') return dp;
        const pp = prod.parameter[i];
        if (!pp || pp.name !== 'validation') return dp;
        const pRes = pp.resource;
        const dRes = dp.resource;
        if (!pRes?.parameter || !dRes?.parameter) return dp;
        const pSystem = getParamValue(pRes, 'system');
        if (pSystem !== 'http://snomed.info/sct') return dp;
        const pVersion = getParamValue(pRes, 'version');
        const dVersion = getParamValue(dRes, 'version');
        if (!pVersion || pVersion !== dVersion) return dp;
        const pDisplay = getParamValue(pRes, 'display');
        const dDisplay = getParamValue(dRes, 'display');
        if (!pDisplay || !dDisplay || pDisplay === dDisplay) return dp;
        return {
          ...dp,
          resource: {
            ...dRes,
            parameter: dRes.parameter.map(p =>
              p.name === 'display' ? { ...p, valueString: pDisplay } : p
            ),
          },
        };
      });
      return { prod, dev: { ...dev, parameter: newDevParams } };
    },
  },

  {
    id: 'inactive-display-message-extra-synonyms',
    description: 'SNOMED validate-code with INACTIVE_DISPLAY_FOUND: dev lists multiple synonyms/designations in "The correct display is one of" message, prod lists only the preferred term. Dev is correct (GG adjudicated). Both identify the same code as having an inactive display.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'message-text', 'snomed', 'display-comment'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      for (let i = 0; i < prodIssues.issue.length; i++) {
        const prodText = prodIssues.issue[i]?.details?.text || '';
        const devText = devIssues.issue[i]?.details?.text || '';
        if (prodText === devText) continue;
        const prodHasDisplayComment = prodIssues.issue[i]?.details?.coding?.some(c => c.code === 'display-comment');
        const devHasDisplayComment = devIssues.issue[i]?.details?.coding?.some(c => c.code === 'display-comment');
        if (!prodHasDisplayComment || !devHasDisplayComment) continue;
        const marker = 'The correct display is one of';
        if (prodText.includes(marker) && devText.includes(marker)) {
          const prodPrefix = prodText.split(marker)[0];
          const devPrefix = devText.split(marker)[0];
          if (prodPrefix === devPrefix) return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return { prod, dev };
      function canonicalize(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: p.resource.issue.map((iss, idx) => {
                  const prodIss = prodIssues.issue[idx];
                  if (!prodIss) return iss;
                  const prodText = prodIss.details?.text || '';
                  const devText = iss.details?.text || '';
                  if (prodText === devText) return iss;
                  const marker = 'The correct display is one of';
                  if (prodText.includes(marker) && devText.includes(marker)) {
                    const prodPrefix = prodText.split(marker)[0];
                    const devPrefix = devText.split(marker)[0];
                    if (prodPrefix === devPrefix) {
                      return {
                        ...iss,
                        details: { ...iss.details, text: prodText },
                      };
                    }
                  }
                  return iss;
                }),
              },
            };
          }),
        };
      }
      return { prod, dev: canonicalize(dev) };
    },
  },

  {
    id: 'v2-0360-lookup-version-skew',
    description: 'v2-0360 $lookup: dev has version 3.0.0, prod has 2.0.0. Dev is correct — newer version is expected (GG adjudicated: "Dev is correct"). Strips version, definition, designation params from both sides.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:d3b49ff',
    adjudication: ['gg'],
    adjudicationText: 'Dev is correct',
    match({ record }) {
      if (record.url.includes('$lookup') && record.url.includes('v2-0360')) {
        return 'normalize';
      }
      return null;
    },
    normalize(ctx) {
      function clean(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter
            .filter(p => !['version', 'definition', 'designation'].includes(p.name))
            .filter(p => !(p.name === 'property' && p.part?.some(pp => pp.name === 'code' && pp.valueCode === 'definition'))),
        };
      }
      return both(ctx, clean);
    },
  },

  {
    id: 'expand-metadata-identifier-timestamp',
    description: 'Expansion identifier (server-generated UUID) and timestamp differ between implementations. These are transient metadata with no terminology significance. Affects all $expand responses.',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    tags: ['normalize', 'expand', 'transient-metadata'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      if (prod.expansion.identifier !== dev.expansion.identifier ||
          prod.expansion.timestamp !== dev.expansion.timestamp) {
        return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      return {
        prod: {
          ...prod,
          expansion: { ...prod.expansion, identifier: undefined, timestamp: undefined },
        },
        dev: {
          ...dev,
          expansion: { ...dev.expansion, identifier: undefined, timestamp: undefined },
        },
      };
    },
  },

  {
    id: 'expand-meta-lastUpdated',
    description: 'meta.lastUpdated on the ValueSet resource wrapper in $expand responses reflects when each server last loaded the resource definition — server-instance metadata, not terminology content. The expansion contents are identical.',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    tags: ['normalize', 'expand', 'transient-metadata'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      const prodLU = prod?.meta?.lastUpdated;
      const devLU = dev?.meta?.lastUpdated;
      if (prodLU && devLU && prodLU !== devLU) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      const canonical = prod?.meta?.lastUpdated || dev?.meta?.lastUpdated;
      return {
        prod: { ...prod, meta: { ...prod.meta, lastUpdated: canonical } },
        dev: { ...dev, meta: { ...dev.meta, lastUpdated: canonical } },
      };
    },
  },

  {
    id: 'expand-extension-child-order',
    description: 'Extension child element ordering within ValueSet.expansion.extension differs between implementations. Prod orders sub-extensions as [uri, code], dev orders as [code, uri]. Extension child order has no semantic meaning in FHIR. Affects 15 $expand records with R5 backport expansion.property extensions.',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    tags: ['normalize', 'expand', 'extension-ordering'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion?.extension || !dev?.expansion?.extension) return null;
      // Check if any expansion-level extension has differently-ordered children
      for (let i = 0; i < prod.expansion.extension.length; i++) {
        const pe = prod.expansion.extension[i];
        const de = dev.expansion.extension[i];
        if (!pe?.extension || !de?.extension) continue;
        if (pe.extension.length !== de.extension.length) continue;
        const pUrls = pe.extension.map(e => e.url).join(',');
        const dUrls = de.extension.map(e => e.url).join(',');
        if (pUrls !== dUrls) {
          // Check same set of URLs, just different order
          const pSorted = [...pe.extension].map(e => e.url).sort().join(',');
          const dSorted = [...de.extension].map(e => e.url).sort().join(',');
          if (pSorted === dSorted) return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      function sortExtChildren(expansion) {
        if (!expansion?.extension) return expansion;
        return {
          ...expansion,
          extension: expansion.extension.map(ext => {
            if (!ext.extension) return ext;
            return {
              ...ext,
              extension: [...ext.extension].sort((a, b) =>
                (a.url || '').localeCompare(b.url || '')
              ),
            };
          }),
        };
      }
      return {
        prod: { ...prod, expansion: sortExtChildren(prod.expansion) },
        dev: { ...dev, expansion: sortExtChildren(dev.expansion) },
      };
    },
  },

  {
    id: 'expand-dev-includeDefinition-param',
    description: 'Dev $expand echoes includeDefinition=false in expansion.parameter. Won\'t fix — design decision (GG adjudicated). Normalizes by stripping includeDefinition from dev.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:d1b7d3b',
    adjudication: ['gg'],
    adjudicationText: 'Won\'t fix — design decision',
    tags: ['normalize', 'expand', 'extra-param'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!dev?.expansion?.parameter) return null;
      const hasIncDef = dev.expansion.parameter.some(p => p.name === 'includeDefinition');
      const prodHas = prod?.expansion?.parameter?.some(p => p.name === 'includeDefinition');
      if (hasIncDef && !prodHas) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      return {
        prod,
        dev: {
          ...dev,
          expansion: {
            ...dev.expansion,
            parameter: dev.expansion.parameter.filter(p => p.name !== 'includeDefinition'),
          },
        },
      };
    },
  },

  {
    id: 'expand-dev-missing-total',
    description: 'Dev $expand omits expansion.total when prod includes it. The total field tells clients how many concepts exist in a paged expansion — without it, clients cannot determine page count. Affects expansions across multiple code systems (ISO 3166-2, UCUM, BCP-47).',
    kind: 'temp-tolerance',
    bugId: '2ed80bd',
    tags: ['normalize', 'expand', 'missing-total'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      if (prod.expansion.total !== undefined && dev.expansion.total === undefined) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      const { total, ...restExpansion } = prod.expansion;
      return {
        prod: { ...prod, expansion: restExpansion },
        dev,
      };
    },
  },

  {
    id: 'expand-dev-extra-contact-metadata',
    description: 'Dev $expand includes ValueSet contact field (publisher contact info) that prod omits (GG adjudicated: "won\'t fix"). Normalizes by stripping contact from dev.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'expand', 'extra-metadata'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!dev?.expansion) return null;
      if (dev.contact && !prod.contact) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      if (dev.contact && !prod.contact) {
        const { contact, ...devRest } = dev;
        return { prod, dev: devRest };
      }
      return { prod, dev };
    },
  },

  {
    id: 'expand-display-text-differs',
    description: 'Expand display text differs between prod and dev for the same codes. Same root cause as SNOMED display text issue — fixed but both sides randomly pick from synonyms (GG adjudicated). Normalizes both sides to prod display value.',
    kind: 'equiv-autofix',
    bugId: 'round-1-bug-id:b9e3cfd',
    adjudication: ['gg'],
    adjudicationText: 'Same issue as SNOMED display text — fixed but both sides random',
    tags: ['normalize', 'expand', 'display-text'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion?.contains || !dev?.expansion?.contains) return null;
      const prodMap = new Map();
      for (const c of prod.expansion.contains) {
        prodMap.set(c.system + '|' + c.code, c.display);
      }
      for (const c of dev.expansion.contains) {
        const key = c.system + '|' + c.code;
        const prodDisplay = prodMap.get(key);
        if (prodDisplay !== undefined && prodDisplay !== c.display) return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      // Build canonical display map from prod
      const displayMap = new Map();
      for (const c of (prod.expansion?.contains || [])) {
        displayMap.set(c.system + '|' + c.code, c.display);
      }
      function setDisplays(body) {
        if (!body?.expansion?.contains) return body;
        return {
          ...body,
          expansion: {
            ...body.expansion,
            contains: body.expansion.contains.map(c => {
              const key = c.system + '|' + c.code;
              const canonical = displayMap.get(key);
              if (canonical !== undefined && c.display !== canonical) {
                return { ...c, display: canonical };
              }
              return c;
            }),
          },
        };
      }
      return both({ prod, dev }, setDisplays);
    },
  },

  {
    id: 'ndc-validate-code-extra-inactive-params',
    description: 'NDC $validate-code: dev returns extra inactive/version/message/issues params that prod omits. Dev is correct in returning these (GG adjudicated: "dev is right so far as I can tell"). Normalizes the extra params.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'ndc', 'validate-code', 'extra-params'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://hl7.org/fhir/sid/ndc') return null;
      // Only match when dev has ALL four extra params and prod lacks ALL of them
      const extras = ['inactive', 'version', 'message', 'issues'];
      const devHasAll = extras.every(n => getParamValue(dev, n) !== undefined);
      const prodLacksAll = extras.every(n => getParamValue(prod, n) === undefined);
      if (devHasAll && prodLacksAll) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Strip the extra dev-only params: inactive, version, message, issues
      // Only strip from dev when prod lacks them, to avoid hiding real diffs
      const prodParamNames = new Set((prod?.parameter || []).map(p => p.name));
      const extraNames = ['inactive', 'version', 'message', 'issues'].filter(n => !prodParamNames.has(n));
      return {
        prod,
        dev: stripParams(dev, ...extraNames),
      };
    },
  },

  {
    id: 'multi-coding-cc-system-code-version-disagree',
    description: 'POST CodeSystem/$validate-code with multi-coding CodeableConcept: prod and dev report different coding in system/code/version output params. Both agree result=true and return identical codeableConcept. Which coding to report is arbitrary (GG adjudicated: "not sure I care"). Normalizes to prod values.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'validate-code', 'multi-coding', 'system-code-disagree'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== true) return null;
      const prodSystem = getParamValue(prod, 'system');
      const devSystem = getParamValue(dev, 'system');
      if (!prodSystem || !devSystem || prodSystem === devSystem) return null;
      // Check that codeableConcept has multiple codings
      const cc = getParamValue(prod, 'codeableConcept') || getParamValue(dev, 'codeableConcept');
      if (!cc?.coding || cc.coding.length < 2) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodSystem = getParamValue(prod, 'system');
      const prodCode = getParamValue(prod, 'code');
      const prodVersion = getParamValue(prod, 'version');
      function canonicalize(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'system') return { ...p, valueUri: prodSystem };
            if (p.name === 'code') return { ...p, valueCode: prodCode };
            if (p.name === 'version') return { ...p, valueString: prodVersion };
            return p;
          }),
        };
      }
      return both({ prod, dev }, canonicalize);
    },
  },

  {
    id: 'cpt-validate-code-missing-info-issue',
    description: 'CPT $validate-code result=false: dev omits informational "Code X not found in CPT" issue that prod includes. The second message is useless so it was intentionally eliminated (GG adjudicated: "won\'t fix - second message is useless so I eliminated it"). Normalizes by stripping the extra informational issue from prod.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'validate-code', 'cpt', 'missing-info-issue'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://www.ama-assn.org/go/cpt') return null;
      const result = getParamValue(prod, 'result');
      if (result !== false) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      if (prodIssues.issue.length <= devIssues.issue.length) return null;
      // Check for extra informational "not found in CPT" issue in prod
      const hasExtraInfo = prodIssues.issue.some(iss =>
        iss.severity === 'information' &&
        iss.details?.text?.match(/^Code '.+' not found in CPT$/)
      );
      if (!hasExtraInfo) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      function stripExtraInfoIssue(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.filter(iss =>
                    !(iss.severity === 'information' &&
                      iss.details?.text?.match(/^Code '.+' not found in CPT$/))
                  ),
                },
              };
            }
            if (p.name === 'message' && p.valueString) {
              // Strip "Code 'X' not found in CPT; " prefix from message
              const stripped = p.valueString.replace(/^Code '[^']+' not found in CPT; /, '');
              if (stripped !== p.valueString) {
                return { ...p, valueString: stripped };
              }
            }
            return p;
          }),
        };
      }
      return { prod: stripExtraInfoIssue(prod), dev };
    },
  },

  {
    id: 'read-resource-text-div-diff',
    description: 'Resource read: prod omits text.div when text.status=generated, dev includes the generated narrative HTML. Dev is correct — div is required when text is present in FHIR R4 (GG adjudicated). Narrative is auto-generated, no terminology significance. Normalizes by stripping text.div from both sides.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'read', 'text-div', 'narrative'],
    match({ prod, dev }) {
      // Match resources where text.status exists on at least one side
      // and div presence differs
      function hasTextDivDiff(prodRes, devRes) {
        const pt = prodRes?.text;
        const dt = devRes?.text;
        if (!pt && !dt) return false;
        if (pt?.status === 'generated' || dt?.status === 'generated') {
          const pdiv = !!pt?.div;
          const ddiv = !!dt?.div;
          if (pdiv !== ddiv) return true;
        }
        return false;
      }

      // Check Bundle entries
      if (prod?.resourceType === 'Bundle' && dev?.resourceType === 'Bundle') {
        const prodEntries = prod.entry || [];
        const devEntries = dev.entry || [];
        for (let i = 0; i < Math.min(prodEntries.length, devEntries.length); i++) {
          if (hasTextDivDiff(prodEntries[i]?.resource, devEntries[i]?.resource)) return 'normalize';
        }
        return null;
      }

      // Check direct resource reads
      if (hasTextDivDiff(prod, dev)) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function stripDiv(resource) {
        if (!resource?.text?.div) return resource;
        const { div, ...textRest } = resource.text;
        return { ...resource, text: textRest };
      }

      function cleanBody(body) {
        if (!body) return body;
        if (body.resourceType === 'Bundle' && Array.isArray(body.entry)) {
          return {
            ...body,
            entry: body.entry.map(e => {
              if (!e.resource) return e;
              return { ...e, resource: stripDiv(e.resource) };
            }),
          };
        }
        return stripDiv(body);
      }

      return both(ctx, cleanBody);
    },
  },

  {
    id: 'oo-missing-location-post-version-skew',
    description: 'Catches OperationOutcome location field differences missed by oo-missing-location-field due to pipeline ordering. Same root cause: deprecated `location` field intentionally removed from dev (GG adjudicated: "won\'t fix. location is deprecated and I\'ve been populating it wrong"). Runs later in pipeline to catch records where version-skew normalization must align issue arrays first.',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    tags: ['normalize', 'operationoutcome', 'missing-location'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      for (let i = 0; i < prodIssues.issue.length; i++) {
        const pi = prodIssues.issue[i];
        const di = devIssues.issue[i];
        if (!di) continue;
        if (pi.location && !di.location &&
            JSON.stringify(pi.location) === JSON.stringify(pi.expression)) {
          return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      function stripLocation(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: p.resource.issue.map(iss => {
                  if (!iss.location) return iss;
                  if (JSON.stringify(iss.location) === JSON.stringify(iss.expression)) {
                    const { location, ...rest } = iss;
                    return rest;
                  }
                  return iss;
                }),
              },
            };
          }),
        };
      }
      return { prod: stripLocation(prod), dev };
    },
  },

  {
    id: 'dev-extra-display-lang-not-found-message',
    description: 'validate-code with displayLanguage: dev returns extra message/issues about "no valid display names found" when prod omits them. Both sides agree result=true. Dev is stricter about display language resolution due to not passing defLang to hasDisplay. Same root cause as display-lang-result-disagrees.',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'extra-message'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== true) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (prodMsg || !devMsg) return null;
      if (!/no valid display names found/i.test(devMsg)) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Strip dev's extra message and issues params since prod has none
      return {
        prod,
        dev: stripParams(dev, 'message', 'issues'),
      };
    },
  },

  {
    id: 'display-lang-result-disagrees',
    description: 'validate-code with displayLanguage: dev returns result=false with "Wrong Display Name" error when no language-specific displays exist, prod returns result=true. Dev is stricter because it does not pass defLang to hasDisplay, causing it to reject displays that prod accepts via default language fallback.',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'result-disagrees'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== false) return null;
      const devMsg = getParamValue(dev, 'message');
      if (!devMsg) return null;
      if (!/Wrong Display Name/.test(devMsg) && !/no valid display names found/i.test(devMsg)) return null;
      if (!/no valid display names found/i.test(devMsg)) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Normalize dev's result to match prod (true), and strip dev's extra error message/issues
      return {
        prod,
        dev: stripParams({
          ...dev,
          parameter: dev.parameter.map(p =>
            p.name === 'result' ? { ...p, valueBoolean: true } : p
          ),
        }, 'message', 'issues'),
      };
    },
  },

  {
    id: 'expand-unclosed-extension-and-total',
    description: 'Dev $expand omits valueset-unclosed extension that prod includes on incomplete/unclosed expansions (e.g. SNOMED is-a filter). When the expansion is unclosed, dev also sometimes includes expansion.total while prod omits it. Root cause: SNOMED provider does not override filtersNotClosed() so dev never marks these expansions as unclosed.',
    kind: 'temp-tolerance',
    bugId: 'f2b2cef',
    tags: ['normalize', 'expand', 'unclosed-extension', 'total'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      // Check if prod has valueset-unclosed extension but dev doesn't
      const prodHasUnclosed = prod.expansion.extension?.some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );
      const devHasUnclosed = dev.expansion.extension?.some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );
      if (prodHasUnclosed && !devHasUnclosed) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Strip valueset-unclosed extension from prod
      let prodExp = { ...prod.expansion };
      if (prodExp.extension) {
        const filtered = prodExp.extension.filter(
          e => e.url !== 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
        );
        if (filtered.length === 0) {
          delete prodExp.extension;
        } else {
          prodExp.extension = filtered;
        }
      }
      // Strip total from dev when prod doesn't have it (unclosed expansions don't report total)
      let devExp = { ...dev.expansion };
      if (devExp.total !== undefined && prod.expansion.total === undefined) {
        delete devExp.total;
      }
      return {
        prod: { ...prod, expansion: prodExp },
        dev: { ...dev, expansion: devExp },
      };
    },
  },

  {
    id: 'expand-missing-limited-expansion',
    description: 'Dev $expand omits limitedExpansion parameter from expansion.parameter when the expansion is truncated. Prod includes limitedExpansion: true to signal that the expansion was incomplete (triggered by _incomplete=true in the request). Without this parameter, clients cannot tell if the expansion was truncated. Affects 24 records across LOINC, SNOMED, and other large code system expansions.',
    kind: 'temp-tolerance',
    bugId: '3071698',
    tags: ['normalize', 'expand', 'limitedExpansion'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion?.parameter || !dev?.expansion) return null;
      const prodHasLimited = prod.expansion.parameter.some(
        p => p.name === 'limitedExpansion' && p.valueBoolean === true
      );
      const devHasLimited = (dev.expansion.parameter || []).some(
        p => p.name === 'limitedExpansion' && p.valueBoolean === true
      );
      if (prodHasLimited && !devHasLimited) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      return {
        prod: {
          ...prod,
          expansion: {
            ...prod.expansion,
            parameter: prod.expansion.parameter.filter(p => p.name !== 'limitedExpansion'),
          },
        },
        dev,
      };
    },
  },

  {
    id: 'expand-contains-sort-order',
    description: 'Expansion.contains code ordering differs between prod and dev. Both return the same set of codes but in different order. Code ordering in ValueSet expansion has no semantic meaning in FHIR — the expansion is a set, not a sequence. Sorts contains by system+code to normalize. Applies to all $expand operations with identical code membership but different ordering.',
    kind: 'equiv-autofix',
    adjudication: ['jm'],
    tags: ['normalize', 'expand', 'ordering'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (!prod?.expansion?.contains || !dev?.expansion?.contains) return null;
      if (prod.expansion.contains.length !== dev.expansion.contains.length) return null;

      // Check same code membership
      const prodCodes = new Set(prod.expansion.contains.map(c => (c.system || '') + '|' + (c.code || '')));
      const devCodes = new Set(dev.expansion.contains.map(c => (c.system || '') + '|' + (c.code || '')));
      if (prodCodes.size !== devCodes.size) return null;
      for (const k of prodCodes) { if (!devCodes.has(k)) return null; }

      // Check if ordering actually differs
      for (let i = 0; i < prod.expansion.contains.length; i++) {
        const pc = prod.expansion.contains[i];
        const dc = dev.expansion.contains[i];
        if ((pc.system || '') + '|' + (pc.code || '') !== (dc.system || '') + '|' + (dc.code || '')) {
          return 'normalize';
        }
      }
      return null;
    },
    normalize(ctx) {
      return both(ctx, body => sortAt(body, ['expansion', 'contains'], 'system', 'code'));
    },
  },

  {
    id: 'validate-code-xcaused-unknown-system-disagree',
    description: 'validate-code with result=false on both sides: prod and dev disagree on which system/version is unknown (x-caused-by-unknown-system differs). Caused by version skew or content differences — each server fails on a different coding. This also causes downstream diffs in code/display/system/version/message/issues params. Filed under b6d19d8 (dev omits params for known codings when unknown system present).',
    kind: 'temp-tolerance',
    bugId: 'b6d19d8',
    tags: ['normalize', 'validate-code', 'x-caused-by-unknown-system', 'version-skew'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      // Collect all x-caused-by-unknown-system values from each side
      const prodXCaused = (prod.parameter || []).filter(p => p.name === 'x-caused-by-unknown-system').map(p => p.valueCanonical);
      const devXCaused = (dev.parameter || []).filter(p => p.name === 'x-caused-by-unknown-system').map(p => p.valueCanonical);
      // At least one side must have it, and they must differ (values or count)
      if (prodXCaused.length === 0 && devXCaused.length === 0) return null;
      if (JSON.stringify(prodXCaused.sort()) === JSON.stringify(devXCaused.sort())) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Normalize all params that follow from the disagreement to prod's values
      // Some params (x-caused-by-unknown-system) can appear multiple times
      const paramsToCanon = new Set(['code', 'display', 'system', 'version', 'message', 'issues', 'x-caused-by-unknown-system', 'x-unknown-system']);
      // Collect all prod params to canonicalize (preserving duplicates)
      const prodCanonParams = (prod.parameter || []).filter(p => paramsToCanon.has(p.name));
      // Build new dev params: keep non-canon params, drop all canon params
      let newDevParams = (dev.parameter || []).filter(p => !paramsToCanon.has(p.name));
      // Add all prod canon params
      newDevParams.push(...prodCanonParams);
      // Re-sort by name to stay consistent with sort-parameters-by-name
      newDevParams.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      return {
        prod,
        dev: { ...dev, parameter: newDevParams },
      };
    },
  },

  {
    id: 'validate-code-no-valueset-codeableconcept',
    description: 'POST /r4/ValueSet/$validate-code with only codeableConcept (no url/context/valueSet): prod returns 200 and validates against the CodeSystem, dev returns 400 "No ValueSet specified". Dev is stricter per spec (url/context/valueSet required at type level), but prod handles it gracefully.',
    kind: 'temp-tolerance',
    bugId: 'd45bc62',
    tags: ['skip', 'validate-code', 'status-mismatch', 'no-valueset'],
    match({ record, prod, dev }) {
      if (record.method !== 'POST') return null;
      if (!record.url.includes('ValueSet/$validate-code')) return null;
      if (record.prod.status !== 200 || record.dev.status !== 400) return null;
      if (dev?.resourceType !== 'OperationOutcome') return null;
      const hasNoVsMsg = dev.issue?.some(i =>
        (i.details?.text || '').includes('No ValueSet specified')
      );
      if (!hasNoVsMsg) return null;
      return 'skip';
    },
  },

  {
    id: 'version-not-found-skew',
    description: 'validate-code with result=false on both sides: issues about "could not be found, so the code cannot be validated" differ due to version skew — different Valid versions lists, or dev reports extra not-found issues for code system versions that prod has loaded. Both servers agree result=false; differences are only in explanatory details about which editions are available.',
    kind: 'temp-tolerance',
    bugId: 'f9e35f6',
    tags: ['normalize', 'validate-code', 'version-skew', 'not-found-issues'],
    match({ record, prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      const marker = 'could not be found, so the code cannot be validated';
      const hasMarker = [...prodIssues.issue, ...devIssues.issue].some(
        i => (i.details?.text || '').includes(marker)
      );
      if (!hasMarker) return null;
      // Only match if issues or message actually differ
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (JSON.stringify(prodIssues) === JSON.stringify(devIssues) && prodMsg === devMsg) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const marker = 'could not be found, so the code cannot be validated';
      function stripVersionNotFound(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message') {
              // Strip message param entirely — it follows from issues
              return null;
            }
            if (p.name === 'issues' && p.resource?.issue) {
              const filtered = p.resource.issue.filter(
                i => !(i.details?.text || '').includes(marker)
              );
              if (filtered.length === 0) return null;
              return {
                ...p,
                resource: { ...p.resource, issue: filtered },
              };
            }
            return p;
          }).filter(Boolean),
        };
      }
      return both({ prod, dev }, stripVersionNotFound);
    },
  },

  {
    id: 'validate-code-missing-extra-version-params',
    description: 'validate-code: dev omits version parameters for secondary codings in multi-coding CodeableConcept responses. Prod returns version strings for all code systems involved in validation, dev returns fewer. Normalizes by adding missing version values from prod to dev.',
    kind: 'temp-tolerance',
    bugId: '7b694ba',
    tags: ['normalize', 'validate-code', 'version-params', 'multi-coding'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodVersions = (prod.parameter || []).filter(p => p.name === 'version');
      const devVersions = (dev.parameter || []).filter(p => p.name === 'version');
      if (prodVersions.length <= devVersions.length) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodVersionVals = (prod.parameter || [])
        .filter(p => p.name === 'version')
        .map(p => p.valueString);
      const devVersionVals = (dev.parameter || [])
        .filter(p => p.name === 'version')
        .map(p => p.valueString);
      // Find versions in prod that dev is missing
      const devSet = new Set(devVersionVals);
      const missing = prodVersionVals.filter(v => !devSet.has(v));
      if (missing.length === 0) return { prod, dev };
      // Add missing version params to dev
      const newDevParams = [
        ...(dev.parameter || []).filter(p => p.name !== 'version'),
        ...missing.map(v => ({ name: 'version', valueString: v })),
        ...(dev.parameter || []).filter(p => p.name === 'version'),
      ];
      // Sort: first by name, then for same-name params sort by value for stable ordering
      newDevParams.sort((a, b) => {
        const nameCmp = (a.name || '').localeCompare(b.name || '');
        if (nameCmp !== 0) return nameCmp;
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });
      // Apply same stable sort to prod for consistency
      const newProdParams = [...(prod.parameter || [])].sort((a, b) => {
        const nameCmp = (a.name || '').localeCompare(b.name || '');
        if (nameCmp !== 0) return nameCmp;
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });
      return {
        prod: { ...prod, parameter: newProdParams },
        dev: { ...dev, parameter: newDevParams },
      };
    },
  },

];

module.exports = { tolerances, getParamValue };
