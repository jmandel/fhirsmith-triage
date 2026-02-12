#!/usr/bin/env node
'use strict';

/**
 * Analyze version skew patterns across comparison.ndjson to understand
 * how a unified "dev-is-newer version skew" tolerance might work.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const COMPARISON_FILE = path.resolve(__dirname, '../../../jobs/2026-02-round-2/comparison.ndjson');

// Load tolerances to cross-reference
const tolerancesPath = path.resolve(__dirname, '../../../jobs/2026-02-round-2/tolerances.js');
const { tolerances, getParamValue } = require(tolerancesPath);

function isParameters(obj) {
  return obj?.resourceType === 'Parameters' || Array.isArray(obj?.parameter);
}

// The 9 target tolerances + extras
const TARGET_IDS = new Set([
  'hl7-terminology-cs-version-skew',
  'expand-hl7-terminology-version-skew-params',
  'expand-hl7-terminology-version-skew-content',
  'validate-code-hl7-terminology-vs-version-skew',
  'expand-hl7-terminology-version-skew-vs-metadata',
  'hl7-terminology-lookup-definition-designation-skew',
  'expand-snomed-version-skew-content',
  'expand-snomed-version-skew-content-no-used-cs',
  'snomed-version-skew-message-text',
]);

const EXTRA_VERSION_IDS = new Set([
  'expand-contains-version-skew',
  'snomed-version-skew',
  'v2-0360-lookup-version-skew',
  'expand-used-codesystem-version-skew',
  'expand-hl7-terminology-used-valueset-version-skew',
  'ndc-validate-code-unknown-code-version-diffs',
  'snomed-version-skew-validate-code-result-disagrees',
]);

// --- Version extraction logic ---

/**
 * Extract all version information from a parsed response body.
 * Returns a map of { system -> version } for each code system found.
 */
function extractVersionInfo(body, record) {
  const versions = {};

  if (!body) return versions;

  // 1. From Parameters: version param (validate-code, lookup)
  if (isParameters(body)) {
    const ver = getParamValue(body, 'version');
    const sys = getParamValue(body, 'system');
    if (ver && sys) {
      versions[sys] = ver;
    } else if (ver && ver.includes('snomed.info/sct')) {
      // SNOMED version URIs encode the system
      versions['http://snomed.info/sct'] = ver;
    }
  }

  // 2. From ValueSet expansion: used-codesystem params
  if (body?.expansion?.parameter) {
    for (const p of body.expansion.parameter) {
      if (p.name === 'used-codesystem' && p.valueUri) {
        const parts = p.valueUri.split('|');
        if (parts.length >= 2) {
          versions[parts[0]] = parts.slice(1).join('|');
        } else {
          versions[p.valueUri] = '';
        }
      }
      if (p.name === 'used-valueset' && p.valueUri) {
        const parts = p.valueUri.split('|');
        if (parts.length >= 2) {
          versions['VS:' + parts[0]] = parts.slice(1).join('|');
        }
      }
    }
  }

  // 3. From expansion contains[].version
  if (body?.expansion?.contains) {
    for (const c of body.expansion.contains) {
      if (c.version && c.system) {
        const key = 'contains:' + c.system;
        if (!versions[key]) {
          versions[key] = c.version;
        }
      }
    }
  }

  return versions;
}

/**
 * Compare two version strings. Returns:
 *  1 if v1 > v2 (v1 is newer)
 * -1 if v1 < v2 (v2 is newer)
 *  0 if equal or cannot determine
 */
function compareVersions(v1, v2) {
  if (v1 === v2) return 0;
  if (!v1 || !v2) return 0;

  // SNOMED version URIs: snomed.info/sct/MODULE/version/DATE
  const snomedRe = /snomed\.info\/sct\/\d+\/version\/(\d+)/;
  const m1 = v1.match(snomedRe);
  const m2 = v2.match(snomedRe);
  if (m1 && m2) {
    return parseInt(m1[1]) > parseInt(m2[1]) ? 1 : parseInt(m1[1]) < parseInt(m2[1]) ? -1 : 0;
  }

  // Pure numeric (dates like 20240201)
  if (/^\d+$/.test(v1) && /^\d+$/.test(v2)) {
    return parseInt(v1) > parseInt(v2) ? 1 : parseInt(v1) < parseInt(v2) ? -1 : 0;
  }

  // Semver-ish (1.0.1, 4.0.1)
  const semverRe = /^(\d+)\.(\d+)\.(\d+)$/;
  const sv1 = v1.match(semverRe);
  const sv2 = v2.match(semverRe);
  if (sv1 && sv2) {
    for (let i = 1; i <= 3; i++) {
      const n1 = parseInt(sv1[i]);
      const n2 = parseInt(sv2[i]);
      if (n1 !== n2) return n1 > n2 ? 1 : -1;
    }
    return 0;
  }

  // Year-based (2025, 2026)
  const yearRe = /^(\d{4})$/;
  const y1 = v1.match(yearRe);
  const y2 = v2.match(yearRe);
  if (y1 && y2) {
    return parseInt(y1[1]) > parseInt(y2[1]) ? 1 : parseInt(y1[1]) < parseInt(y2[1]) ? -1 : 0;
  }

  // Year-month (2025-01, 2021-11-01)
  const dateRe = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/;
  const d1 = v1.match(dateRe);
  const d2 = v2.match(dateRe);
  if (d1 && d2) {
    const s1 = v1.replace(/-/g, '');
    const s2 = v2.replace(/-/g, '');
    return s1 > s2 ? 1 : s1 < s2 ? -1 : 0;
  }

  // Date-like strings (2014-03-26 vs 3.0.0) - can't compare these
  return 0;
}

/**
 * Detect version skew for a record.
 * Returns { hasSkew, devNewer, systems: [{ system, prodVer, devVer, comparison }] }
 */
function detectVersionSkew(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { return { hasSkew: false, systems: [] }; }
  try { dev = JSON.parse(record.devBody); } catch { return { hasSkew: false, systems: [] }; }

  const prodVersions = extractVersionInfo(prod, record);
  const devVersions = extractVersionInfo(dev, record);

  const systems = [];
  const allSystems = new Set([...Object.keys(prodVersions), ...Object.keys(devVersions)]);

  for (const sys of allSystems) {
    const pv = prodVersions[sys];
    const dv = devVersions[sys];
    if (pv !== undefined && dv !== undefined && pv !== dv) {
      const cmp = compareVersions(pv, dv);
      systems.push({ system: sys, prodVer: pv, devVer: dv, comparison: cmp });
    }
  }

  const hasSkew = systems.length > 0;
  // "dev newer" means at least one system where dev > prod, and none where dev < prod
  const devNewer = hasSkew && systems.some(s => s.comparison === -1) && !systems.some(s => s.comparison === 1);
  // Actually, the convention: comparison=1 means v1(prod) > v2(dev), so dev is OLDER
  // comparison=-1 means v1(prod) < v2(dev), so dev is NEWER
  // But wait, let me re-check: the task says "dev's version is newer than prod's"
  // So devNewer = systems where compareVersions(prodVer, devVer) === -1 (prod < dev, dev is newer)

  return {
    hasSkew,
    devNewer: hasSkew && systems.every(s => s.comparison === -1 || s.comparison === 0) && systems.some(s => s.comparison === -1),
    prodNewer: hasSkew && systems.every(s => s.comparison === 1 || s.comparison === 0) && systems.some(s => s.comparison === 1),
    mixed: hasSkew && systems.some(s => s.comparison === 1) && systems.some(s => s.comparison === -1),
    unknownDirection: hasSkew && systems.every(s => s.comparison === 0),
    systems
  };
}

/**
 * Check if the request pinned a code system version.
 */
function requestPinnedVersion(record) {
  // Check URL for system-version parameter
  if (record.url.includes('system-version')) return true;

  // Check request body for system-version
  if (record.requestBody) {
    try {
      const req = JSON.parse(record.requestBody);
      if (isParameters(req)) {
        const sv = getParamValue(req, 'system-version');
        if (sv) return true;
      }
    } catch {}
  }

  return false;
}

/**
 * Check which of the target tolerances match a record.
 */
function checkToleranceMatches(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { prod = null; }
  try { dev = JSON.parse(record.devBody); } catch { dev = null; }

  const ctx = { record, prod, dev };
  const matched = [];

  for (const t of tolerances) {
    try {
      const action = t.match(ctx);
      if (action === 'skip' || action === 'normalize') {
        if (TARGET_IDS.has(t.id) || EXTRA_VERSION_IDS.has(t.id)) {
          matched.push(t.id);
        }
        // Apply normalization to see subsequent matches
        if (action === 'normalize' && ctx.prod && ctx.dev) {
          const result = t.normalize(ctx);
          ctx.prod = result.prod;
          ctx.dev = result.dev;
        }
      }
    } catch (e) {
      // Some tolerances may fail on certain records
    }
  }

  return matched;
}


async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(COMPARISON_FILE),
    crlfDelay: Infinity,
  });

  let totalRecords = 0;
  let skewDetected = 0;
  let devNewerCount = 0;
  let prodNewerCount = 0;
  let mixedCount = 0;
  let unknownDirCount = 0;
  let pinnedCount = 0;

  // Track which records match each tolerance
  const toleranceMatchCounts = {};
  const toleranceMatchRecordIds = {};

  // Track overlap between detection and tolerances
  let detectedAndMatched = 0;
  let detectedNotMatched = 0;
  let matchedNotDetected = 0;

  // Version pairs seen
  const versionPairs = {};

  // Records matched by target tolerances
  const targetMatchedIds = new Set();
  // Records detected as version skew
  const skewDetectedIds = new Set();
  // Records with dev newer
  const devNewerIds = new Set();

  // Detailed per-record info for the "incidental" captures
  const incidentalCaptures = [];

  // Records that tolerances catch but detection misses
  const missedByDetection = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    totalRecords++;

    let record;
    try {
      record = JSON.parse(line);
    } catch { continue; }

    // Check version skew detection
    const skew = detectVersionSkew(record);
    const pinned = requestPinnedVersion(record);

    // Check tolerance matches
    const matched = checkToleranceMatches(record);
    const matchedTarget = matched.filter(id => TARGET_IDS.has(id));
    const matchedExtra = matched.filter(id => EXTRA_VERSION_IDS.has(id));
    const matchedAnyTarget = matchedTarget.length > 0;

    if (matchedAnyTarget) {
      targetMatchedIds.add(record.id);
    }

    for (const id of matched) {
      toleranceMatchCounts[id] = (toleranceMatchCounts[id] || 0) + 1;
      if (!toleranceMatchRecordIds[id]) toleranceMatchRecordIds[id] = [];
      toleranceMatchRecordIds[id].push(record.id);
    }

    if (skew.hasSkew) {
      skewDetected++;
      skewDetectedIds.add(record.id);
      if (pinned) pinnedCount++;

      if (skew.devNewer) {
        devNewerCount++;
        devNewerIds.add(record.id);
      }
      if (skew.prodNewer) prodNewerCount++;
      if (skew.mixed) mixedCount++;
      if (skew.unknownDirection) unknownDirCount++;

      // Track version pairs
      for (const s of skew.systems) {
        const key = `${s.system}: ${s.prodVer} -> ${s.devVer}`;
        versionPairs[key] = (versionPairs[key] || 0) + 1;
      }

      if (matchedAnyTarget) {
        detectedAndMatched++;
      } else {
        detectedNotMatched++;
        if (!matchedExtra.length) {
          // Truly new captures not covered by any version-skew tolerance
          incidentalCaptures.push({
            id: record.id,
            url: record.url,
            systems: skew.systems,
            devNewer: skew.devNewer,
            prodNewer: skew.prodNewer,
            mixed: skew.mixed,
          });
        }
      }
    } else {
      if (matchedAnyTarget) {
        matchedNotDetected++;
        missedByDetection.push({
          id: record.id,
          url: record.url,
          matchedBy: matchedTarget,
        });
      }
    }

    if (totalRecords % 5000 === 0) {
      process.stderr.write(`\r  Processed ${totalRecords}...`);
    }
  }

  process.stderr.write('\n');

  // Output results
  console.log('=== VERSION SKEW ANALYSIS ===\n');
  console.log(`Total records: ${totalRecords}`);
  console.log(`Records with version skew detected: ${skewDetected}`);
  console.log(`  Dev newer: ${devNewerCount}`);
  console.log(`  Prod newer: ${prodNewerCount}`);
  console.log(`  Mixed direction: ${mixedCount}`);
  console.log(`  Unknown direction: ${unknownDirCount}`);
  console.log(`  Pinned version in request: ${pinnedCount}`);

  console.log('\n--- Target Tolerance Match Counts ---');
  for (const id of [...TARGET_IDS].sort()) {
    console.log(`  ${id}: ${toleranceMatchCounts[id] || 0}`);
  }

  console.log('\n--- Extra Version Tolerance Match Counts ---');
  for (const id of [...EXTRA_VERSION_IDS].sort()) {
    console.log(`  ${id}: ${toleranceMatchCounts[id] || 0}`);
  }

  console.log('\n--- Coverage Analysis ---');
  console.log(`Records matched by 9 target tolerances: ${targetMatchedIds.size}`);
  console.log(`Records with version skew detected: ${skewDetectedIds.size}`);
  console.log(`  Both detected and matched: ${detectedAndMatched}`);
  console.log(`  Detected but NOT matched by target 9: ${detectedNotMatched}`);
  console.log(`  Matched by target 9 but NOT detected: ${matchedNotDetected}`);

  // Dev-newer subset
  const devNewerAndMatched = [...devNewerIds].filter(id => targetMatchedIds.has(id)).length;
  const devNewerNotMatched = [...devNewerIds].filter(id => !targetMatchedIds.has(id)).length;
  console.log(`\nDev-newer subset:`);
  console.log(`  Total dev-newer: ${devNewerIds.size}`);
  console.log(`  Dev-newer AND matched by target 9: ${devNewerAndMatched}`);
  console.log(`  Dev-newer but NOT matched by target 9: ${devNewerNotMatched}`);

  console.log('\n--- Version Pairs Seen (top 30) ---');
  const sortedPairs = Object.entries(versionPairs).sort((a, b) => b[1] - a[1]).slice(0, 30);
  for (const [pair, count] of sortedPairs) {
    console.log(`  ${count}x  ${pair}`);
  }

  console.log('\n--- Missed by Detection (matched by tolerance but not detected) ---');
  console.log(`Count: ${missedByDetection.length}`);
  for (const r of missedByDetection.slice(0, 20)) {
    console.log(`  ${r.id} ${r.url} matched by: ${r.matchedBy.join(', ')}`);
  }

  console.log('\n--- Incidental Captures (detected but not matched by any version-skew tolerance) ---');
  console.log(`Count: ${incidentalCaptures.length}`);
  for (const r of incidentalCaptures.slice(0, 30)) {
    console.log(`  ${r.id} ${r.url}`);
    console.log(`    devNewer=${r.devNewer} prodNewer=${r.prodNewer} mixed=${r.mixed}`);
    for (const s of r.systems) {
      console.log(`    ${s.system}: ${s.prodVer} -> ${s.devVer} (cmp=${s.comparison})`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
