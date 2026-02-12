# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code`
**Category**: status-mismatch
**Status**: prod=200 dev=400
**Bug**: d45bc62
**Tolerance**: validate-code-no-valueset-codeableconcept

## What differs

The request sends a `codeableConcept` parameter with LOINC codings (8867-4 "Heart rate" and 8480-6 "Systolic blood pressure") to `POST /r4/ValueSet/$validate-code`, but provides no `url`, `context`, or `valueSet` parameter to identify which ValueSet to validate against.

- **Prod** (HTTP 200): Validates each coding against the LOINC CodeSystem directly and returns a Parameters response with `result: true`, along with system, code, version, display, and the echoed codeableConcept.
- **Dev** (HTTP 400): Returns an OperationOutcome error: `"No ValueSet specified - provide url parameter or valueSet resource"`

The FHIR R4 spec states: "If the operation is not called at the instance level, one of url, context, or valueSet must be provided." Dev enforces this strictly; prod falls back to validating against the CodeSystem.

## Category: `temp-tolerance`

This is a real behavioral difference. Dev is arguably more strictly spec-compliant (the spec requires a ValueSet reference at the type level), but prod's behavior is more forgiving and still useful — it validates the codeableConcept against its constituent CodeSystems when no ValueSet is specified. Since this represents a difference in how the two servers handle edge-case requests, it's a real diff worth tracking.

## Tolerance

Tolerance `validate-code-no-valueset-codeableconcept` skips POST validate-code requests where prod=200, dev=400, and dev body contains "No ValueSet specified". Eliminates all 9 matching records. All 9 are LOINC codeableConcept requests with no url/context/valueSet parameter. Validated: exactly 9 records eliminated, 0 false positives, no remaining "No ValueSet specified" records in deltas.
