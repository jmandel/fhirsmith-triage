# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 8f739e9 (existing — SNOMED same-version display differs)
**Tolerance**: batch-validate-snomed-display-differs

## What differs

Both servers return `result=true` for two SNOMED CT codes (72440003, 62766000) with identical `system`, `code`, and `version` (International edition `20250201`). The only difference is the `display` (preferred term) text inside the nested `validation` resources:

- Code 72440003: prod="Disturbance of orientation to place", dev="Disorientation as to place"
- Code 62766000: prod="Disturbance of orientation to person", dev="Disorientation as to people"

Both are valid SNOMED synonyms for these concepts, but the servers select different preferred terms from the same edition.

## Category: `temp-tolerance`

This is the same root cause as the existing `snomed-same-version-display-differs` tolerance (bug `8f739e9`): dev returns a different preferred term than prod for the same SNOMED CT edition version. The existing tolerance handles top-level Parameters responses but does not reach inside the nested `validation` resource structure used by `$batch-validate-code`. This is a real, meaningful difference (different display text selection) but follows a recognized pattern.

## Tolerance

Added `batch-validate-snomed-display-differs` tolerance linked to existing bug `8f739e9`. It matches `$batch-validate-code` responses, iterates nested `validation` resources, and for any SNOMED validation where the version matches but display differs, normalizes to prod's display value. Eliminated 1 record (this one — the only SNOMED batch-validate-code delta). The other batch-validate-code delta (392830d5, UCUM/Torr) was correctly left untouched.
