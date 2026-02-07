const rl = require("readline").createInterface({input: process.stdin});
let count = 0;
rl.on("line", line => {
  const r = JSON.parse(line);
  if (r.comparison.op !== "expand") return;
  if (r.prod.status !== 200 || r.dev.status !== 200) return;
  const prod = JSON.parse(r.prodBody);
  const dev = JSON.parse(r.devBody);
  if (!prod.expansion?.parameter || !dev.expansion?.parameter) return;
  const prodUcs = prod.expansion.parameter.filter(p => p.name === "used-codesystem");
  const devUcs = dev.expansion.parameter.filter(p => p.name === "used-codesystem");
  // Dev has used-codesystem(s) that prod doesn't have at all (not just different version)
  if (prodUcs.length === 0 && devUcs.length > 0) {
    count++;
    console.log(r.id.substring(0,8) + " devUcs=" + JSON.stringify(devUcs.map(p => p.valueUri)));
  }
});
rl.on("close", () => {
  console.log("Total dev-only used-codesystem (expand, both 200):", count);
});
