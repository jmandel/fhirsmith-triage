# Analysis: `temp-tolerance`

**Operation**: `POST /r4/ValueSet/$expand?_limit=1000&_incomplete=true`
**Category**: status-mismatch
**Status**: prod=422 dev=404
**Bug**: 1c145d2 (existing)
**Tolerance**: expand-422-vs-404-codesystem-not-found (widened URL match)

## What differs

Both servers return an OperationOutcome with the same error: issue code `not-found`, message "A definition for CodeSystem 'http://hl7.org/fhir/ValueSet/allergyintolerance-clinical' could not be found, so the value set cannot be expanded". The error content is identical. The only differences are:

1. **HTTP status code**: prod returns 422 (Unprocessable Entity), dev returns 404 (Not Found)
2. **Narrative text element**: prod includes `text.status: "generated"` with a div, dev omits the `text` element entirely (already handled by `read-resource-text-div-diff` normalization)

## Category: `temp-tolerance`

This is a real difference in HTTP status code semantics (422 vs 404), not merely cosmetic. However, both servers communicate the same error with the same issue code and message. This is part of an existing, already-filed bug (1c145d2).

The record was not being caught by the existing tolerance because the tolerance matched `record.url !== '/r4/ValueSet/$expand'` using strict equality, which missed URLs with query parameters (`?_limit=1000&_incomplete=true` for POST requests, `?url=...` for GET requests).

## Tolerance

Widened the existing `expand-422-vs-404-codesystem-not-found` tolerance match from strict URL equality (`record.url !== '/r4/ValueSet/$expand'`) to prefix match (`!record.url.startsWith('/r4/ValueSet/$expand')`). This now covers:

- 32 POST records with `?_limit=1000&_incomplete=true` query params
- 10 GET records with `?url=...&_format=json` query params

Total: 42 additional records eliminated (from 3514 to 3472 deltas). All 10 sampled eliminations validated — each has prod=422, dev=404, matching `not-found` issue codes, and identical error messages.
