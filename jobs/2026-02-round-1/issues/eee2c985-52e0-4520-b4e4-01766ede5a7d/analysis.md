# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Priority**: P4
**Status**: prod=422 dev=404
**Bug**: 1c145d2
**Tolerance**: expand-422-vs-404-codesystem-not-found

## What differs

When a ValueSet $expand fails because a referenced CodeSystem definition cannot be found, prod returns HTTP 422 (Unprocessable Entity) while dev returns HTTP 404 (Not Found). Both servers return an identical OperationOutcome:

- Issue severity: `error`
- Issue code: `not-found`
- Issue details coding: `http://hl7.org/fhir/tools/CodeSystem/tx-issue-type#not-found`
- Message text: identical (e.g., "A definition for CodeSystem '...' could not be found, so the value set cannot be expanded")
- Extension: identical (`operationoutcome-message-id` = `UNKNOWN_CODESYSTEM_EXP`)

Secondary cosmetic differences in the OperationOutcome structure:
- Dev includes `location: [null]` and `expression: [null]` arrays (prod omits them)
- Prod includes a `text` narrative element (dev omits it)

These secondary differences carry no semantic information, but the HTTP status code difference (422 vs 404) is meaningful — clients may branch on status codes.

## Category: `temp-tolerance`

This is a real, meaningful status code difference affecting 296 records with the same root cause. Both servers agree on the error semantics (CodeSystem not found, expansion impossible), but disagree on which HTTP status code to return. The FHIR R4 spec says the server "SHALL return an error" but does not specify which status code, so either could be argued as valid. However, since prod (the reference implementation) uses 422, dev should match for compatibility.

## Tolerance

Tolerance `expand-422-vs-404-codesystem-not-found` skips records matching:
- URL: `/r4/ValueSet/$expand`
- prod status: 422
- dev status: 404

**Records affected**: 296 (all POST /r4/ValueSet/$expand with CodeSystem not found errors)
**Delta reduction**: 2567 → 2271 lines (removed 296)
**Validation**: 10 randomly sampled eliminated records verified — all have identical OperationOutcome content (after accounting for known cosmetic differences), confirming no real content differences are being hidden.
