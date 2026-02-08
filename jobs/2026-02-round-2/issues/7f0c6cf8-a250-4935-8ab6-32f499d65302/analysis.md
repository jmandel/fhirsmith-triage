# Analysis: temp-tolerance

**Operation**: `POST /r5/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: f9f6206
**Tolerance**: validate-code-undefined-null-in-unknown-code-message

## What differs

Request validates a coding with system `urn:ietf:bcp:47` but no `code` or `version` provided. Both servers correctly return `result=false`. The differences are:

1. **Message text**: Prod renders absent values as empty strings, dev renders JavaScript `undefined` and `null` as literal strings:
   - Prod: `"Unknown code '' in the CodeSystem 'urn:ietf:bcp:47' version ''"`
   - Dev: `"Unknown code 'undefined' in the CodeSystem 'urn:ietf:bcp:47' version 'null'"`

2. **Extra issue**: Dev includes an additional informational OperationOutcome issue `{"text": "Empty code", "severity": "information"}` that prod does not return.

3. **Issues details text**: Mirrors the message difference (same `undefined`/`null` literals).

## Category: `temp-tolerance`

This is a real, meaningful difference — dev is leaking JavaScript `undefined` and `null` values into user-facing strings instead of handling absent values properly. The message content is wrong (showing literal "undefined" and "null" where empty strings should appear). The extra "Empty code" issue is an additional behavioral difference. Filed as bug f9f6206.

Related to existing bug af1ce69 (null literal in "status of null" messages) but affects a different message template ("Unknown code" vs "INACTIVE_CONCEPT_FOUND").

## Tolerance

Tolerance ID: `validate-code-undefined-null-in-unknown-code-message`
- Matches validate-code Parameters responses where prod message contains `"Unknown code ''"` and dev message contains `"Unknown code 'undefined'"`
- Normalizes dev message and issues text to prod's rendering
- Removes the extra "Empty code" informational issue from dev
- Eliminates 1 delta record (only this record has this specific pattern)
- Validated: 45 → 44 deltas, only record 7f0c6cf8 removed
