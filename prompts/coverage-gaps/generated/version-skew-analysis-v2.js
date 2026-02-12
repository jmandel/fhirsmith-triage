#!/usr/bin/env node
'use strict';

/**
 * V2: Investigate why 362 records matched by tolerances are NOT detected
 * by our version extraction. Also understand directionality better.
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

/**
 * Check which tolerances match, returning actions and what changed
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
        if (TARGET_IDS.has(t.id)) {
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

  // Focus: analyze records where tolerances match but detection missed them
  // First, let's look at what the tolerance is actually matching on

  // Group missed records by tolerance ID
  const missedByTolerance = {};
  let count = 0;

  for await (const line of rl) {
    if (!line.trim()) continue;
    count++;

    let record;
    try { record = JSON.parse(line); } catch { continue; }

    const matched = checkToleranceMatches(record);
    if (matched.length === 0) continue;

    // Now check if version info is extractable
    let prod, dev;
    try { prod = JSON.parse(record.prodBody); } catch { prod = null; }
    try { dev = JSON.parse(record.devBody); } catch { dev = null; }

    if (!prod || !dev) continue;

    // Check specific cases:
    // 1. hl7-terminology-cs-version-skew: Matches on version param or message text diffs
    // 2. expand-hl7-terminology-version-skew-params: Matches on warning-draft or used-codesystem version
    // 3. expand-hl7-terminology-version-skew-vs-metadata: Matches on ValueSet metadata diffs

    for (const m of matched) {
      if (!missedByTolerance[m.id]) missedByTolerance[m.id] = { count: 0, examples: [] };
      missedByTolerance[m.id].count++;

      // Check if we can find version info
      let hasVersionInParams = false;
      let hasVersionInUsedCS = false;
      let hasVersionInContains = false;
      let hasVersionInMessage = false;

      // Version params
      const prodVer = getParamValue(prod, 'version');
      const devVer = getParamValue(dev, 'version');
      if (prodVer && devVer && prodVer !== devVer) hasVersionInParams = true;

      // used-codesystem
      if (prod?.expansion?.parameter && dev?.expansion?.parameter) {
        const prodUcs = prod.expansion.parameter
          .filter(p => p.name === 'used-codesystem')
          .map(p => p.valueUri).sort();
        const devUcs = dev.expansion.parameter
          .filter(p => p.name === 'used-codesystem')
          .map(p => p.valueUri).sort();
        if (JSON.stringify(prodUcs) !== JSON.stringify(devUcs)) hasVersionInUsedCS = true;
      }

      // contains[].version
      if (prod?.expansion?.contains && dev?.expansion?.contains) {
        const prodVers = new Set(prod.expansion.contains.map(c => c.system + '|' + c.version));
        const devVers = new Set(dev.expansion.contains.map(c => c.system + '|' + c.version));
        if (JSON.stringify([...prodVers].sort()) !== JSON.stringify([...devVers].sort())) {
          hasVersionInContains = true;
        }
      }

      // Message text
      const prodMsg = getParamValue(prod, 'message');
      const devMsg = getParamValue(dev, 'message');
      if (prodMsg && devMsg && prodMsg !== devMsg) hasVersionInMessage = true;

      if (missedByTolerance[m.id].examples.length < 5) {
        missedByTolerance[m.id].examples.push({
          id: record.id,
          url: record.url,
          hasVersionInParams,
          hasVersionInUsedCS,
          hasVersionInContains,
          hasVersionInMessage,
          prodVer: prodVer?.substring(0, 60),
          devVer: devVer?.substring(0, 60),
          prodMsg: prodMsg?.substring(0, 100),
          devMsg: devMsg?.substring(0, 100),
          // For expand, check what params exist
          prodExpParams: prod?.expansion?.parameter?.map(p => p.name + '=' + (p.valueUri || p.valueString || '').substring(0, 40)),
          devExpParams: dev?.expansion?.parameter?.map(p => p.name + '=' + (p.valueUri || p.valueString || '').substring(0, 40)),
          // Check what the tolerance actually matches on
          toleranceAction: m.action,
        });
      }
    }

    if (count % 5000 === 0) process.stderr.write(`\r  Processed ${count}...`);
  }

  process.stderr.write('\n');

  console.log('=== MISSED BY DETECTION: DETAILED ANALYSIS ===\n');

  // Wait, actually the first analysis was checking if detection FINDS version skew.
  // But these 362 records ARE matched by tolerances. Let me re-examine.
  // The issue might be that the tolerance matches on things other than version diff
  // e.g., expand-hl7-terminology-version-skew-params also matches on warning-draft
  // even if the used-codesystem versions are the same after other normalizations.

  for (const [tolId, data] of Object.entries(missedByTolerance).sort()) {
    console.log(`\n${tolId}: ${data.count} records total`);
    for (const ex of data.examples) {
      console.log(`  Record: ${ex.id}`);
      console.log(`  URL: ${ex.url}`);
      console.log(`  Version in params: ${ex.hasVersionInParams}`);
      console.log(`  Version in used-cs: ${ex.hasVersionInUsedCS}`);
      console.log(`  Version in contains: ${ex.hasVersionInContains}`);
      console.log(`  Version in message: ${ex.hasVersionInMessage}`);
      if (ex.prodVer) console.log(`  Prod version: ${ex.prodVer}`);
      if (ex.devVer) console.log(`  Dev version: ${ex.devVer}`);
      if (ex.prodMsg) console.log(`  Prod msg: ${ex.prodMsg}`);
      if (ex.devMsg) console.log(`  Dev msg: ${ex.devMsg}`);
      if (ex.prodExpParams) {
        console.log(`  Prod exp params: ${JSON.stringify(ex.prodExpParams)}`);
      }
      if (ex.devExpParams) {
        console.log(`  Dev exp params: ${JSON.stringify(ex.devExpParams)}`);
      }
      console.log();
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
