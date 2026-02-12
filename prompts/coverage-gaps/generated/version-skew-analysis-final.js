#!/usr/bin/env node
'use strict';

/**
 * Final comprehensive analysis for the version-skew tolerance consolidation study.
 */

const fs = require('fs');
const readline = require('readline');
const path = require('path');

const COMPARISON_FILE = path.resolve(__dirname, '../../../jobs/2026-02-round-2/comparison.ndjson');
const tolerancesPath = path.resolve(__dirname, '../../../jobs/2026-02-round-2/tolerances.js');
const { tolerances, getParamValue } = require(tolerancesPath);

function isParameters(obj) {
  return obj?.resourceType === 'Parameters' || Array.isArray(obj?.parameter);
}

const TARGET_IDS = [
  'hl7-terminology-cs-version-skew',
  'expand-hl7-terminology-version-skew-params',
  'expand-hl7-terminology-version-skew-content',
  'validate-code-hl7-terminology-vs-version-skew',
  'expand-hl7-terminology-version-skew-vs-metadata',
  'hl7-terminology-lookup-definition-designation-skew',
  'expand-snomed-version-skew-content',
  'expand-snomed-version-skew-content-no-used-cs',
  'snomed-version-skew-message-text',
];

const EXTRA_IDS = [
  'expand-contains-version-skew',
  'snomed-version-skew',
  'v2-0360-lookup-version-skew',
  'expand-used-codesystem-version-skew',
  'expand-hl7-terminology-used-valueset-version-skew',
  'ndc-validate-code-unknown-code-version-diffs',
  'snomed-version-skew-validate-code-result-disagrees',
];

const ALL_VERSION_IDS = new Set([...TARGET_IDS, ...EXTRA_IDS]);

// ==========================================
// GENERAL DETECTION: check raw bodies for version differences
// ==========================================

function detectVersionDifferences(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { return { diffs: [] }; }
  try { dev = JSON.parse(record.devBody); } catch { return { diffs: [] }; }

  const diffs = [];

  // 1. version param in Parameters
  if (isParameters(prod) && isParameters(dev)) {
    const pv = getParamValue(prod, 'version');
    const dv = getParamValue(dev, 'version');
    if (pv && dv && pv !== dv) {
      diffs.push({ location: 'version-param', system: getParamValue(prod, 'system') || 'unknown', prodVer: pv, devVer: dv });
    }
  }

  // 2. used-codesystem in expansion.parameter
  if (prod?.expansion?.parameter && dev?.expansion?.parameter) {
    const prodUcs = new Map();
    const devUcs = new Map();
    for (const p of prod.expansion.parameter) {
      if (p.name === 'used-codesystem' && p.valueUri) {
        const parts = p.valueUri.split('|');
        prodUcs.set(parts[0], parts.slice(1).join('|') || '');
      }
    }
    for (const p of dev.expansion.parameter) {
      if (p.name === 'used-codesystem' && p.valueUri) {
        const parts = p.valueUri.split('|');
        devUcs.set(parts[0], parts.slice(1).join('|') || '');
      }
    }
    for (const [sys, pv] of prodUcs) {
      const dv = devUcs.get(sys);
      if (dv !== undefined && pv !== dv) {
        diffs.push({ location: 'used-codesystem', system: sys, prodVer: pv, devVer: dv });
      }
    }
  }

  // 3. used-valueset
  if (prod?.expansion?.parameter && dev?.expansion?.parameter) {
    const prodUvs = new Map();
    const devUvs = new Map();
    for (const p of prod.expansion.parameter) {
      if (p.name === 'used-valueset' && p.valueUri) {
        const parts = p.valueUri.split('|');
        prodUvs.set(parts[0], parts.slice(1).join('|') || '');
      }
    }
    for (const p of dev.expansion.parameter) {
      if (p.name === 'used-valueset' && p.valueUri) {
        const parts = p.valueUri.split('|');
        devUvs.set(parts[0], parts.slice(1).join('|') || '');
      }
    }
    for (const [sys, pv] of prodUvs) {
      const dv = devUvs.get(sys);
      if (dv !== undefined && pv !== dv) {
        diffs.push({ location: 'used-valueset', system: sys, prodVer: pv, devVer: dv });
      }
    }
  }

  // 4. contains[].version
  if (prod?.expansion?.contains && dev?.expansion?.contains) {
    const prodVerMap = new Map();
    for (const c of prod.expansion.contains) {
      if (c.version && c.system && !prodVerMap.has(c.system)) {
        prodVerMap.set(c.system, c.version);
      }
    }
    const devVerMap = new Map();
    for (const c of dev.expansion.contains) {
      if (c.version && c.system && !devVerMap.has(c.system)) {
        devVerMap.set(c.system, c.version);
      }
    }
    for (const [sys, pv] of prodVerMap) {
      const dv = devVerMap.get(sys);
      if (dv && pv !== dv) {
        diffs.push({ location: 'contains-version', system: sys, prodVer: pv, devVer: dv });
      }
    }
  }

  // 5. Message text version strings
  if (isParameters(prod) && isParameters(dev)) {
    const pm = getParamValue(prod, 'message') || '';
    const dm = getParamValue(dev, 'message') || '';
    if (pm !== dm) {
      // SNOMED version URIs
      const snomedRe = /snomed\.info\/sct\/\d+\/version\/\d+/g;
      const pmNorm = pm.replace(snomedRe, 'SNOMED_V');
      const dmNorm = dm.replace(snomedRe, 'SNOMED_V');
      if (pm.match(snomedRe) && dm.match(snomedRe) && pmNorm === dmNorm) {
        diffs.push({ location: 'message-snomed-version', system: 'http://snomed.info/sct', prodVer: pm.match(snomedRe)[0], devVer: dm.match(snomedRe)[0] });
      }

      // Semver-like version 'X.Y.Z' patterns
      const versionRe = /version '([^']*)'/g;
      const pmVersions = [...pm.matchAll(versionRe)].map(m => m[1]);
      const dmVersions = [...dm.matchAll(versionRe)].map(m => m[1]);
      if (pmVersions.length > 0 && dmVersions.length > 0 && pm.replace(versionRe, "version 'X'") === dm.replace(versionRe, "version 'X'")) {
        diffs.push({ location: 'message-version-text', system: 'message', prodVer: pmVersions[0], devVer: dmVersions[0] });
      }

      // HL7 pipe-delimited system|version patterns in message
      const pipeRe = /terminology\.hl7\.org\/(CodeSystem|ValueSet)\/([^|'"}\s]*)\|([^'"}\s]*)/g;
      const pmPipes = [...pm.matchAll(pipeRe)];
      const dmPipes = [...dm.matchAll(pipeRe)];
      if (pmPipes.length > 0 && dmPipes.length > 0) {
        const pmNorm2 = pm.replace(pipeRe, 'HL7|X');
        const dmNorm2 = dm.replace(pipeRe, 'HL7|X');
        if (pmNorm2 === dmNorm2) {
          diffs.push({ location: 'message-hl7-pipe', system: pmPipes[0][0], prodVer: pmPipes[0][3], devVer: dmPipes[0][3] });
        }
      }
    }
  }

  // 6. ValueSet-level metadata
  if (prod?.resourceType === 'ValueSet' && dev?.resourceType === 'ValueSet') {
    if (prod.version && dev.version && prod.version !== dev.version) {
      diffs.push({ location: 'vs-metadata-version', system: 'valueset', prodVer: prod.version, devVer: dev.version });
    }
  }

  // 7. Extra definition/designation (lookup version skew)
  if (isParameters(prod) && isParameters(dev)) {
    const prodNames = new Set((prod.parameter || []).map(p => p.name));
    const devNames = new Set((dev.parameter || []).map(p => p.name));
    if (devNames.has('definition') && !prodNames.has('definition')) {
      const sys = getParamValue(prod, 'system') || getParamValue(dev, 'system') || 'unknown';
      diffs.push({ location: 'extra-definition-in-dev', system: sys });
    }
    if (devNames.has('designation') && !prodNames.has('designation')) {
      const sys = getParamValue(prod, 'system') || getParamValue(dev, 'system') || 'unknown';
      diffs.push({ location: 'extra-designation-in-dev', system: sys });
    }
  }

  return { diffs, hasDiff: diffs.length > 0 };
}

function checkToleranceMatches(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { prod = null; }
  try { dev = JSON.parse(record.devBody); } catch { dev = null; }

  const ctx = { record, prod, dev };
  const matched = new Set();

  for (const t of tolerances) {
    try {
      const action = t.match(ctx);
      if (action === 'skip' || action === 'normalize') {
        if (ALL_VERSION_IDS.has(t.id)) {
          matched.add(t.id);
        }
        if (action === 'normalize' && ctx.prod && ctx.dev) {
          const result = t.normalize(ctx);
          ctx.prod = result.prod;
          ctx.dev = result.dev;
        }
      }
    } catch {}
  }

  return matched;
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(COMPARISON_FILE),
    crlfDelay: Infinity,
  });

  let total = 0;

  // Coverage metrics
  const metrics = {
    target9: { matched: 0, ids: new Set() },
    allVersion: { matched: 0, ids: new Set() },
    detected: { matched: 0, ids: new Set() },
  };

  // Overlap matrices
  let detectedAndTarget9 = 0;
  let detectedNotTarget9 = 0;
  let target9NotDetected = 0;
  let detectedAndAllVersion = 0;
  let allVersionNotDetected = 0;

  // Per-tolerance coverage by detection
  const perTolCoverage = {};
  for (const id of ALL_VERSION_IDS) {
    perTolCoverage[id] = { total: 0, detected: 0, notDetected: [] };
  }

  // Examples of detection NOT matching any tolerance
  const detectedNoTolExamples = [];
  const detectedNoTolByOp = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let record;
    try { record = JSON.parse(line); } catch { continue; }

    const { diffs, hasDiff } = detectVersionDifferences(record);
    const tolMatches = checkToleranceMatches(record);
    const matchedTarget9 = [...tolMatches].some(id => TARGET_IDS.includes(id));
    const matchedAnyVersion = tolMatches.size > 0;

    if (matchedTarget9) {
      metrics.target9.matched++;
      metrics.target9.ids.add(record.id);
    }
    if (matchedAnyVersion) {
      metrics.allVersion.matched++;
      metrics.allVersion.ids.add(record.id);
    }
    if (hasDiff) {
      metrics.detected.matched++;
      metrics.detected.ids.add(record.id);
    }

    // Overlaps
    if (hasDiff && matchedTarget9) detectedAndTarget9++;
    if (hasDiff && !matchedTarget9) {
      detectedNotTarget9++;
      if (!matchedAnyVersion) {
        const op = record.url.includes('expand') ? 'expand' :
                   record.url.includes('validate-code') ? 'validate-code' :
                   record.url.includes('lookup') ? 'lookup' : 'other';
        detectedNoTolByOp[op] = (detectedNoTolByOp[op] || 0) + 1;
        if (detectedNoTolExamples.length < 15) {
          detectedNoTolExamples.push({
            id: record.id,
            url: record.url.substring(0, 100),
            diffs: diffs.map(d => `${d.location}[${d.system?.substring(0, 40)}]: ${(d.prodVer||'').substring(0, 30)} -> ${(d.devVer||'').substring(0, 30)}`),
          });
        }
      }
    }
    if (matchedTarget9 && !hasDiff) target9NotDetected++;
    if (hasDiff && matchedAnyVersion) detectedAndAllVersion++;
    if (matchedAnyVersion && !hasDiff) allVersionNotDetected++;

    // Per-tolerance coverage
    for (const id of tolMatches) {
      perTolCoverage[id].total++;
      if (hasDiff) {
        perTolCoverage[id].detected++;
      } else {
        if (perTolCoverage[id].notDetected.length < 3) {
          perTolCoverage[id].notDetected.push(record.id);
        }
      }
    }

    if (total % 5000 === 0) process.stderr.write(`\r  Processed ${total}...`);
  }
  process.stderr.write('\n');

  // ==========================================
  // REPORT
  // ==========================================
  console.log('======================================================');
  console.log('   VERSION SKEW TOLERANCE CONSOLIDATION ANALYSIS');
  console.log('======================================================\n');

  console.log(`Total comparison records: ${total}\n`);

  console.log('--- High-Level Coverage ---');
  console.log(`Records matched by the 9 target tolerances: ${metrics.target9.matched}`);
  console.log(`Records matched by all 16 version-skew tolerances: ${metrics.allVersion.matched}`);
  console.log(`Records where version differences detected in raw bodies: ${metrics.detected.matched}`);

  console.log('\n--- Coverage Matrix: Detection vs Target 9 ---');
  console.log(`  Detected AND target-9 match: ${detectedAndTarget9}`);
  console.log(`  Detected but NOT target-9: ${detectedNotTarget9} (incidental captures)`);
  console.log(`  Target-9 but NOT detected: ${target9NotDetected} (missed by detection)`);

  console.log('\n--- Coverage Matrix: Detection vs All 16 Version Tolerances ---');
  console.log(`  Detected AND any-version match: ${detectedAndAllVersion}`);
  console.log(`  Any-version but NOT detected: ${allVersionNotDetected} (tolerances match, no version diff found)`);

  console.log('\n--- Per-Tolerance Detection Coverage ---');
  for (const id of [...TARGET_IDS, ...EXTRA_IDS]) {
    const c = perTolCoverage[id];
    if (c.total === 0) continue;
    const pct = c.total > 0 ? Math.round(100 * c.detected / c.total) : 0;
    const missed = c.total - c.detected;
    console.log(`  ${id}:`);
    console.log(`    Total matches: ${c.total}, Detected: ${c.detected} (${pct}%), NOT detected: ${missed}`);
    if (missed > 0 && c.notDetected.length > 0) {
      console.log(`    Example not-detected IDs: ${c.notDetected.join(', ')}`);
    }
  }

  console.log('\n--- Records Detected but NOT Matched by Any Version Tolerance ---');
  console.log(`By operation: ${JSON.stringify(detectedNoTolByOp)}`);
  console.log(`Examples:`);
  for (const ex of detectedNoTolExamples) {
    console.log(`  ${ex.id} ${ex.url}`);
    for (const d of ex.diffs) {
      console.log(`    ${d}`);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
