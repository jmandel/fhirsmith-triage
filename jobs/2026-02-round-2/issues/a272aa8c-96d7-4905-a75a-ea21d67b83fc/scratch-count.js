const rl = require("readline").createInterface({input: process.stdin});
let count = 0;
const ids = [];
rl.on("line", line => {
  const r = JSON.parse(line);
  if (r.prod.status === 200 && r.dev.status === 200) {
    const prod = JSON.parse(r.prodBody);
    const dev = JSON.parse(r.devBody);
    const prodHas = JSON.stringify(prod.expansion?.extension || []).includes("toocostly");
    const devHas = JSON.stringify(dev.expansion?.extension || []).includes("toocostly");
    if (prodHas && !devHas) {
      count++;
      ids.push(r.id.substring(0,8));
    }
  }
});
rl.on("close", () => {
  console.log("Both 200, prod-only toocostly:", count);
  console.log("IDs:", ids.join(", "));
});
