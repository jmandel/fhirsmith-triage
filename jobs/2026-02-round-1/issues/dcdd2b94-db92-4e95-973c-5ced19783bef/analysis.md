# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 241f1d8
**Tolerance**: draft-codesystem-message-provenance-suffix

## What differs

Both prod and dev return `result: true` and agree on system, code, version, and display. The only difference is in the OperationOutcome `issues` parameter's `details.text`:

- **Prod**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1`
- **Dev**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1`

Dev omits the ` from hl7.fhir.r4.core#4.0.1` provenance suffix that identifies which FHIR package the draft CodeSystem was loaded from. This is a MSG_DRAFT informational message with tx-issue-type `status-check`.

The `dev-empty-string-expression-location` tolerance already handled dev's invalid `location: [""]` and `expression: [""]` fields on these same issues.

## Category: `temp-tolerance`

This is a real, meaningful difference in message content. The provenance suffix provides useful information about where a CodeSystem was loaded from, and its absence in dev represents incomplete message generation. However, it does not affect the validation result or any other terminology content. Filed as bug 241f1d8.

## Tolerance

Tolerance ID: `draft-codesystem-message-provenance-suffix`. Matches validate-code Parameters responses where an OperationOutcome issue's `details.text` in prod ends with ` from <package>#<version>` and dev has the same text without that suffix. Normalizes dev's text to match prod (canonical normalization).

**Records affected**: 4 (all POST /r4/CodeSystem/$validate-code, content-differs)
- dcdd2b94-db92-4e95-973c-5ced19783bef (http://hl7.org/fhir/event-status, code=completed)
- 43fffcb3-2e22-4f94-a84c-dd9515864a0b (http://hl7.org/fhir/narrative-status, code=generated)
- 2d19785a-6906-4615-9572-62cdb76d5694 (http://hl7.org/fhir/CodeSystem/medicationrequest-status, code=active)
- 955ee0d7-5ec0-4016-b807-c7767a0b7552 (http://hl7.org/fhir/CodeSystem/medicationrequest-intent, code=order)

**Validation**: All 4 records verified. In each case, all parameters (result, system, code, version, display) agree between prod and dev. The only difference was the provenance suffix in issue text. No other differences were hidden by this tolerance. Delta count: 910 -> 906.
