const readline = require('readline');
const rl = readline.createInterface({ input: process.stdin });
let count = 0;
let total = 0;
let onlyExtOrderDiff = 0;

rl.on('line', line => {
  total++;
  const r = JSON.parse(line);
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);
  const pe = (prod.expansion?.extension || []);
  const de = (dev.expansion?.extension || []);
  const pPropExts = pe.filter(e => e.url?.includes('expansion.property'));
  const dPropExts = de.filter(e => e.url?.includes('expansion.property'));
  const prodOrder = pPropExts.map(e => e.extension?.map(c => c.url));
  const devOrder = dPropExts.map(e => e.extension?.map(c => c.url));
  if (JSON.stringify(prodOrder) !== JSON.stringify(devOrder)) {
    count++;
  }
});

rl.on('close', () => {
  console.log(`Records with differing expansion.extension child order: ${count} out of ${total}`);
});
