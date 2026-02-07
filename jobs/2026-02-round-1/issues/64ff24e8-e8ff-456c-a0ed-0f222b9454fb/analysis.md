# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 933fdcc
**Tolerance**: vsac-modifier-extension-error

## What differs

Both servers return `result: false` for validating codes against VSAC ValueSet `http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1|20250419` with system `urn:oid:2.16.840.1.113883.6.238`.

**Prod** processes the ValueSet and returns detailed, specific validation results:
- Reports that the requested CodeSystem version `1.3` could not be found (valid versions: `1.2`)
- Reports the code was not found in the ValueSet
- Returns `version`, `x-unknown-system` parameters
- Issues have proper severity/code/details with tx-issue-type codings

**Dev** fails at the ValueSet processing stage:
- Returns a single generic error: `Cannot process resource at "exclude[0].filter" due to the presence of the modifier extension vsacOpModifier`
- Issue code is `business-rule` (not `not-found` or `code-invalid`)
- Missing `version` and `x-unknown-system` parameters
- `location` and `expression` arrays contain `[null]` (also a separate FHIR conformance issue)

The difference is meaningful: dev cannot handle VSAC ValueSets that use the `vsacOpModifier` extension in their exclude filters. While the `result: false` agrees, dev's error message and issues are completely different from prod's correct, specific validation output.

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev fails to process a class of VSAC ValueSets entirely. The agreement on `result: false` is coincidental — prod returns false because the code doesn't validate, while dev returns false because it can't process the ValueSet at all. Filed as bug 933fdcc.

## Tolerance

Tolerance `vsac-modifier-extension-error` skips any validate-code record where dev's message parameter contains "vsacOpModifier". This eliminates exactly 3 records from the delta file (1552 -> 1549), all `POST /r4/ValueSet/$validate-code` against the same VSAC ValueSet with different codes:
- `2184-0` (Dominican)
- `2148-5` (Mexican)
- `2151-9` (Chicano)

All 3 records were manually verified to show the same pattern.
