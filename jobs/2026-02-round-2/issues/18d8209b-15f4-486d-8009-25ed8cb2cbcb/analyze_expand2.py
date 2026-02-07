import json, sys, re
from collections import Counter

# Extract distinct ValueSet URLs and count records per VS
vs_counts = Counter()
vs_examples = {}
total_count = 0

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
        total_count += 1
        url = r.get("url", "")
        # Extract VS URL from the request
        m = re.search(r'url=([^&]+)', url)
        if m:
            from urllib.parse import unquote
            vs_url = unquote(m.group(1))
        else:
            vs_url = url
        vs_counts[vs_url] += 1
        if vs_url not in vs_examples:
            vs_examples[vs_url] = {"id": r["id"], "prod_total": pt, "dev_total": dt}

print(f"Total records with differing expansion totals: {total_count}")
print(f"Distinct ValueSets affected: {len(vs_counts)}")
print()
for vs, cnt in vs_counts.most_common():
    ex = vs_examples[vs]
    print(f"  {cnt:4d} records  prod={ex['prod_total']:5d} dev={ex['dev_total']:5d}  {vs}")
