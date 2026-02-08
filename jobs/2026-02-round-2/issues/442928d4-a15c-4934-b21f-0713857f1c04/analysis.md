# Analysis: temp-tolerance

**Operation**: `GET /r5/CodeSystem/$lookup?system=http://snomed.info/sct&code=710136005`
**Category**: status-mismatch
**Status**: prod=400 dev=404
**Bug**: e107342
**Tolerance**: lookup-unknown-code-status-400-vs-404

## What differs

Both servers agree that SNOMED CT code 710136005 does not exist in the loaded edition (version `http://snomed.info/sct/900000000000207008/version/20250201`). However, they disagree on how to report this error:

1. **HTTP status**: prod returns 400 (Bad Request), dev returns 404 (Not Found)
2. **OperationOutcome issue code**: prod uses `invalid`, dev uses `not-found`
3. **Error message location**: prod puts the message in `diagnostics`, dev puts it in `details.text`
4. **Error message text**: slightly different formatting — prod: `"Unable to find code 710136005 in ..."`, dev: `"Unable to find code '710136005' in ..."` (dev wraps code in single quotes)

The FHIR R4 spec's example error response for $lookup uses issue code `not-found` with `details.text`, which matches dev's behavior.

## Category: `temp-tolerance`

This is a real, meaningful difference — the HTTP status code (400 vs 404) and the OperationOutcome issue code (`invalid` vs `not-found`) are not cosmetically equivalent. They communicate different semantics: 400 means "your request was malformed" while 404 means "the thing you asked about doesn't exist." For an unknown code, 404 with `not-found` (dev's behavior) is arguably more correct per the FHIR spec example.

This is a single-record occurrence (the only $lookup status mismatch out of 2991 total $lookup operations), so it's a narrow pattern but still worth tracking.

## Tolerance

Tolerance `lookup-unknown-code-status-400-vs-404` (kind: `temp-tolerance`, bugId: `e107342`) skips $lookup records where prod returns 400 and dev returns 404, and both return OperationOutcome with "Unable to find code" messages. This eliminated exactly 1 record from the deltas (6 -> 5). Verified the eliminated record is the target record `442928d4-a15c-4934-b21f-0713857f1c04`.
