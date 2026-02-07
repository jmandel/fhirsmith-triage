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

];

module.exports = { tolerances, getParamValue };
