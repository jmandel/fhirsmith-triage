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
 *       requestBody: string,   // raw request body (when available)
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

function hasOperationOutcome(prod, dev) {
  if (prod?.resourceType === 'OperationOutcome') return true;
  if (dev?.resourceType === 'OperationOutcome') return true;
  if (prod?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return true;
  if (dev?.parameter?.some(p => p.resource?.resourceType === 'OperationOutcome')) return true;
  return false;
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
    id: 'skip-truncated-body',
    description: 'Response body truncated at 50k chars during recording, producing invalid JSON. 277 P6 records affected.',
    kind: 'temp-tolerance',
    bugId: 'dc6c82a',
    match({ record }) {
      if (record.prodBody && record.prodBody.length === 50000) return 'skip';
      if (record.devBody && record.devBody.length === 50000) return 'skip';
      return null;
    },
  },

  // ============================================================
  // Phase A (cont.): Temp-tolerance skips
  // ============================================================

  {
    id: 'temp-vsac-op-modifier',
    description: 'Dev fails on ValueSets with vsacOpModifier extension in exclude[0].filter. Returns business-rule error instead of properly validating the code. Affects 3 P6 validate-code records.',
    kind: 'temp-tolerance',
    bugId: 'bb9bee9',
    match({ record, dev }) {
      if (!/\$validate-code/.test(record.url)) return null;
      const devMsg = getParamValue(dev, 'message');
      if (typeof devMsg === 'string' && devMsg.includes('vsacOpModifier')) return 'skip';
      return null;
    },
  },

  {
    id: 'temp-v2-0360-version-mismatch',
    description: 'v2-0360 CodeSystem version mismatch: prod has 2.0.0, dev has 3.0.0. All 157 $lookup records for this CodeSystem differ only in version, extra definition, and extra designation.',
    kind: 'temp-tolerance',
    bugId: '52e1690',
    match({ record, prod, dev }) {
      if (!/\$lookup/.test(record.url)) return null;
      if (!/v2-0360/.test(record.url)) return null;
      const prodVersion = getParamValue(prod, 'version');
      const devVersion = getParamValue(dev, 'version');
      if (prodVersion === '2.0.0' && devVersion === '3.0.0') return 'skip';
      return null;
    },
  },

  // ============================================================
  // Phase B: Structural cleanup
  // ============================================================

  {
    id: 'temp-empty-string-location-expression',
    description: 'Dev emits location: [""] and expression: [""] on OperationOutcome issues where prod omits these fields. Empty strings are invalid FHIR. Affects 260 P6 records.',
    kind: 'temp-tolerance',
    bugId: '92514c0',
    match({ prod, dev }) {
      return hasOperationOutcome(prod, dev) ? 'normalize' : null;
    },
    normalize(ctx) {
      function fixIssues(oo) {
        if (!oo.issue) return oo;
        return {
          ...oo,
          issue: oo.issue.map(issue => {
            const fixed = { ...issue };
            if (Array.isArray(fixed.location) && fixed.location.every(l => l === '')) {
              delete fixed.location;
            }
            if (Array.isArray(fixed.expression) && fixed.expression.every(e => e === '')) {
              delete fixed.expression;
            }
            return fixed;
          }),
        };
      }
      return both(ctx, body => transformOperationOutcomes(body, fixIssues));
    },
  },


  {
    id: 'normalize-issue-extensions',
    description: 'Strip operationoutcome-message-id extensions (server metadata) and sort remaining extensions by URL for stable comparison.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return hasOperationOutcome(prod, dev) ? 'normalize' : null;
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

  {
    id: 'normalize-issue-coding-order',
    description: 'Sort details.coding arrays by system|code for stable comparison.',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return hasOperationOutcome(prod, dev) ? 'normalize' : null;
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
    id: 'temp-snomed-version-mismatch',
    description: 'SNOMED CT version mismatch: dev loads older editions than prod. International: 20250201 vs 20240201, US: 20250901 vs 20230301. Affects validate-code (281 records) and expand (4 records) where used-codesystem version differs.',
    kind: 'temp-tolerance',
    bugId: '4abd03a',
    match({ record, prod, dev }) {
      const snomedVersionRe = /^http:\/\/snomed\.info\/sct\/\d+\/version\/\d+$/;
      // $validate-code: version parameter on Parameters
      if (/\$validate-code/.test(record.url)) {
        if (!isParameters(prod) || !isParameters(dev)) return null;
        const prodVersion = getParamValue(prod, 'version');
        const devVersion = getParamValue(dev, 'version');
        if (!prodVersion || !devVersion || prodVersion === devVersion) return null;
        if (snomedVersionRe.test(prodVersion) && snomedVersionRe.test(devVersion)) return 'normalize';
      }
      // $expand: used-codesystem parameter in expansion.parameter
      if (/\$expand/.test(record.url)) {
        const prodParams = prod?.expansion?.parameter;
        const devParams = dev?.expansion?.parameter;
        if (!prodParams || !devParams) return null;
        const prodUsed = prodParams.find(p => p.name === 'used-codesystem')?.valueUri;
        const devUsed = devParams.find(p => p.name === 'used-codesystem')?.valueUri;
        if (!prodUsed || !devUsed || prodUsed === devUsed) return null;
        const prodVer = prodUsed.match(/snomed\.info\/sct\/\d+\/version\/\d+/);
        const devVer = devUsed.match(/snomed\.info\/sct\/\d+\/version\/\d+/);
        if (prodVer && devVer) return 'normalize';
      }
      return null;
    },
    normalize(ctx) {
      // $validate-code: strip version parameter from Parameters
      if (/\$validate-code/.test(ctx.record.url)) {
        return both(ctx, body => stripParams(body, 'version'));
      }
      // $expand: strip used-codesystem from expansion parameters
      return both(ctx, body => {
        return transformExpansions(body, vs => {
          if (!vs.expansion?.parameter) return vs;
          return {
            ...vs,
            expansion: {
              ...vs.expansion,
              parameter: vs.expansion.parameter.filter(p => p.name !== 'used-codesystem'),
            },
          };
        });
      });
    },
  },

  {
    id: 'temp-validate-code-display-differs',
    description: 'validate-code display parameter differs between prod and dev across UCUM (prod echoes code, dev returns name), SNOMED (different preferred terms), and BCP47 (format). 286 display-only P6 records.',
    kind: 'temp-tolerance',
    bugId: '5c34436',
    match({ record, prod, dev }) {
      if (!/\$validate-code/.test(record.url)) return null;
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodDisplay = getParamValue(prod, 'display');
      const devDisplay = getParamValue(dev, 'display');
      if (prodDisplay !== undefined && devDisplay !== undefined && prodDisplay !== devDisplay) return 'normalize';
      return null;
    },
    normalize(ctx) {
      return both(ctx, body => stripParams(body, 'display'));
    },
  },

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

  {
    id: 'sort-operation-outcome-issues',
    description: 'Sort OperationOutcome issues for stable comparison (ordering may differ between implementations).',
    kind: 'equiv-autofix',
    match({ prod, dev }) {
      return hasOperationOutcome(prod, dev) ? 'normalize' : null;
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

  {
    id: 'normalize-empty-searchset-bundle',
    description: 'Strip server-generated metadata (id, meta, link, empty entry) from empty searchset Bundles.',
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
