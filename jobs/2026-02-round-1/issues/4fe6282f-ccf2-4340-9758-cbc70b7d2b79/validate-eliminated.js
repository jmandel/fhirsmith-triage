const fs = require("fs");
const archive = process.argv[2];
const oldLines = fs.readFileSync(archive, "utf8").trim().split("\n");
const newLines = fs.readFileSync("jobs/2026-02-round-1/results/deltas/deltas.ndjson", "utf8").trim().split("\n");
const oldIds = new Set(oldLines.map(l => JSON.parse(l).id));
const newIds = new Set(newLines.map(l => JSON.parse(l).id));
const eliminated = [...oldIds].filter(id => !newIds.has(id));
console.log("Eliminated: " + eliminated.length);
// Now look up each in the old file
const oldMap = new Map(oldLines.map(l => { const r = JSON.parse(l); return [r.id, r]; }));
for (const id of eliminated) {
  const r = oldMap.get(id);
  const pb = JSON.parse(r.prodBody);
  const hasToo = pb.issue && pb.issue.some(i => i.code === "too-costly");
  console.log(id + " | prod=" + r.prod.status + " dev=" + r.dev.status + " | too-costly=" + hasToo + " | " + r.comparison.category);
}
