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

  // Skip: not FHIR terminology content
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

  // Strip: trace output that differs by design
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

  // Phase D: Sort — stable ordering after all transforms
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

  // Phase B: Structural — clean up structure before content transforms
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

  // Phase C: Content — temp-tolerances for known bugs
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
