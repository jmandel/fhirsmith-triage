# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b6d19d8
**Tolerance**: cc-validate-code-missing-known-coding-params

## What differs

This is a `$validate-code` request with a CodeableConcept containing two codings:
1. SNOMED CT (`http://snomed.info/sct/11000274103/version/20231115` - Danish edition, unavailable on both servers)
2. LOINC (`http://loinc.org` version 2.77, code 74043-1 "Alcohol use disorder")

Both servers agree `result=false` and both report the same `x-caused-by-unknown-system` for the unavailable SNOMED edition. However:

- **Prod** validates the LOINC coding successfully and returns `system=http://loinc.org`, `code=74043-1`, `display=Alcohol use disorder` params, plus an informational OperationOutcome issue about display language (no valid display for language 'de').
- **Dev** omits `system`, `code`, `display` params entirely, and also omits the informational display-language issue in the OperationOutcome.

After existing tolerances normalize away version-not-found messages, diagnostics, parameter ordering, and message-id extensions, the remaining difference in normalized output is exactly these missing params and the extra informational issue.

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev fails to report the results of validating the known coding when another coding in the CodeableConcept has an unknown system version. The `system`/`code`/`display` output params carry terminology content (which code was validated and its display text). Their absence means clients get less information about what was validated.

Existing bug b6d19d8 already tracks this exact pattern ("Dev omits system/code/version/display params on CodeSystem/$validate-code with codeableConcept containing unknown system"). Updated that bug's comment 0 to include this new tolerance and the 155 additional impacted records.

## Tolerance

Added `cc-validate-code-missing-known-coding-params` tolerance which matches:
- `$validate-code` with Parameters result=false on both sides
- Same `x-caused-by-unknown-system` values on both sides
- Prod has `code`/`system` params that dev lacks

The tolerance normalizes by copying prod's `code`, `system`, `display` params and `issues` to dev, then sorting for consistency.

**Impact**: Eliminates 155 records from deltas (1497 -> 1342). All 155 are POST CodeSystem/$validate-code with multi-coding CodeableConcepts where one SNOMED CT edition version is unavailable. 140 involve LOINC as the known system, 15 involve SNOMED.

**Validation**: Sampled 12 eliminated records. All matched the expected pattern (result=false on both sides, same x-caused-by-unknown-system, prod has code/system/display that dev lacks). No non-targeted differences were hidden.
