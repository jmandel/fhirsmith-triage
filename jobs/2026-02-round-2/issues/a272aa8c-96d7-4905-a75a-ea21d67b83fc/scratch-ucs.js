const rl = require("readline").createInterface({input: process.stdin});
let devOnlyCount = 0;
let prodOnlyCount = 0;
const devOnlyVals = {};
const prodOnlyVals = {};
rl.on("line", line => {
  const r = JSON.parse(line);
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);
  const prodParams = (prod.expansion?.parameter || prod.parameter || []).filter(p => p.name === "used-codesystem").map(p => p.valueUri);
  const devParams = (dev.expansion?.parameter || dev.parameter || []).filter(p => p.name === "used-codesystem").map(p => p.valueUri);

  // Find used-codesystems in dev but not prod
  for (const v of devParams) {
    if (!prodParams.includes(v)) {
      devOnlyCount++;
      devOnlyVals[v] = (devOnlyVals[v] || 0) + 1;
    }
  }
  // Find used-codesystems in prod but not dev
  for (const v of prodParams) {
    if (!devParams.includes(v)) {
      prodOnlyCount++;
      prodOnlyVals[v] = (prodOnlyVals[v] || 0) + 1;
    }
  }
});
rl.on("close", () => {
  console.log("Dev-only used-codesystem count:", devOnlyCount);
  console.log("Dev-only values:", JSON.stringify(devOnlyVals, null, 2));
  console.log("Prod-only used-codesystem count:", prodOnlyCount);
  console.log("Prod-only values:", JSON.stringify(prodOnlyVals, null, 2));
});
