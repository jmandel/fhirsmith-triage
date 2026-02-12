#!/usr/bin/env node
'use strict';

/**
 * V4: Investigate the 41 expand-hl7-terminology-version-skew-params records without signals
 * and understand the directionality issue.
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

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(COMPARISON_FILE),
    crlfDelay: Infinity,
  });

  let count = 0;
  const noSignalExamples = [];

  // For directionality analysis
  const versionPairDirections = {};

  for await (const line of rl) {
    if (!line.trim()) continue;
    count++;

    let record;
    try { record = JSON.parse(line); } catch { continue; }

    let prod, dev;
    try { prod = JSON.parse(record.prodBody); } catch { continue; }
    try { dev = JSON.parse(record.devBody); } catch { continue; }

    // Check if expand-hl7-terminology-version-skew-params matches
    if (!/\/ValueSet\/\$expand/.test(record.url)) continue;
    if (prod?.resourceType !== 'ValueSet' || dev?.resourceType !== 'ValueSet') continue;
    if (!prod?.expansion?.parameter || !dev?.expansion?.parameter) continue;

    // Check for warning-draft in either side
    const hasWarningDraft = [...(prod.expansion.parameter || []), ...(dev.expansion.parameter || [])]
      .some(p => p.name === 'warning-draft');

    // Check for used-codesystem version mismatch on terminology.hl7.org systems
    const prodHl7Ucs = (prod.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem' && (p.valueUri || '').includes('terminology.hl7.org/CodeSystem/'))
      .map(p => p.valueUri).sort();
    const devHl7Ucs = (dev.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem' && (p.valueUri || '').includes('terminology.hl7.org/CodeSystem/'))
      .map(p => p.valueUri).sort();
    const hasVersionMismatch = JSON.stringify(prodHl7Ucs) !== JSON.stringify(devHl7Ucs);

    if (!hasWarningDraft && !hasVersionMismatch) continue;

    // Track version pairs for directionality
    for (let i = 0; i < prodHl7Ucs.length; i++) {
      const pUri = prodHl7Ucs[i];
      const pParts = pUri.split('|');
      for (let j = 0; j < devHl7Ucs.length; j++) {
        const dUri = devHl7Ucs[j];
        const dParts = dUri.split('|');
        if (pParts[0] === dParts[0] && pParts[1] !== dParts[1]) {
          const key = `${pParts[0]}: prod=${pParts[1]} dev=${dParts[1]}`;
          versionPairDirections[key] = (versionPairDirections[key] || 0) + 1;
        }
      }
    }

    // Check if there's a detectable signal in the raw bodies
    let hasSignal = false;

    // used-codesystem difference
    const prodAllUcs = (prod.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem')
      .map(p => p.valueUri).sort();
    const devAllUcs = (dev.expansion.parameter || [])
      .filter(p => p.name === 'used-codesystem')
      .map(p => p.valueUri).sort();
    if (JSON.stringify(prodAllUcs) !== JSON.stringify(devAllUcs)) hasSignal = true;

    // warning-draft check
    const prodHasWD = (prod.expansion.parameter || []).some(p => p.name === 'warning-draft');
    const devHasWD = (dev.expansion.parameter || []).some(p => p.name === 'warning-draft');
    if (prodHasWD !== devHasWD) hasSignal = true;

    if (!hasSignal && noSignalExamples.length < 10) {
      noSignalExamples.push({
        id: record.id,
        url: record.url,
        prodParams: (prod.expansion.parameter || []).map(p => `${p.name}=${(p.valueUri || p.valueString || JSON.stringify(p.valueBoolean) || '').substring(0, 60)}`),
        devParams: (dev.expansion.parameter || []).map(p => `${p.name}=${(p.valueUri || p.valueString || JSON.stringify(p.valueBoolean) || '').substring(0, 60)}`),
        prodHasWD,
        devHasWD,
        hasVersionMismatch,
        hasWarningDraft,
      });
    }

    if (count % 5000 === 0) process.stderr.write(`\r  Processed ${count}...`);
  }
  process.stderr.write('\n');

  console.log('=== HL7 TERMINOLOGY VERSION DIRECTION ANALYSIS ===\n');
  console.log('Version pairs (prod vs dev):');
  for (const [pair, count] of Object.entries(versionPairDirections).sort((a,b) => b[1] - a[1])) {
    console.log(`  ${count}x  ${pair}`);
  }

  console.log(`\n=== RECORDS WITHOUT DETECTABLE SIGNAL (${noSignalExamples.length}) ===\n`);
  for (const ex of noSignalExamples) {
    console.log(`Record: ${ex.id}`);
    console.log(`URL: ${ex.url}`);
    console.log(`hasWarningDraft: ${ex.hasWarningDraft}, hasVersionMismatch: ${ex.hasVersionMismatch}`);
    console.log(`prodHasWD: ${ex.prodHasWD}, devHasWD: ${ex.devHasWD}`);
    console.log(`Prod params: ${JSON.stringify(ex.prodParams)}`);
    console.log(`Dev params: ${JSON.stringify(ex.devParams)}`);
    console.log();
  }

  // === SNOMED DIRECTION ANALYSIS ===
  console.log('\n=== SNOMED VERSION DIRECTION ANALYSIS ===\n');
  console.log('SNOMED prod=20250201 means international edition Feb 2025');
  console.log('SNOMED dev=20240201 means international edition Feb 2024');
  console.log('So prod is NEWER than dev for SNOMED International.');
  console.log('');
  console.log('SNOMED prod=20250901 means US edition Sep 2025');
  console.log('SNOMED dev=20250301 means US edition Mar 2025');
  console.log('So prod is NEWER than dev for SNOMED US.');
  console.log('');
  console.log('For HL7 terminology, prod reports version 4.0.1 (FHIR R4 version)');
  console.log('Dev reports actual THO version like 2.0.0, 2.0.1, 3.0.0.');
  console.log('These are NOT comparable - prod is using FHIR version as CS version');
  console.log('while dev uses the actual HL7 Terminology version.');
  console.log('The ACTUAL content in dev is NEWER because THO packages are updated more frequently.');
  console.log('');
  console.log('v2-0360: prod=2.0.0, dev=3.0.0. Dev is NEWER.');
}

main().catch(e => { console.error(e); process.exit(1); });
