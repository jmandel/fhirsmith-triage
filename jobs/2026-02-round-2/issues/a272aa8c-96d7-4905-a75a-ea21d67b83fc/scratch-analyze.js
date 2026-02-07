const rl = require("readline").createInterface({input: process.stdin});
rl.on("line", line => {
  const r = JSON.parse(line);
  const prodBody = JSON.parse(r.prodBody);
  const devBody = JSON.parse(r.devBody);
  const prodParams = (prodBody.expansion?.parameter || prodBody.parameter || []).filter(p => p.name === "used-codesystem");
  const devParams = (devBody.expansion?.parameter || devBody.parameter || []).filter(p => p.name === "used-codesystem");
  if(JSON.stringify(prodParams) !== JSON.stringify(devParams)) {
    console.log("id=" + r.id.substring(0,8) + " prod=" + JSON.stringify(prodParams) + " dev=" + JSON.stringify(devParams));
  }
});
