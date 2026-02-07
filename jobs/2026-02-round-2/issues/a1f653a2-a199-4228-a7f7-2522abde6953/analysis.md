# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 2ed80bd
**Tolerance**: expand-dev-missing-total

## What differs

After normalization, the only remaining difference is `expansion.total`:

- **Prod**: includes `"total": 5099` in the expansion
- **Dev**: omits `total` entirely

Both servers return identical `contains` arrays (1000 entries, paged with offset=0) and identical expansion parameters. Neither has the `valueset-unclosed` extension. The request is a SNOMED $expand with `count=1000`, `offset=0`, `displayLanguage=fr`, `excludeNested=true`.

The `expansion.total` field is a 0..1 optional integer in FHIR R4's ValueSet.expansion, documented as "Total concept count; permits server pagination." Without it, clients cannot determine how many total concepts exist or how many pages remain.

## Category: `temp-tolerance`

This is a real, meaningful difference. The `total` field carries functional information for pagination — it tells clients there are 5099 matching concepts even though only 1000 are returned in this page. Dev's omission of this field is a bug, not a cosmetic difference.

This is distinct from the existing `expand-unclosed-extension-and-total` tolerance (bug f2b2cef), which handles the reverse case: prod omits `total` on unclosed/truncated expansions while dev includes it. In this record, neither side uses the unclosed extension; dev simply fails to include `total` in complete expansions.

## Tolerance

**ID**: `expand-dev-missing-total`
**Bug**: 2ed80bd
**Kind**: temp-tolerance

Matches POST /r4/ValueSet/$expand responses where both sides return 200, prod has `expansion.total`, and dev doesn't. Normalizes by removing `total` from prod.

**Impact**: 47 records matched the pattern. 33 were fully eliminated (total was the only remaining diff). 14 still appear in deltas due to other unrelated differences (status-mismatch, missing-resource, etc.) but have the total field correctly normalized.

**Validation**: Sampled 10 of the 33 eliminated records. All showed the same pattern: POST /r4/ValueSet/$expand, both 200 status, prod total=5099 with 1000 contains, dev missing total with 1000 contains. No other differences were hidden by the tolerance.
