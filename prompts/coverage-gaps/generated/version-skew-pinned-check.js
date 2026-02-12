#!/usr/bin/env node
'use strict';

/**
 * Check how many version-skew records have pinned versions in the request.
 * Also check whether the version-pinning detection is robust.
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

function checkRequestPinning(record) {
  const url = decodeURIComponent(record.url);
  const results = {
    hasSystemVersionInUrl: url.includes('system-version'),
    hasVersionInUrl: /[?&]version=/.test(url),
    hasSystemVersionInBody: false,
    hasVersionInBody: false,
    pinnedVersionValue: null,
  };

  if (record.requestBody) {
    try {
      const req = JSON.parse(record.requestBody);
      if (isParameters(req)) {
        const sv = getParamValue(req, 'system-version');
        if (sv) {
          results.hasSystemVersionInBody = true;
          results.pinnedVersionValue = sv;
        }
        const v = getParamValue(req, 'version');
        if (v) {
          results.hasVersionInBody = true;
        }
      }
      // Also check if it's a ValueSet definition with a compose that pins versions
      if (req?.resourceType === 'ValueSet' && req.compose?.include) {
        for (const inc of req.compose.include) {
          if (inc.version) {
            results.hasVersionInBody = true;
            results.pinnedVersionValue = inc.version;
          }
        }
      }
    } catch {}
  }

  results.isPinned = results.hasSystemVersionInUrl || results.hasSystemVersionInBody ||
                     results.hasVersionInUrl || results.hasVersionInBody;
  return results;
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
        if (TARGET_IDS.has(t.id)) {
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
  let target9Matched = 0;
  let target9Pinned = 0;
  let target9Unpinned = 0;

  const pinnedExamples = [];

  // Per-tolerance pinning stats
  const perTolPinning = {};
  for (const id of TARGET_IDS) {
    perTolPinning[id] = { pinned: 0, unpinned: 0 };
  }

  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;

    let record;
    try { record = JSON.parse(line); } catch { continue; }

    const tolMatches = checkToleranceMatches(record);
    if (tolMatches.size === 0) continue;

    target9Matched++;
    const pinning = checkRequestPinning(record);

    if (pinning.isPinned) {
      target9Pinned++;
      if (pinnedExamples.length < 10) {
        pinnedExamples.push({
          id: record.id,
          url: record.url.substring(0, 120),
          pinning,
          tolerances: [...tolMatches],
        });
      }
    } else {
      target9Unpinned++;
    }

    for (const id of tolMatches) {
      if (pinning.isPinned) {
        perTolPinning[id].pinned++;
      } else {
        perTolPinning[id].unpinned++;
      }
    }

    if (total % 5000 === 0) process.stderr.write(`\r  Processed ${total}...`);
  }
  process.stderr.write('\n');

  console.log('=== REQUEST VERSION PINNING ANALYSIS ===\n');
  console.log(`Target-9 matched records: ${target9Matched}`);
  console.log(`  Pinned version in request: ${target9Pinned}`);
  console.log(`  Unpinned (no version in request): ${target9Unpinned}`);

  console.log('\n--- Per-Tolerance Pinning ---');
  for (const id of [...TARGET_IDS]) {
    const s = perTolPinning[id];
    if (s.pinned + s.unpinned === 0) continue;
    console.log(`  ${id}: ${s.pinned} pinned, ${s.unpinned} unpinned`);
  }

  if (pinnedExamples.length > 0) {
    console.log('\n--- Pinned Examples ---');
    for (const ex of pinnedExamples) {
      console.log(`  ${ex.id}`);
      console.log(`  URL: ${ex.url}`);
      console.log(`  Pinning: ${JSON.stringify(ex.pinning)}`);
      console.log(`  Tolerances: ${ex.tolerances.join(', ')}`);
      console.log();
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
