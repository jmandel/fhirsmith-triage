// Check if extension child ordering is the ONLY difference, or if there are other diffs too
const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
let onlyExtDiff = 0;
let otherDiffsAlso = 0;
let total = 0;

function sortExtChildren(obj) {
  if (Array.isArray(obj)) {
    return obj.map(sortExtChildren);
  }
  if (obj && typeof obj === 'object') {
    const result = {};
    for (const k of Object.keys(obj).sort()) {
      if (k === 'extension' && Array.isArray(obj[k])) {
        // Sort child extensions by url
        const sorted = [...obj[k]].sort((a, b) => (a.url || '').localeCompare(b.url || ''));
        result[k] = sorted.map(sortExtChildren);
      } else {
        result[k] = sortExtChildren(obj[k]);
      }
    }
    return result;
  }
  return obj;
}

function normalize(body) {
  if (!body) return body;
  // Remove transient fields
  const b = { ...body };
  delete b.id;
  if (b.expansion) {
    const exp = { ...b.expansion };
    delete exp.identifier;
    delete exp.timestamp;
    // Remove includeDefinition param
    if (exp.parameter) {
      exp.parameter = exp.parameter.filter(p => p.name !== 'includeDefinition');
    }
    b.expansion = exp;
  }
  return b;
}

rl.on('line', line => {
  total++;
  const r = JSON.parse(line);
  const prod = normalize(JSON.parse(r.prodBody));
  const dev = normalize(JSON.parse(r.devBody));

  // Check if after sorting extensions they match
  const prodSorted = sortExtChildren(prod);
  const devSorted = sortExtChildren(dev);

  const prodJson = JSON.stringify(prodSorted);
  const devJson = JSON.stringify(devSorted);

  if (prodJson === devJson) {
    onlyExtDiff++;
  } else {
    otherDiffsAlso++;
    console.log(`  Record ${r.id}: has other diffs beyond extension ordering`);
  }
});

rl.on('close', () => {
  console.log(`\nTotal: ${total}`);
  console.log(`Only ext ordering diff: ${onlyExtDiff}`);
  console.log(`Other diffs also: ${otherDiffsAlso}`);
});
