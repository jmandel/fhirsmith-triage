// Find IDs in old deltas that are not in new deltas (eliminated records)
const fs = require('fs');
const oldFile = process.argv[2];
const newFile = process.argv[3];

const newIds = new Set();
for (const line of fs.readFileSync(newFile, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  newIds.add(r.id);
}

const eliminated = [];
for (const line of fs.readFileSync(oldFile, 'utf8').trim().split('\n')) {
  const r = JSON.parse(line);
  if (!newIds.has(r.id)) {
    eliminated.push(r);
  }
}

console.log("Eliminated records:", eliminated.length);
console.log("---");

// Validate each eliminated record
for (const r of eliminated) {
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);

  const prodHasTooCostly = (prod.expansion?.extension || []).some(
    e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
  );
  const devHasTooCostly = (dev.expansion?.extension || []).some(
    e => e.url === 'http://hl7.org/fhir/StructureDefinition/valueset-toocostly'
  );

  const prodUcs = (prod.expansion?.parameter || []).filter(p => p.name === 'used-codesystem');
  const devUcs = (dev.expansion?.parameter || []).filter(p => p.name === 'used-codesystem');

  const vsUrl = prod.url || dev.url || "?";
  const prodContains = (prod.expansion?.contains || []).length;
  const devContains = (dev.expansion?.contains || []).length;

  console.log(`ID: ${r.id.substring(0,8)}`);
  console.log(`  VS: ${vsUrl}`);
  console.log(`  prod toocostly: ${prodHasTooCostly}, dev toocostly: ${devHasTooCostly}`);
  console.log(`  prod UCS: ${JSON.stringify(prodUcs.map(p=>p.valueUri))}`);
  console.log(`  dev UCS: ${JSON.stringify(devUcs.map(p=>p.valueUri))}`);
  console.log(`  prod contains: ${prodContains}, dev contains: ${devContains}`);
  console.log(`  prod status: ${r.prod.status}, dev status: ${r.dev.status}`);
  console.log(`  VALID: ${prodHasTooCostly && !devHasTooCostly && r.prod.status === 200 && r.dev.status === 200 ? 'YES' : 'CHECK'}`);
  console.log("");
}
