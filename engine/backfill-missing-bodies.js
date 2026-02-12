'use strict';

/**
 * Backfill missing response bodies in comparison.ndjson by replaying requests.
 *
 * Finds records where prodBody/devBody are absent, replays the request against
 * both prod and dev servers, and writes a patched copy of the file.
 *
 * Usage:
 *   node engine/backfill-missing-bodies.js <comparison.ndjson>
 *   node engine/backfill-missing-bodies.js <comparison.ndjson> --concurrency 4
 *   node engine/backfill-missing-bodies.js <comparison.ndjson> --dry-run
 */

const fs = require('fs');
const readline = require('readline');
const crypto = require('crypto');
const path = require('path');

const PROD_BASE = 'https://tx.fhir.org';
const DEV_BASE = 'https://tx-dev.fhir.org';
const DEFAULT_CONCURRENCY = 2;
const DEFAULT_TIMEOUT_MS = 30000;
const DELAY_MS = 500;

function md5Hex(text) {
  return crypto.createHash('md5').update(text || '', 'utf8').digest('hex');
}

async function fetchOne(base, record, timeoutMs) {
  const target = new URL(record.url, base).toString();
  const method = (record.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/fhir+json' };
  const init = { method, headers };

  if (method === 'POST' && record.requestBody) {
    headers['Content-Type'] = 'application/fhir+json';
    init.body = record.requestBody;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    const contentType = res.headers.get('content-type') || '';
    return {
      status: res.status,
      contentType,
      size: Buffer.byteLength(body, 'utf8'),
      hash: md5Hex(body),
      body,
    };
  } catch (err) {
    return { status: 0, contentType: '', size: 0, hash: '', body: '', error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const concIdx = args.indexOf('--concurrency');
  const concurrency = concIdx >= 0 ? parseInt(args[concIdx + 1], 10) : DEFAULT_CONCURRENCY;
  const filePath = args.find(a => !a.startsWith('--') && (concIdx < 0 || a !== args[concIdx + 1]));

  if (!filePath) {
    console.error('Usage: node engine/backfill-missing-bodies.js <comparison.ndjson> [--concurrency N] [--dry-run]');
    process.exit(1);
  }

  // Pass 1: stream-read to find records missing bodies
  console.log(`Scanning ${filePath} for records with missing bodies...`);
  const missing = new Map(); // id -> { record, lineNum }
  let lineNum = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(filePath) });
  for await (const line of rl) {
    const hasProdBody = line.includes('"prodBody"');
    const hasDevBody = line.includes('"devBody"');
    if (!hasProdBody && !hasDevBody) {
      const rec = JSON.parse(line);
      missing.set(rec.id, { record: rec, lineNum });
    }
    lineNum++;
  }
  console.log(`Found ${missing.size} records with missing bodies out of ${lineNum} total`);

  if (missing.size === 0) return;

  if (dryRun) {
    console.log('Dry run — would replay these:');
    for (const [id, { record }] of missing) {
      console.log(`  ${id} ${record.method} ${record.url}`);
    }
    return;
  }

  // Replay missing records
  const entries = [...missing.values()];
  let nextIdx = 0;
  let completed = 0;
  let patched = 0;
  let failed = 0;
  const patchMap = new Map(); // id -> patched JSON string

  async function worker() {
    while (true) {
      const idx = nextIdx++;
      if (idx >= entries.length) break;

      const { record } = entries[idx];

      const [prodResult, devResult] = await Promise.all([
        fetchOne(PROD_BASE, record, DEFAULT_TIMEOUT_MS),
        fetchOne(DEV_BASE, record, DEFAULT_TIMEOUT_MS),
      ]);

      completed++;

      if (prodResult.error || devResult.error) {
        failed++;
        console.error(`  [${completed}/${entries.length}] FAILED ${record.id}: prod=${prodResult.error || 'ok'} dev=${devResult.error || 'ok'}`);
      } else {
        record.prodBody = prodResult.body;
        record.devBody = devResult.body;
        record.prod = {
          ...record.prod,
          status: prodResult.status,
          contentType: prodResult.contentType,
          size: prodResult.size,
          hash: prodResult.hash,
        };
        record.dev = {
          ...record.dev,
          status: devResult.status,
          contentType: devResult.contentType,
          size: devResult.size,
          hash: devResult.hash,
        };
        record.rawMatch = prodResult.body === devResult.body;
        delete record.normMatch;
        patchMap.set(record.id, JSON.stringify(record));
        patched++;
      }

      if (completed % 10 === 0 || completed === entries.length) {
        console.log(`  Replayed: ${completed}/${entries.length} (${patched} patched, ${failed} failed)`);
      }

      await sleep(DELAY_MS);
    }
  }

  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  console.log(`\nReplay done. Patched ${patched}, failed ${failed}.`);
  if (patched === 0) return;

  // Pass 2: stream-read original file, write patched copy, then rename
  const tmpPath = filePath + '.tmp';
  console.log(`Writing patched file to ${tmpPath}...`);
  const rl2 = readline.createInterface({ input: fs.createReadStream(filePath) });
  const out = fs.createWriteStream(tmpPath);
  let patchedCount = 0;

  for await (const line of rl2) {
    // Quick check: does this line's id match any patch?
    const hasProdBody = line.includes('"prodBody"');
    const hasDevBody = line.includes('"devBody"');
    if (!hasProdBody && !hasDevBody) {
      // Extract id without full parse
      const m = line.match(/"id":"([^"]+)"/);
      if (m && patchMap.has(m[1])) {
        out.write(patchMap.get(m[1]) + '\n');
        patchedCount++;
        continue;
      }
    }
    out.write(line + '\n');
  }

  await new Promise(resolve => out.end(resolve));
  fs.renameSync(tmpPath, filePath);
  console.log(`Done. Patched ${patchedCount} records in ${filePath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
