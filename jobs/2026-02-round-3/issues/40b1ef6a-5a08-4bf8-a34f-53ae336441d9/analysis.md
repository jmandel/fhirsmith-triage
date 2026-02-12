# Analysis: equiv-autofix

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: d70be11 (existing bug, updated)
**Tolerance**: multi-coding-cc-system-code-version-disagree

## What differs

When validating a CodeableConcept with 3 codings (MDC `urn:iso:std:iso:11073:10101`, SNOMED `http://snomed.info/sct`, LOINC `http://loinc.org`) against CodeSystem/$validate-code, both servers return `result=false` (SNOMED version `http://snomed.info/sct/11000274103` is unknown to both). However, the scalar output parameters disagree on which coding to report:

- **Prod**: code=`8480-6`, system=`http://loinc.org`, version=`2.81` (picks LOINC)
- **Dev**: code=`150017`, system=`urn:iso:std:iso:11073:10101`, version=`2024-12-05` (picks MDC)

Both sides agree on result, codeableConcept, display, issues, and x-caused-by-unknown-system. The only difference is which coding's system/code/version is reported as the "primary" one.

## Category: `equiv-autofix`

Which coding to report as "primary" in a multi-coding CodeableConcept validation is arbitrary. GG previously adjudicated the result=true variant as "not sure I care." The result=false variant is the same issue. Both servers correctly identify the unknown system and return the same validation result. The choice of which valid coding to highlight is an implementation detail.

## Tolerance

Updated existing tolerance `multi-coding-cc-system-code-version-disagree` to also cover `result=false` cases (previously only matched `result=true`). The tolerance now matches when:
- Both sides are Parameters responses
- Both agree on result (true or false)
- System param differs
- CodeableConcept has 2+ codings
- For result=false: x-caused-by-unknown-system values match (if present)

Normalizes system/code/version to prod values on both sides.

Eliminates 19 records in round 3 (1342 -> 1323 deltas). All 19 validated as legitimate eliminations.
