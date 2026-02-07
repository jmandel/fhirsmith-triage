# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 52ecb75
**Tolerance**: cs-validate-code-no-system-error-format

## What differs

Both servers agree `result: false` and `code: "OBG"` — the validation correctly fails because no system is provided. However, the error reporting differs in three ways:

1. **Message text**: Prod returns "Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided". Dev returns "No CodeSystem specified - provide url parameter or codeSystem resource".

2. **Severity**: Prod reports the issue as `warning`, dev reports it as `error`. This is a meaningful FHIR distinction — the severity level affects how clients should handle the response.

3. **Issue detail structure**: Prod includes structured `details.coding` with `{code: "invalid-data", system: "http://hl7.org/fhir/tools/CodeSystem/tx-issue-type"}`. Dev only includes `details.text` with no coding.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The severity level (warning vs error) and structured coding in the issue details are meaningful FHIR content. However, both servers agree on the core result (`result: false`), and this is a single-record pattern specific to a CodeSystem/$validate-code POST with no system parameter.

## Tolerance

Tolerance `cs-validate-code-no-system-error-format` normalizes dev's message and issues to match prod's values. It matches narrowly: only `POST /r4/CodeSystem/$validate-code` (without trailing `?`) where dev's message contains "No CodeSystem specified".

Comparison rerun: 684 deltas -> 683 deltas. Exactly 1 record eliminated, confirmed to be this record only (9afb9fcf-df5f-4766-a56a-33379c66b90a).
