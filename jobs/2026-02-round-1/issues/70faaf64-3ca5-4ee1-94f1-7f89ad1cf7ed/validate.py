import json, os

old_file = sorted([f for f in os.listdir('jobs/2026-02-round-1/results/deltas/') if f.startswith('deltas.2')])[-1]

eliminated_ids = {
    '12acd79c-7671-468d-8ce1-b655cb5cb54a',
    '25156d3f-8053-4312-92ae-bd5511027183',
    '70faaf64-3ca5-4ee1-94f1-7f89ad1cf7ed',
    '85775231-9471-4ec0-815c-b020afef2169',
    '8839e177-d770-47ed-a951-de3c0a637b24',
    'c15110c1-6b9e-4635-b930-b45c1bf87969',
    'fd433fe2-4dba-4ba7-a0cc-3020b5fd5d61',
}

with open(f'jobs/2026-02-round-1/results/deltas/{old_file}') as f:
    for line in f:
        r = json.loads(line)
        if r['id'] not in eliminated_ids:
            continue
        prod = json.loads(r['prodBody'])
        dev = json.loads(r['devBody'])
        pt = prod.get('expansion', {}).get('total', '?')
        dt = dev.get('expansion', {}).get('total', '?')
        pc = len(prod.get('expansion', {}).get('contains', []))
        dc = len(dev.get('expansion', {}).get('contains', []))

        prod_codes = set(c.get('system','') + '|' + c.get('code','') for c in prod.get('expansion',{}).get('contains',[]))
        dev_codes = set(c.get('system','') + '|' + c.get('code','') for c in dev.get('expansion',{}).get('contains',[]))
        extra_in_prod = prod_codes - dev_codes
        extra_in_dev = dev_codes - prod_codes
        all_dev_in_prod = dev_codes.issubset(prod_codes)

        prod_displays = {c.get('system','')+'|'+c.get('code',''): c.get('display','') for c in prod.get('expansion',{}).get('contains',[])}
        dev_displays = {c.get('system','')+'|'+c.get('code',''): c.get('display','') for c in dev.get('expansion',{}).get('contains',[])}
        display_diffs = 0
        for code in dev_codes & prod_codes:
            if prod_displays.get(code) != dev_displays.get(code):
                display_diffs += 1

        print(f'{r["id"][:12]}: prod_total={pt}({pc}) dev_total={dt}({dc}) extra_prod={len(extra_in_prod)} extra_dev={len(extra_in_dev)} dev_subset_of_prod={all_dev_in_prod} display_diffs={display_diffs}')
        if extra_in_dev:
            print(f'  UNEXPECTED extra in dev: {extra_in_dev}')
