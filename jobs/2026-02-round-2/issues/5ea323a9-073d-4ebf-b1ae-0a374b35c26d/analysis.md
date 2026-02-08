# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2FUSPS-State&code=TX&_format=json`
**Category**: status-mismatch
**Status**: prod=422 dev=200
**Bug**: e4e45bc
**Tolerance**: validate-code-no-system-422

## What differs

Prod returns HTTP 422 with an OperationOutcome: "Unable to find code to validate (looked for coding | codeableConcept | code+system | code+inferSystem in parameters ...)". Dev returns HTTP 200 with a successful Parameters response containing `result=true`, `system=https://www.usps.com/`, `code=TX`, `display=Texas`.

The request provides `code=TX` and a ValueSet URL but no `system` parameter. Per the FHIR spec for ValueSet/$validate-code: "If a code is provided, a system or a context must be provided." Prod correctly rejects the request; dev incorrectly infers the system from the ValueSet and returns a successful validation.

## Category: `temp-tolerance`

This is a real behavioral difference where dev is too lenient in accepting requests. The FHIR spec requires a `system` or `context` parameter when `code` is provided, and prod enforces this. Dev's behavior of inferring the system from the ValueSet may seem helpful but violates the spec. Filed as bug e4e45bc.

## Tolerance

Tolerance `validate-code-no-system-422` skips records where:
- prod returns 422 and dev returns 200
- The URL contains `$validate-code`
- The request has `code` but no `system` parameter (checked in URL query params for GET, request body for POST)

Eliminated 133 records (2480 -> 2347 deltas). The 133 records span 14 distinct request URLs across multiple ValueSets (USPS-State, defined-types, iso3166-1-2, mimetypes, languages, administrative-gender, encounter-status, event-status, patient-contactrelationship, and a CTS ValueSet). One POST record to CodeSystem/$validate-code follows the same pattern.

Validated by sampling 15 eliminated records — all confirmed as the same pattern: prod=422 OperationOutcome, dev=200 Parameters, code present without system.
