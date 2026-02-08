# Analysis: temp-tolerance

**Operation**: `GET /r4/CodeSystem/$validate-code?url=http:%2F%2Fwww.nlm.nih.gov%2Fresearch%2Fumls%2Frxnorm&code=70618&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: af1ce69
**Tolerance**: validate-code-null-status-in-message

## What differs

Both prod and dev agree on all substantive fields: result=true, system=rxnorm, code=70618, display=Penicillin, inactive=true, version="??". Both return the INACTIVE_CONCEPT_FOUND warning.

The only difference is in the message text and issues OperationOutcome text:
- Prod: `"The concept '70618' has a status of  and its use should be reviewed"` (empty string where status would go)
- Dev: `"The concept '70618' has a status of null and its use should be reviewed"` (literal word "null")

Dev interpolates a null/missing status value as the string "null" rather than as an empty string. This is a string interpolation difference — both servers are reporting that the concept has no meaningful status.

## Category: `temp-tolerance`

This is a real difference, not true equivalence. The two servers render a missing status differently in human-readable message text. While the semantic meaning is the same (no status), the actual output differs, and dev is arguably incorrect — rendering a null value as the literal string "null" is a common programming error (e.g., `"" + null` in JavaScript yields `"null"`). Filed as bug af1ce69.

## Tolerance

Tolerance `validate-code-null-status-in-message` normalizes dev's "status of null" to prod's "status of " (empty) in both the `message` parameter and the `issues` OperationOutcome `details.text`.

- Matches: validate-code Parameters responses where prod message contains "status of " (two spaces, indicating empty status) and dev message contains "status of null"
- Records eliminated: 24 (all 24 are the same URL: RxNorm code 70618)
- Validated all 24 eliminated records: every one shows the same pattern with no other differences hidden
- The same null-vs-empty pattern also affects 20 NDC records, but those are already covered by the `ndc-validate-code-extra-inactive-params` tolerance (bug 7258b41)
