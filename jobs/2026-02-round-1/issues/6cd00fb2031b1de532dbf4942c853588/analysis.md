# Analysis: equiv-autofix

**MD5**: `6cd00fb2031b1de532dbf4942c853588`
**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: sort-parameters-by-name

## What differs

After stripping diagnostics (the only tolerance applied), the prod and dev responses contain exactly the same parameters with identical values. The sole difference is the ordering of elements in the `Parameters.parameter` array:

- **Prod order**: result, system, x-caused-by-unknown-system, code, message, issues
- **Dev order**: issues, result, message, system, code, x-caused-by-unknown-system

All parameter values (result=false, system URI, code, message text, OperationOutcome issues) are identical between prod and dev.

## Category: `equiv-autofix`

Parameter ordering within a FHIR Parameters.parameter array has no semantic meaning. FHIR Parameters are accessed by name, not position. This is listed as a known cosmetic difference in AGENTS.md ("Parameter ordering — prod and dev return Parameters in different order"). A sort-by-name normalization deterministically resolves the difference.

## Tolerance

Added `sort-parameters-by-name` tolerance (Phase D: Sort) that sorts `Parameters.parameter` arrays by the `name` field on both sides.

- **Records eliminated**: 608 out of 4085 deltas (14.9%)
- **Validation**: Sampled 15 eliminated records — all were validate-code operations where the only difference was parameter array ordering. No false positives found; no other differences were hidden by the sort.
- **Delta count**: 4085 -> 3477
