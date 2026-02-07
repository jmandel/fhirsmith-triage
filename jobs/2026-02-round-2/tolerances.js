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

// ---- Baseline tolerances ----

const tolerances = [

  // Skips: drop non-FHIR-terminology records
  {
    id: 'skip-metadata-ops',
    description: 'CapabilityStatement/metadata responses differ by design between implementations',
    kind: 'equiv-autofix',
    match({ record }) {
      return /\/metadata/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-root-page',
    description: 'Root page (/) differs by design between implementations',
    kind: 'equiv-autofix',
    match({ record }) {
      return /^\/r[345]\/$/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-static-assets',
    description: 'Static asset requests like icons differ by design',
    kind: 'equiv-autofix',
    match({ record }) {
      return /\.(png|ico|css|js)$/.test(record.url) ? 'skip' : null;
    },
  },
  {
    id: 'skip-prod-xml',
    description: 'Prod returned XML — we only compare JSON responses',
    kind: 'equiv-autofix',
    match({ record }) {
      return record.prodBody && record.prodBody.trimStart().startsWith('<') ? 'skip' : null;
    },
  },
  {
    id: 'skip-truncated-body',
    description: 'Response body truncated at 50KB during data collection, producing invalid JSON that cannot be parsed. Comparison is impossible. Affects 277 records (ValueSet/CodeSystem searches, large $expand responses).',
    kind: 'equiv-autofix',
    tags: ['skip', 'data-collection-artifact'],
    match({ record }) {
      const prodLen = (record.prodBody || '').length;
      const devLen = (record.devBody || '').length;
      if (prodLen >= 50000 || devLen >= 50000) {
        // Verify at least one body fails to parse as JSON
        try { if (prodLen >= 50000) JSON.parse(record.prodBody); } catch { return 'skip'; }
        try { if (devLen >= 50000) JSON.parse(record.devBody); } catch { return 'skip'; }
      }
      return null;
    },
  },

  // Normalizations
  {
    id: 'strip-diagnostics',
    description: 'Trace diagnostics parameter has completely different formats between implementations (by design).',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'diagnostics'));
    },
  },

  {
    id: 'sort-parameters-by-name',
    description: 'Parameters.parameter array ordering differs between implementations but has no semantic meaning in FHIR.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => {
        if (!body?.parameter || !Array.isArray(body.parameter)) return body;
        return {
          ...body,
          parameter: [...body.parameter].sort((a, b) =>
            (a.name || '').localeCompare(b.name || '')
          ),
        };
      });
    },
  },

  {
    id: 'strip-oo-message-id-extension',
    description: 'OperationOutcome issue extensions for operationoutcome-message-id are server-generated message identifiers. Both servers include them inconsistently — sometimes both have matching IDs, sometimes they differ, sometimes only one side has them. These are implementation-specific metadata with no terminology significance. Listed in Known Cosmetic Differences. Affects ~264 delta records where the extension presence or value differs.',
    kind: 'equiv-autofix',
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
    description: 'Dev omits deprecated `location` field on OperationOutcome issues that prod includes. In FHIR R4, `location` is deprecated in favor of `expression`, but prod still populates both. In all observed cases, `location` exactly equals `expression`. Normalizes by stripping `location` from prod when dev lacks it. Handles both flat validate-code and nested batch-validate-code structures. Affects ~3069 records.',
    kind: 'temp-tolerance',
    bugId: 'a9cf20c',
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
    id: 'dev-null-expression-location',
    description: 'Dev returns expression:[null] and location:[null] on OperationOutcome issues that have no specific location. Prod correctly omits these fields. Null values in arrays are invalid FHIR. Same root cause as empty-string variant (bug e9c7e58). Affects 5 records total (2 in deltas).',
    kind: 'temp-tolerance',
    bugId: 'e9c7e58',
    tags: ['normalize', 'operationoutcome', 'invalid-fhir'],
    match({ dev }) {
      if (!isParameters(dev)) return null;
      const issues = getParamValue(dev, 'issues');
      if (!issues?.issue) return null;
      for (const iss of issues.issue) {
        if ((iss.expression && iss.expression.includes(null)) ||
            (iss.location && iss.location.includes(null))) {
          return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      function removeNullArrays(body) {
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
                  const result = { ...iss };
                  if (result.expression && result.expression.length === 1 && result.expression[0] === null) {
                    delete result.expression;
                  }
                  if (result.location && result.location.length === 1 && result.location[0] === null) {
                    delete result.location;
                  }
                  return result;
                }),
              },
            };
          }),
        };
      }
      return { prod, dev: removeNullArrays(dev) };
    },
  },

  {
    id: 'dev-empty-string-expression-location',
    description: 'Dev returns expression:[""] and location:[""] on OperationOutcome issues that have no specific location (e.g. TX_GENERAL_CC_ERROR_MESSAGE, MSG_DRAFT, MSG_DEPRECATED). Prod correctly omits these fields. Empty strings are invalid FHIR. Affects 318 validate-code records.',
    kind: 'temp-tolerance',
    bugId: 'e9c7e58',
    match({ dev }) {
      if (!isParameters(dev)) return null;
      const issues = getParamValue(dev, 'issues');
      if (!issues?.issue) return null;
      for (const iss of issues.issue) {
        if ((iss.expression && iss.expression.includes('')) ||
            (iss.location && iss.location.includes(''))) {
          return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev, record }) {
      function removeEmptyStrArrays(body) {
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
                  const result = { ...iss };
                  if (result.expression && result.expression.length === 1 && result.expression[0] === '') {
                    delete result.expression;
                  }
                  if (result.location && result.location.length === 1 && result.location[0] === '') {
                    delete result.location;
                  }
                  return result;
                }),
              },
            };
          }),
        };
      }
      return { prod: prod, dev: removeEmptyStrArrays(dev) };
    },
  },

  {
    id: 'invalid-display-message-format',
    description: 'Wrong Display Name error messages differ in format: prod may list duplicate display options (e.g. "6 choices"), dev de-duplicates and appends language tags like "(en)". Core validation result agrees. Affects ~44 validate-code records with invalid-display issues.',
    kind: 'temp-tolerance',
    bugId: 'cf90495',
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
    description: 'Same as invalid-display-message-format but for $batch-validate-code responses, where each validation is a nested Parameters resource. Dev appends language tags like "(en)" to invalid-display messages inside each validation. Affects 12 batch-validate-code records.',
    kind: 'temp-tolerance',
    bugId: 'cf90495',
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
    description: 'BCP-47 display text format differs: prod returns "English (United States)", dev returns "English (Region=United States)". Dev uses explicit subtag labels ("Region=") which is non-standard. Affects 7 validate-code records for urn:ietf:bcp:47.',
    kind: 'temp-tolerance',
    bugId: 'e09cff6',
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
    id: 'ucum-display-code-as-display',
    description: 'UCUM $validate-code: dev returns human-readable display (e.g. "(inch)") instead of code-as-display (e.g. "[in_i]"). Per FHIR UCUM guidance, the code itself IS the display. Normalizes both sides to prod display (the code). Affects 220 validate-code records for http://unitsofmeasure.org.',
    kind: 'temp-tolerance',
    bugId: '17ad254',
    tags: ['normalize', 'display-text', 'ucum'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodSystem = getParamValue(prod, 'system');
      if (prodSystem !== 'http://unitsofmeasure.org') return null;
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
    id: 'expand-422-vs-404-codesystem-not-found',
    description: 'Dev returns 404 instead of 422 for $expand when a referenced CodeSystem is not found. Both servers return identical OperationOutcome with issue code "not-found" and message "could not be found, so the value set cannot be expanded". Affects 296 POST /r4/ValueSet/$expand records.',
    kind: 'temp-tolerance',
    bugId: '1c145d2',
    tags: ['skip', 'status-mismatch', 'expand'],
    match({ record }) {
      if (record.url !== '/r4/ValueSet/$expand') return null;
      if (record.prod?.status !== 422 || record.dev?.status !== 404) return null;
      return 'skip';
    },
  },

  {
    id: 'missing-dicom-cid29-valueset',
    description: 'DICOM CID 29 AcquisitionModality ValueSet is not loaded in dev. Prod returns the full ValueSet (51 codes) for both direct reads (/r4/ValueSet/dicom-cid-29-AcquisitionModality) and URL searches (?url=...sect_CID_29.html). Dev returns 404 or empty Bundle. Affects 10 records (5 P3, 5 P6).',
    kind: 'temp-tolerance',
    bugId: '51f23f5',
    tags: ['skip', 'missing-resource', 'dicom'],
    match({ record }) {
      if (record.url.includes('dicom-cid-29') || record.url.includes('sect_CID_29')) {
        return 'skip';
      }
      return null;
    },
  },

  {
    id: 'searchset-bundle-wrapper',
    description: 'Searchset Bundle wrapper differences: dev includes empty entry:[] arrays (invalid FHIR), extra first/last pagination links, absolute URLs with _offset param, and search.mode on entries. Prod includes server-generated id/meta. Normalizes both sides by stripping id, meta, links, entry-level search elements, and removing empty entry arrays. Affects ~498 records (ValueSet and CodeSystem searches). Does NOT hide entry content differences for non-empty results.',
    kind: 'temp-tolerance',
    bugId: '4233647',
    tags: ['normalize', 'searchset', 'bundle-wrapper'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'Bundle' || prod?.type !== 'searchset') return null;
      if (dev?.resourceType !== 'Bundle' || dev?.type !== 'searchset') return null;
      return 'normalize';
    },
    normalize(ctx) {
      function cleanBundle(body) {
        if (!body || body.resourceType !== 'Bundle') return body;
        const result = { ...body };
        // Strip server-generated transient metadata
        delete result.id;
        delete result.meta;
        // Remove empty entry arrays (invalid FHIR)
        if (Array.isArray(result.entry) && result.entry.length === 0) {
          delete result.entry;
        }
        // Strip search element from entries — dev adds search.mode:"match"
        // on searchset entries, prod omits it. Both are valid FHIR (optional).
        if (Array.isArray(result.entry)) {
          result.entry = result.entry.map(e => {
            if (!e.search) return e;
            const { search, ...rest } = e;
            return rest;
          });
        }
        // Strip all links — self/first/last links echo back the search URL
        // in different formats (relative vs absolute, encoded vs decoded,
        // with/without _offset/_format params). No semantic content.
        delete result.link;
        return result;
      }
      return both(ctx, cleanBundle);
    },
  },

  {
    id: 'searchset-duplicate-entries',
    description: 'Prod returns multiple entries (duplicates or different versions) for the same resource in searchset Bundle results, while dev returns one. Normalizes by keeping only the first entry from prod and setting total to match. Affects 3 records (ValueSet and CodeSystem searches where prod has multiple copies loaded).',
    kind: 'temp-tolerance',
    bugId: '91e49e8',
    tags: ['normalize', 'searchset', 'duplicate-entries'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'Bundle' || prod?.type !== 'searchset') return null;
      if (dev?.resourceType !== 'Bundle' || dev?.type !== 'searchset') return null;
      const prodEntries = prod.entry || [];
      const devEntries = dev.entry || [];
      if (prodEntries.length > 1 && devEntries.length === 1) return 'normalize';
      return null;
    },
    normalize(ctx) {
      const dev = ctx.dev;
      const prod = { ...ctx.prod };
      // Keep only the first entry from prod to match dev's single entry
      if (prod.entry && prod.entry.length > 1) {
        prod.entry = [prod.entry[0]];
      }
      // Normalize totals to match
      if (prod.total !== dev.total) {
        const canonical = Math.min(prod.total || 0, dev.total || 0);
        prod.total = canonical;
        dev.total = canonical;
      }
      return { prod, dev: { ...dev } };
    },
  },

  {
    id: 'snomed-version-skew',
    description: 'SNOMED CT edition version skew: dev loads different (generally older) SNOMED CT editions than prod across multiple modules (International 20240201 vs 20250201, US 20230301 vs 20250901, etc.). Normalizes version and display parameters to prod values. Display text changes between editions as preferred terms are updated (e.g. "Rehabilitation - specialty" → "Rehabilitation specialty"). Also matches ValueSet $validate-code with result=false where system param is absent but version URIs identify SNOMED. Affects ~292 validate-code records for http://snomed.info/sct.',
    kind: 'temp-tolerance',
    bugId: 'da50d17',
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
    description: 'SNOMED $validate-code: dev returns different display text (preferred term) than prod for the same SNOMED CT edition version. Examples: prod="Hearing loss" vs dev="Deafness", prod="Counselling" vs dev="Counseling (regime/therapy)". Both agree on result, system, code, and version. Normalizes display to prod value. Affects 59 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '8f739e9',
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
    id: 'batch-validate-snomed-display-differs',
    description: 'Batch $validate-code: SNOMED display text differs inside nested validation resources even when both sides use the same SNOMED CT edition version. Same root cause as snomed-same-version-display-differs (bug 8f739e9) — the existing tolerance only handles top-level Parameters, not the batch wrapper. Normalizes each validation resource display to prod value. Affects batch-validate-code records with SNOMED codes.',
    kind: 'temp-tolerance',
    bugId: '8f739e9',
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
    description: 'SNOMED validate-code with INACTIVE_DISPLAY_FOUND: dev lists multiple synonyms/designations in "The correct display is one of" message, prod lists only the preferred term. Both identify the same code as having an inactive display. Affects 3 validate-code records for display-comment issues.',
    kind: 'temp-tolerance',
    bugId: '645fdcf',
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
    id: 'vsac-modifier-extension-error',
    description: 'Dev fails to process VSAC ValueSets with vsacOpModifier extension in exclude filters. Returns generic "Cannot process resource" business-rule error instead of proper validation. Both servers return result=false but for different reasons. Affects 3 POST /r4/ValueSet/$validate-code records.',
    kind: 'temp-tolerance',
    bugId: '933fdcc',
    tags: ['skip', 'vsac', 'modifier-extension'],
    match({ record, dev }) {
      if (!isParameters(dev)) return null;
      const devMsg = getParamValue(dev, 'message');
      if (devMsg && devMsg.includes('vsacOpModifier')) return 'skip';
      return null;
    },
  },

  {
    id: 'v2-0360-lookup-version-skew',
    description: 'v2-0360 $lookup: dev has version 3.0.0, prod has 2.0.0. Dev returns extra definition and designation parameters reflecting newer CodeSystem edition. Strips version, definition, designation params and definition property from both sides.',
    kind: 'temp-tolerance',
    bugId: 'd3b49ff',
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
    id: 'expand-extension-child-order',
    description: 'Extension child element ordering within ValueSet.expansion.extension differs between implementations. Prod orders sub-extensions as [uri, code], dev orders as [code, uri]. Extension child order has no semantic meaning in FHIR. Affects 15 $expand records with R5 backport expansion.property extensions.',
    kind: 'equiv-autofix',
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
    id: 'expand-dev-empty-id',
    description: 'Dev $expand returns "id":"" (empty string) on ValueSet responses. Prod omits id. Empty string is invalid FHIR. Affects 690 expand records.',
    kind: 'temp-tolerance',
    bugId: '2abe02d',
    tags: ['normalize', 'expand', 'invalid-fhir'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!dev?.expansion) return null;
      if (dev.id === '') return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      if (dev.id === '') {
        const { id, ...devRest } = dev;
        return { prod, dev: devRest };
      }
      return { prod, dev };
    },
  },

  {
    id: 'expand-dev-includeDefinition-param',
    description: 'Dev $expand echoes includeDefinition=false in expansion.parameter. Prod omits it. Affects 677 expand records.',
    kind: 'temp-tolerance',
    bugId: 'd1b7d3b',
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
    id: 'expand-dev-warning-experimental-param',
    description: 'Dev $expand includes warning-experimental expansion parameter (flags experimental ValueSet status) that prod omits. Affects 1 expand record (CommonLanguages ValueSet).',
    kind: 'temp-tolerance',
    bugId: '67df517',
    tags: ['normalize', 'expand', 'extra-param'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!dev?.expansion?.parameter) return null;
      const devHas = dev.expansion.parameter.some(p => p.name === 'warning-experimental');
      const prodHas = prod?.expansion?.parameter?.some(p => p.name === 'warning-experimental');
      if (devHas && !prodHas) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      return {
        prod,
        dev: {
          ...dev,
          expansion: {
            ...dev.expansion,
            parameter: dev.expansion.parameter.filter(p => p.name !== 'warning-experimental'),
          },
        },
      };
    },
  },

  {
    id: 'expand-dev-crash-on-error',
    description: 'Dev crashes (500) on $expand when CodeSystem content mode prevents expansion. Prod returns 422 with clear error. Dev leaks JS source code in error message (contentMode() function body), or crashes with TypeError (addParamUri/TerminologyError). Affects 186 POST /r4/ValueSet/$expand records.',
    kind: 'temp-tolerance',
    bugId: '9376cf0',
    tags: ['skip', 'dev-crash-on-error', 'expand'],
    match({ record }) {
      if (record.url !== '/r4/ValueSet/$expand') return null;
      if (record.prod?.status !== 422 || record.dev?.status !== 500) return null;
      return 'skip';
    },
  },

  {
    id: 'expand-dev-crash-on-valid',
    description: 'Dev crashes (500) on valid $expand requests that prod handles successfully (200). Dev returns JavaScript TypeErrors: "vs.expansion.parameter is not iterable" (1 record, us-core-pregnancy-status) and "exp.addParamUri is not a function" (14 records, Verily phenotype ValueSets). Affects 15 POST /r4/ValueSet/$expand records.',
    kind: 'temp-tolerance',
    bugId: '2ae971e',
    tags: ['skip', 'dev-crash-on-valid', 'expand'],
    match({ record }) {
      if (record.url !== '/r4/ValueSet/$expand') return null;
      if (record.prod?.status !== 200 || record.dev?.status !== 500) return null;
      return 'skip';
    },
  },

  {
    id: 'draft-codesystem-message-provenance-suffix',
    description: 'Dev omits " from <package>#<version>" provenance suffix in OperationOutcome issue text for draft CodeSystem warnings (MSG_DRAFT). Prod includes it, e.g. "Reference to draft CodeSystem ...event-status|4.0.1 from hl7.fhir.r4.core#4.0.1". Normalizes both sides to prod text. Affects 4 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '241f1d8',
    tags: ['normalize', 'message-text', 'draft-codesystem'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      for (let i = 0; i < prodIssues.issue.length; i++) {
        const prodText = prodIssues.issue[i]?.details?.text || '';
        const devText = devIssues.issue[i]?.details?.text || '';
        if (prodText !== devText) {
          const m = prodText.match(/^(.+) from \S+#\S+$/);
          if (m && m[1] === devText) return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!devIssues?.issue || !prodIssues?.issue) return { prod, dev };
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
                  if (prodText !== devText) {
                    const m = prodText.match(/^(.+) from \S+#\S+$/);
                    if (m && m[1] === devText) {
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
    id: 'expand-used-codesystem-version-skew',
    description: 'Dev $expand reports different used-codesystem versions than prod, reflecting different loaded code system editions. Normalizes used-codesystem to prod value. Affects 37 expand records across SNOMED, ICD-9-CM, LOINC, and others.',
    kind: 'temp-tolerance',
    bugId: '515117b',
    tags: ['normalize', 'expand', 'version-skew'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion?.parameter || !dev?.expansion?.parameter) return null;
      const prodUcs = prod.expansion.parameter.find(p => p.name === 'used-codesystem');
      const devUcs = dev.expansion.parameter.find(p => p.name === 'used-codesystem');
      if (!prodUcs || !devUcs) return null;
      if (prodUcs.valueUri !== devUcs.valueUri) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      const prodUcs = prod.expansion.parameter.find(p => p.name === 'used-codesystem');
      return {
        prod,
        dev: {
          ...dev,
          expansion: {
            ...dev.expansion,
            parameter: dev.expansion.parameter.map(p =>
              p.name === 'used-codesystem' ? { ...p, valueUri: prodUcs.valueUri } : p
            ),
          },
        },
      };
    },
  },

  {
    id: 'expand-dev-extra-contact-metadata',
    description: 'Dev $expand includes ValueSet contact field (publisher contact info) that prod omits. The contact data is source ValueSet metadata passed through by dev but stripped by prod. Affects 12 expand records in deltas (59 in full comparison).',
    kind: 'temp-tolerance',
    bugId: '3967e97',
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
    id: 'validate-code-display-echo-on-unknown-system',
    description: 'Dev echoes back input display parameter on $validate-code when result=false and CodeSystem is unknown. Prod correctly omits display when it cannot validate it. FHIR spec says output display is "a valid display for the concept" — inapplicable when the system is unknown. Affects 74 validate-code records across 38+ unknown code systems.',
    kind: 'temp-tolerance',
    bugId: '9390fe4',
    tags: ['normalize', 'validate-code', 'display-echo'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const result = getParamValue(prod, 'result');
      if (result !== false) return null;
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (prodDisplay !== undefined || devDisplay === undefined) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      return { prod, dev: stripParams(dev, 'display') };
    },
  },

  {
    id: 'hcpcs-codesystem-availability',
    description: 'HCPCS CodeSystem (http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets) is loaded in dev (version 2025-01) but unknown in prod. Prod returns result=false with x-caused-by-unknown-system, dev returns result=true with valid code details. Affects 110 validate-code result-disagrees records.',
    kind: 'temp-tolerance',
    bugId: 'ac95424',
    tags: ['skip', 'codesystem-availability', 'hcpcs'],
    match({ prod }) {
      if (!isParameters(prod)) return null;
      const unknownSys = getParamValue(prod, 'x-caused-by-unknown-system');
      if (unknownSys === 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets') return 'skip';
      return null;
    },
  },

  {
    id: 'cs-validate-code-no-system-error-format',
    description: 'CodeSystem/$validate-code with no system: prod returns warning with "Coding has no system" message and tx-issue-type coding, dev returns error with "No CodeSystem specified" message and no coding. Both agree result=false. Severity, message text, and issue detail structure all differ. Affects 1 record (POST /r4/CodeSystem/$validate-code without system).',
    kind: 'temp-tolerance',
    bugId: '52ecb75',
    tags: ['normalize', 'validate-code', 'error-format'],
    match({ record, dev }) {
      if (!isParameters(dev)) return null;
      if (record.url !== '/r4/CodeSystem/$validate-code') return null;
      const devMsg = getParamValue(dev, 'message');
      if (devMsg && devMsg.includes('No CodeSystem specified')) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Canonicalize dev's message and issues to match prod's
      const prodMsg = getParamValue(prod, 'message');
      const prodIssues = getParamValue(prod, 'issues');
      if (!prodMsg || !prodIssues) return { prod, dev };
      function canonicalize(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message') {
              return { ...p, valueString: prodMsg };
            }
            if (p.name === 'issues' && prodIssues) {
              return {
                ...p,
                resource: prodIssues,
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
    id: 'cpt-validate-code-result-disagrees',
    description: 'CPT $validate-code: dev returns result=false for valid CPT codes that prod validates as result=true. Dev reports "Unknown code" for 17 distinct CPT codes in system http://www.ama-assn.org/go/cpt version 2023. Affects 45 validate-code records (41 CodeSystem, 4 ValueSet).',
    kind: 'temp-tolerance',
    bugId: 'f559b53',
    tags: ['skip', 'result-disagrees', 'cpt'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://www.ama-assn.org/go/cpt') return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult === true && devResult === false) return 'skip';
      return null;
    },
  },

  {
    id: 'ndc-validate-code-unknown-code-version-diffs',
    description: 'NDC $validate-code result=false: prod reports empty version in error messages, dev reports version 2021-11-01. Prod also includes an extra informational issue ("Code X not found in NDC") that dev omits. Both agree result=false. Root cause is NDC version skew (same as ndc-validate-code-extra-inactive-params). Normalizes version strings in message/issues text and strips extra informational issue from prod. Affects 15 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '7258b41',
    tags: ['normalize', 'ndc', 'validate-code', 'version-skew'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://hl7.org/fhir/sid/ndc') return null;
      const result = getParamValue(prod, 'result');
      if (result !== false) return null;
      const prodMsg = getParamValue(prod, 'message') || '';
      const devMsg = getParamValue(dev, 'message') || '';
      // Match when both have "Unknown code" messages but differ in version string
      if (prodMsg.includes("version ''") && devMsg.includes("version '2021-11-01'")) {
        return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      // Normalize version string in message to dev's value (more informative)
      function normalizeVersionInMessage(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message' && p.valueString) {
              return { ...p, valueString: p.valueString.replace("version ''", "version '2021-11-01'") };
            }
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue
                    // Strip the extra informational "Code X not found in NDC" issue from prod
                    .filter(iss => !(iss.severity === 'information' && iss.details?.text?.match(/^Code .+ not found in NDC$/)))
                    .map(iss => {
                      if (iss.details?.text?.includes("version ''")) {
                        return {
                          ...iss,
                          details: {
                            ...iss.details,
                            text: iss.details.text.replace("version ''", "version '2021-11-01'"),
                          },
                        };
                      }
                      return iss;
                    }),
                },
              };
            }
            return p;
          }),
        };
      }
      return both({ prod, dev }, normalizeVersionInMessage);
    },
  },

  {
    id: 'unknown-version-valid-versions-message',
    description: 'UNKNOWN_CODESYSTEM_VERSION error messages list available versions, which differ between prod and dev because they load different editions. Dev also appends "and undefined" to some version lists (bug de8b2f7) and uses ", " vs "," separators. Both sides agree result=false and the same error type. Normalizes by truncating the "Valid versions:" portion from message and issues text. Affects 13 validate-code records where both sides report UNKNOWN_CODESYSTEM_VERSION for SNOMED 2017-09.',
    kind: 'temp-tolerance',
    bugId: 'de8b2f7',
    tags: ['normalize', 'validate-code', 'version-list', 'unknown-version'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodMsg = getParamValue(prod, 'message') || '';
      const devMsg = getParamValue(dev, 'message') || '';
      // Both sides must have "Valid versions:" in their message
      if (!prodMsg.includes('Valid versions:') || !devMsg.includes('Valid versions:')) return null;
      // Prefix before "Valid versions:" must match (same error, just different version lists)
      const prodPrefix = prodMsg.split('Valid versions:')[0];
      const devPrefix = devMsg.split('Valid versions:')[0];
      if (prodPrefix !== devPrefix) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      function truncateVersionList(text) {
        const idx = text.indexOf('Valid versions:');
        if (idx === -1) return text;
        return text.substring(0, idx).trimEnd();
      }
      function normalizeBody(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message' && p.valueString) {
              return { ...p, valueString: truncateVersionList(p.valueString) };
            }
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.map(iss => {
                    if (iss.details?.text?.includes('Valid versions:')) {
                      return {
                        ...iss,
                        details: { ...iss.details, text: truncateVersionList(iss.details.text) },
                      };
                    }
                    return iss;
                  }),
                },
              };
            }
            return p;
          }),
        };
      }
      return both({ prod, dev }, normalizeBody);
    },
  },

  {
    id: 'expand-display-text-differs',
    description: 'Expand display text differs between prod and dev for the same codes in expansion.contains[].display. Reflects version skew and different preferred term selection across SNOMED (134 records), ISO 3166 (22), and UCUM (1). Normalizes both sides to prod display value. Affects 157 expand records.',
    kind: 'temp-tolerance',
    bugId: 'b9e3cfd',
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
    description: 'NDC $validate-code: dev returns inactive, version, message, and issues parameters that prod omits. Dev loads NDC version 2021-11-01 and flags concepts as inactive (status=null); prod uses unversioned NDC and omits these. Both agree result=true. Affects 16 validate-code records for http://hl7.org/fhir/sid/ndc.',
    kind: 'temp-tolerance',
    bugId: '7258b41',
    tags: ['normalize', 'ndc', 'validate-code', 'extra-params'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://hl7.org/fhir/sid/ndc') return null;
      // Check if dev has inactive param that prod lacks
      const devInactive = getParamValue(dev, 'inactive');
      const prodInactive = getParamValue(prod, 'inactive');
      if (devInactive !== undefined && prodInactive === undefined) return 'normalize';
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
    id: 'ndc-valueset-validate-code-extra-version',
    description: 'NDC ValueSet $validate-code result=false: dev returns extra version parameter ("2021-11-01") that prod omits. These are ValueSet validate-code with codeableConcept containing NDC codes — the code is not found in the ValueSet but dev still reports its NDC edition version. Same root cause as other NDC version skew (bug 7258b41). Affects 2 records.',
    kind: 'temp-tolerance',
    bugId: '7258b41',
    tags: ['normalize', 'ndc', 'validate-code', 'extra-version'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      if (prodResult !== false) return null;
      const devVersion = getParamValue(dev, 'version');
      const prodVersion = getParamValue(prod, 'version');
      if (devVersion === undefined || prodVersion !== undefined) return null;
      // Check codeableConcept contains NDC
      const cc = getParamValue(dev, 'codeableConcept') || getParamValue(prod, 'codeableConcept');
      if (!cc?.coding?.some(c => c.system === 'http://hl7.org/fhir/sid/ndc')) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      return { prod, dev: stripParams(dev, 'version') };
    },
  },

  {
    id: 'validate-code-crash-undefined-system-code',
    description: 'Dev crashes (500) on POST /r4/ValueSet/$validate-code with error "No Match for undefined|undefined". Dev fails to extract system and code from the request body, receiving them as JavaScript undefined. Prod returns 200 with successful validation. Affects 1 record (detailed-race ValueSet, code 2108-9).',
    kind: 'temp-tolerance',
    bugId: '4cdcd85',
    tags: ['skip', 'dev-crash-on-valid', 'validate-code'],
    match({ record, dev }) {
      if (!record.url.includes('$validate-code')) return null;
      if (record.prod?.status !== 200 || record.dev?.status !== 500) return null;
      if (dev?.resourceType !== 'OperationOutcome') return null;
      const errorText = dev?.issue?.[0]?.details?.text || '';
      if (errorText.includes('undefined|undefined')) return 'skip';
      return null;
    },
  },

  {
    id: 'bcp47-case-sensitive-validation',
    description: 'BCP-47 $validate-code: dev accepts lowercase regional variant "en-us" as valid (result=true), prod correctly rejects it (result=false) because BCP-47 is case-sensitive in FHIR and the valid form is "en-US". Affects 2 result-disagrees records (1 CodeSystem, 1 ValueSet validate-code).',
    kind: 'temp-tolerance',
    bugId: '85d0977',
    tags: ['skip', 'result-disagrees', 'bcp47', 'case-sensitivity'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'urn:ietf:bcp:47') return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult === false && devResult === true) return 'skip';
      return null;
    },
  },

  {
    id: 'expand-too-costly-succeeds',
    description: 'Prod returns 422 with too-costly issue code for $expand on grammar-based or very large code systems (CPT, BCP-13 MIME types, NDC). Dev returns 200 with a successful expansion. Dev does not enforce the expansion guard that prod has. Affects 12 records (8 CPT, 2 BCP-13, 2 NDC).',
    kind: 'temp-tolerance',
    bugId: 'e3fb3f6',
    tags: ['skip', 'status-mismatch', 'expand', 'too-costly'],
    match({ record, prod }) {
      if (record.url !== '/r4/ValueSet/$expand') return null;
      if (record.prod?.status !== 422 || record.dev?.status !== 200) return null;
      // Check prod is OperationOutcome with too-costly issue
      if (prod?.resourceType !== 'OperationOutcome') return null;
      if (!prod?.issue?.some(i => i.code === 'too-costly')) return null;
      return 'skip';
    },
  },

  {
    id: 'validate-code-extra-filter-miss-message',
    description: 'Dev $validate-code returns extra message parameter with "Code X is not in the specified filter" warnings when validating against ValueSets with multiple include filters. When the code is valid (result=true, found in at least one filter), prod omits the message entirely. Dev reports intermediate filter-miss messages for each include filter the code did not match. Affects 12 validate-code records (all IPS ValueSets with SNOMED codes).',
    kind: 'temp-tolerance',
    bugId: 'eaeccdd',
    tags: ['normalize', 'validate-code', 'extra-message', 'filter-miss'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== true) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (prodMsg !== undefined || devMsg === undefined) return null;
      if (!devMsg.includes('is not in the specified filter')) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      return { prod, dev: stripParams(dev, 'message') };
    },
  },

  {
    id: 'validate-code-filter-miss-message-prefix',
    description: 'Dev $validate-code prepends "Code X is not in the specified filter; " (once per include filter) to the message parameter when result=false. Prod returns only the standard error message. Same root cause as validate-code-extra-filter-miss-message (bug eaeccdd). Affects 32 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '40c3ecc',
    tags: ['normalize', 'validate-code', 'message-text', 'filter-miss'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (!prodMsg || !devMsg) return null;
      if (prodMsg === devMsg) return null;
      if (!devMsg.includes('is not in the specified filter')) return null;
      if (!devMsg.endsWith(prodMsg)) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodMsg = getParamValue(prod, 'message');
      function setMessage(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'message' ? { ...p, valueString: prodMsg } : p
          ),
        };
      }
      return { prod, dev: setMessage(dev) };
    },
  },

  {
    id: 'expand-iso3166-extra-reserved-codes',
    description: 'ISO 3166 $expand: prod includes 42 reserved/user-assigned codes (AA, QM-QZ, XA-XZ, XX, XZ, ZZ) that dev omits. Prod returns total=291, dev returns total=249. Normalizes by filtering prod contains to only codes present in dev and setting both totals to dev count. Affects 7 expand records.',
    kind: 'temp-tolerance',
    bugId: 'e5a78af',
    tags: ['normalize', 'expand', 'iso3166', 'code-set-difference'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion?.contains || !dev?.expansion?.contains) return null;
      // Check if this is an ISO 3166 expansion
      const prodHasIso = prod.expansion.contains.some(c => c.system === 'urn:iso:std:iso:3166');
      const devHasIso = dev.expansion.contains.some(c => c.system === 'urn:iso:std:iso:3166');
      if (!prodHasIso || !devHasIso) return null;
      // Only match when prod has more codes than dev
      if (prod.expansion.contains.length <= dev.expansion.contains.length) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Build set of codes present in dev
      const devCodes = new Set(
        dev.expansion.contains.map(c => c.system + '|' + c.code)
      );
      // Filter prod to only codes in dev
      const filteredContains = prod.expansion.contains.filter(c =>
        devCodes.has(c.system + '|' + c.code)
      );
      return {
        prod: {
          ...prod,
          expansion: {
            ...prod.expansion,
            total: dev.expansion.total,
            contains: filteredContains,
          },
        },
        dev,
      };
    },
  },

  {
    id: 'validate-code-undefined-system-result-disagrees',
    description: 'POST $validate-code: dev returns result=false because it fails to extract the system URI from the request body — system appears as JavaScript "undefined" in dev diagnostics. Prod correctly validates result=true. Affects 89 records (74 ValueSet, 15 CodeSystem) across LOINC, SNOMED, and RxNorm. Related to bug 4cdcd85 (crash variant).',
    kind: 'temp-tolerance',
    bugId: '19283df',
    tags: ['skip', 'result-disagrees', 'validate-code', 'undefined-system'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$validate-code')) return null;
      if (record.method !== 'POST') return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== false) return null;
      // Diagnostics are already stripped by strip-diagnostics tolerance,
      // so check the raw devBody string for the telltale "undefined" system
      if (!record.devBody || !record.devBody.includes('undefined')) return null;
      return 'skip';
    },
  },

  {
    id: 'snomed-expression-parse-message-diff',
    description: 'SNOMED expression parse error message differs: prod says "and neither could it be parsed as an expression...at character 1", dev says "and could not be parsed as an expression...at character 0". Both convey the same parse failure for invalid SNOMED codes. Normalizes dev issue text to prod text. Affects 2 records (batch-validate-code and validate-code for code "freetext").',
    kind: 'temp-tolerance',
    bugId: '36675d4',
    tags: ['normalize', 'message-text', 'snomed', 'expression-parse'],
    match({ prod, dev }) {
      // Check all OperationOutcome issues in both top-level and nested (batch) parameters
      function hasExprParseDiff(prodBody, devBody) {
        const prodIssues = collectAllIssues(prodBody);
        const devIssues = collectAllIssues(devBody);
        for (let i = 0; i < Math.min(prodIssues.length, devIssues.length); i++) {
          const pt = prodIssues[i]?.details?.text || '';
          const dt = devIssues[i]?.details?.text || '';
          if (pt !== dt &&
              pt.includes('neither could it be parsed as an expression') &&
              dt.includes('could not be parsed as an expression')) {
            return true;
          }
        }
        return false;
      }
      function collectAllIssues(body) {
        const issues = [];
        if (!body?.parameter) return issues;
        for (const p of body.parameter) {
          if (p.name === 'issues' && p.resource?.issue) {
            issues.push(...p.resource.issue);
          }
          if (p.name === 'validation' && p.resource?.parameter) {
            for (const vp of p.resource.parameter) {
              if (vp.name === 'issues' && vp.resource?.issue) {
                issues.push(...vp.resource.issue);
              }
            }
          }
        }
        return issues;
      }
      if (!isParameters(prod) || !isParameters(dev)) return null;
      if (hasExprParseDiff(prod, dev)) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      function canonicalizeIssues(prodBody, devBody) {
        // Build a map of prod issue texts for matching
        function getIssueTexts(body) {
          const texts = [];
          if (!body?.parameter) return texts;
          for (const p of body.parameter) {
            if (p.name === 'issues' && p.resource?.issue) {
              for (const iss of p.resource.issue) texts.push(iss.details?.text || '');
            }
            if (p.name === 'validation' && p.resource?.parameter) {
              for (const vp of p.resource.parameter) {
                if (vp.name === 'issues' && vp.resource?.issue) {
                  for (const iss of vp.resource.issue) texts.push(iss.details?.text || '');
                }
              }
            }
          }
          return texts;
        }
        const prodTexts = getIssueTexts(prodBody);

        function fixIssue(iss, idx) {
          const dt = iss.details?.text || '';
          if (!dt.includes('could not be parsed as an expression')) return iss;
          const pt = prodTexts[idx] || '';
          if (!pt.includes('neither could it be parsed as an expression')) return iss;
          return { ...iss, details: { ...iss.details, text: pt } };
        }

        function fixParams(params, issueIdx) {
          if (!params) return { params, issueIdx };
          let idx = issueIdx;
          const newParams = params.map(p => {
            if (p.name === 'issues' && p.resource?.issue) {
              const newIssues = p.resource.issue.map(iss => fixIssue(iss, idx++));
              return { ...p, resource: { ...p.resource, issue: newIssues } };
            }
            if (p.name === 'validation' && p.resource?.parameter) {
              const result = fixParams(p.resource.parameter, idx);
              idx = result.issueIdx;
              return { ...p, resource: { ...p.resource, parameter: result.params } };
            }
            return p;
          });
          return { params: newParams, issueIdx: idx };
        }

        if (!devBody?.parameter) return devBody;
        const { params } = fixParams(devBody.parameter, 0);
        return { ...devBody, parameter: params };
      }

      return { prod, dev: canonicalizeIssues(prod, dev) };
    },
  },

  {
    id: 'multi-coding-cc-system-code-version-disagree',
    description: 'POST CodeSystem/$validate-code with multi-coding CodeableConcept: prod reports SNOMED coding in system/code/version output params, dev reports the custom CodeSystem coding. Both agree result=true and return identical codeableConcept. Normalizes system/code/version to prod values. Affects 3 records (all el-observation-code-cs + SNOMED pairs).',
    kind: 'temp-tolerance',
    bugId: '43d6cfa',
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
    id: 'validate-code-undefined-system-missing-params',
    description: 'POST $validate-code result=false: dev missing code/system/display params and has extra issues due to undefined system extraction. Both agree result=false (display text is wrong) but dev response shape differs because it failed to extract the system from the POST body. Dev diagnostics show "undefined" system. Same root cause as bug 19283df (result-disagrees variant). Affects 3 records.',
    kind: 'temp-tolerance',
    bugId: '530eeb3',
    tags: ['skip', 'validate-code', 'undefined-system', 'content-differs'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$validate-code')) return null;
      if (record.method !== 'POST') return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      // Prod has code/system params, dev doesn't
      const prodCode = getParamValue(prod, 'code');
      const devCode = getParamValue(dev, 'code');
      if (prodCode === undefined || devCode !== undefined) return null;
      const prodSystem = getParamValue(prod, 'system');
      const devSystem = getParamValue(dev, 'system');
      if (prodSystem === undefined || devSystem !== undefined) return null;
      // Confirm undefined system in dev diagnostics
      if (!record.devBody || !record.devBody.includes('undefined')) return null;
      return 'skip';
    },
  },

  {
    id: 'cpt-expand-empty-results',
    description: 'CPT $expand: dev returns empty expansion (total=0) for ValueSets containing CPT codes. Prod returns the expected codes. Dev reports used-codesystem http://www.ama-assn.org/go/cpt|2023 but fails to resolve any codes from it. Same root cause as CPT validate-code bug f559b53. Affects 45 expand records.',
    kind: 'temp-tolerance',
    bugId: '1176a4a',
    tags: ['skip', 'expand', 'cpt', 'empty-expansion'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      // Dev returns total=0, prod returns >0
      if (dev.expansion.total !== 0 || !(prod.expansion.total > 0)) return null;
      // Check that CPT is the used-codesystem
      const hasCpt = (prod.expansion.parameter || []).some(p =>
        p.name === 'used-codesystem' && p.valueUri && p.valueUri.includes('ama-assn.org/go/cpt')
      );
      if (!hasCpt) return null;
      return 'skip';
    },
  },

  {
    id: 'validate-code-missing-message-on-true',
    description: 'Dev omits the message output parameter on $validate-code when result=true. FHIR spec says message "carries hints and warnings" when result is true. Prod returns it (e.g. fragment code system warnings). The same text appears in issues OperationOutcome. Normalizes by stripping message from prod when dev omits it and result=true. Affects 150 records (111 ValueSet, 39 CodeSystem validate-code).',
    kind: 'temp-tolerance',
    bugId: '8f148da',
    tags: ['normalize', 'validate-code', 'missing-message'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      if (prodResult !== true) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (prodMsg !== undefined && devMsg === undefined) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      return { prod: stripParams(prod, 'message'), dev };
    },
  },

  {
    id: 'cpt-validate-code-unknown-vs-invalid-display',
    description: 'CPT $validate-code result=false: prod finds the code and reports invalid-display (wrong display text), dev cannot find the code at all and reports invalid-code (unknown code). Both agree result=false but for different reasons. Same root cause as bug f559b53 — dev CPT CodeSystem is missing codes. Affects 4 CodeSystem/$validate-code records for code 99235.',
    kind: 'temp-tolerance',
    bugId: '79fe417',
    tags: ['skip', 'cpt', 'validate-code', 'content-differs'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://www.ama-assn.org/go/cpt') return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      // Check prod has invalid-display and dev has invalid-code
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      const prodHasInvalidDisplay = prodIssues.issue.some(i =>
        i.details?.coding?.some(c => c.code === 'invalid-display'));
      const devHasInvalidCode = devIssues.issue.some(i =>
        i.details?.coding?.some(c => c.code === 'invalid-code'));
      if (prodHasInvalidDisplay && devHasInvalidCode) return 'skip';
      return null;
    },
  },

  {
    id: 'cpt-validate-code-missing-info-issue',
    description: 'CPT $validate-code result=false: dev omits informational "Code X not found in CPT" OperationOutcome issue that prod includes. For ValueSet validate-code, prod also prefixes message with this text. Both agree on result=false and the primary error issue. Normalizes by stripping the extra informational issue from prod and removing the message prefix. Affects 10 records (8 CodeSystem, 2 ValueSet).',
    kind: 'temp-tolerance',
    bugId: '9d6a37e',
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
    id: 'case-insensitive-code-validation-diffs',
    description: 'Case-insensitive code validation (ICD-10, ICD-10-CM): dev returns extra normalized-code parameter with correctly-cased code, uses severity "information" instead of "warning" for CODE_CASE_DIFFERENCE issue, and includes version in system URI within issue text. Both agree result=true. Affects 4 validate-code records.',
    kind: 'temp-tolerance',
    bugId: 'fd9fd91',
    tags: ['normalize', 'validate-code', 'case-insensitive', 'normalized-code'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      // Check for dev having normalized-code that prod lacks
      const devNc = getParamValue(dev, 'normalized-code');
      const prodNc = getParamValue(prod, 'normalized-code');
      if (devNc !== undefined && prodNc === undefined) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // 1. Strip normalized-code from dev (prod doesn't have it)
      let newDev = stripParams(dev, 'normalized-code');

      // 2. Normalize severity: canonicalize to prod's severity for CODE_CASE_DIFFERENCE issues
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(newDev, 'issues');
      if (prodIssues?.issue && devIssues?.issue) {
        newDev = {
          ...newDev,
          parameter: newDev.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: p.resource.issue.map((iss, idx) => {
                  const prodIss = prodIssues.issue[idx];
                  if (!prodIss) return iss;
                  // Normalize severity to prod's value
                  let result = iss;
                  if (iss.severity !== prodIss.severity) {
                    result = { ...result, severity: prodIss.severity };
                  }
                  // Normalize issue text: strip version from system URI in text
                  if (result.details?.text && prodIss.details?.text &&
                      result.details.text !== prodIss.details.text) {
                    result = {
                      ...result,
                      details: { ...result.details, text: prodIss.details.text },
                    };
                  }
                  return result;
                }),
              },
            };
          }),
        };
      }

      return { prod, dev: newDev };
    },
  },

  {
    id: 'validate-code-undefined-code-message-diff',
    description: 'POST ValueSet/$validate-code with empty code: dev stringifies absent code as literal "undefined" in error messages (JavaScript undefined-to-string coercion). Both agree result=false but messages differ ("http://loinc.org#" vs "http://loinc.org#undefined") and dev returns extra invalid-code issue. Same root cause as bugs 19283df and 4cdcd85. Affects 2 records.',
    kind: 'temp-tolerance',
    bugId: 'c9d8333',
    tags: ['skip', 'validate-code', 'undefined-code', 'content-differs'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$validate-code')) return null;
      if (record.method !== 'POST') return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      const prodMsg = getParamValue(prod, 'message') || '';
      const devMsg = getParamValue(dev, 'message') || '';
      if (prodMsg.includes('#\'') && devMsg.includes('#undefined\'')) return 'skip';
      return null;
    },
  },

  {
    id: 'read-resource-text-div-diff',
    description: 'Resource read: prod omits text.div when text.status=generated, dev includes the generated narrative HTML. Prod is technically non-conformant (div is required when text is present in FHIR R4). Narrative is auto-generated, no terminology significance. Normalizes by stripping text.div from both sides. Affects 4 read records (us-core-laboratory-test-codes via direct and search reads).',
    kind: 'temp-tolerance',
    bugId: 'bd0f7f4',
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
    id: 'error-operationoutcome-structure-diff',
    description: 'When both prod and dev return 500 OperationOutcome, structural differences remain: prod omits required issue.code field, dev includes it; dev includes issue.diagnostics duplicating details.text, prod omits it; prod includes text narrative, dev omits it. Normalizes by setting canonical issue.code, stripping diagnostics (redundant with details.text), and stripping text (narrative only). Affects 4 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '98ae4ce',
    tags: ['normalize', 'operationoutcome', 'error-structure'],
    match({ record, prod, dev }) {
      if (record.prod.status !== 500 || record.dev.status !== 500) return null;
      if (prod?.resourceType !== 'OperationOutcome' || dev?.resourceType !== 'OperationOutcome') return null;
      const prodIssues = prod.issue || [];
      const devIssues = dev.issue || [];
      if (!prodIssues.length || !devIssues.length) return null;
      // Check if there are structural differences in issue fields (code, diagnostics) or text element
      const hasCodeDiff = prodIssues.some((pi, i) => {
        const di = devIssues[i];
        if (!di) return false;
        return (!!pi.code) !== (!!di.code);
      });
      const hasDiagDiff = prodIssues.some((pi, i) => {
        const di = devIssues[i];
        if (!di) return false;
        return (!!pi.diagnostics) !== (!!di.diagnostics);
      });
      const hasTextDiff = (!!prod.text) !== (!!dev.text);
      if (hasCodeDiff || hasDiagDiff || hasTextDiff) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      function normalizeOO(oo, otherOO) {
        if (!oo) return oo;
        // Strip text narrative
        const { text, ...rest } = oo;
        return {
          ...rest,
          issue: (oo.issue || []).map((issue, i) => {
            const otherIssue = (otherOO?.issue || [])[i] || {};
            // Canonical code: use whichever side has it, prefer dev (more conformant)
            const canonicalCode = issue.code || otherIssue.code;
            // Strip diagnostics when it duplicates details.text
            const { diagnostics, ...issueRest } = issue;
            const result = { ...issueRest };
            if (canonicalCode) result.code = canonicalCode;
            return result;
          }),
        };
      }
      return {
        prod: normalizeOO(prod, dev),
        dev: normalizeOO(dev, prod),
      };
    },
  },

  {
    id: 'message-concat-missing-issues',
    description: 'Dev message parameter only includes first issue text instead of concatenating all issue texts with "; ". Prod correctly joins all OperationOutcome issue details.text values. The issues resource itself is identical. Affects 8 validate-code records (CodeSystem and ValueSet) where multiple issues exist.',
    kind: 'temp-tolerance',
    bugId: '093fde6',
    tags: ['normalize', 'message-format', 'validate-code'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (!prodMsg || !devMsg || prodMsg === devMsg) return null;
      // Get issue texts from both sides
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      if (prodIssues.issue.length < 2) return null;
      const prodTexts = prodIssues.issue.map(i => i.details?.text).filter(Boolean);
      const devTexts = devIssues.issue.map(i => i.details?.text).filter(Boolean);
      // Pattern: prod message = all issues joined with '; ', dev message = first issue only
      if (prodMsg === prodTexts.join('; ') && devMsg === devTexts[0]) {
        return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      const prodMsg = getParamValue(prod, 'message');
      function setMessage(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'message' ? { ...p, valueString: prodMsg } : p
          ),
        };
      }
      return { prod, dev: setMessage(dev) };
    },
  },

  {
    id: 'message-concat-selective-issues',
    description: 'Dev message parameter omits some issue texts when validating CodeableConcept with multiple coding errors. Prod concatenates error+warning issue texts with "; " into the message, dev only includes a subset. The OperationOutcome issues resource is identical. Same root cause as message-concat-missing-issues but the message is not a simple join of all issue texts (e.g., informational issues are excluded). Affects 10 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '80ce6b2',
    tags: ['normalize', 'message-format', 'validate-code'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (!prodMsg || !devMsg || prodMsg === devMsg) return null;
      // Dev message must be a proper substring of prod message
      if (!prodMsg.includes(devMsg) || prodMsg.length <= devMsg.length) return null;
      // OO issues must be identical (after earlier normalizations)
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      // Compare with sorted keys to ignore JSON key ordering differences
      const sortedStringify = obj => JSON.stringify(obj, Object.keys(obj).sort());
      function deepSortedStringify(obj) {
        if (obj === null || typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(deepSortedStringify).join(',') + ']';
        const keys = Object.keys(obj).sort();
        return '{' + keys.map(k => JSON.stringify(k) + ':' + deepSortedStringify(obj[k])).join(',') + '}';
      }
      if (deepSortedStringify(prodIssues) !== deepSortedStringify(devIssues)) return null;
      // Prod message must contain "; " (concatenated multiple messages)
      if (!prodMsg.includes('; ')) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodMsg = getParamValue(prod, 'message');
      function setMessage(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p =>
            p.name === 'message' ? { ...p, valueString: prodMsg } : p
          ),
        };
      }
      return { prod, dev: setMessage(dev) };
    },
  },

  {
    id: 'validate-code-x-unknown-system-extra',
    description: 'Dev returns x-unknown-system parameter, extra UNKNOWN_CODESYSTEM_VERSION issue, and different message/display/version when a requested code system version is not found. Prod falls back to a known version and provides display/version details. Both agree result=false. Affects 5 validate-code content-differs records.',
    kind: 'temp-tolerance',
    bugId: '451c583',
    tags: ['normalize', 'validate-code', 'unknown-system-version'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const devUnknown = getParamValue(dev, 'x-unknown-system');
      const prodUnknown = getParamValue(prod, 'x-unknown-system');
      if (devUnknown && !prodUnknown) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      if (!prod?.parameter || !dev?.parameter) return { prod, dev };
      // Strip x-unknown-system from dev
      let devNorm = stripParams(dev, 'x-unknown-system');
      // Canonicalize message to prod's value
      const prodMsg = getParamValue(prod, 'message');
      if (prodMsg) {
        devNorm = {
          ...devNorm,
          parameter: devNorm.parameter.map(p =>
            p.name === 'message' ? { ...p, valueString: prodMsg } : p
          ),
        };
      }
      // Canonicalize issues to prod's value
      const prodIssues = getParamValue(prod, 'issues');
      if (prodIssues) {
        devNorm = {
          ...devNorm,
          parameter: devNorm.parameter.map(p =>
            p.name === 'issues' ? { ...p, resource: prodIssues } : p
          ),
        };
      }
      // Add display from prod if prod has it and dev doesn't
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (prodDisplay && !devDisplay) {
        devNorm = {
          ...devNorm,
          parameter: [...devNorm.parameter, { name: 'display', valueString: prodDisplay }],
        };
      }
      // Canonicalize version: prod may have extra version params (the actual known version)
      const prodVersions = prod.parameter.filter(p => p.name === 'version');
      const devVersions = devNorm.parameter.filter(p => p.name === 'version');
      if (prodVersions.length !== devVersions.length) {
        devNorm = {
          ...devNorm,
          parameter: [
            ...devNorm.parameter.filter(p => p.name !== 'version'),
            ...prodVersions,
          ],
        };
      }
      // Re-sort parameters since sort-parameters-by-name already ran
      devNorm = {
        ...devNorm,
        parameter: devNorm.parameter.slice().sort((a, b) => a.name.localeCompare(b.name)),
      };
      return { prod, dev: devNorm };
    },
  },

  {
    id: 'ucum-error-message-format',
    description: 'UCUM error message formatting differs: prod says "Error processing Unit: \'Torr\': The unit \\"Torr\\" is unknown", dev says "Error processing unit \'Torr\': The unit \'Torr\' is unknown". Different capitalization, punctuation, and quoting style. Both convey the same parse error. Affects 1 batch-validate-code record for http://unitsofmeasure.org.',
    kind: 'temp-tolerance',
    bugId: '4f27f83',
    tags: ['normalize', 'message-text', 'ucum', 'batch-validate-code'],
    match({ record, prod, dev }) {
      if (!record.url.includes('$batch-validate-code') && !record.url.includes('$validate-code')) return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      // Collect all issue texts from nested validation resources and top-level
      function collectIssueTexts(body) {
        const texts = [];
        if (!body?.parameter) return texts;
        for (const p of body.parameter) {
          if (p.name === 'issues' && p.resource?.issue) {
            for (const iss of p.resource.issue) texts.push(iss.details?.text || '');
          }
          if (p.name === 'validation' && p.resource?.parameter) {
            for (const vp of p.resource.parameter) {
              if (vp.name === 'issues' && vp.resource?.issue) {
                for (const iss of vp.resource.issue) texts.push(iss.details?.text || '');
              }
            }
          }
        }
        return texts;
      }
      const prodTexts = collectIssueTexts(prod);
      const devTexts = collectIssueTexts(dev);
      for (let i = 0; i < Math.min(prodTexts.length, devTexts.length); i++) {
        if (prodTexts[i] !== devTexts[i] &&
            prodTexts[i].includes('Error processing Unit') &&
            devTexts[i].includes('Error processing unit')) {
          return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      // Build prod issue text index for canonicalization
      function collectProdIssueTexts(body) {
        const texts = [];
        if (!body?.parameter) return texts;
        for (const p of body.parameter) {
          if (p.name === 'issues' && p.resource?.issue) {
            for (const iss of p.resource.issue) texts.push(iss.details?.text || '');
          }
          if (p.name === 'validation' && p.resource?.parameter) {
            for (const vp of p.resource.parameter) {
              if (vp.name === 'issues' && vp.resource?.issue) {
                for (const iss of vp.resource.issue) texts.push(iss.details?.text || '');
              }
            }
          }
        }
        return texts;
      }
      const prodTexts = collectProdIssueTexts(prod);
      let textIdx = 0;

      function fixIssues(issues) {
        return issues.map(iss => {
          const idx = textIdx++;
          const dt = iss.details?.text || '';
          const pt = prodTexts[idx] || '';
          if (dt !== pt &&
              pt.includes('Error processing Unit') &&
              dt.includes('Error processing unit')) {
            return { ...iss, details: { ...iss.details, text: pt } };
          }
          return iss;
        });
      }

      function canonicalize(body) {
        if (!body?.parameter) return body;
        textIdx = 0;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: { ...p.resource, issue: fixIssues(p.resource.issue) },
              };
            }
            if (p.name === 'validation' && p.resource?.parameter) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  parameter: p.resource.parameter.map(vp => {
                    if (vp.name === 'issues' && vp.resource?.issue) {
                      return {
                        ...vp,
                        resource: { ...vp.resource, issue: fixIssues(vp.resource.issue) },
                      };
                    }
                    return vp;
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
    id: 'error-status-422-vs-400',
    description: 'Dev returns HTTP 400 instead of 422 for error responses across validate-code and expand operations. Both sides return OperationOutcome with the same error semantics. 1897 records (1331 validate-code, 566 expand).',
    kind: 'temp-tolerance',
    bugId: 'cd4b7d1',
    tags: ['skip', 'status-mismatch'],
    match({ record, prod, dev }) {
      if (record.prod?.status !== 422 || record.dev?.status !== 400) return null;
      // Both must be OperationOutcome error responses
      if (prod?.resourceType !== 'OperationOutcome') return null;
      if (dev?.resourceType !== 'OperationOutcome') return null;
      return 'skip';
    },
  },

  {
    id: 'v3-valueset-validate-code-result-disagrees',
    description: 'Dev returns result=false for valid HL7 v3 terminology codes in ValueSet $validate-code. Prod correctly returns result=true. Both agree on CodeSystem version, code, and display. Dev fails to resolve ValueSet membership for codes from terminology.hl7.org/CodeSystem/v3-* systems. Affects 187 records across 5 ValueSets (v3-ActEncounterCode, encounter-participant-type, consent-category, v3-ServiceDeliveryLocationRoleType, v3-PurposeOfUse).',
    kind: 'temp-tolerance',
    bugId: '167be81',
    tags: ['skip', 'result-disagrees', 'v3-terminology', 'validate-code'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$validate-code/.test(record.url)) return null;
      if (!prod || !dev) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== false) return null;
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system') || '';
      if (!/^http:\/\/terminology\.hl7\.org\/CodeSystem\/v3-/.test(system)) return null;
      return 'skip';
    },
  },

  {
    id: 'hl7-terminology-cs-version-skew',
    description: 'HL7 terminology CodeSystems (terminology.hl7.org/CodeSystem/*) are loaded with different versions in prod vs dev. Prod uses version 4.0.1 for consentcategorycodes/goal-achievement (dev=1.0.1), 4.0.1 for consentpolicycodes (dev=3.0.1), and 2.9 for v2-0116 (dev=3.0.0). Both agree on validation result. Version strings differ only in message and issues text. Normalizes version strings in message and OperationOutcome issue details.text from dev to prod values. Affects 32 validate-code records.',
    kind: 'temp-tolerance',
    bugId: '6edc96c',
    tags: ['normalize', 'validate-code', 'version-skew', 'hl7-terminology'],
    match({ record, prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodMsg = getParamValue(prod, 'message') || '';
      const devMsg = getParamValue(dev, 'message') || '';
      if (prodMsg === devMsg) return null;
      // Check system is a terminology.hl7.org CodeSystem
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system') || '';
      if (!system.startsWith('http://terminology.hl7.org/CodeSystem/')) return null;
      // Check that messages differ only in version string
      const versionPattern = /version '[^']*'/g;
      const prodNorm = prodMsg.replace(versionPattern, "version 'X'");
      const devNorm = devMsg.replace(versionPattern, "version 'X'");
      if (prodNorm !== devNorm) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Extract prod's version strings from message
      const prodMsg = getParamValue(prod, 'message') || '';
      const versionPattern = /version '([^']*)'/g;
      const prodVersions = [];
      let m;
      while ((m = versionPattern.exec(prodMsg)) !== null) {
        prodVersions.push(m[1]);
      }
      if (prodVersions.length === 0) return { prod, dev };
      // Build a replacement: replace dev's version strings with prod's (positionally)
      function replaceVersions(text) {
        let idx = 0;
        return text.replace(/version '[^']*'/g, (match) => {
          if (idx < prodVersions.length) {
            return "version '" + prodVersions[idx++] + "'";
          }
          return match;
        });
      }
      function fixBody(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name === 'message' && p.valueString) {
              return { ...p, valueString: replaceVersions(p.valueString) };
            }
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.map(iss => {
                    if (iss.details?.text) {
                      return {
                        ...iss,
                        details: { ...iss.details, text: replaceVersions(iss.details.text) },
                      };
                    }
                    return iss;
                  }),
                },
              };
            }
            return p;
          }),
        };
      }
      return { prod, dev: fixBody(dev) };
    },
  },

  {
    id: 'expand-hl7-terminology-version-skew-content',
    description: 'Dev loads different versions of HL7 terminology CodeSystems (terminology.hl7.org/CodeSystem/*) than prod, causing $expand to return different sets of codes. The common codes between prod and dev are identical — only extra/missing codes differ. Normalizes both sides to the intersection of codes and adjusts total. Affects 163 expand records across consent-policy (7), observation-category (130), patient-contactrelationship (5), TribalEntityUS (3), security-labels (18).',
    kind: 'temp-tolerance',
    bugId: '6edc96c',
    tags: ['normalize', 'expand', 'version-skew', 'hl7-terminology'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (!prod?.expansion?.contains || !dev?.expansion?.contains) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;

      // Check that at least one used-codesystem is from terminology.hl7.org
      const allParams = [
        ...(prod.expansion.parameter || []),
        ...(dev.expansion.parameter || []),
      ];
      const hasHl7Cs = allParams.some(p =>
        p.name === 'used-codesystem' &&
        (p.valueUri || '').includes('terminology.hl7.org/CodeSystem/')
      );
      if (!hasHl7Cs) return null;

      // Build code sets
      const prodCodes = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
      const devCodes = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));

      // Check there are extra/missing codes (not just total mismatch)
      let hasExtra = false;
      for (const k of devCodes) { if (!prodCodes.has(k)) { hasExtra = true; break; } }
      if (!hasExtra) {
        for (const k of prodCodes) { if (!devCodes.has(k)) { hasExtra = true; break; } }
      }
      if (!hasExtra) return null;

      // Only match if dev didn't fail to expand (dev total > 1)
      if (dev.expansion.contains.length <= 1 && prod.expansion.contains.length > 5) return null;

      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Intersect: keep only codes present in both sides
      const prodKeys = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
      const devKeys = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));
      const commonKeys = new Set([...prodKeys].filter(k => devKeys.has(k)));

      const filterContains = (contains) =>
        contains.filter(c => commonKeys.has(c.system + '|' + c.code));

      const newProd = {
        ...prod,
        expansion: {
          ...prod.expansion,
          contains: filterContains(prod.expansion.contains),
          total: commonKeys.size,
        },
      };
      const newDev = {
        ...dev,
        expansion: {
          ...dev.expansion,
          contains: filterContains(dev.expansion.contains),
          total: commonKeys.size,
        },
      };
      return { prod: newProd, dev: newDev };
    },
  },

  {
    id: 'expand-snomed-version-skew-content',
    description: 'Dev loads SNOMED CT edition 20240201 while prod loads 20250201, causing $expand to return different code sets. Codes added/removed between editions appear as extra/missing in the expansion. Normalizes both sides to the intersection of codes and adjusts total. Affects 40 expand records.',
    kind: 'temp-tolerance',
    bugId: '9fd2328',
    tags: ['normalize', 'expand', 'version-skew', 'snomed'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (!prod?.expansion?.contains || !dev?.expansion?.contains) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;

      // Check that at least one used-codesystem is SNOMED (in normalized bodies)
      const allParams = [
        ...(prod.expansion.parameter || []),
        ...(dev.expansion.parameter || []),
      ];
      const hasSnomedCs = allParams.some(p =>
        p.name === 'used-codesystem' &&
        (p.valueUri || '').includes('snomed.info/sct')
      );
      if (!hasSnomedCs) return null;

      // Check SNOMED version skew from raw bodies (before earlier normalizations)
      try {
        const rawProd = JSON.parse(record.prodBody);
        const rawDev = JSON.parse(record.devBody);
        const rawProdSnomed = (rawProd.expansion?.parameter || [])
          .filter(p => p.name === 'used-codesystem' && (p.valueUri || '').includes('snomed.info/sct'))
          .map(p => p.valueUri);
        const rawDevSnomed = (rawDev.expansion?.parameter || [])
          .filter(p => p.name === 'used-codesystem' && (p.valueUri || '').includes('snomed.info/sct'))
          .map(p => p.valueUri);
        if (rawProdSnomed.length === 0 || rawDevSnomed.length === 0) return null;
        if (JSON.stringify(rawProdSnomed.sort()) === JSON.stringify(rawDevSnomed.sort())) return null;
      } catch {
        return null;
      }

      // Check code membership actually differs
      const prodCodes = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
      const devCodes = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));
      let hasExtra = false;
      for (const k of devCodes) { if (!prodCodes.has(k)) { hasExtra = true; break; } }
      if (!hasExtra) {
        for (const k of prodCodes) { if (!devCodes.has(k)) { hasExtra = true; break; } }
      }
      if (!hasExtra) return null;

      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodKeys = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
      const devKeys = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));
      const commonKeys = new Set([...prodKeys].filter(k => devKeys.has(k)));

      const filterContains = (contains) =>
        contains.filter(c => commonKeys.has(c.system + '|' + c.code));

      const newProd = {
        ...prod,
        expansion: {
          ...prod.expansion,
          contains: filterContains(prod.expansion.contains),
          total: commonKeys.size,
        },
      };
      const newDev = {
        ...dev,
        expansion: {
          ...dev.expansion,
          contains: filterContains(dev.expansion.contains),
          total: commonKeys.size,
        },
      };
      return { prod: newProd, dev: newDev };
    },
  },

  {
    id: 'expand-v3-hierarchical-incomplete',
    description: 'Dev $expand returns only the root abstract concept for v3 hierarchical ValueSets (v3-ActEncounterCode, v3-ServiceDeliveryLocationRoleType, v3-PurposeOfUse, v3-ActPharmacySupplyType), missing all descendant codes. Prod returns the full hierarchy. 246 records across 4 ValueSets.',
    kind: 'temp-tolerance',
    bugId: '4336772',
    tags: ['skip', 'expand', 'v3-hierarchy'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      const prodTotal = prod.expansion.total;
      const devTotal = dev.expansion.total;
      if (devTotal !== 1 || prodTotal <= 1) return null;
      // Check this is a v3 terminology ValueSet (URL may be percent-encoded)
      const decodedUrl = decodeURIComponent(record.url);
      if (!/terminology\.hl7\.org\/ValueSet\/v3-/.test(decodedUrl)) return null;
      return 'skip';
    },
  },

  {
    id: 'expand-unclosed-extension-and-total',
    description: 'Dev $expand: missing valueset-unclosed extension and spurious expansion.total on incomplete expansions. Prod marks truncated expansions with the valueset-unclosed extension and omits total; dev omits the extension but includes total. 292 records.',
    kind: 'temp-tolerance',
    bugId: 'f2b2cef',
    tags: ['normalize', 'expand', 'unclosed', 'total'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;
      if (!prod?.expansion || !dev?.expansion) return null;

      const prodHasUnclosed = (prod.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );
      const devHasUnclosed = (dev.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );
      const prodHasTotal = prod.expansion.total !== undefined;
      const devHasTotal = dev.expansion.total !== undefined;

      if (prodHasUnclosed && !devHasUnclosed) return 'normalize';
      if (!prodHasTotal && devHasTotal) return 'normalize';
      return null;
    },
    normalize({ prod, dev, record }) {
      let newProd = prod;
      let newDev = dev;

      const prodHasUnclosed = (prod.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );
      const devHasUnclosed = (dev.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
      );

      // Remove valueset-unclosed extension from prod if dev doesn't have it
      if (prodHasUnclosed && !devHasUnclosed) {
        const filteredExt = (newProd.expansion.extension || []).filter(
          e => e.url !== 'http://hl7.org/fhir/StructureDefinition/valueset-unclosed'
        );
        const newExpansion = { ...newProd.expansion };
        if (filteredExt.length > 0) {
          newExpansion.extension = filteredExt;
        } else {
          delete newExpansion.extension;
        }
        newProd = { ...newProd, expansion: newExpansion };
      }

      // Remove total from dev if prod doesn't have it
      if (prod.expansion.total === undefined && dev.expansion.total !== undefined) {
        const { total, ...restExpansion } = newDev.expansion;
        newDev = { ...newDev, expansion: restExpansion };
      }

      return { prod: newProd, dev: newDev };
    },
  },

  {
    id: 'expand-dev-missing-total',
    description: 'Dev $expand omits expansion.total when prod includes it. The total field (0..1 integer) tells clients the total concept count for pagination. Neither side has the valueset-unclosed extension — these are complete expansions where dev simply fails to report total. Affects 47 expand records.',
    kind: 'temp-tolerance',
    bugId: '2ed80bd',
    tags: ['normalize', 'expand', 'total'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      const prodHasTotal = prod.expansion.total !== undefined;
      const devHasTotal = dev.expansion.total !== undefined;
      if (prodHasTotal && !devHasTotal) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Remove total from prod since dev doesn't have it
      const { total, ...restExpansion } = prod.expansion;
      return { prod: { ...prod, expansion: restExpansion }, dev };
    },
  },

  {
    id: 'oo-extra-expression-on-info-issues',
    description: 'Dev adds expression: ["code"] on information-severity OperationOutcome issues where prod omits the expression field. Both error-severity issues have expression in both sides. Affects 6 validate-code records (SNOMED and UCUM invalid codes).',
    kind: 'temp-tolerance',
    bugId: '801aef1',
    tags: ['normalize', 'operationoutcome', 'expression-field'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      if (prodIssues.issue.length !== devIssues.issue.length) return null;
      for (let i = 0; i < prodIssues.issue.length; i++) {
        const pi = prodIssues.issue[i];
        const di = devIssues.issue[i];
        if (!pi.expression && di?.expression && di.severity === 'information') {
          return 'normalize';
        }
      }
      return null;
    },
    normalize({ prod, dev }) {
      function stripExtraExpression(devBody, prodBody) {
        if (!devBody?.parameter || !prodBody?.parameter) return devBody;
        return {
          ...devBody,
          parameter: devBody.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            const prodParam = prodBody.parameter.find(pp => pp.name === 'issues');
            if (!prodParam?.resource?.issue) return p;
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: p.resource.issue.map((iss, idx) => {
                  const prodIss = prodParam.resource.issue[idx];
                  if (iss.severity === 'information' && iss.expression && !prodIss?.expression) {
                    const { expression, ...rest } = iss;
                    return rest;
                  }
                  return iss;
                }),
              },
            };
          }),
        };
      }
      return { prod, dev: stripExtraExpression(dev, prod) };
    },
  },

  {
    id: 'expand-valueset-not-found-status-mismatch',
    description: 'Prod returns 422 with issue code "unknown", dev returns 404 with issue code "not-found" when a ValueSet cannot be found for $expand. Both communicate the same meaning but differ in HTTP status and OperationOutcome structure. 756 records.',
    kind: 'temp-tolerance',
    bugId: '2337986',
    tags: ['skip', 'status-mismatch', 'expand'],
    match({ record, prod, dev }) {
      if (record.prod.status !== 422 || record.dev.status !== 404) return null;
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      // Verify both sides report ValueSet not found
      const prodNotFound = prod?.issue?.some(i =>
        i.code === 'unknown' && /unable to find value set/i.test(i.details?.text || '')
      );
      const devNotFound = dev?.issue?.some(i =>
        i.code === 'not-found' && /valueset not found/i.test(i.diagnostics || '')
      );
      if (prodNotFound && devNotFound) return 'skip';
      return null;
    },
  },

  {
    id: 'dev-extra-display-lang-not-found-message',
    description: 'Dev $validate-code returns extra message and issues parameters with "no valid display names found" informational feedback when displayLanguage is specified and the code system lacks a display in that language. Prod omits these entirely. Both agree result=true. Affects 19 validate-code records (mostly urn:iso:std:iso:3166 with displayLanguage=fr/fr-FR).',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'extra-message'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      if (prodResult !== true) return null;
      const prodMsg = getParamValue(prod, 'message');
      if (prodMsg !== undefined) return null;
      const devMsg = getParamValue(dev, 'message');
      if (!devMsg || !devMsg.includes('There are no valid display names found')) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      return { prod, dev: stripParams(dev, 'message', 'issues') };
    },
  },

  {
    id: 'cc-validate-code-missing-known-coding-params',
    description: 'CodeSystem/$validate-code with codeableConcept containing unknown + known coding: dev omits system/code/version/display params for the known coding. Prod validates the known coding and returns these details plus additional OperationOutcome issues. Dev stops at the unknown system error. Affects 5 records (2 LOINC, 3 SNOMED).',
    kind: 'temp-tolerance',
    bugId: 'b6d19d8',
    tags: ['normalize', 'validate-code', 'codeableConcept', 'unknown-system'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      // Must have x-caused-by-unknown-system on either side
      const unknown = getParamValue(prod, 'x-caused-by-unknown-system') ||
                       getParamValue(dev, 'x-caused-by-unknown-system');
      if (!unknown) return null;
      // Must have codeableConcept
      const cc = getParamValue(prod, 'codeableConcept') || getParamValue(dev, 'codeableConcept');
      if (!cc) return null;
      // Prod has system param, dev doesn't
      const prodSystem = getParamValue(prod, 'system');
      const devSystem = getParamValue(dev, 'system');
      if (prodSystem === undefined || devSystem !== undefined) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      if (!prod?.parameter || !dev?.parameter) return { prod, dev };
      // Add missing params from prod to dev
      const devNames = new Set(dev.parameter.map(p => p.name));
      const paramsToAdd = ['system', 'code', 'version', 'display'];
      const newParams = [...dev.parameter];
      for (const name of paramsToAdd) {
        if (devNames.has(name)) continue;
        const prodParam = prod.parameter.find(p => p.name === name);
        if (prodParam) newParams.push(prodParam);
      }
      let devNorm = { ...dev, parameter: newParams };
      // Canonicalize issues to prod's set
      const prodIssues = getParamValue(prod, 'issues');
      if (prodIssues) {
        devNorm = {
          ...devNorm,
          parameter: devNorm.parameter.map(p =>
            p.name === 'issues' ? { ...p, resource: prodIssues } : p
          ),
        };
      }
      // Re-sort parameters by name (sort-parameters-by-name already ran)
      devNorm = {
        ...devNorm,
        parameter: [...devNorm.parameter].sort((a, b) =>
          (a.name || '').localeCompare(b.name || '')
        ),
      };
      return { prod, dev: devNorm };
    },
  },

  {
    id: 'expand-toocostly-extension-and-used-codesystem',
    description: 'Dev $expand: missing valueset-toocostly extension and spurious used-codesystem parameter on grammar-based code system expansions. Prod marks empty expansions of grammar-based systems (BCP-13 MIME types, etc.) with valueset-toocostly extension and omits used-codesystem. Dev omits the toocostly extension but includes used-codesystem. Affects 13 records.',
    kind: 'temp-tolerance',
    bugId: 'c7004d3',
    tags: ['normalize', 'expand', 'toocostly', 'used-codesystem'],
    match({ record, prod, dev }) {
      if (!/\/ValueSet\/\$expand/.test(record.url)) return null;
      if (record.prod.status !== 200 || record.dev.status !== 200) return null;
      if (!prod?.expansion || !dev?.expansion) return null;

      const prodHasTooCostly = (prod.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
      );
      const devHasTooCostly = (dev.expansion.extension || []).some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
      );

      if (prodHasTooCostly && !devHasTooCostly) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      let newProd = prod;
      let newDev = dev;

      // Remove valueset-toocostly extension from prod
      const filteredExt = (newProd.expansion.extension || []).filter(
        e => e.url !== 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
      );
      const newExpansion = { ...newProd.expansion };
      if (filteredExt.length > 0) {
        newExpansion.extension = filteredExt;
      } else {
        delete newExpansion.extension;
      }
      newProd = { ...newProd, expansion: newExpansion };

      // Remove dev-only used-codesystem parameters (prod doesn't have them for toocostly expansions)
      if (dev.expansion.parameter) {
        const prodUcsUris = new Set(
          (prod.expansion.parameter || [])
            .filter(p => p.name === 'used-codesystem')
            .map(p => p.valueUri)
        );
        const filteredParams = dev.expansion.parameter.filter(p => {
          if (p.name !== 'used-codesystem') return true;
          return prodUcsUris.has(p.valueUri);
        });
        newDev = {
          ...newDev,
          expansion: { ...newDev.expansion, parameter: filteredParams },
        };
      }

      return { prod: newProd, dev: newDev };
    },
  },

  {
    id: 'hgvs-extra-syntax-issue',
    description: 'Dev returns extra informational OperationOutcome issue for HGVS (varnomen.hgvs.org) $validate-code operations. Dev includes an additional informational-level issue with HGVS syntax validation feedback ("Missing one of \'c\', \'g\', \'m\', \'n\', \'p\', \'r\' followed by \'.\'") that prod does not return. Both agree on result=false and the error-level issue. Affects 62 records.',
    kind: 'temp-tolerance',
    bugId: '3103b01',
    tags: ['normalize', 'operationoutcome', 'hgvs', 'extra-issue'],
    match({ prod, dev, record }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      if (devIssues.issue.length <= prodIssues.issue.length) return null;
      // Check that the extra issues are informational HGVS syntax issues
      const system = getParamValue(prod, 'system') || getParamValue(dev, 'system');
      if (system !== 'http://varnomen.hgvs.org') return null;
      // Verify that dev has informational issues with the HGVS syntax message that prod doesn't
      const hasHgvsSyntaxIssue = devIssues.issue.some(i =>
        i.severity === 'information' &&
        (i.details?.text || '').startsWith('Error while processing')
      );
      if (!hasHgvsSyntaxIssue) return null;
      return 'normalize';
    },
    normalize({ prod, dev, record }) {
      function filterHgvsSyntaxIssues(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            const filtered = p.resource.issue.filter(i =>
              !(i.severity === 'information' &&
                (i.details?.text || '').startsWith('Error while processing'))
            );
            return {
              ...p,
              resource: {
                ...p.resource,
                issue: filtered,
              },
            };
          }),
        };
      }
      return { prod, dev: filterHgvsSyntaxIssues(dev) };
    },
  },

  {
    id: 'skip-prod-hgvs-timeout',
    description: 'Prod returned 500 due to transient timeout calling external HGVS validation service ("Error parsing HGVS response: Read timed out"). Dev returned 200 with a valid terminology response. Comparison data is unreliable for these records. Affects 62 records, all POST /r4/CodeSystem/$validate-code with system http://varnomen.hgvs.org.',
    kind: 'temp-tolerance',
    bugId: 'e02b03e',
    tags: ['skip', 'data-collection-artifact', 'hgvs', 'timeout'],
    match({ record }) {
      if (record.prod.status !== 500) return null;
      if (!record.prodBody || !record.prodBody.includes('Read timed out')) return null;
      return 'skip';
    },
  },

  {
    id: 'unknown-version-no-versions-known',
    description: 'When validating a code against a CodeSystem version that does not exist, prod says "Valid versions: X" (listing known versions) while dev says "No versions of this code system are known" (even though dev does know other versions). Also, x-caused-by-unknown-system includes version suffix in prod but not dev, and message-id is UNKNOWN_CODESYSTEM_VERSION (prod) vs UNKNOWN_CODESYSTEM_VERSION_NONE (dev). Both agree result=false. Affects 50 records, all England-GenomicTestDirectory with requested versions 7 or 9.',
    kind: 'temp-tolerance',
    bugId: 'b36a12b',
    tags: ['normalize', 'validate-code', 'unknown-version', 'message-text'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (!prodMsg || !devMsg) return null;
      if (prodMsg.includes('Valid versions:') && devMsg.includes('No versions of this code system are known')) {
        return 'normalize';
      }
      return null;
    },
    normalize({ prod, dev }) {
      // Normalize message parameter to prod's value
      const prodMsg = getParamValue(prod, 'message');

      function normalizeBody(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            // Normalize message text
            if (p.name === 'message' && p.valueString) {
              return { ...p, valueString: prodMsg };
            }
            // Normalize x-caused-by-unknown-system to include version suffix (prod's value)
            if (p.name === 'x-caused-by-unknown-system') {
              const prodXCaused = getParamValue(prod, 'x-caused-by-unknown-system');
              if (prodXCaused) {
                return { ...p, valueCanonical: prodXCaused };
              }
            }
            // Normalize OperationOutcome issues
            if (p.name === 'issues' && p.resource?.issue) {
              return {
                ...p,
                resource: {
                  ...p.resource,
                  issue: p.resource.issue.map(iss => ({
                    ...iss,
                    details: iss.details ? { ...iss.details, text: prodMsg } : iss.details,
                  })),
                },
              };
            }
            return p;
          }),
        };
      }

      return both({ prod, dev }, normalizeBody);
    },
  },

  {
    id: 'expand-toocostly-grammar-400',
    description: 'Dev returns 400 OperationOutcome with too-costly error for grammar-based code systems (BCP-47, SNOMED), while prod returns 200 with a ValueSet containing the valueset-toocostly extension. Prod behavior is correct per FHIR spec.',
    kind: 'temp-tolerance',
    bugId: 'f33161f',
    tags: ['skip', 'status-mismatch', 'expand', 'toocostly'],
    match({ record, prod, dev }) {
      if (record.prod.status !== 200 || record.dev.status !== 400) return null;
      if (!/\$expand/.test(record.url)) return null;
      // Prod must have the valueset-toocostly extension
      if (!prod?.expansion?.extension?.some(e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly')) return null;
      // Dev must be an OperationOutcome with too-costly issue code
      if (dev?.resourceType !== 'OperationOutcome') return null;
      if (!dev?.issue?.some(i => i.code === 'too-costly')) return null;
      return 'skip';
    },
  },

  {
    id: 'snomed-implicit-valueset-expand-404',
    description: 'Dev returns 404 for SNOMED CT implicit ValueSet URLs (fhir_vs pattern). These are FHIR-standard implicit ValueSet URLs that prod handles correctly but dev does not recognize.',
    kind: 'temp-tolerance',
    bugId: '36da928',
    tags: ['skip', 'missing-resource', 'snomed', 'implicit-valueset'],
    match({ record }) {
      if (record.dev.status !== 404 || record.prod.status !== 200) return null;
      // Match URLs containing the SNOMED CT implicit ValueSet fhir_vs pattern
      if (/fhir_vs/.test(decodeURIComponent(record.url))) return 'skip';
      return null;
    },
  },

];

module.exports = { tolerances, getParamValue };
