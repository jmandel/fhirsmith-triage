# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet?_format=json&url=http%3A%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1021.103`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 91e49e8
**Tolerance**: searchset-duplicate-entries

## What differs

Prod returns a searchset Bundle with `total: 2` and two entries for ValueSet `2.16.840.1.113762.1.4.1021.103`. Dev returns `total: 1` with one entry.

The two prod entries are different versions of the same ValueSet:
- Entry 0: `meta.lastUpdated: 2024-04-29`, `resource-lastReviewDate: 2024-06-05`, expansion timestamp `2025-05-23`
- Entry 1: `meta.lastUpdated: 2025-10-22`, `resource-lastReviewDate: 2025-10-22`, expansion timestamp `2025-11-24`, different `purpose` text

Dev returns only the first version (matching entry 0).

The `searchset-bundle-wrapper` tolerance already handles other Bundle wrapper differences (id, meta, link, search.mode). The remaining difference after that tolerance is the entry count and the extra entry content.

## Category: `temp-tolerance`

This is a real, meaningful difference in search behavior. Prod has loaded multiple copies/versions of the same resource and returns all of them in search results, while dev returns only one. This is not an equivalence — the search results genuinely differ. The pattern affects 3 records across 503 resource search operations:
- 71e7b8c5 and b9db7af5: same ValueSet URL (cts.nlm.nih.gov `2.16.840.1.113762.1.4.1021.103`)
- c8adc8ae: CodeSystem URL (nahdo.org/sopt version 9.2, where prod returns two identical copies)

## Tolerance

Tolerance `searchset-duplicate-entries` matches searchset Bundles where prod has more entries than dev's single entry. It normalizes by keeping only prod's first entry and setting totals to match.

After rerun: 32 → 30 deltas (2 eliminated). The third matching record (c8adc8ae) was not eliminated because it has additional content differences beyond the duplicate entries (different resource id `SOP` vs `1864` and different fullUrl).

Both eliminated records validated: prod's first entry matches dev's single entry on all key resource fields (id, url, version, name, status, fullUrl). The normalization only removes the extra duplicate entry from prod.
