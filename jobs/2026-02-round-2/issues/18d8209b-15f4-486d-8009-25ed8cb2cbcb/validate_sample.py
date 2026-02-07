import json, sys, random, re
from urllib.parse import unquote

# Read the old deltas (archived) and new deltas, find eliminated records
old_ids = set()
new_ids = set()

old_records = {}
with open(sys.argv[1]) as f:
    for line in f:
        r = json.loads(line)
        old_ids.add(r["id"])
        old_records[r["id"]] = r

with open(sys.argv[2]) as f:
    for line in f:
        r = json.loads(line)
        new_ids.add(r["id"])

eliminated = old_ids - new_ids
print(f"Eliminated: {len(eliminated)} records")

# Filter to only the ones our tolerance should have matched
our_eliminated = []
for rid in eliminated:
    r = old_records[rid]
    url = r.get("url", "")
    decoded = unquote(url)
    if "terminology.hl7.org/ValueSet/v3-" in decoded and "/ValueSet/$expand" in url:
        our_eliminated.append(r)

print(f"Of which matching our v3 pattern: {len(our_eliminated)}")

# Sample 15 and validate
sample = random.sample(our_eliminated, min(15, len(our_eliminated)))
print(f"\nValidating {len(sample)} sampled records:")
for r in sample:
    prod = json.loads(r["prodBody"])
    dev = json.loads(r["devBody"])
    pt = prod.get("expansion", {}).get("total", "?")
    dt = dev.get("expansion", {}).get("total", "?")
    prod_ct = len(prod.get("expansion", {}).get("contains", []))
    dev_ct = len(dev.get("expansion", {}).get("contains", []))
    decoded_url = unquote(r["url"])
    # Extract VS name
    m = re.search(r'ValueSet/v3-(\w+)', decoded_url)
    vs_name = m.group(1) if m else "?"
    ok = dt == 1 and pt > 1
    print(f"  {'OK' if ok else 'BAD'} id={r['id'][:12]}  vs={vs_name:40s}  prod_total={pt:5d} dev_total={dt}  prod_contains={prod_ct:5d} dev_contains={dev_ct}")
