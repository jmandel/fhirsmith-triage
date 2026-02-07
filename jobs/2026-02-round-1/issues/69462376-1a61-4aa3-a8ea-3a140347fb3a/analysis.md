# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 093fde6
**Tolerance**: message-concat-missing-issues

## What differs

The `message` parameter differs between prod and dev. Both servers return identical OperationOutcome `issues` resources with the same two errors (UNKNOWN_CODESYSTEM and Terminology_TX_System_Relative), but they assemble the top-level `message` summary differently:

- **Prod**: Concatenates all issue detail texts with `; ` separator: "A definition for CodeSystem 'SI' could not be found, so the code cannot be validated; Coding.system must be an absolute reference, not a local reference"
- **Dev**: Only includes the first issue's text: "A definition for CodeSystem 'SI' could not be found, so the code cannot be validated"

This is not cosmetic — the `message` parameter is a meaningful summary and should reflect all issues. Clients relying on the message text would miss the second error about relative references.

## Category: `temp-tolerance`

This is a real behavioral difference. Dev fails to concatenate all OperationOutcome issue texts into the message parameter when multiple issues exist. The structured `issues` resource is correct on both sides, but the summary `message` is incomplete on dev. Filed as bug 093fde6.

## Tolerance

Tolerance `message-concat-missing-issues` normalizes the dev `message` to match prod's concatenated value when:
1. Both are Parameters responses
2. Messages differ
3. There are 2+ issues in the OperationOutcome
4. Prod message equals all issue texts joined with `; `
5. Dev message equals only the first issue text

8 total records match this pattern in comparison.ndjson (5 CodeSystem/$validate-code, 3 ValueSet/$validate-code). 5 were in current deltas and are now eliminated. The other 3 were already handled by other tolerances (they had additional diffs beyond just message).

Validated all 5 eliminated records: each matches the exact pattern with identical issues and no other hidden differences.
