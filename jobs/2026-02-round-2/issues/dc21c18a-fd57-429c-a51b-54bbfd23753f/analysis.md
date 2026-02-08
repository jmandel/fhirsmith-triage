# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fsecurity-labels%7C4.0.1&code=code8&_format=json&system=urn:ihe:xds:scheme8`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: d05a4a6
**Tolerance**: missing-retired-status-check-issue

## What differs

Both prod and dev agree on the core result (result=false, system, code, message, x-unknown-system) and both return two error-level OperationOutcome issues (UNKNOWN_CODESYSTEM and not-in-vs). However, prod additionally returns an informational status-check issue that dev omits:

```json
{
  "severity": "information",
  "code": "business-rule",
  "details": {
    "coding": [{"system": "http://hl7.org/fhir/tools/CodeSystem/tx-issue-type", "code": "status-check"}],
    "text": "Reference to retired ValueSet http://terminology.hl7.org/ValueSet/v3-ActUSPrivacyLaw|3.0.0"
  }
}
```

The ValueSet `security-labels|4.0.1` composes `v3-ActUSPrivacyLaw|3.0.0`, which is a retired ValueSet. Prod detects this and emits an informational issue; dev does not perform this status check.

## Category: `temp-tolerance`

This is a real behavioral difference, not cosmetic. Prod implements resource status checking for composed ValueSets (reporting retired/draft status as informational issues), while dev does not. The difference is confined to an informational issue and doesn't affect the validation result or error-level issues.

A similar pattern exists for "draft" status-check issues, which are handled by the existing `hl7-terminology-cs-version-skew` tolerance (bug 6edc96c) but scoped to `terminology.hl7.org/CodeSystem/*` systems. This pattern is specifically about "retired" status-check issues on ValueSet composition references.

## Tolerance

Tolerance `missing-retired-status-check-issue` strips informational status-check issues containing "retired" from prod's OperationOutcome when dev does not have corresponding retired status-check issues. Scoped to validate-code Parameters responses where both sides have issues.

- Records eliminated: 13 (delta count 2329 -> 2316)
- All 13 are GET validate-code on `security-labels|4.0.1` with system `urn:ihe:xds:scheme8`
- Validated 10 of 13 eliminated records: all pass (only difference was the retired status-check issue)
- No new records appeared in deltas after rerun
