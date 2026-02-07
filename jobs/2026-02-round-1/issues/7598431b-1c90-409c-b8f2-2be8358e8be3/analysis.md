# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: dev-crash-on-valid
**Status**: prod=200 dev=500
**Bug**: 2ae971e
**Tolerance**: expand-dev-crash-on-valid

## What differs

Prod returns a valid ValueSet expansion (200) for `http://hl7.org/fhir/us/core/ValueSet/us-core-pregnancy-status` containing 4 codes (3 SNOMED CT + 1 NullFlavor). Dev returns 500 with an OperationOutcome containing the JavaScript TypeError: `vs.expansion.parameter is not iterable`.

The error indicates dev attempts to iterate over `vs.expansion.parameter` during the expand code path, but the value is undefined/null at that point in processing.

No tolerances were applied to this record before analysis (applied-tolerances.txt shows "none").

## Category: `temp-tolerance`

This is a real bug — dev crashes on a valid request that prod handles successfully. The crash prevents dev from returning any terminology content. This is part of a broader pattern of 15 `dev-crash-on-valid` $expand records, which exhibit two distinct JS TypeErrors:

1. `vs.expansion.parameter is not iterable` — 1 record (this one, us-core-pregnancy-status)
2. `exp.addParamUri is not a function` — 14 records (all Verily phenotype ValueSets)

Both are unhandled TypeErrors in the expand code path. Filed as a single bug since they share the same symptom (500 crash on valid $expand) even though the specific error locations differ.

## Tolerance

Tolerance `expand-dev-crash-on-valid` skips all `POST /r4/ValueSet/$expand` records where prod=200 and dev=500. Eliminates 15 records (452 → 437 deltas). All 15 eliminated records were validated: every one is a dev-crash-on-valid $expand with a JavaScript TypeError, no false positives.
