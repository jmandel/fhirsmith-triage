#!/usr/bin/env node
/**
 * Replay comparison.ndjson requests against a running server.
 *
 * Usage:
 *   node engine/replay-for-coverage.js <comparison.ndjson> [--base http://localhost:3000] [--concurrency 20]
 *
 * Reads each line from comparison.ndjson, fires the request (method + url + requestBody),
 * and reports progress. Designed to be run while the server is instrumented with c8
 * for code coverage.
 */

const http = require('http');
const fs = require('fs');
const readline = require('readline');

const args = process.argv.slice(2);
let ndjsonPath = null;
let base = 'http://localhost:3000';
let concurrency = 20;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--base' && args[i + 1]) { base = args[++i]; }
  else if (args[i] === '--concurrency' && args[i + 1]) { concurrency = parseInt(args[++i], 10); }
  else if (!args[i].startsWith('-')) { ndjsonPath = args[i]; }
}

if (!ndjsonPath) {
  console.error('Usage: node replay-for-coverage.js <comparison.ndjson> [--base URL] [--concurrency N]');
  process.exit(1);
}

const baseUrl = new URL(base);

let total = 0;
let completed = 0;
let errors = 0;
let statusCounts = {};

function makeRequest(record) {
  return new Promise((resolve) => {
    const urlStr = record.url || '';
    const method = (record.method || 'GET').toUpperCase();
    const body = record.requestBody || null;

    const options = {
      hostname: baseUrl.hostname,
      port: baseUrl.port || 80,
      path: urlStr,
      method,
      headers: {
        'Accept': 'application/fhir+json',
      },
    };

    if (body && method === 'POST') {
      options.headers['Content-Type'] = 'application/fhir+json';
      options.headers['Content-Length'] = Buffer.byteLength(body);
    }

    const req = http.request(options, (res) => {
      // Drain response
      res.resume();
      res.on('end', () => {
        const sc = res.statusCode;
        statusCounts[sc] = (statusCounts[sc] || 0) + 1;
        completed++;
        if (completed % 500 === 0 || completed === total) {
          const pct = ((completed / total) * 100).toFixed(1);
          process.stderr.write(`\r  ${completed}/${total} (${pct}%) — errors: ${errors}`);
        }
        resolve();
      });
    });

    req.on('error', () => {
      errors++;
      completed++;
      resolve();
    });

    req.setTimeout(30000, () => {
      errors++;
      completed++;
      req.destroy();
      resolve();
    });

    if (body && method === 'POST') {
      req.write(body);
    }
    req.end();
  });
}

async function main() {
  // First pass: count lines
  console.error('Counting records...');
  const countStream = fs.createReadStream(ndjsonPath, 'utf-8');
  const countRl = readline.createInterface({ input: countStream, crlfDelay: Infinity });
  for await (const _ of countRl) { total++; }
  console.error(`Found ${total} records to replay`);

  // Second pass: replay with concurrency
  console.error(`Replaying against ${base} (concurrency=${concurrency})...`);
  const start = Date.now();

  const stream = fs.createReadStream(ndjsonPath, 'utf-8');
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });

  const inflight = new Set();

  for await (const line of rl) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }

    const p = makeRequest(record).then(() => inflight.delete(p));
    inflight.add(p);

    if (inflight.size >= concurrency) {
      await Promise.race(inflight);
    }
  }

  await Promise.all(inflight);

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.error(`\n\nDone: ${completed} requests in ${elapsed}s (${(completed / elapsed * 1).toFixed(0)} req/s)`);
  console.error(`Errors: ${errors}`);
  console.error('Status codes:', JSON.stringify(statusCounts, null, 2));
}

main().catch(err => { console.error(err); process.exit(1); });
