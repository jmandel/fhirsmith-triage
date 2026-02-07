// Find records eliminated by the new tolerance and validate them
const fs = require('fs');
const oldPath = process.argv[2]; // archived deltas
const newPath = process.argv[3]; // new deltas

const oldIds = new Set();
const newIds = new Set();

for (const line of fs.readFileSync(oldPath, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  oldIds.add(r.id);
}
for (const line of fs.readFileSync(newPath, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  newIds.add(r.id);
}

const eliminated = [];
for (const id of oldIds) {
  if (!newIds.has(id)) eliminated.push(id);
}

console.log(`Eliminated ${eliminated.length} records:`);

// Load the full comparison data to inspect eliminated records
const compPath = process.argv[4]; // comparison.ndjson
const compLines = fs.readFileSync(compPath, 'utf8').trim().split('\n');
const compMap = new Map();
for (const line of compLines) {
  const r = JSON.parse(line);
  compMap.set(r.id, r);
}

for (const id of eliminated) {
  const r = compMap.get(id);
  if (!r) {
    console.log(`  ${id}: NOT FOUND in comparison.ndjson`);
    continue;
  }
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);

  // Check the specific pattern: expansion.extension child ordering
  const pe = (prod.expansion?.extension || []);
  const de = (dev.expansion?.extension || []);

  let hasExtOrderDiff = false;
  for (let i = 0; i < pe.length && i < de.length; i++) {
    if (!pe[i]?.extension || !de[i]?.extension) continue;
    const pUrls = pe[i].extension.map(e => e.url).join(',');
    const dUrls = de[i].extension.map(e => e.url).join(',');
    if (pUrls !== dUrls) hasExtOrderDiff = true;
  }

  console.log(`  ${id}: url=${r.url} extOrderDiff=${hasExtOrderDiff}`);

  // Also verify: after removing expansion-level ext child ordering, id, timestamp, identifier, includeDefinition,
  // are there any other content diffs?
  // (spot check a few fields)
  console.log(`    prod.total=${prod.expansion?.total} dev.total=${dev.expansion?.total}`);
  console.log(`    prod.contains.length=${prod.expansion?.contains?.length} dev.contains.length=${dev.expansion?.contains?.length}`);

  // Check contains content matches
  const prodCodes = (prod.expansion?.contains || []).map(c => c.code).sort().join(',');
  const devCodes = (dev.expansion?.contains || []).map(c => c.code).sort().join(',');
  console.log(`    codes match: ${prodCodes === devCodes}`);

  // Check display text matches
  const prodDisplays = (prod.expansion?.contains || []).map(c => c.display).sort().join('|');
  const devDisplays = (dev.expansion?.contains || []).map(c => c.display).sort().join('|');
  console.log(`    displays match: ${prodDisplays === devDisplays}`);
}
