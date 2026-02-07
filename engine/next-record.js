#!/usr/bin/env node
'use strict';

/**
 * Issue directory picker: finds the next un-analyzed record from
 * deltas.ndjson and creates a prepared issue directory for it.
 *
 * Usage:
 *   node engine/next-record.js --job jobs/<round-name>
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
  console.error('Usage: node engine/next-record.js --job <job-directory>');
  process.exit(1);
}

const jobDir = path.resolve(JOB_DIR);
const { tolerances } = require(path.join(jobDir, 'tolerances'));
const DELTAS_FILE = path.join(jobDir, 'results/deltas/deltas.ndjson');
const ISSUES_DIR = path.join(jobDir, 'issues');

function sortKeysDeep(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function runTolerancePipeline(record) {
  let prod, dev;
  try { prod = JSON.parse(record.prodBody); } catch { prod = null; }
  try { dev = JSON.parse(record.devBody); } catch { dev = null; }

  const ctx = { record, prod, dev };
  const applied = [];
  for (const t of tolerances) {
    const action = t.match(ctx);
    if (action === 'skip') {
      applied.push(`${t.id}: skip`);
      return { prod: ctx.prod, dev: ctx.dev, skippedBy: t.id, applied };
    }
    if (action === 'normalize' && ctx.prod && ctx.dev) {
      const result = t.normalize(ctx);
      ctx.prod = result.prod;
      ctx.dev = result.dev;
      applied.push(`${t.id}: normalize`);
    }
  }
  return { prod: sortKeysDeep(ctx.prod), dev: sortKeysDeep(ctx.dev), skippedBy: null, applied };
}

async function main() {
  if (!fs.existsSync(DELTAS_FILE)) {
    console.error(`Delta file not found: ${DELTAS_FILE}`);
    process.exit(1);
  }

  fs.mkdirSync(ISSUES_DIR, { recursive: true });

  const rl = readline.createInterface({
    input: fs.createReadStream(DELTAS_FILE),
    crlfDelay: Infinity,
  });

  let total = 0;
  let analyzed = 0;
  let found = null;

  for await (const line of rl) {
    const raw = line.trim();
    if (!raw) continue;
    total++;

    const record = JSON.parse(raw);
    const recordId = record.id;
    if (!recordId) continue;

    const analysisFile = path.join(ISSUES_DIR, recordId, 'analysis.md');

    if (fs.existsSync(analysisFile)) {
      analyzed++;
      continue;
    }

    if (!found) {
      found = { raw, recordId, lineno: total };
    }
  }

  if (!found) {
    if (total === 0) {
      console.error(`Delta file is empty: ${DELTAS_FILE}`);
    } else {
      console.error(`All ${total} records have been analyzed!`);
    }
    process.exit(1);
  }

  // Create the issue directory and write files
  const { raw, recordId, lineno } = found;
  const record = JSON.parse(raw);
  const issueDir = path.join(ISSUES_DIR, recordId);
  fs.mkdirSync(issueDir, { recursive: true });

  // Write record.json
  fs.writeFileSync(
    path.join(issueDir, 'record.json'),
    JSON.stringify(record, null, 2)
  );

  // Write prod-raw.json and dev-raw.json
  let prodRaw, devRaw;
  try { prodRaw = JSON.parse(record.prodBody); } catch { prodRaw = null; }
  try { devRaw = JSON.parse(record.devBody); } catch { devRaw = null; }

  fs.writeFileSync(
    path.join(issueDir, 'prod-raw.json'),
    JSON.stringify(prodRaw, null, 2)
  );
  fs.writeFileSync(
    path.join(issueDir, 'dev-raw.json'),
    JSON.stringify(devRaw, null, 2)
  );

  // Run tolerance pipeline for normalized output
  const normalized = runTolerancePipeline(record);

  fs.writeFileSync(
    path.join(issueDir, 'prod-normalized.json'),
    JSON.stringify(normalized.prod, null, 2)
  );
  fs.writeFileSync(
    path.join(issueDir, 'dev-normalized.json'),
    JSON.stringify(normalized.dev, null, 2)
  );

  // Write applied tolerances
  fs.writeFileSync(
    path.join(issueDir, 'applied-tolerances.txt'),
    normalized.applied.length > 0
      ? normalized.applied.join('\n') + '\n'
      : '(none)\n'
  );

  // Write pick context so we can track delta count trajectory across rounds
  const remaining = total - analyzed;
  const priority = record.comparison?.priority || '?';
  fs.writeFileSync(
    path.join(issueDir, 'pick-context.json'),
    JSON.stringify({ pickedAt: new Date().toISOString(), total, analyzed, remaining, priority }, null, 2)
  );

  // Print summary
  console.log(`Record: ${lineno}/${total} (${analyzed} analyzed, ${remaining} remaining)`);
  console.log(`Priority: ${priority}`);
  console.log(`Issue dir: ${issueDir}`);
  console.log(`Record ID: ${record.id || '?'}`);
  console.log(`URL: ${record.url || '?'}`);
  console.log(`Method: ${record.method || '?'}`);
  console.log(`Prod status: ${record.prodStatus || '?'}`);
  console.log(`Dev status: ${record.devStatus || '?'}`);
  console.log(`Operation: ${record.comparison?.op || '?'}`);
  console.log(`Lookup: grep -n '${record.id}' ${path.join(jobDir, 'comparison.ndjson')}`);
}

main().catch(e => { console.error(e); process.exit(1); });
