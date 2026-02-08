# Analysis: temp-tolerance

**Operation**: `GET /r5/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=40127002&codeB=159033005`
**Category**: status-mismatch
**Status**: prod=400 dev=200
**Bug**: 15f5ce0
**Tolerance**: r5-get-subsumes-status-mismatch

## What differs

Prod returns HTTP 400 with an OperationOutcome error: "No CodeSystem Identified (need a system parameter, or execute the operation on a CodeSystem resource)". Dev returns HTTP 200 with a valid Parameters response: `{outcome: "subsumed-by"}`.

The `system=http://snomed.info/sct` parameter is clearly present in the query string. The FHIR R4 spec (and R5 by extension) explicitly documents `GET [base]/CodeSystem/$subsumes?system=...&codeA=...&codeB=...` as a valid invocation pattern.

Notably, POST requests to `/r5/CodeSystem/$subsumes` with the same system in the request body succeed on both prod and dev. The issue is specific to GET requests where the system is passed as a query parameter.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The prod server fails to process a valid FHIR operation request. The `system` parameter is present but prod reports it cannot find a CodeSystem, suggesting prod fails to parse or recognize the system query parameter for GET $subsumes on R5. Dev correctly processes the request and returns the subsumption result.

## Tolerance

Tolerance `r5-get-subsumes-status-mismatch` (kind: `temp-tolerance`, bugId: `15f5ce0`) skips GET requests to `/r5/CodeSystem/$subsumes` where prod returns 400 and dev returns 200. Eliminates 2 records from the delta set (47 -> 45). Both eliminated records were validated — same pattern of prod failing to identify the CodeSystem despite system param being present.
