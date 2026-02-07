#!/usr/bin/env node
'use strict';

/**
 * Comparison engine: reads comparison.ndjson, applies the unified tolerance
 * pipeline, categorizes deltas by priority, writes results.
 *
 * Tolerances are loaded from <job>/tolerances.js.
 *
 * Usage:
 *   node engine/compare.js --job jobs/<round-name>
 *
 * The job directory must contain:
 *   - comparison.ndjson (input data)
 *   - tolerances.js (tolerance definitions)
 *
 * Output is written to <job>/results/
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

function getArg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

const JOB_DIR = getArg('--job', null);
if (!JOB_DIR) {
  console.error('Usage: node engine/compare.js --job <job-directory>');
  process.exit(1);
}

const jobDir = path.resolve(JOB_DIR);
const { tolerances, getParamValue } = require(path.join(jobDir, 'tolerances'));
const inputPath = path.join(jobDir, 'comparison.ndjson');
const outDir = path.join(jobDir, 'results');

// ---- Comparison ----

function getOperation(url) {
  const base = url.split('?')[0];
  if (base.includes('$validate-code')) return 'validate-code';
  if (base.includes('$batch-validate-code')) return 'batch-validate-code';
  if (base.includes('$expand')) return 'expand';
  if (base.includes('$lookup')) return 'lookup';
  if (base.includes('$subsumes')) return 'subsumes';
  if (base.includes('$translate')) return 'translate';
  if (base.includes('/metadata')) return 'metadata';
  if (base.match(/\/(CodeSystem|ValueSet|ConceptMap)(\/|$)/)) return 'read';
  return 'other';
}

/**
 * Deep-sort all object keys recursively so JSON.stringify produces
 * a canonical string regardless of key insertion order.
 *
 * JSON object key order carries no meaning in FHIR. This is fundamental
 * to comparison semantics, not a tolerance — it applies unconditionally.
 */
function sortKeysDeep(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function deepEqual(a, b) {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

function compareRecord(record) {
  const op = getOperation(record.url);
  const prodStatus = record.prod.status;
  const devStatus = record.dev.status;

  // Parse bodies
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { prod = null; }
  try { dev = JSON.parse(record.devBody); } catch { dev = null; }

  // Apply tolerance pipeline — track which kinds contributed
  const ctx = { record, prod, dev };
  let normalizedBy = null; // 'equiv-autofix' or 'temp-tolerance'
  for (const t of tolerances) {
    const action = t.match(ctx);
    if (action === 'skip') {
      return { category: 'SKIP', reason: t.id, kind: t.kind || 'unknown', op };
    }
    if (action === 'normalize' && ctx.prod && ctx.dev) {
      const before = JSON.stringify(ctx.prod) + JSON.stringify(ctx.dev);
      const result = t.normalize(ctx);
      ctx.prod = result.prod;
      ctx.dev = result.dev;
      const after = JSON.stringify(ctx.prod) + JSON.stringify(ctx.dev);
      if (before !== after) {
        // Escalate: temp-tolerance trumps equiv-autofix
        if (t.kind === 'temp-tolerance') normalizedBy = 'temp-tolerance';
        else if (!normalizedBy) normalizedBy = t.kind || 'equiv-autofix';
      }
    }
  }
  prod = ctx.prod;
  dev = ctx.dev;

  // Status code mismatch cases
  if (prodStatus !== devStatus) {
    if (devStatus === 500) {
      if (prodStatus === 200) return { category: 'dev-crash-on-valid', op };
      return { category: 'dev-crash-on-error', op, prodStatus, devStatus };
    }
    if (prodStatus === 200 && devStatus === 404) return { category: 'missing-resource', op };
    return { category: 'status-mismatch', op, prodStatus, devStatus };
  }

  // Parse failure
  if (!prod || !dev) {
    return { category: 'parse-error', op };
  }

  // Check result boolean (for validate-code)
  const prodResult = getParamValue(prod, 'result');
  const devResult = getParamValue(dev, 'result');
  if (prodResult !== undefined && devResult !== undefined && prodResult !== devResult) {
    return {
      category: 'result-disagrees',
      op,
      prodResult,
      devResult,
      system: getParamValue(prod, 'system') || getParamValue(dev, 'system'),
      code: getParamValue(prod, 'code') || getParamValue(dev, 'code'),
    };
  }

  // Deep compare normalized bodies
  if (deepEqual(prod, dev)) {
    return { category: 'OK', normalizedBy, op };
  }

  // Find specific differences
  return {
    category: 'content-differs',
    op,
    diffs: findParameterDiffs(prod, dev),
  };
}

function findParameterDiffs(prod, dev) {
  const diffs = [];
  const prodParams = new Map((prod.parameter || []).map(p => [p.name, p]));
  const devParams = new Map((dev.parameter || []).map(p => [p.name, p]));

  for (const [name, param] of prodParams) {
    if (!devParams.has(name)) {
      diffs.push({ type: 'missing-in-dev', param: name });
    } else if (!deepEqual(param, devParams.get(name))) {
      diffs.push({ type: 'value-differs', param: name });
    }
  }
  for (const name of devParams.keys()) {
    if (!prodParams.has(name)) {
      diffs.push({ type: 'extra-in-dev', param: name });
    }
  }
  return diffs;
}

// ---- Output writers ----

class OutputWriter {
  constructor(outDir) {
    this.outDir = outDir;
    this.deltasDir = path.join(outDir, 'deltas');
    fs.mkdirSync(this.deltasDir, { recursive: true });
    const filePath = path.join(this.deltasDir, 'deltas.ndjson');
    this.stream = fs.createWriteStream(filePath);
    this.counts = {};
  }

  write(category, record, comparison) {
    this.counts[category] = (this.counts[category] || 0) + 1;
    this.stream.write(JSON.stringify({
      id: record.id,
      url: record.url,
      method: record.method,
      prod: record.prod,
      dev: record.dev,
      comparison,
      prodBody: record.prodBody,
      devBody: record.devBody,
      ...(record.requestBody ? { requestBody: record.requestBody } : {}),
    }) + '\n');
  }

  close() {
    return new Promise(r => this.stream.end(r));
  }
}

// ---- Main ----

async function main() {
  console.log(`Job directory: ${jobDir}`);
  console.log(`Loaded ${tolerances.length} tolerances`);

  fs.mkdirSync(outDir, { recursive: true });

  const writers = new OutputWriter(outDir);
  const summary = {
    jobDir: JOB_DIR,
    timestamp: new Date().toISOString(),
    totalRecords: 0,
    skipped: 0,
    skippedByKind: {},
    skippedReasons: {},
    categories: {},
    okBreakdown: { strict: 0, 'equiv-autofix': 0, 'temp-tolerance': 0 },
    operationBreakdown: {},
  };

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    summary.totalRecords++;

    let record;
    try {
      record = JSON.parse(line);
    } catch (e) {
      console.error(`Line ${summary.totalRecords}: parse error: ${e.message}`);
      continue;
    }

    const comparison = compareRecord(record);
    const category = comparison.category;

    // Handle skipped records
    if (category === 'SKIP') {
      summary.skipped++;
      const kind = comparison.kind || 'unknown';
      summary.skippedByKind[kind] = (summary.skippedByKind[kind] || 0) + 1;
      summary.skippedReasons[comparison.reason] = (summary.skippedReasons[comparison.reason] || 0) + 1;
      continue;
    }

    // Track stats
    summary.categories[category] = (summary.categories[category] || 0) + 1;
    if (category === 'OK') {
      // Use original match field for strict; key-sorting counts as equiv-autofix
      const bucket = record.match === true ? 'strict' : (comparison.normalizedBy || 'equiv-autofix');
      summary.okBreakdown[bucket] = (summary.okBreakdown[bucket] || 0) + 1;
    }
    const op = comparison.op || 'unknown';
    if (!summary.operationBreakdown[op]) summary.operationBreakdown[op] = {};
    summary.operationBreakdown[op][category] = (summary.operationBreakdown[op][category] || 0) + 1;

    // Write delta (skip OK matches)
    if (category !== 'OK') {
      writers.write(category, record, comparison);
    }

    if (summary.totalRecords % 1000 === 0) {
      process.stdout.write(`\r  Processed ${summary.totalRecords} records...`);
    }
  }

  await writers.close();

  // Write summary
  const summaryPath = path.join(outDir, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

  console.log(`\n\nComparison complete.`);
  console.log(`  Total records: ${summary.totalRecords}`);
  console.log(`  Skipped (tolerance rules): ${summary.skipped}`);
  console.log(`\nCategory breakdown:`);
  for (const [c, count] of Object.entries(summary.categories).sort()) {
    console.log(`  ${c}: ${count}`);
  }
  console.log(`\nOperation breakdown:`);
  for (const [op, categories] of Object.entries(summary.operationBreakdown).sort()) {
    const parts = Object.entries(categories).sort().map(([c, n]) => `${c}=${n}`).join(', ');
    console.log(`  ${op}: ${parts}`);
  }
  console.log(`\nResults written to ${outDir}/`);
}

main().catch(e => { console.error(e); process.exit(1); });
