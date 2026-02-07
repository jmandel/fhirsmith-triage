import json, sys, re
from collections import Counter
from urllib.parse import unquote

# Find ALL expand records where dev_total=1 and prod_total>1
records = []
for line in sys.stdin:
    r = json.loads(line)
    try:
        prod = json.loads(r["prodBody"])
        dev = json.loads(r["devBody"])
    except:
        continue
    pt = prod.get("expansion", {}).get("total")
    dt = dev.get("expansion", {}).get("total")
    if pt is not None and dt == 1 and pt > 1:
        url = r.get("url", "")
        m = re.search(r'url=([^&]+)', url)
        vs_url = unquote(m.group(1)) if m else url
        records.append({"vs": vs_url, "id": r["id"], "prod_total": pt})

vs_counts = Counter(r["vs"] for r in records)
print(f"Total expand records with dev_total=1, prod_total>1: {len(records)}")
print(f"Distinct ValueSets: {len(vs_counts)}")
print()
for vs, cnt in vs_counts.most_common():
    ex = next(r for r in records if r["vs"] == vs)
    print(f"  {cnt:4d} records  prod_total={ex['prod_total']:5d}  {vs}")
