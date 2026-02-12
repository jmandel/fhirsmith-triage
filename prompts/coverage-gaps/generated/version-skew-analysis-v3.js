#!/usr/bin/env node
'use strict';

/**
 * V3: Refined analysis.
 *
 * Key questions:
 * 1. For each of the 9 target tolerances, which specific "version skew signal"
 *    does it detect? (version param, used-codesystem, contains, message text, warning-draft, extra params)
 * 2. Can a general detector based on "version differs in raw bodies" cover all 9?
 * 3. What about the hl7-terminology special case where prod=4.0.1 is NOT the THO version
 *    but rather the FHIR R4 version, and dev has the actual THO version?
 * 4. Understanding directionality: for HL7 terminology, prod reports 4.0.1 but the ACTUAL
 *    code system version may be older in prod.
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

const EXTRA_IDS = new Set([
  'expand-contains-version-skew',
  'snomed-version-skew',
  'v2-0360-lookup-version-skew',
  'expand-used-codesystem-version-skew',
  'expand-hl7-terminology-used-valueset-version-skew',
  'ndc-validate-code-unknown-code-version-diffs',
  'snomed-version-skew-validate-code-result-disagrees',
]);

const ALL_VERSION_IDS = new Set([...TARGET_IDS, ...EXTRA_IDS]);

/**
 * Extended version detection: find ANY version-related signal differences.
 * Looks at:
 * 1. version param in Parameters
 * 2. used-codesystem in expansion.parameter
 * 3. used-valueset in expansion.parameter
 * 4. contains[].version
 * 5. version strings in message text (SNOMED URI patterns, semver-like)
 * 6. version strings in issues text
 * 7. warning-draft parameter presence
 * 8. ValueSet-level metadata (version, date)
 * 9. Extra parameters (definition, designation) that imply different CS edition
 */
function detectVersionSignals(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { return { signals: [], hasAnySignal: false }; }
  try { dev = JSON.parse(record.devBody); } catch { return { signals: [], hasAnySignal: false }; }

  const signals = [];

  // 1. Version param
  if (isParameters(prod) && isParameters(dev)) {
    const pv = getParamValue(prod, 'version');
    const dv = getParamValue(dev, 'version');
    if (pv && dv && pv !== dv) {
      signals.push({ type: 'version-param', prodVal: pv, devVal: dv });
    }
  }

  // 2. used-codesystem versions
  if (prod?.expansion?.parameter && dev?.expansion?.parameter) {
    const prodUcs = (prod.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem')
      .map(p => ({ base: (p.valueUri || '').split('|')[0], uri: p.valueUri }));
    const devUcs = (dev.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem')
      .map(p => ({ base: (p.valueUri || '').split('|')[0], uri: p.valueUri }));

    const prodMap = new Map(prodUcs.map(u => [u.base, u.uri]));
    const devMap = new Map(devUcs.map(u => [u.base, u.uri]));

    for (const [base, pUri] of prodMap) {
      const dUri = devMap.get(base);
      if (dUri && pUri !== dUri) {
        signals.push({ type: 'used-codesystem', system: base, prodVal: pUri, devVal: dUri });
      }
    }
    // Check for entirely missing used-codesystem entries
    for (const [base, pUri] of prodMap) {
      if (!devMap.has(base)) {
        signals.push({ type: 'used-codesystem-missing-in-dev', system: base, prodVal: pUri });
      }
    }
    for (const [base, dUri] of devMap) {
      if (!prodMap.has(base)) {
        signals.push({ type: 'used-codesystem-extra-in-dev', system: base, devVal: dUri });
      }
    }
  }

  // 3. used-valueset versions
  if (prod?.expansion?.parameter && dev?.expansion?.parameter) {
    const prodUvs = (prod.expansion.parameter || [])
      .filter(p => p.name === 'used-valueset')
      .map(p => ({ base: (p.valueUri || '').split('|')[0], uri: p.valueUri }));
    const devUvs = (dev.expansion.parameter || [])
      .filter(p => p.name === 'used-valueset')
      .map(p => ({ base: (p.valueUri || '').split('|')[0], uri: p.valueUri }));

    const prodMap = new Map(prodUvs.map(u => [u.base, u.uri]));
    const devMap = new Map(devUvs.map(u => [u.base, u.uri]));

    for (const [base, pUri] of prodMap) {
      const dUri = devMap.get(base);
      if (dUri && pUri !== dUri) {
        signals.push({ type: 'used-valueset', system: base, prodVal: pUri, devVal: dUri });
      }
    }
  }

  // 4. contains[].version
  if (prod?.expansion?.contains && dev?.expansion?.contains) {
    const prodVerMap = new Map();
    for (const c of prod.expansion.contains) {
      if (c.version && c.system) prodVerMap.set(c.system, c.version);
    }
    const devVerMap = new Map();
    for (const c of dev.expansion.contains) {
      if (c.version && c.system) devVerMap.set(c.system, c.version);
    }
    for (const [sys, pv] of prodVerMap) {
      const dv = devVerMap.get(sys);
      if (dv && pv !== dv) {
        signals.push({ type: 'contains-version', system: sys, prodVal: pv, devVal: dv });
      }
    }
  }

  // 5-6. Message text version strings
  if (isParameters(prod) && isParameters(dev)) {
    const pm = getParamValue(prod, 'message') || '';
    const dm = getParamValue(dev, 'message') || '';
    if (pm !== dm) {
      // Check for version-like patterns
      const snomedRe = /snomed\.info\/sct\/\d+\/version\/\d+/g;
      const pmSnomed = pm.match(snomedRe) || [];
      const dmSnomed = dm.match(snomedRe) || [];
      if (pmSnomed.length > 0 && dmSnomed.length > 0) {
        const pmNorm = pm.replace(snomedRe, 'SNOMED_V');
        const dmNorm = dm.replace(snomedRe, 'SNOMED_V');
        if (pmNorm === dmNorm) {
          signals.push({ type: 'message-snomed-version', prodVal: pmSnomed[0], devVal: dmSnomed[0] });
        }
      }

      // Check for semver/pipe-delimited version patterns
      const versionRe = /version '[^']*'/g;
      const pmVersions = pm.match(versionRe) || [];
      const dmVersions = dm.match(versionRe) || [];
      if (pmVersions.length > 0 && dmVersions.length > 0) {
        const pmNorm = pm.replace(versionRe, "version 'X'");
        const dmNorm = dm.replace(versionRe, "version 'X'");
        if (pmNorm === dmNorm) {
          signals.push({ type: 'message-version-string', prodVal: pmVersions[0], devVal: dmVersions[0] });
        }
      }

      // Check for VS/CS pipe-delimited version diffs
      const pipeRe = /terminology\.hl7\.org\/(CodeSystem|ValueSet)\/[^|'"]*\|[^'"}\s]*/g;
      const pmPipe = pm.match(pipeRe) || [];
      const dmPipe = dm.match(pipeRe) || [];
      if (pmPipe.length > 0 && dmPipe.length > 0) {
        const pmNorm = pm.replace(pipeRe, 'HL7_URI');
        const dmNorm = dm.replace(pipeRe, 'HL7_URI');
        if (pmNorm === dmNorm) {
          signals.push({ type: 'message-hl7-pipe-version', prodVal: pmPipe[0], devVal: dmPipe[0] });
        }
      }
    }
  }

  // 7. warning-draft presence
  if (prod?.expansion?.parameter || dev?.expansion?.parameter) {
    const prodHas = (prod?.expansion?.parameter || []).some(p => p.name === 'warning-draft');
    const devHas = (dev?.expansion?.parameter || []).some(p => p.name === 'warning-draft');
    if (prodHas !== devHas) {
      signals.push({ type: 'warning-draft-diff', prodVal: prodHas, devVal: devHas });
    }
  }

  // 8. ValueSet-level metadata version diff
  if (prod?.resourceType === 'ValueSet' && dev?.resourceType === 'ValueSet') {
    if (prod.version && dev.version && prod.version !== dev.version) {
      signals.push({ type: 'vs-metadata-version', prodVal: prod.version, devVal: dev.version });
    }
    if (prod.date && dev.date && prod.date !== dev.date) {
      signals.push({ type: 'vs-metadata-date', prodVal: prod.date, devVal: dev.date });
    }
  }

  // 9. Extra definition/designation params (implies different CS edition)
  if (isParameters(prod) && isParameters(dev)) {
    const prodNames = new Set((prod.parameter || []).map(p => p.name));
    const devNames = new Set((dev.parameter || []).map(p => p.name));
    if (devNames.has('definition') && !prodNames.has('definition')) {
      signals.push({ type: 'extra-definition-in-dev' });
    }
    if (devNames.has('designation') && !prodNames.has('designation')) {
      signals.push({ type: 'extra-designation-in-dev' });
    }
  }

  // 10. Code membership differs (for expand)
  if (prod?.expansion?.contains && dev?.expansion?.contains) {
    const prodCodes = new Set(prod.expansion.contains.map(c => c.system + '|' + c.code));
    const devCodes = new Set(dev.expansion.contains.map(c => c.system + '|' + c.code));
    let hasExtra = false;
    for (const k of devCodes) { if (!prodCodes.has(k)) { hasExtra = true; break; } }
    if (!hasExtra) { for (const k of prodCodes) { if (!devCodes.has(k)) { hasExtra = true; break; } } }
    if (hasExtra) {
      signals.push({
        type: 'code-membership-differs',
        prodCount: prodCodes.size,
        devCount: devCodes.size,
      });
    }
  }

  return { signals, hasAnySignal: signals.length > 0 };
}

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
        if (ALL_VERSION_IDS.has(t.id)) {
          matched.push({ id: t.id, action });
        }
        if (action === 'normalize' && ctx.prod && ctx.dev) {
          const result = t.normalize(ctx);
          ctx.prod = result.prod;
          ctx.dev = result.dev;
        }
      }
    } catch (e) {}
  }

  return matched;
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(COMPARISON_FILE),
    crlfDelay: Infinity,
  });

  let total = 0;

  // Per-tolerance stats
  const stats = {};
  for (const id of ALL_VERSION_IDS) {
    stats[id] = { total: 0, withSignal: 0, signalTypes: {} };
  }

  // Records with signals but not matched by any version tolerance
  let signalNoTol = 0;
  const signalNoTolExamples = [];

  // Records with signals AND target 9 match
  let signalAndTarget = 0;
  // Records with signals AND any version match
  let signalAndAny = 0;

  // Overall signal stats
  const signalTypeCounts = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let record;
    try { record = JSON.parse(line); } catch { continue; }

    const { signals, hasAnySignal } = detectVersionSignals(record);
    const tolMatches = checkToleranceMatches(record);
    const matchedTarget = tolMatches.filter(m => TARGET_IDS.has(m.id));
    const matchedAny = tolMatches.length > 0;

    // Track signal types
    for (const s of signals) {
      signalTypeCounts[s.type] = (signalTypeCounts[s.type] || 0) + 1;
    }

    // Track per-tolerance signal coverage
    for (const m of tolMatches) {
      stats[m.id].total++;
      if (hasAnySignal) {
        stats[m.id].withSignal++;
        for (const s of signals) {
          stats[m.id].signalTypes[s.type] = (stats[m.id].signalTypes[s.type] || 0) + 1;
        }
      }
    }

    if (hasAnySignal && matchedTarget.length > 0) signalAndTarget++;
    if (hasAnySignal && matchedAny) signalAndAny++;

    if (hasAnySignal && !matchedAny) {
      signalNoTol++;
      if (signalNoTolExamples.length < 20) {
        signalNoTolExamples.push({
          id: record.id,
          url: record.url,
          signals: signals.map(s => s.type + ': ' + (s.prodVal || '') + ' -> ' + (s.devVal || '')),
        });
      }
    }

    if (total % 5000 === 0) process.stderr.write(`\r  Processed ${total}...`);
  }
  process.stderr.write('\n');

  console.log('=== SIGNAL-BASED ANALYSIS ===\n');
  console.log(`Total records: ${total}`);

  console.log('\n--- Signal Type Counts (across all records) ---');
  for (const [type, count] of Object.entries(signalTypeCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${type}: ${count}`);
  }

  console.log('\n--- Per-Tolerance Signal Coverage ---');
  for (const id of [...ALL_VERSION_IDS].sort()) {
    const s = stats[id];
    if (s.total === 0) continue;
    console.log(`\n  ${id}: ${s.total} matched, ${s.withSignal} have signals (${Math.round(100*s.withSignal/s.total)}%)`);
    if (Object.keys(s.signalTypes).length > 0) {
      const sorted = Object.entries(s.signalTypes).sort((a,b) => b[1] - a[1]);
      for (const [type, cnt] of sorted) {
        console.log(`    ${type}: ${cnt}`);
      }
    }
    if (s.total > s.withSignal) {
      console.log(`    ** ${s.total - s.withSignal} records WITHOUT detectable version signal **`);
    }
  }

  console.log('\n--- Records with Signals but No Version Tolerance ---');
  console.log(`Count: ${signalNoTol}`);
  for (const ex of signalNoTolExamples) {
    console.log(`  ${ex.id} ${ex.url}`);
    for (const s of ex.signals) {
      console.log(`    ${s}`);
    }
  }

  console.log(`\nRecords with signals AND target-9 match: ${signalAndTarget}`);
  console.log(`Records with signals AND any version match: ${signalAndAny}`);
}

main().catch(e => { console.error(e); process.exit(1); });
