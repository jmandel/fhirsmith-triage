import json, sys, re
from urllib.parse import unquote

# Look at ALL expand deltas for v3 ValueSets (not just total-differs)
v3_records = []
for line in sys.stdin:
    r = json.loads(line)
    url = r.get("url", "")
    m = re.search(r'url=([^&]+)', url)
    if not m:
        continue
    vs_url = unquote(m.group(1))
    # v3 ValueSets that use hierarchical inclusion
    if "v3-ActEncounterCode" in vs_url or "v3-ServiceDeliveryLocationRoleType" in vs_url or "v3-ActPharmacySupplyType" in vs_url or "v3-PurposeOfUse" in vs_url:
        try:
            prod = json.loads(r["prodBody"])
            dev = json.loads(r["devBody"])
        except:
            continue
        pt = prod.get("expansion", {}).get("total", "?")
        dt = dev.get("expansion", {}).get("total", "?")
        prod_contains = len(prod.get("expansion", {}).get("contains", []))
        dev_contains = len(dev.get("expansion", {}).get("contains", []))
        v3_records.append({
            "id": r["id"],
            "vs": vs_url,
            "prod_total": pt,
            "dev_total": dt,
            "prod_contains": prod_contains,
            "dev_contains": dev_contains,
        })

print(f"Total v3 hierarchical expand records in deltas: {len(v3_records)}")
# Check if ALL of them have dev_total=1
dev1 = sum(1 for r in v3_records if r["dev_total"] == 1)
print(f"  Of these, dev_total=1: {dev1}")
print(f"  Of these, dev_total!=1: {len(v3_records) - dev1}")
