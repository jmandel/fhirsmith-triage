# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: 4aebc14
**Tolerance**: snomed-version-skew-validate-code-result-disagrees

## What differs

Prod returns `result: true` for SNOMED code 39154008 ("Clinical diagnosis") validated against ValueSet `ndhm-diagnosis-use` (which filters for `is-a 106229004` "Qualifier for type of diagnosis", excluding the root concept). Dev returns `result: false` with an error message stating the code was not found in the ValueSet.

The root cause is SNOMED CT edition version skew: prod uses International edition 20250201 while dev uses 20240201. The hierarchical relationships in SNOMED differ between these editions, so code 39154008's position relative to 106229004 differs — prod's edition includes it as a descendant, dev's edition does not.

After the existing `snomed-version-skew` tolerance normalizes the version strings to match, the normalized output still shows:
- Prod: `result: true`, no message/issues parameters
- Dev: `result: false`, with `message` and `issues` parameters explaining the code was not found

## Category: `temp-tolerance`

This is a real, meaningful difference — the validate-code result boolean disagrees. However, it is caused by a known pattern (SNOMED version skew) already tracked in bug 9fd2328 (expand) and now filed as bug 4aebc14 for the validate-code manifestation. The disagreement will resolve once dev loads the same SNOMED edition as prod.

## Tolerance

Tolerance `snomed-version-skew-validate-code-result-disagrees` skips validate-code records where:
- Both prod and dev return 200
- Both are Parameters resources
- The result boolean disagrees
- Raw (pre-normalization) version parameters show different SNOMED CT edition versions

The tolerance checks raw versions from `record.prodBody`/`record.devBody` because the earlier `snomed-version-skew` tolerance already normalizes version strings to match.

In the full comparison dataset, 57 records have SNOMED version-skewed validate-code result disagreements. Of those, 45 are already handled by other tolerances (mostly status-mismatch tolerances). This tolerance eliminates 1 additional delta record. Validated by confirming the eliminated record is exactly our target (a74520f2) and the remaining 3 result-disagrees records are unrelated (ISO 3166 code "AA").
