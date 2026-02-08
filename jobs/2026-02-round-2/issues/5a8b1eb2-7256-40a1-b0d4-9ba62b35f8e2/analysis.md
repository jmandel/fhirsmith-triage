# Analysis: temp-tolerance

**Operation**: `GET /r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: fdc587a
**Tolerance**: validate-code-iso3166-AA-result-disagrees

## What differs

Prod and dev disagree on the validity of ISO 3166 code "AA":

- **Prod**: `result: true`, `version: "2018"`, `display: "User-assigned"` — recognizes "AA" as a valid user-assignable code
- **Dev**: `result: false`, message "Unknown code 'AA' in the CodeSystem 'urn:iso:std:iso:3166' version '2018'" — does not recognize the code at all

"AA" is a user-assigned code in ISO 3166. The standard reserves certain code elements (AA, QM-QZ, XA-XZ, ZZ) for user-defined purposes. Prod includes these reserved codes in its code system data; dev does not.

## Category: `temp-tolerance`

This is a `result-disagrees` — the core `$validate-code` result boolean differs. Prod says the code is valid and dev says it's unknown. This is a real, meaningful difference in terminology behavior, not a cosmetic difference. Filed as git-bug fdc587a.

## Tolerance

Tolerance `validate-code-iso3166-AA-result-disagrees` matches CodeSystem/$validate-code requests on `urn:iso:std:iso:3166` with `code=AA` where prod returns result=true and dev returns result=false. Skips the matched records.

3 records matched and were eliminated. All 3 were validated — all are identical requests (`GET /r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA`) with the same result disagreement. Delta count went from 4 to 1.
