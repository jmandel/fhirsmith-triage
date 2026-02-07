'use strict';

/**
 * Unified tolerance definitions for the tx-compare comparison engine.
 *
 * Each tolerance is a self-contained object describing one class of known
 * difference between prod (tx.fhir.org) and dev (FHIRsmith) responses.
 *
 * ## Tolerance object shape
 *
 *   {
 *     id:          string,                  // unique identifier
 *     description: string,                  // human-readable explanation
 *     kind:        'equiv-autofix' | 'temp-tolerance',
 *     bugId:       string | string[],       // only for temp-tolerance; git-bug ID(s)
 *     match:       (ctx) => 'skip' | 'normalize' | null,
 *     normalize:   (ctx) => { prod, dev },  // only called when match returns 'normalize'
 *   }
 *
 * ## Context object (ctx)
 *
 * Every match() and normalize() function receives a single ctx object:
 *
 *   {
 *     record: {                // the full NDJSON log line
 *       url:     string,       // request URL (GET params in URL; POST has trailing ?)
 *       method:  string,       // 'GET' | 'POST'
 *       prod:    { status, contentType, size, hash },
 *       dev:     { status, contentType, size, hash },
 *       prodBody: string,      // raw response body (unparsed JSON string)
 *       devBody:  string,      // raw response body (unparsed JSON string)
 *       requestBody: string,   // raw request body (when available; not yet captured)
 *     },
 *     prod: object | null,     // parsed prodBody (null if unparseable)
 *     dev:  object | null,     // parsed devBody  (null if unparseable)
 *   }
 *
 * ## Kinds
 *
 *   - equiv-autofix:   Non-substantive difference. The two responses are
 *                      semantically equivalent; the tolerance corrects for
 *                      cosmetic/structural noise (JSON key order, server
 *                      UUIDs, parameter ordering, etc.). Permanent.
 *
 *   - temp-tolerance:  A real, meaningful difference that is being suppressed
 *                      for triage efficiency. Each has a bugId linking to a
 *                      git-bug issue tracking the underlying problem. These
 *                      are NOT equivalent — they're known patterns we stop
 *                      re-triaging until the bug is fixed.
 *
 * ## Ordering
 *
 * Tolerances are applied in array order. The ordering is:
 *   A. Skip tolerances (short-circuit before any normalization)
 *   B. Structural cleanup (issue/extension normalization before content transforms)
 *   C. Content-specific normalizations (strip/transform specific fields)
 *   D. Sorting (after all content transforms, so sort keys are stable)
 *   E. Bundle-level normalization (self-contained, runs last)
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

function getSystem(params) {
  return getParamValue(params, 'system');
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

/**
 * Walk a parsed response body and apply `fn` to every OperationOutcome found,
 * including those nested inside Parameters.parameter[].resource.
 */
function transformOperationOutcomes(obj, fn) {
  if (!obj || typeof obj !== 'object') return obj;
  let result = obj;
  if (result.resourceType === 'OperationOutcome') {
    result = fn(result);
  }
  if (result.parameter && Array.isArray(result.parameter)) {
    const mapped = result.parameter.map(p => {
      if (p.resource) {
        return { ...p, resource: transformOperationOutcomes(p.resource, fn) };
      }
      return p;
    });
    result = { ...result, parameter: mapped };
  }
  return result;
}

/**
 * Walk a parsed response body and apply `fn` to every ValueSet with an
 * expansion, including those nested inside Parameters.
 */
function transformExpansions(obj, fn) {
  if (!obj || typeof obj !== 'object') return obj;
  let result = obj;
  if (result.resourceType === 'ValueSet' && result.expansion) {
    result = fn(result);
  }
  if (result.parameter && Array.isArray(result.parameter)) {
    const mapped = result.parameter.map(p => {
      if (p.resource) {
        return { ...p, resource: transformExpansions(p.resource, fn) };
      }
      return p;
    });
    result = { ...result, parameter: mapped };
  }
  return result;
}

/** Apply fn to both sides, return { prod, dev }. */
function both(ctx, fn) {
  return { prod: fn(ctx.prod), dev: fn(ctx.dev) };
}

// ---- Tolerance definitions ----

const tolerances = [

  // ============================================================
  // Phase A: Skip tolerances
  // ============================================================

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
    id: 'skip-truncated',
    description: 'Response body truncated at ~50K chars during capture. 277 total records. Need re-capture with higher limit.',
    kind: 'temp-tolerance',
    bugId: ['abb1fe1', 'c10fd57'],
    match({ record }) {
      const TRUNC = 49990;
      if (record.prodBody && record.prodBody.length >= TRUNC) return 'skip';
      if (record.devBody && record.devBody.length >= TRUNC) return 'skip';
      return null;
    },
  },

  // ============================================================
  // Phase B: Structural cleanup
  // ============================================================

  // T06: Strip empty/null location and expression from OperationOutcome issues
  {
    id: 'strip-empty-location-expression',
    description: 'Dev emits location:[""] and expression:[""] on OperationOutcome issues where prod omits them. Empty strings are invalid FHIR. Also handles location:[null]/expression:[null]. ~260 P6 records.',
    kind: 'temp-tolerance',
    bugId: 'a151f3c',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            const fixed = { ...issue };
            if (Array.isArray(fixed.location) &&
                fixed.location.length === 1 &&
                (fixed.location[0] === '' || fixed.location[0] === null)) {
              delete fixed.location;
            }
            if (Array.isArray(fixed.expression) &&
                fixed.expression.length === 1 &&
                (fixed.expression[0] === '' || fixed.expression[0] === null)) {
              delete fixed.expression;
            }
            return fixed;
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // T07: Normalize OperationOutcome issue extensions
  {
    id: 'normalize-issue-extensions',
    description: 'Strip operationoutcome-message-id extensions (server metadata) and sort remaining extensions by URL for stable comparison.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            const fixed = { ...issue };
            if (fixed.extension) {
              fixed.extension = fixed.extension.filter(e =>
                !(e.url || '').includes('operationoutcome-message-id')
              );
              if (fixed.extension.length === 0) {
                delete fixed.extension;
              }
            }
            if (fixed.extension) {
              fixed.extension = [...fixed.extension].sort((a, b) =>
                (a.url || '').localeCompare(b.url || '')
              );
            }
            return fixed;
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // T08: Sort coding arrays in OperationOutcome issue details
  {
    id: 'normalize-issue-coding-order',
    description: 'Sort details.coding arrays by system|code for stable comparison.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            if (!issue.details?.coding) return issue;
            return {
              ...issue,
              details: {
                ...issue.details,
                coding: [...issue.details.coding].sort((a, b) =>
                  `${a.system}|${a.code}`.localeCompare(`${b.system}|${b.code}`)
                ),
              },
            };
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // ============================================================
  // Phase C: Content-specific normalizations
  // ============================================================

  // T09: Strip diagnostics parameter
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

  // T10: Strip version parameter
  {
    id: 'strip-version-param',
    description: 'Version parameter differs due to different terminology editions loaded (SNOMED, LOINC, etc). 438 P6 records.',
    kind: 'temp-tolerance',
    bugId: '7b80bc3',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'version'));
    },
  },

  // T11: Strip definition/designation from $lookup responses
  {
    id: 'strip-lookup-definition-designation',
    description: 'Version difference (v2-0360 2.0.0 vs 3.0.0) causes extra definition/designation parameters and property(definition) diffs in $lookup. 157 P6 records.',
    kind: 'temp-tolerance',
    bugId: '7b80bc3',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function strip(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter
            .filter(p => p.name !== 'definition' && p.name !== 'designation')
            .filter(p => !(p.name === 'property' && p.part &&
              p.part.some(pp => pp.name === 'code' && pp.valueCode === 'definition'))),
        };
      }
      return both(ctx, strip);
    },
  },

  // T12: Strip message parameter
  {
    id: 'strip-message-param',
    description: 'Message parameter in validate-code responses has inconsistent behavior between prod and dev. 184 P6 records.',
    kind: 'temp-tolerance',
    bugId: '80a3a59',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'message'));
    },
  },

  // T13: Normalize version strings in OperationOutcome issue text
  {
    id: 'normalize-version-in-issue-text',
    description: "Version strings in issue text differ due to different terminology editions. Same root cause as strip-version-param. ~15 P6 records.",
    kind: 'temp-tolerance',
    bugId: '7b80bc3',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            if (!issue.details?.text) return issue;
            return {
              ...issue,
              details: {
                ...issue.details,
                text: issue.details.text.replace(/version '([^']*)'/g, "version '<VERSION>'"),
              },
            };
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // T14: Normalize "Wrong Display Name" alternatives in issue text
  {
    id: 'normalize-display-alternatives-in-issue-text',
    description: "Wrong Display Name issue text differs in how many valid display alternatives are listed. Prod lists 1, dev lists multiple. 31 P6 records.",
    kind: 'temp-tolerance',
    bugId: '3b162b8',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            if (!issue.details?.text) return issue;
            const text = issue.details.text.replace(
              /Valid display is (one of \d+ choices: )?'[^']*'(?: \([^)]*\))?(?:,? (?:or )?'[^']*'(?: \([^)]*\))?)*(?: \(for the language\(s\) '[^']*'\))?/g,
              "Valid display is <DISPLAY_ALTERNATIVES>"
            );
            return {
              ...issue,
              details: { ...issue.details, text },
            };
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // T15: Strip informational "Code X not found in Y" issues
  {
    id: 'strip-info-not-found-issue',
    description: "Dev omits informational 'Code X not found in Y' OperationOutcome issues that prod generates. 27 P6 records.",
    kind: 'temp-tolerance',
    bugId: 'e566efc',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.filter(i =>
            !(i.severity === 'information' && i.code === 'code-invalid' &&
              (i.details?.text || '').match(/not found in /))
          ),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },

  // T16: Strip UCUM display parameter
  {
    id: 'strip-ucum-display',
    description: "UCUM display text selection differs: prod returns code symbol ('%', '[in_i]'), dev returns print name ('(percent)', '(inch)'). 220 P6 records.",
    kind: 'temp-tolerance',
    bugId: '94d94ac',
    match({ prod }) {
      return getSystem(prod) === 'http://unitsofmeasure.org' ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'display'));
    },
  },

  // T17: Strip SNOMED display (both Parameters and expansion contains)
  {
    id: 'strip-snomed-display',
    description: 'SNOMED display text selection differs between prod and dev (FSN vs PT). 274 P6 records (134 expand, 140 validate-code).',
    kind: 'temp-tolerance',
    bugId: '01da2dd',
    match({ prod, dev }) {
      if (getSystem(prod) === 'http://snomed.info/sct') return 'normalize';
      // Also match ValueSet expansions containing SNOMED entries
      const hasSnomedExpansion = (body) =>
        body?.resourceType === 'ValueSet' &&
        body?.expansion?.contains?.some(c => c.system === 'http://snomed.info/sct');
      if (hasSnomedExpansion(prod) || hasSnomedExpansion(dev)) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function stripFromParams(body) {
        if (getSystem(body) === 'http://snomed.info/sct') {
          return stripParams(body, 'display');
        }
        return body;
      }
      function stripFromExpansion(vs) {
        if (!vs.expansion?.contains) return vs;
        return {
          ...vs,
          expansion: {
            ...vs.expansion,
            contains: vs.expansion.contains.map(c => {
              if (c.system === 'http://snomed.info/sct') {
                const copy = { ...c };
                delete copy.display;
                return copy;
              }
              return c;
            }),
          },
        };
      }
      return {
        prod: transformExpansions(stripFromParams(ctx.prod), stripFromExpansion),
        dev: transformExpansions(stripFromParams(ctx.dev), stripFromExpansion),
      };
    },
  },

  // T18: Strip NDC inactive and issues parameters
  {
    id: 'strip-ndc-inactive-issues',
    description: "Dev returns extra 'inactive: true' and 'issues' for NDC codes in validate-code. Related to NDC version difference. 16 P6 records.",
    kind: 'temp-tolerance',
    bugId: 'acaf908',
    match({ prod }) {
      return getSystem(prod) === 'http://hl7.org/fhir/sid/ndc' ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'inactive', 'issues'));
    },
  },

  // T19: Strip display for unknown system failures
  {
    id: 'strip-display-unknown-system',
    description: "Dev returns display parameter for unknown code systems in validate-code where prod omits it. 73 P6 records.",
    kind: 'temp-tolerance',
    bugId: '94942b1',
    match({ prod }) {
      if (!prod?.parameter) return null;
      const hasUnknown = prod.parameter.some(p => p.name === 'x-caused-by-unknown-system');
      const resultFalse = prod.parameter.some(p => p.name === 'result' && p.valueBoolean === false);
      return (hasUnknown && resultFalse) ? 'normalize' : null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'display'));
    },
  },

  // T20: Strip expansion metadata (timestamp, identifier, includeDefinition, empty id)
  {
    id: 'strip-expansion-metadata',
    description: 'Expansion metadata (timestamp, identifier, includeDefinition=false default, empty id) are cosmetic server-generated differences.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      const hasExpansion = (body) => body?.resourceType === 'ValueSet' && body?.expansion;
      return (hasExpansion(prod) || hasExpansion(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function fixExpansion(vs) {
        if (!vs.expansion) return vs;
        const result = { ...vs };
        const exp = { ...vs.expansion };
        delete exp.timestamp;
        delete exp.identifier;
        if (exp.parameter) {
          exp.parameter = exp.parameter.filter(p =>
            !(p.name === 'includeDefinition' && p.valueBoolean === false)
          );
        }
        if (result.id === '') {
          delete result.id;
        }
        result.expansion = exp;
        return result;
      }
      return both(ctx, body => transformExpansions(body, fixExpansion));
    },
  },

  // ============================================================
  // Phase D: Sorting (after all content transforms)
  // ============================================================

  // T21: Sort parameters by name
  {
    id: 'sort-parameters',
    description: 'Parameter ordering in FHIR Parameters resources is not semantically meaningful.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return (isParameters(prod) || isParameters(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function sortParams(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: [...body.parameter].sort((a, b) => a.name.localeCompare(b.name)),
        };
      }
      return both(ctx, sortParams);
    },
  },

  // T22: Sort OperationOutcome issues by severity|code|details.text
  {
    id: 'sort-operation-outcome-issues',
    description: 'Sort OperationOutcome issues for stable comparison (ordering may differ between implementations).',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      if (prod?.resourceType === 'OperationOutcome') return 'normalize';
      if (dev?.resourceType === 'OperationOutcome') return 'normalize';
      if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return 'normalize';
      return null;
    },
    normalize(ctx) {
      function sortIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: [...oo.issue].sort((a, b) => {
            const aKey = `${a.severity}|${a.code}|${a.details?.text || ''}`;
            const bKey = `${b.severity}|${b.code}|${b.details?.text || ''}`;
            return aKey.localeCompare(bKey);
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, sortIssues));
    },
  },

  // T23: Sort expansion contains by system|code
  {
    id: 'sort-expansion-contains',
    description: 'Sort ValueSet expansion contains by system|code for stable comparison.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      const hasContains = (body) =>
        body?.resourceType === 'ValueSet' && body?.expansion?.contains;
      return (hasContains(prod) || hasContains(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function sortContains(vs) {
        if (!vs.expansion?.contains) return vs;
        return {
          ...vs,
          expansion: {
            ...vs.expansion,
            contains: [...vs.expansion.contains].sort((a, b) =>
              `${a.system}|${a.code}`.localeCompare(`${b.system}|${b.code}`)
            ),
          },
        };
      }
      return both(ctx, body => transformExpansions(body, sortContains));
    },
  },

  // ============================================================
  // Phase E: Bundle-level normalization
  // ============================================================

  // T24: Normalize empty searchset Bundles
  {
    id: 'normalize-empty-searchset-bundle',
    description: 'Strip server-generated metadata (id, meta, link, empty entry) from empty searchset Bundles. 491 P6 records.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      const isEmptySearchset = (body) =>
        body?.resourceType === 'Bundle' && body?.type === 'searchset' && body?.total === 0;
      return (isEmptySearchset(prod) || isEmptySearchset(dev)) ? 'normalize' : null;
    },
    normalize(ctx) {
      function fix(body) {
        if (!body || body.resourceType !== 'Bundle') return body;
        if (body.type !== 'searchset') return body;
        if (body.total !== 0) return body;
        const result = { ...body };
        delete result.id;
        delete result.meta;
        delete result.link;
        if (Array.isArray(result.entry) && result.entry.length === 0) {
          delete result.entry;
        }
        return result;
      }
      return both(ctx, fix);
    },
  },
];

module.exports = { tolerances, getParamValue };
