# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: status-mismatch
**Status**: prod=422 dev=200
**Bug**: 44d1916
**Tolerance**: expand-too-costly-succeeds

## What differs

Prod returns HTTP 422 with an OperationOutcome containing `issue.code: "too-costly"` and message "The value set '' expansion has too many codes to display (>10000)". Dev returns HTTP 200 with a ValueSet containing 1000 LOINC codes in `expansion.contains` (honoring the `count` pagination parameter).

The request is a POST $expand with an inline ValueSet including all of `http://loinc.org` (no filter), with `count=1000` and `offset=0`. Prod enforces a size guard refusing to expand code systems with >10000 codes. Dev does not enforce this guard and returns paginated results.

## Category: `temp-tolerance`

This is a real, meaningful difference — prod and dev disagree on whether a too-large expansion should error or return paginated results. This is a known behavioral difference tracked in bug 44d1916. The responses are fundamentally incomparable (error vs success), so the tolerance skips the record entirely.

## Tolerance

Tolerance `expand-too-costly-succeeds` matches any $expand request where prod returns 422 with OperationOutcome containing `issue.code: "too-costly"` and dev returns 200. Eliminates 40 records across LOINC (20) and BCP-13 MIME types (20), both /r4/ and /r5/ paths. Validated with 12-record random sample — all legitimate too-costly skip eliminations.
