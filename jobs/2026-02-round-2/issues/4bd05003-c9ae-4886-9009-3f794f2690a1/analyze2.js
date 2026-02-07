const fs = require("fs");
const lines = fs.readFileSync("jobs/2026-02-round-2/results/deltas/deltas.ndjson","utf8").trim().split("\n");

// Find all records where displayLanguage echoed value is truncated (has region in request/prod but not in dev)
let frMatches = [];
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
  if (prodDL && devDL && prodDL.valueCode !== devDL.valueCode) {
    frMatches.push({id: r.id, prodVal: prodDL.valueCode, devVal: devDL.valueCode, url: r.url, method: r.method});
  }
}
console.log("Records with displayLanguage value mismatch (both present, values differ):");
console.log(JSON.stringify(frMatches, null, 2));

// Also check: across ALL deltas, any time a request has displayLanguage with a region code
let regionCodeRequests = 0;
for (const line of lines) {
  const r = JSON.parse(line);
  if (!r.requestBody) continue;
  const req = JSON.parse(r.requestBody);
  const params = req.parameter || [];
  const dl = params.find(p => p.name === "displayLanguage");
  if (dl && dl.valueCode && dl.valueCode.includes("-")) {
    regionCodeRequests++;
  }
}
console.log("\nTotal deltas with region-coded displayLanguage in request:", regionCodeRequests);
