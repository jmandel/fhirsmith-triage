# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: a9cf20c (existing — oo-missing-location-field)
**Tolerance**: oo-missing-location-field (updated to handle batch-validate-code nesting)

## What differs

After normalization, the only difference is that prod includes the deprecated `location` field (`["Coding"]`) on OperationOutcome issues inside nested `validation` resources, while dev omits it. Both sides include the `expression` field with the same value, so the information is not lost — `location` is a deprecated duplicate of `expression` per the FHIR R4 spec.

This is exactly the same pattern as the existing `oo-missing-location-field` tolerance (bug a9cf20c), but for `$batch-validate-code` responses. The batch operation wraps each validation result in a `validation` parameter containing a nested `Parameters` resource, so the `issues` OperationOutcome is one level deeper than in regular `$validate-code` responses. The existing tolerance only looked for `issues` at the top level via `getParamValue(prod, 'issues')`, missing the nested batch structure.

## Category: `temp-tolerance`

This is a real difference — dev should ideally populate the `location` field to match prod, even though it's deprecated. It's the same root cause as the existing bug a9cf20c, just manifesting in a different response structure (batch vs. single).

## Tolerance

Updated the existing `oo-missing-location-field` tolerance to also check for and strip `location` from nested `validation.resource.parameter` entries (batch-validate-code). The match function now:
1. Checks top-level issues (regular validate-code) — unchanged
2. Checks nested issues inside `validation` parameters (batch-validate-code) — new

Validation results:
- **38 records eliminated** (3775 → 3737 deltas)
- 22 of these had location as the only remaining diff
- 16 had location + SNOMED display diffs (the display diffs are separately handled by the existing `batch-validate-snomed-display-differs` tolerance, bug 8f739e9)
- Sampled 15 eliminated records — all had only `location` and/or `display` diffs, both tracked by existing bugs
- 0 records added (no regressions)
- 50 total batch-validate-code records in deltas had the pattern; 12 remain (with other diffs beyond location/display)
