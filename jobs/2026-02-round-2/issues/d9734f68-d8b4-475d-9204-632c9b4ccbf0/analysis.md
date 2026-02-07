# Analysis: temp-tolerance

**Operation**: `POST /r5/ValueSet/$expand`
**Category**: status-mismatch
**Status**: prod=422 dev=200
**Bug**: 44d1916
**Tolerance**: expand-too-costly-succeeds

## What differs

Prod returns HTTP 422 with an OperationOutcome containing `issue.code: "too-costly"` and message "The value set '' expansion has too many codes to display (>10000)". The request attempts to expand the entire LOINC code system (`http://loinc.org` with `inactive: true`), which has far more than 10,000 codes.

Dev returns HTTP 200 with a ValueSet containing 1000 codes (honoring the `count: 1000` pagination parameter). Dev does not enforce the expansion size guard that prod has.

The prod-normalized output after the tolerance pipeline is a stripped OperationOutcome with the too-costly issue. The dev-normalized output is a full ValueSet with 1000 LOINC codes. The only tolerance applied was `read-resource-text-div-diff` (normalizing the text div), which is irrelevant to the core status mismatch.

## Category: `temp-tolerance`

This is a real, meaningful difference in behavior. Prod correctly enforces a guard against expanding very large code systems (>10,000 codes) even when pagination parameters are present. Dev ignores this guard and returns paginated results. This is not a cosmetic difference — it reflects missing expansion size enforcement in dev.

An existing tolerance (`expand-too-costly-succeeds`, originally bug e3fb3f6) already covered this pattern but was scoped too narrowly: it only matched the exact URL `/r4/ValueSet/$expand`, missing:
- GET requests with query parameters (e.g., `/r4/ValueSet/$expand?url=...mimetypes`)
- R5 requests (`/r5/ValueSet/$expand`)

## Tolerance

Broadened the existing `expand-too-costly-succeeds` tolerance to match any URL containing `ValueSet/$expand` (instead of exact match on `/r4/ValueSet/$expand`). Updated the bugId to the new bug `44d1916`. The tolerance still requires:
- prod status 422, dev status 200
- prod body is an OperationOutcome with `issue.code: "too-costly"`

This eliminates 17 records (was previously eliminating 0 due to the narrow URL match):
- 6 records: POST `/r5/ValueSet/$expand` expanding all of LOINC
- 11 records: GET `/r4/ValueSet/$expand?url=...mimetypes` expanding MIME types ValueSet

All 17 eliminated records were validated: each has prod returning 422 with too-costly OperationOutcome and dev returning 200 with a ValueSet.

Delta count: 3551 -> 3534 (-17 records).
