# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 44136eb
**Tolerance**: expand-toocostly-dev-returns-codes

## What differs

Both prod and dev return HTTP 200 for a `$expand` of a Brazilian ValueSet (`cid10-ciap2`, which includes BRCID10 and BRCIAP2 code systems). However, the expansion contents are fundamentally different:

- **Prod**: Returns an empty expansion with `total: 0`, `valueset-toocostly: true` extension, and `limitedExpansion: true` parameter. No codes in `expansion.contains`. Prod signals that the expansion is too costly to perform.
- **Dev**: Returns 1000 codes in `expansion.contains` with `limitedExpansion: true` parameter and a `used-valueset` parameter. Dev proceeds with the expansion that prod considers too costly.

After existing tolerances normalize away the `toocostly` extension difference and `used-codesystem`/`used-valueset` parameters, the remaining difference is: prod has no `contains` array while dev has 1000 codes.

## Category: `temp-tolerance`

This is a real, meaningful behavioral difference. Dev does not enforce the expansion size guard that prod uses — when a ValueSet includes code systems too large to enumerate, prod returns an empty expansion flagged as too-costly, while dev goes ahead and returns up to 1000 codes. This is related to bug 44d1916 (where prod returns 422 instead of 200) but represents a distinct variant: here both return 200, differing only in whether codes are included.

## Tolerance

Tolerance `expand-toocostly-dev-returns-codes` (bug 44136eb) matches $expand records where both return 200, prod has `limitedExpansion: true` parameter, prod has no `contains`, and dev has codes. It skips these records since the responses are fundamentally incomparable (empty vs populated expansion).

Only 1 record in the dataset matches this pattern. Validated by comparing delta file line counts (56 -> 55) and confirming the only eliminated record is 227d1960-bfbd-4ca4-9c10-c5614d0e62d5.
