# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: missing-resource
**Status**: prod=200 dev=404
**Bug**: e18fdef
**Tolerance**: loinc-answer-list-expand-404

## What differs

Prod successfully expands the LOINC answer list ValueSet `http://loinc.org/vs/LL379-9`, returning a ValueSet with 7 codes (LA9658-1 Wild type, LA6692-3 Deletion, LA6686-5 Duplication, LA6687-3 Insertion, LA6688-1 Insertion/Deletion, LA6689-9 Inversion, LA6690-7 Substitution).

Dev returns 404 with an OperationOutcome error: `ValueSet not found: http://loinc.org/vs/LL379-9|4.0.1`. Dev is appending `|4.0.1` (the FHIR R4 version identifier) to the ValueSet canonical URL when attempting to resolve it, which causes the lookup to fail since no ValueSet exists at that versioned URL.

No tolerances were applied (applied-tolerances.txt shows "none"), and the normalized outputs show the full prod ValueSet vs the dev OperationOutcome 404.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev fails to expand a valid ValueSet that prod handles successfully. The root cause appears to be dev incorrectly appending a FHIR version suffix `|4.0.1` to the LOINC answer list canonical URL during resolution. This is not a cosmetic or equivalent difference; dev is returning an error for a valid request.

Filed as bug e18fdef with labels `tx-compare` and `missing-resource`.

## Tolerance

Tolerance ID: `loinc-answer-list-expand-404`
- Kind: `temp-tolerance` with bugId `e18fdef`
- Matches: records where prod=200, dev=404, URL contains `ValueSet/$expand`, and dev diagnostics contain `|4.0.1`
- Eliminates: 2 records (both `POST /r4/ValueSet/$expand` for `http://loinc.org/vs/LL379-9`)
- Validated: both eliminated records confirmed to match the exact pattern (LOINC answer list expand returning 404 with `|4.0.1` suffix in error)
- Delta count: 9 → 7 (2 records eliminated)
