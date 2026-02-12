# Analysis: equiv-autofix

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: parse-error
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: skip-missing-bodies

## What differs

Both `prod-normalized.json` and `dev-normalized.json` are `null`. The record has no `prodBody` or `devBody` fields in comparison.ndjson — the response bodies were not captured during data collection. The comparison engine parses both as `null` and flags the record as `parse-error`.

However, the source record has `normMatch: true`, indicating the data collection pipeline already determined these responses match after normalization. The bodies simply weren't stored (likely an optimization when bodies match).

The prod and dev sizes differ slightly (454 vs 422 bytes) and hashes differ, which is consistent with cosmetic differences like Content-Type headers or JSON formatting that the collection pipeline's own normalization resolved.

## Category: `equiv-autofix`

This is a data collection artifact, not a real difference. The collection pipeline confirmed the responses match (`normMatch: true`) but didn't persist the bodies. No terminology content can be compared because there's nothing to compare. Safe to skip.

## Tolerance

Added `skip-missing-bodies` tolerance that skips any record where both `prodBody` and `devBody` are absent. This eliminates all 178 parse-error records in the dataset.

- All 178 have `normMatch: true` in the source data
- All 178 have status 200/200
- Operations: validate-code (83), batch-validate-code (79), expand (16)
- Validated 15 random samples — all confirmed: no bodies, normMatch=true

Delta count: 2780 -> 2602 (reduction of 178, exactly matching the parse-error count). Zero parse-error records remain after the tolerance.
