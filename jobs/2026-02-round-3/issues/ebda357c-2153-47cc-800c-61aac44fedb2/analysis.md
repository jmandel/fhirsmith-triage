# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b6d19d8
**Tolerance**: validate-code-xcaused-unknown-system-disagree

## What differs

Both sides return `result=false` for a CodeableConcept containing two codings:
1. `http://loinc.org|2.77` code `29463-7` (Body weight)
2. `http://snomed.info/sct|http://snomed.info/sct/11000274103/version/20231115` code `27113001` (Body weight)

**Prod** has LOINC 2.77 loaded, so it validates the LOINC coding successfully. It fails on the SNOMED Danish edition (version 11000274103/20231115 not available) and reports:
- `x-caused-by-unknown-system`: `http://snomed.info/sct|http://snomed.info/sct/11000274103/version/20231115`
- `system`: `http://loinc.org`, `code`: `29463-7`, `display`: `Body weight`, `version`: `2.77`
- `message`/`issues`: "A definition for CodeSystem 'http://snomed.info/sct' version '...' could not be found"

**Dev** only has LOINC 2.81 (not 2.77), so it fails on the LOINC version and reports:
- `x-caused-by-unknown-system`: `http://loinc.org|2.77`
- No `system`, `code`, `display`, `version` params
- `message`/`issues`: "A definition for CodeSystem 'http://loinc.org' version '2.77' could not be found"

The root cause is **version skew** (different code system versions installed) combined with dev's behavior of omitting params for the known coding when an unknown system is encountered (bug b6d19d8).

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev should report params for the coding it can validate, regardless of whether other codings in the CodeableConcept reference unknown systems/versions. The version skew (LOINC 2.77 vs 2.81) causes the two servers to fail on different codings, amplifying the behavioral bug.

## Tolerance

Tolerance `validate-code-xcaused-unknown-system-disagree` matches validate-code records where both sides return `result=false` and `x-caused-by-unknown-system` differs (values or count). Normalizes by replacing dev's error-related params (code, display, system, version, message, issues, x-caused-by-unknown-system, x-unknown-system) with prod's values.

Filed under existing bug b6d19d8 (updated comment 0 to consolidate both tolerance patterns).

Eliminates 11 records across 4 sub-patterns:
- LOINC/SNOMED version skew (3 records): prod/dev disagree on which version is unknown
- c80-practice-codes (2 records): prod has x-caused-by-unknown-system, dev omits it
- Cerner/RxNorm (2 records): dev reports x-caused-by for RxNorm version, prod uses x-unknown-system for Cerner
- b-zion (4 records): prod reports 2 x-caused-by-unknown-system, dev reports 1

Validation: All 11 eliminated records verified. All have result=false on both sides with only error-reporting disagreements (no real validation result differences hidden).
