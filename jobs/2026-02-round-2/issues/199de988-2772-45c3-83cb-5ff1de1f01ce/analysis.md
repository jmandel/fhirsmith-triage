# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-problem-or-health-concern&code=encounter-diagnosis&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fcondition-category`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: a9cf20c (existing — "Dev omits deprecated location field on OperationOutcome issues")
**Tolerance**: oo-missing-location-post-version-skew

## What differs

After existing tolerances normalize version skew (hl7-terminology-cs-version-skew) and strip diagnostics/extensions, the only remaining difference is:

- **Prod** includes `"location": ["code"]` on the `code-invalid` OperationOutcome issue
- **Dev** omits the `location` field entirely

Both sides agree on `result: false`, system, code, display, message text, and the OperationOutcome issue's severity/code/details/expression.

## Why the existing tolerance missed this

The existing `oo-missing-location-field` tolerance (line 186) handles this exact pattern in general, but runs BEFORE `hl7-terminology-cs-version-skew` (line 2550) in the pipeline. At the time `oo-missing-location-field` runs, prod has 2 OperationOutcome issues (a `status-check`/MSG_DRAFT informational issue + the `not-in-vs` error) while dev has only 1 (the `not-in-vs` error). The index-based comparison in `oo-missing-location-field` fails because the issue arrays are misaligned. Later, `hl7-terminology-cs-version-skew` strips the extra status-check issue from prod, aligning the arrays — but by then, `oo-missing-location-field` has already passed.

## Category: `temp-tolerance`

This is the same root cause as bug a9cf20c — dev omits the deprecated `location` field on OperationOutcome issues that prod includes. The `location` field is deprecated in FHIR R4 in favor of `expression`, and both sides have matching `expression: ["code"]` values. This is a real difference (dev should include `location` for consistency) but is already tracked.

## Tolerance

**Tolerance ID**: `oo-missing-location-post-version-skew`
**Bug ID**: a9cf20c (existing)
**Records eliminated**: 234 (all `condition-category` system, all `validate-code` operations)
**Validation**: Sampled 15 random eliminated records — all showed the identical pattern (prod has 2 issues with status-check + location, dev has 1 issue without location; all results match; all location values are `["code"]`).

The tolerance is placed immediately after `hl7-terminology-cs-version-skew` in the pipeline, so it runs on post-normalized data where the issue arrays are aligned. It uses the same logic as `oo-missing-location-field`: strips `location` from prod issues where `location` equals `expression` and dev lacks it.
