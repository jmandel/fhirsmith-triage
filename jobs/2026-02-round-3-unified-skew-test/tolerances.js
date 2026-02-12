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

// ---- Version skew detection and normalization ----
// Unified handler for all version-skew patterns: SNOMED, HL7 terminology, CPT, NDC, v2 tables.
// Replaces 18 individual version-skew tolerances (12 in round-3, 6 in round-2 only).
// GG adjudicated: version skew is by design (round-1 bugs 5b3ae71 "By design — VSAC", be888eb "Dev is correct").

function hasRawVersionSkew(record) {
  try {
    const rawProd = JSON.parse(record.prodBody);
    const rawDev = JSON.parse(record.devBody);
    const getUris = (body) => (body.expansion?.parameter || [])
      .filter(p => p.name === 'used-codesystem').map(p => p.valueUri).sort();
    const prodUris = getUris(rawProd);
    const devUris = getUris(rawDev);
    if (prodUris.length && devUris.length &&
        JSON.stringify(prodUris) !== JSON.stringify(devUris)) return true;
    const prodVers = new Set((rawProd.expansion?.contains || []).map(c => c.version).filter(Boolean));
    const devVers = new Set((rawDev.expansion?.contains || []).map(c => c.version).filter(Boolean));
    if (prodVers.size && devVers.size &&
        JSON.stringify([...prodVers].sort()) !== JSON.stringify([...devVers].sort())) return true;
  } catch { /* ignore parse errors */ }
  return false;
}

function urlHasPinnedVersion(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  if (/[?&](version|system-version|force-system-version|check-system-version|valuesetversion|codesystemversion)=/.test(lower)) {
    return true;
  }
  // Canonical params with explicit |version (including percent-encoded)
  if (/[?&](url|system|valueset|codesystem|coding)=[^&]*(\||%7c)/.test(lower)) {
    return true;
  }
  return false;
}

function bodyHasPinnedVersion(requestBody) {
  if (!requestBody) return false;
  let body;
  try {
    body = JSON.parse(requestBody);
  } catch {
    return false;
  }

  function scan(node) {
    if (!node || typeof node !== 'object') return false;
    if (Array.isArray(node)) return node.some(scan);

    if (node.resourceType === 'Parameters' && Array.isArray(node.parameter)) {
      for (const p of node.parameter) {
        const name = (p?.name || '').toLowerCase();
        if (['version', 'system-version', 'force-system-version', 'check-system-version', 'valuesetversion', 'codesystemversion'].includes(name)) {
          return true;
        }
        for (const key of ['valueUri', 'valueCanonical']) {
          const v = p?.[key];
          if (typeof v === 'string' && v.includes('|')) return true;
        }
        if (scan(p?.part) || scan(p?.resource)) return true;
      }
    }

    if (node.resourceType === 'ValueSet') {
      const groups = [...(node?.compose?.include || []), ...(node?.compose?.exclude || [])];
      if (groups.some(g => typeof g?.version === 'string' && g.version)) return true;
      if (groups.some(g => (g?.valueSet || []).some(v => typeof v === 'string' && v.includes('|')))) return true;
    }

    for (const [key, value] of Object.entries(node)) {
      if (typeof value === 'string') {
        const k = key.toLowerCase();
        if ((k === 'url' || k === 'system' || k === 'valueset' || k === 'codesystem' || k.endsWith('uri') || k.endsWith('canonical')) &&
            value.includes('|')) {
          return true;
        }
      } else if (scan(value)) {
        return true;
      }
    }
    return false;
  }

  return scan(body);
}

function isVersionPinnedRequest(record) {
  return urlHasPinnedVersion(record?.url || '') || bodyHasPinnedVersion(record?.requestBody);
}

function detectVersionSkew({ record, prod, dev }) {
  // Respect explicitly pinned version requests: these are not "default edition" skew.
  if (isVersionPinnedRequest(record)) return null;

  // --- Parameters responses (validate-code, lookup) ---
  if (isParameters(prod) && isParameters(dev)) {
    const prodVer = getParamValue(prod, 'version');
    const devVer = getParamValue(dev, 'version');
    const prodResult = getParamValue(prod, 'result');
    const devResult = getParamValue(dev, 'result');

    // Hard evidence: explicit version parameter mismatch.
    if (prodVer && devVer && prodVer !== devVer) {
      if (prodResult !== undefined && devResult !== undefined && prodResult !== devResult) {
        try {
          const rawProd = JSON.parse(record.prodBody);
          const rawDev = JSON.parse(record.devBody);
          const rawPV = getParamValue(rawProd, 'version') || '';
          const rawDV = getParamValue(rawDev, 'version') || '';
          if ((rawPV.includes('snomed.info/sct') || rawDV.includes('snomed.info/sct')) &&
              rawPV !== rawDV) return 'skip';
        } catch { /* fall through to normalize */ }
      }
      return 'normalize';
    }

    // Hard evidence: result disagreement with raw SNOMED edition mismatch.
    if (prodResult !== undefined && devResult !== undefined && prodResult !== devResult) {
      try {
        const rawProd = JSON.parse(record.prodBody);
        const rawDev = JSON.parse(record.devBody);
        const rawPV = getParamValue(rawProd, 'version') || '';
        const rawDV = getParamValue(rawDev, 'version') || '';
        if ((rawPV.includes('snomed.info/sct') || rawDV.includes('snomed.info/sct')) &&
            rawPV !== rawDV) return 'skip';
      } catch { /* not version skew */ }
    }
  }

  // --- ValueSet responses (expand) ---
  if (prod?.resourceType === 'ValueSet' && dev?.resourceType === 'ValueSet' &&
      record.prod.status === 200 && record.dev.status === 200) {
    const prodParams = prod.expansion?.parameter || [];
    const devParams = dev.expansion?.parameter || [];

    // used-codesystem version differs
    const prodUcs = prodParams.filter(p => p.name === 'used-codesystem').map(p => p.valueUri).sort();
    const devUcs = devParams.filter(p => p.name === 'used-codesystem').map(p => p.valueUri).sort();
    if (prodUcs.length && devUcs.length && JSON.stringify(prodUcs) !== JSON.stringify(devUcs)) return 'normalize';

    // used-valueset version differs
    const prodUvs = prodParams.filter(p => p.name === 'used-valueset').map(p => p.valueUri).sort();
    const devUvs = devParams.filter(p => p.name === 'used-valueset').map(p => p.valueUri).sort();
    if (prodUvs.length && devUvs.length && JSON.stringify(prodUvs) !== JSON.stringify(devUvs)) return 'normalize';

    // Hard evidence: contains version/membership differences.
    if (prod.expansion?.contains?.length && dev.expansion?.contains?.length) {
      const prodCodes = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
      const devCodes = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));
      if (prodCodes.size === devCodes.size && [...prodCodes].every(k => devCodes.has(k))) {
        const prodVerMap = {};
        for (const c of prod.expansion.contains) prodVerMap[c.system + '|' + c.code] = c.version;
        for (const c of dev.expansion.contains) {
          if (prodVerMap[c.system + '|' + c.code] !== c.version) return 'normalize';
        }
      } else {
        if (hasRawVersionSkew(record)) return 'normalize';
      }
    }

  }

  return null;
}

function normalizeValidateCodeVersionSkew({ prod, dev }) {
  if (!prod?.parameter || !dev?.parameter) return { prod, dev };
  const newProd = prod;
  let newDev = dev;

  // Determine target version from prod
  const prodVer = getParamValue(prod, 'version');
  let targetVer = prodVer;
  if (!targetVer) {
    const prodMsg = getParamValue(prod, 'message') || '';
    const m = prodMsg.match(/version '([^']*)'/);
    if (m) targetVer = m[1];
  }

  // Normalize version param to prod value
  if (targetVer && getParamValue(newDev, 'version') &&
      getParamValue(newDev, 'version') !== targetVer) {
    newDev = {
      ...newDev,
      parameter: newDev.parameter.map(p =>
        p.name === 'version' ? { ...p, valueString: targetVer } : p
      ),
    };
  }

  // Version string replacement in text
  const prodMsg = getParamValue(prod, 'message') || '';
  const snomedRe = /snomed\.info\/sct\/\d+\/version\/\d+/g;
  const prodSnomedVers = prodMsg.match(snomedRe) || [];

  function normalizeText(text) {
    if (!text) return text;
    // SNOMED version URIs
    const textSnomedVers = text.match(snomedRe) || [];
    for (let i = 0; i < textSnomedVers.length; i++) {
      if (prodSnomedVers[i] && textSnomedVers[i] !== prodSnomedVers[i]) {
        text = text.split(textSnomedVers[i]).join(prodSnomedVers[i]);
      }
    }
    if (targetVer) {
      text = text.replace(/version '[^']*'/g, "version '" + targetVer + "'");
      text = text.replace(/terminology\.hl7\.org\/(?:CodeSystem|ValueSet)\/[^|]*\|[^\s"']*/g, (m) =>
        m.split('|')[0] + '|' + targetVer
      );
    }
    return text;
  }

  function normalizeBody(body) {
    if (!body?.parameter) return body;
    return {
      ...body,
      parameter: body.parameter.map(p => {
        if (p.name === 'message' && p.valueString) {
          return { ...p, valueString: normalizeText(p.valueString) };
        }
        if (p.name === 'issues' && p.resource?.issue) {
          return {
            ...p,
            resource: {
              ...p.resource,
              issue: p.resource.issue.map(iss => iss.details?.text
                ? { ...iss, details: { ...iss.details, text: normalizeText(iss.details.text) } }
                : iss
              ),
            },
          };
        }
        return p;
      }),
    };
  }

  return { prod: normalizeBody(newProd), dev: normalizeBody(newDev) };
}

function normalizeExpandVersionSkew({ prod, dev }) {
  let newProd = { ...prod, expansion: { ...prod.expansion } };
  let newDev = { ...dev, expansion: { ...dev.expansion } };

  // Build version maps from prod parameters
  const versionMaps = { cs: new Map(), vs: new Map() };
  for (const p of (prod.expansion?.parameter || [])) {
    if (p.name === 'used-codesystem' && p.valueUri)
      versionMaps.cs.set(p.valueUri.split('|')[0], p.valueUri);
    if (p.name === 'used-valueset' && p.valueUri)
      versionMaps.vs.set(p.valueUri.split('|')[0], p.valueUri);
  }

  // Normalize used-codesystem and used-valueset versions to prod
  function normalizeParams(params) {
    if (!params) return params;
    return params
      .map(p => {
        if (p.name === 'used-codesystem' && p.valueUri) {
          const base = p.valueUri.split('|')[0];
          const prodUri = versionMaps.cs.get(base);
          if (prodUri && prodUri !== p.valueUri) return { ...p, valueUri: prodUri };
        }
        if (p.name === 'used-valueset' && p.valueUri) {
          const base = p.valueUri.split('|')[0];
          const prodUri = versionMaps.vs.get(base);
          if (prodUri && prodUri !== p.valueUri) return { ...p, valueUri: prodUri };
        }
        return p;
      });
  }
  newProd.expansion.parameter = normalizeParams(newProd.expansion.parameter);
  newDev.expansion.parameter = normalizeParams(newDev.expansion.parameter);

  // Normalize contains
  if (newProd.expansion?.contains?.length && newDev.expansion?.contains?.length) {
    const prodCodes = new Set(newProd.expansion.contains.map(c => c.system + '|' + c.code));
    const devCodes = new Set(newDev.expansion.contains.map(c => c.system + '|' + c.code));
    const prodVerMap = {};
    for (const c of newProd.expansion.contains) prodVerMap[c.system + '|' + c.code] = c.version;

    if (prodCodes.size === devCodes.size && [...prodCodes].every(k => devCodes.has(k))) {
      // Same membership — normalize contains[].version to prod
      newDev.expansion.contains = newDev.expansion.contains.map(c => {
        const key = c.system + '|' + c.code;
        return prodVerMap[key] && prodVerMap[key] !== c.version ? { ...c, version: prodVerMap[key] } : c;
      });
    } else {
      // Different membership — intersect code sets
      const commonKeys = new Set([...prodCodes].filter(k => devCodes.has(k)));
      const filterContains = (contains) => contains.filter(c => commonKeys.has(c.system + '|' + c.code));
      newProd.expansion.contains = filterContains(newProd.expansion.contains);
      newDev.expansion.contains = filterContains(newDev.expansion.contains);
      newProd.expansion.total = commonKeys.size;
      newDev.expansion.total = commonKeys.size;
      newDev.expansion.contains = newDev.expansion.contains.map(c => {
        const key = c.system + '|' + c.code;
        return prodVerMap[key] && prodVerMap[key] !== c.version ? { ...c, version: prodVerMap[key] } : c;
      });
    }
  }

  return { prod: newProd, dev: newDev };
}

function normalizeLookupVersionSkew({ prod, dev }) {
  const prodVer = getParamValue(prod, 'version');
  const devVer = getParamValue(dev, 'version');
  if (!prod?.parameter || !dev?.parameter || !prodVer || !devVer || prodVer === devVer) {
    return { prod, dev };
  }
  return {
    prod,
    dev: {
      ...dev,
      parameter: dev.parameter.map(p =>
        p.name === 'version' ? { ...p, valueString: prodVer } : p
      ),
    },
  };
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
    id: 'version-skew',
    description: 'Unified version-skew tolerance: prod and dev load different editions of terminology code systems ' +
      '(SNOMED, HL7 terminology, CPT, NDC, v2 tables). When the request does not pin a specific version, the servers ' +
      'resolve to different defaults. Detects version differences across all signal locations and dispatches to ' +
      'operation-specific normalizers. Replaces 18 individual version-skew tolerances. ' +
      'GG adjudicated: version skew is by design (round-1 bugs 5b3ae71 "By design — VSAC", be888eb "Dev is correct").',
    kind: 'equiv-autofix',
    adjudication: ['gg'],
    adjudicationText: 'Version skew is by design — servers load different editions',
    tags: ['normalize', 'version-skew'],
    match(ctx) {
      return detectVersionSkew(ctx);
    },
    normalize(ctx) {
      const { record, prod, dev } = ctx;
      if (prod?.resourceType === 'ValueSet' && dev?.resourceType === 'ValueSet') {
        return normalizeExpandVersionSkew(ctx);
      }
      if (isParameters(prod) && isParameters(dev)) {
        if (record.url.includes('$lookup')) return normalizeLookupVersionSkew(ctx);
        return normalizeValidateCodeVersionSkew(ctx);
      }
      return { prod, dev };
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
    id: 'prod-display-comment-default-display-lang',
    description: 'validate-code with displayLanguage: prod returns informational display-comment issues about "is the default display" when no language-specific display exists. Dev either omits issues entirely or had its issues stripped by dev-extra-display-lang-not-found-message. Same root cause as display-lang-result-disagrees — display language handling differs between prod and dev.',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'display-comment'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== true || devResult !== true) return null;
      // Prod has issues with display-comment about "default display"
      const prodIssues = getParamValue(prod, 'issues');
      if (!prodIssues?.issue) return null;
      const hasDefaultDisplayComment = prodIssues.issue.some(iss =>
        iss.severity === 'information' &&
        iss.details?.coding?.some(c => c.code === 'display-comment') &&
        /is the default display/.test(iss.details?.text || '')
      );
      if (!hasDefaultDisplayComment) return null;
      // Dev has no issues (either never had them, or they were stripped)
      const devIssues = getParamValue(dev, 'issues');
      if (devIssues?.issue?.length > 0) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Strip prod's display-comment issues about default display
      return {
        prod: stripParams(prod, 'issues'),
        dev,
      };
    },
  },

  {
    id: 'display-comment-vs-invalid-display-issues',
    description: 'validate-code with displayLanguage: prod has extra display-comment issues in its OperationOutcome that dev lacks. Dev uses invalid-display where prod uses display-comment, with different severity (information vs warning) and text. Both convey the same information — the provided display does not match a language-specific display. Same root cause as display-lang-result-disagrees. Strips display-comment issues from prod and corresponding dev-only invalid-display issues/message.',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'display-comment', 'invalid-display'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      if (!prodIssues?.issue) return null;
      const hasDisplayComment = prodIssues.issue.some(iss =>
        iss.details?.coding?.some(c => c.code === 'display-comment')
      );
      if (!hasDisplayComment) return null;
      // Dev must also have issues (otherwise prod-display-comment-default-display-lang handles it)
      const devIssues = getParamValue(dev, 'issues');
      if (!devIssues?.issue?.length) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      // Strip display-comment issues from prod's OperationOutcome
      function stripDisplayCommentIssues(body) {
        if (!body?.parameter) return body;
        return {
          ...body,
          parameter: body.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            const filtered = p.resource.issue.filter(iss =>
              !iss.details?.coding?.some(c => c.code === 'display-comment')
            );
            if (filtered.length === 0) {
              // No issues left — remove the parameter entirely
              return null;
            }
            return {
              ...p,
              resource: { ...p.resource, issue: filtered },
            };
          }).filter(Boolean),
        };
      }
      // Strip dev-only invalid-display issues that don't exist in prod
      // (i.e., where prod had display-comment instead)
      function stripDevOnlyInvalidDisplay(prodBody, devBody) {
        if (!devBody?.parameter) return devBody;
        const prodIss = getParamValue(prodBody, 'issues');
        const devIss = getParamValue(devBody, 'issues');
        if (!devIss?.issue) return devBody;
        // After stripping display-comment from prod, figure out which dev issues
        // are "extra" invalid-display issues. We compare by issue count:
        // if dev has more invalid-display issues than prod after stripping display-comment,
        // the extras correspond to prod's display-comment entries.
        const strippedProd = stripDisplayCommentIssues(prodBody);
        const strippedProdIss = getParamValue(strippedProd, 'issues');
        const prodIssueCount = strippedProdIss?.issue?.length || 0;
        const devIssueCount = devIss.issue.length;
        if (devIssueCount <= prodIssueCount) return devBody;
        // Dev has more issues — strip the extra invalid-display issues from dev
        // that correspond to display language resolution
        const devInvalidDisplayIndices = [];
        devIss.issue.forEach((iss, idx) => {
          if (iss.details?.coding?.some(c => c.code === 'invalid-display') &&
              /no valid display names found|Wrong Display Name/.test(iss.details?.text || '')) {
            devInvalidDisplayIndices.push(idx);
          }
        });
        // Try to find which dev invalid-display issues don't have a matching prod issue
        // Simple approach: if there are more issues in dev than in prod, remove extra ones
        const extraCount = devIssueCount - prodIssueCount;
        const toRemove = new Set(devInvalidDisplayIndices.slice(0, extraCount));
        if (toRemove.size === 0) return devBody;
        return {
          ...devBody,
          parameter: devBody.parameter.map(p => {
            if (p.name !== 'issues' || !p.resource?.issue) return p;
            const filtered = p.resource.issue.filter((_, idx) => !toRemove.has(idx));
            if (filtered.length === 0) return null;
            return { ...p, resource: { ...p.resource, issue: filtered } };
          }).filter(Boolean),
        };
      }
      // Also strip dev-only message about wrong display name when prod has no message
      function stripDevExtraMessage(prodBody, devBody) {
        const prodMsg = getParamValue(prodBody, 'message');
        const devMsg = getParamValue(devBody, 'message');
        if (prodMsg || !devMsg) return devBody;
        if (!/Wrong Display Name|no valid display names found/i.test(devMsg)) return devBody;
        return stripParams(devBody, 'message');
      }
      let newProd = stripDisplayCommentIssues(prod);
      let newDev = stripDevOnlyInvalidDisplay(newProd, dev);
      newDev = stripDevExtraMessage(newProd, newDev);
      return { prod: newProd, dev: newDev };
    },
  },

  {
    id: 'display-lang-invalid-display-different-coding',
    description: 'validate-code with displayLanguage + multi-coding CodeableConcept: after earlier tolerances strip display-comment from prod and extra issues from dev, both sides have invalid-display issues but referencing different codings (different expression paths and text). Same root cause as display-lang-result-disagrees — prod and dev disagree on which coding triggers the display language warning. Normalizes dev invalid-display issues to match prod.',
    kind: 'temp-tolerance',
    bugId: 'bd89513',
    tags: ['normalize', 'validate-code', 'display-language', 'invalid-display', 'multi-coding'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodIssues = getParamValue(prod, 'issues');
      const devIssues = getParamValue(dev, 'issues');
      if (!prodIssues?.issue || !devIssues?.issue) return null;
      if (prodIssues.issue.length !== devIssues.issue.length) return null;
      // Check if any invalid-display issues differ in text or expression
      let hasDiff = false;
      for (let i = 0; i < prodIssues.issue.length; i++) {
        const pi = prodIssues.issue[i];
        const di = devIssues.issue[i];
        const piIsInvalidDisplay = pi.details?.coding?.some(c => c.code === 'invalid-display');
        const diIsInvalidDisplay = di.details?.coding?.some(c => c.code === 'invalid-display');
        if (piIsInvalidDisplay && diIsInvalidDisplay) {
          if (pi.details?.text !== di.details?.text ||
              JSON.stringify(pi.expression) !== JSON.stringify(di.expression)) {
            hasDiff = true;
          }
        }
      }
      if (!hasDiff) return null;
      return 'normalize';
    },
    normalize({ prod, dev }) {
      const prodIssues = getParamValue(prod, 'issues');
      if (!prodIssues?.issue) return { prod, dev };
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
                  const issIsInvalidDisplay = iss.details?.coding?.some(c => c.code === 'invalid-display');
                  const prodIsInvalidDisplay = prodIss.details?.coding?.some(c => c.code === 'invalid-display');
                  if (!issIsInvalidDisplay || !prodIsInvalidDisplay) return iss;
                  // Canonicalize to prod's text and expression
                  return {
                    ...iss,
                    details: { ...iss.details, text: prodIss.details?.text },
                    expression: prodIss.expression,
                  };
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
    id: 'expand-toocostly-extension-and-used-codesystem',
    description: 'Dev omits valueset-toocostly extension on $expand of grammar-based code systems (BCP-13 MIME types, all-languages) where expansion returns total=0. Prod marks these with expansion.extension valueset-toocostly: true; dev does not. Dev also adds a used-codesystem parameter that prod omits. Both differences always co-occur on grammar-based code systems that cannot be enumerated.',
    kind: 'temp-tolerance',
    bugId: 'c7004d3',
    tags: ['normalize', 'expand', 'toocostly', 'used-codesystem'],
    match({ prod, dev }) {
      if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') return null;
      if (!prod?.expansion || !dev?.expansion) return null;
      // Check if prod has valueset-toocostly extension but dev doesn't
      const prodHasTooCostly = prod.expansion.extension?.some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
      );
      const devHasTooCostly = dev.expansion.extension?.some(
        e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
      );
      if (prodHasTooCostly && !devHasTooCostly) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Strip valueset-toocostly extension from prod
      let prodExp = { ...prod.expansion };
      if (prodExp.extension) {
        const filtered = prodExp.extension.filter(
          e => e.url !== 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
        );
        if (filtered.length === 0) {
          delete prodExp.extension;
        } else {
          prodExp.extension = filtered;
        }
      }
      // Strip dev-only used-codesystem parameters
      let devExp = { ...dev.expansion };
      if (devExp.parameter) {
        const prodUsedCs = new Set(
          (prod.expansion.parameter || [])
            .filter(p => p.name === 'used-codesystem')
            .map(p => p.valueUri)
        );
        devExp.parameter = devExp.parameter.filter(p => {
          if (p.name !== 'used-codesystem') return true;
          return prodUsedCs.has(p.valueUri);
        });
      }
      return {
        prod: { ...prod, expansion: prodExp },
        dev: { ...dev, expansion: devExp },
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

  {
    id: 'cc-validate-code-missing-known-coding-params',
    description: 'POST CodeSystem/$validate-code with multi-coding CodeableConcept where one coding has an unknown system version: prod validates the known coding and returns system/code/display params for it plus any related informational issues. Dev omits these params entirely. Both sides agree result=false and have the same x-caused-by-unknown-system. Normalizes by copying prod\'s code/system/display params and extra issues to dev.',
    kind: 'temp-tolerance',
    bugId: 'b6d19d8',
    tags: ['normalize', 'validate-code', 'multi-coding', 'missing-params', 'x-caused-by-unknown-system'],
    match({ prod, dev }) {
      if (!isParameters(prod) || !isParameters(dev)) return null;
      const prodResult = getParamValue(prod, 'result');
      const devResult = getParamValue(dev, 'result');
      if (prodResult !== false || devResult !== false) return null;
      // Both must have x-caused-by-unknown-system with same values
      const prodXC = (prod.parameter || []).filter(p => p.name === 'x-caused-by-unknown-system').map(p => p.valueCanonical).sort();
      const devXC = (dev.parameter || []).filter(p => p.name === 'x-caused-by-unknown-system').map(p => p.valueCanonical).sort();
      if (prodXC.length === 0 || JSON.stringify(prodXC) !== JSON.stringify(devXC)) return null;
      // Prod has code/system/display params that dev lacks
      const prodHasCode = getParamValue(prod, 'code') !== undefined;
      const devHasCode = getParamValue(dev, 'code') !== undefined;
      const prodHasSystem = getParamValue(prod, 'system') !== undefined;
      const devHasSystem = getParamValue(dev, 'system') !== undefined;
      if (prodHasCode && !devHasCode && prodHasSystem && !devHasSystem) return 'normalize';
      return null;
    },
    normalize({ prod, dev }) {
      // Copy prod's code, system, display params to dev
      const paramsToAdd = ['code', 'system', 'display'];
      const prodParamsToAdd = (prod.parameter || []).filter(p => paramsToAdd.includes(p.name));
      // For issues: prod may have extra informational issues that dev lacks.
      // Canonicalize dev's issues to match prod's.
      const prodIssues = getParamValue(prod, 'issues');
      let newDevParams = [...(dev.parameter || [])];
      // Add missing params from prod
      for (const pp of prodParamsToAdd) {
        const existing = newDevParams.find(p => p.name === pp.name);
        if (!existing) {
          newDevParams.push({ ...pp });
        }
      }
      // Replace dev's issues with prod's if they differ
      if (prodIssues) {
        const devHasIssues = newDevParams.some(p => p.name === 'issues');
        if (devHasIssues) {
          newDevParams = newDevParams.map(p =>
            p.name === 'issues' ? (prod.parameter || []).find(pp => pp.name === 'issues') || p : p
          );
        } else {
          const prodIssuesParam = (prod.parameter || []).find(p => p.name === 'issues');
          if (prodIssuesParam) newDevParams.push({ ...prodIssuesParam });
        }
      }
      // Sort by name for consistency
      newDevParams.sort((a, b) => {
        const nameCmp = (a.name || '').localeCompare(b.name || '');
        if (nameCmp !== 0) return nameCmp;
        return JSON.stringify(a).localeCompare(JSON.stringify(b));
      });
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
