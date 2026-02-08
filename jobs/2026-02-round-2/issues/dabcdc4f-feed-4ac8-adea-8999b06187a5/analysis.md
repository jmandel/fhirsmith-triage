# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/participant-role&filter=referr&count=50`
**Category**: dev-crash-on-valid
**Status**: prod=200 dev=500
**Bug**: 6b31694
**Tolerance**: expand-filter-crash

## What differs

Dev crashes with HTTP 500 on all `$expand` requests that include a `filter` query parameter. The error is a JavaScript TypeError: `searchText.toLowerCase is not a function`, indicating that `searchText` is null or undefined when the filter logic attempts to call `.toLowerCase()` on it.

Prod successfully returns a ValueSet expansion (HTTP 200). In this specific record, prod returns an empty expansion (no `contains` entries) with a `valueset-unclosed` extension, indicating the expansion is based on SNOMED CT and filtered by "referr".

## Category: `temp-tolerance`

This is a real bug — dev crashes on valid requests that prod handles successfully. The `filter` parameter is a standard FHIR $expand parameter for text-based filtering of expansion results. Dev fails to handle it, crashing with a TypeError rather than returning filtered results.

This affects all 58 records in the delta file that have `filter=` in the URL, spanning both R4 and R5 FHIR versions and 3 different ValueSets (participant-role, condition-code, medication-codes).

## Tolerance

Tolerance `expand-filter-crash` skips GET requests to `/r[345]/ValueSet/$expand` where:
- The URL contains `filter=`
- prod returns 200 and dev returns 500
- The dev response body contains `searchText.toLowerCase is not a function`

Eliminated 58 records (114 → 56 deltas). Validated by sampling 10 eliminated records — all matched the exact pattern.
