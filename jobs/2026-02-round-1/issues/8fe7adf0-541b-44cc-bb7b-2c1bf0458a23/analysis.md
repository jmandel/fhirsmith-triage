# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7258b41 (existing — NDC validate-code version skew)
**Tolerance**: ndc-validate-code-unknown-code-version-diffs

## What differs

Both servers agree `result=false` for unknown NDC codes. Two differences remain after normalization:

1. **Version string in messages**: Prod reports `version ''` (empty), dev reports `version '2021-11-01'`. This appears in both the `message` parameter and the OperationOutcome issue `details.text`. Prod uses unversioned NDC (`http://hl7.org/fhir/sid/ndc|`), dev uses NDC version 2021-11-01.

2. **Extra informational issue in prod**: Prod returns 2 OperationOutcome issues (an error "Unknown code 'X' in the CodeSystem..." plus an informational "Code 'X' not found in NDC"). Dev returns only the error issue. The informational issue is a secondary summary that dev does not generate.

## Category: `temp-tolerance`

This is a real, meaningful difference — the version string reflects which NDC edition is loaded, and the extra OperationOutcome issue is a structural content difference. However, both share the same root cause as existing bug 7258b41 (NDC version skew: prod loads unversioned NDC, dev loads 2021-11-01). That bug covers the `result=true` case with extra inactive/version params; this record is the `result=false` case where both agree the code is unknown but differ in version reporting and issue structure.

## Tolerance

Tolerance `ndc-validate-code-unknown-code-version-diffs` matches NDC validate-code responses where `result=false`, prod message contains `version ''`, and dev message contains `version '2021-11-01'`. It normalizes:
- Version strings in both `message` and `issues` text to `'2021-11-01'` (dev's more informative value)
- Strips the extra informational "Code X not found in NDC" issue from prod

Eliminates 15 records (all POST /r4/CodeSystem/$validate-code? for http://hl7.org/fhir/sid/ndc). Validated all 15 — each has identical pattern: result=false on both sides, prod has 2 issues vs dev's 1, and the version string difference. No other differences hidden.
