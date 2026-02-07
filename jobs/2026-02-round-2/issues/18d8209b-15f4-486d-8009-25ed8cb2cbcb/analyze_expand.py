import json, sys

count = 0
total_diffs = []
for line in sys.stdin:
    r = json.loads(line)
    try:
        prod = json.loads(r["prodBody"])
        dev = json.loads(r["devBody"])
    except:
        continue
    pt = prod.get("expansion", {}).get("total")
    dt = dev.get("expansion", {}).get("total")
    if pt is not None and dt is not None and pt != dt:
        count += 1
        prod_contains = len(prod.get("expansion", {}).get("contains", []))
        dev_contains = len(dev.get("expansion", {}).get("contains", []))
        url = r.get("url", "")
        total_diffs.append({
            "id": r["id"],
            "url": url,
            "prod_total": pt,
            "dev_total": dt,
            "prod_contains": prod_contains,
            "dev_contains": dev_contains,
        })

print(f"Records where expansion total differs: {count}")
print()
# Show first 20 sorted by magnitude of difference
total_diffs.sort(key=lambda x: abs(x["prod_total"] - x["dev_total"]), reverse=True)
for d in total_diffs[:30]:
    print(f"  prod={d['prod_total']:5d} dev={d['dev_total']:5d} prod_contains={d['prod_contains']:5d} dev_contains={d['dev_contains']:5d} {d['url'][:120]}")
