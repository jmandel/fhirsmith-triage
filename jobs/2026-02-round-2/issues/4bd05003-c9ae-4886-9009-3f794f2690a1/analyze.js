const fs = require("fs");
const lines = fs.readFileSync("jobs/2026-02-round-2/results/deltas/deltas.ndjson","utf8").trim().split("\n");
let patterns = {};
let isOnlyDiff = 0;
let hasOtherDiffs = 0;
for (const line of lines) {
  const r = JSON.parse(line);
  if (!r.prodBody || !r.devBody) continue;
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);
  const prodParams = prod.expansion ? prod.expansion.parameter : (prod.parameter || []);
  const devParams = dev.expansion ? dev.expansion.parameter : (dev.parameter || []);
  if (!prodParams || !devParams) continue;
  const prodDL = prodParams.find(p => p.name === "displayLanguage");
  const devDL = devParams.find(p => p.name === "displayLanguage");
  if ((prodDL || devDL) && JSON.stringify(prodDL) !== JSON.stringify(devDL)) {
    const key = `prod=${prodDL ? prodDL.valueCode : "ABSENT"} dev=${devDL ? devDL.valueCode : "ABSENT"}`;
    patterns[key] = (patterns[key] || 0) + 1;
  }
}
console.log("DisplayLanguage mismatch patterns:");
console.log(JSON.stringify(patterns, null, 2));
