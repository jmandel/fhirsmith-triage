'use strict';
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const jobDir = path.resolve('jobs/2026-02-round-1');

function sortKeysDeep(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = sortKeysDeep(obj[key]);
  return sorted;
}

function stripParams(body, ...names) {
  if (!body || !body.parameter) return body;
  return { ...body, parameter: body.parameter.filter(p => !names.includes(p.name)) };
}

function isParameters(obj) {
  return (obj && obj.resourceType === 'Parameters') || (obj && Array.isArray(obj.parameter));
}

function sortParamsByName(body) {
  if (!body || !body.parameter || !Array.isArray(body.parameter)) return body;
  return { ...body, parameter: [...body.parameter].sort((a,b) => (a.name||'').localeCompare(b.name||'')) };
}

async function main() {
  // Read old deltas (archived)
  const archiveFiles = fs.readdirSync(path.join(jobDir, 'results/deltas'))
    .filter(f => f.match(/^deltas\.\d{8}-\d{6}\.ndjson$/))
    .sort();
  const archivePath = path.join(jobDir, 'results/deltas', archiveFiles[archiveFiles.length - 1]);

  // Read new deltas
  const newDeltaIds = new Set();
  const newRl = readline.createInterface({
    input: fs.createReadStream(path.join(jobDir, 'results/deltas/deltas.ndjson')),
    crlfDelay: Infinity,
  });
  for await (const line of newRl) {
    if (!line.trim()) continue;
    newDeltaIds.add(JSON.parse(line).id);
  }

  // Find eliminated records from old deltas
  const eliminated = [];
  const oldRl = readline.createInterface({
    input: fs.createReadStream(archivePath),
    crlfDelay: Infinity,
  });
  for await (const line of oldRl) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    if (!newDeltaIds.has(rec.id)) {
      eliminated.push(rec);
    }
  }

  console.log('Total eliminated:', eliminated.length);

  // Random sample of 15
  const sample = [];
  const indices = new Set();
  while (sample.length < Math.min(15, eliminated.length)) {
    const idx = Math.floor(Math.random() * eliminated.length);
    if (!indices.has(idx)) {
      indices.add(idx);
      sample.push(eliminated[idx]);
    }
  }

  console.log('\nValidating', sample.length, 'sampled eliminations:\n');

  for (let i = 0; i < sample.length; i++) {
    const rec = sample[i];
    let prod, dev;
    try { prod = JSON.parse(rec.prodBody); } catch { prod = null; }
    try { dev = JSON.parse(rec.devBody); } catch { dev = null; }

    // Apply strip-diagnostics
    if (isParameters(prod) || isParameters(dev)) {
      prod = stripParams(prod, 'diagnostics');
      dev = stripParams(dev, 'diagnostics');
    }

    // Check: are they equal WITHOUT param sorting?
    const equalWithout = JSON.stringify(sortKeysDeep(prod)) === JSON.stringify(sortKeysDeep(dev));

    // Check: are they equal WITH param sorting?
    const sortedProd = sortParamsByName(prod);
    const sortedDev = sortParamsByName(dev);
    const equalWith = JSON.stringify(sortKeysDeep(sortedProd)) === JSON.stringify(sortKeysDeep(sortedDev));

    // Extract param names from each
    const prodNames = (prod && prod.parameter) ? prod.parameter.map(p => p.name).join(', ') : 'N/A';
    const devNames = (dev && dev.parameter) ? dev.parameter.map(p => p.name).join(', ') : 'N/A';

    console.log(`--- Sample ${i+1} ---`);
    console.log('  ID:', rec.id);
    console.log('  URL:', rec.url);
    console.log('  Op:', rec.comparison ? rec.comparison.op : 'unknown');
    console.log('  Equal without sort:', equalWithout);
    console.log('  Equal with sort:', equalWith);
    console.log('  Prod params:', prodNames);
    console.log('  Dev params:', devNames);
    if (!equalWith) {
      console.log('  WARNING: NOT EQUAL EVEN WITH SORTING - unexpected');
    }
    if (equalWithout) {
      console.log('  NOTE: Already equal without sorting - eliminated for another reason');
    }
    console.log();
  }
}
main();
