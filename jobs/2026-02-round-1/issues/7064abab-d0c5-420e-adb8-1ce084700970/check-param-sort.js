'use strict';
const fs = require('fs');
const readline = require('readline');
const path = require('path');

const jobDir = path.resolve('jobs/2026-02-round-1');
const { tolerances, getParamValue } = require(path.join(jobDir, 'tolerances'));

function sortKeysDeep(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) sorted[key] = sortKeysDeep(obj[key]);
  return sorted;
}

function sortParamsByName(body) {
  if (!body || !body.parameter || !Array.isArray(body.parameter)) return body;
  return { ...body, parameter: [...body.parameter].sort((a,b) => (a.name||'').localeCompare(b.name||'')) };
}

function isParameters(obj) {
  return (obj && obj.resourceType === 'Parameters') || (obj && Array.isArray(obj.parameter));
}

function stripParams(body, ...names) {
  if (!body || !body.parameter) return body;
  return { ...body, parameter: body.parameter.filter(p => !names.includes(p.name)) };
}

async function main() {
  const rl = readline.createInterface({
    input: fs.createReadStream(path.join(jobDir, 'results/deltas/deltas.ndjson')),
    crlfDelay: Infinity,
  });
  let total = 0, paramSort = 0;
  for await (const line of rl) {
    if (!line.trim()) continue;
    total++;
    const rec = JSON.parse(line);
    let prod, dev;
    try { prod = JSON.parse(rec.prodBody); } catch { continue; }
    try { dev = JSON.parse(rec.devBody); } catch { continue; }

    // Apply existing tolerances
    if (isParameters(prod) || isParameters(dev)) {
      prod = stripParams(prod, 'diagnostics');
      dev = stripParams(dev, 'diagnostics');
    }

    // Now sort params by name
    prod = sortParamsByName(prod);
    dev = sortParamsByName(dev);

    // Deep compare
    if (JSON.stringify(sortKeysDeep(prod)) === JSON.stringify(sortKeysDeep(dev))) {
      paramSort++;
    }
  }
  console.log('Total deltas:', total);
  console.log('Fixed by param sorting:', paramSort);
  console.log('Remaining:', total - paramSort);
}
main();
