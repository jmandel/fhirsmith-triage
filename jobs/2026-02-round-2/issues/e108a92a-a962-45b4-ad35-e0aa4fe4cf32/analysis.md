# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand?_limit=1000&_incomplete=true`
**Category**: content-differs
**Status**: prod=500 dev=500
**Bug**: 1932f81
**Tolerance**: dev-sqlite-misuse-expand-rxnorm

## What differs

Both servers return 500 on this RxNorm $expand request, but with different internal error messages:

- **Prod**: OperationOutcome with `"fdb_sqlite3_objects error: no such column: cui1"` — a specific SQLite schema error
- **Dev**: OperationOutcome with `"SQLITE_MISUSE: not an error"` — a generic SQLite misuse error

After normalization (text div stripped, OperationOutcome structure normalized), the remaining difference is the error message text in `issue[0].details.text` and the presence of `code: "exception"` in dev's issue (absent in prod's).

## Broader pattern

This record is part of a 16-record pattern where dev returns SQLITE_MISUSE errors on RxNorm-related $expand requests:

- **8 records**: Both servers return 500 (both crash, different error messages). Prod's error references "fdb_sqlite3_objects error: no such column: cui1".
- **8 records**: Prod returns 422 with proper FHIR error ("A definition for CodeSystem 'https://hl7.org/fhir/sid/ndc' could not be found"), while dev crashes with 500 SQLITE_MISUSE.

All 16 records are POST requests to the same URL with RxNorm (`http://www.nlm.nih.gov/research/umls/rxnorm`) in the ValueSet compose.

## Category: `temp-tolerance`

This is a real difference. Dev has a SQLite handling issue with RxNorm expand operations. In the prod-422/dev-500 subset, dev is clearly wrong — it should return a proper error, not crash. In the both-500 subset (including this record), the difference in error messages indicates different failure modes in the two implementations. Filed as bug 1932f81.

## Tolerance

Tolerance `dev-sqlite-misuse-expand-rxnorm` matches $expand records where dev returns 500 with an OperationOutcome containing "SQLITE_MISUSE" in the error details text. Skips the entire record since dev's crash prevents meaningful content comparison.

- Records eliminated: 16 (3472 → 3456 deltas)
- Validated 10 of 16 eliminated records: all confirmed as RxNorm $expand requests with dev SQLITE_MISUSE errors
- No SQLITE_MISUSE records remain in deltas after tolerance applied
