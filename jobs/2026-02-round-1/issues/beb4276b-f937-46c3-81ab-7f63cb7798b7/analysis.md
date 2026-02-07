# Analysis: `temp-tolerance`

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: cf90495
**Tolerance**: invalid-display-message-format

## What differs

Both prod and dev correctly return `result: false` for validating display "English" against `urn:ietf:bcp:47#en-US`. The `system`, `code`, and `display` parameters all match. The only difference is in the `message` parameter and `issues` OperationOutcome `details.text` — the "Wrong Display Name" error message text:

- **Prod**: "Valid display is one of 6 choices: 'English (Region=United States)', 'English (United States)', 'English (Region=United States)', 'English (Region=United States)', 'English (United States)' or 'English (Region=United States)'"
- **Dev**: "Valid display is one of 3 choices: 'English (Region=United States)' (en), 'English (United States)' (en) or 'English (Region=United States)' (en)"

Two formatting differences:
1. Prod lists duplicate display options (6 including repeats), dev de-duplicates (3 unique)
2. Dev appends language tags like `(en)` after each display option, prod does not

## Category: `temp-tolerance`

This is a real, meaningful difference in message content — not equivalent. The error messages convey different information (different count of options, different formatting). However, the core validation result (`result: false`) agrees, and the pattern is consistent across many records. Filed as bug cf90495 with a tolerance to suppress during triage.

## Tolerance

Tolerance `invalid-display-message-format` matches validate-code records where both prod and dev have `invalid-display` coded issues in the OperationOutcome and the `message` parameters differ. It canonicalizes dev's message text and issue details to prod's version.

- **Records eliminated**: 31 (from 3106 to 3075 deltas)
- **Validation**: Sampled 12 eliminated records — all had matching `result` booleans, only `message`/`issues` diffs, and `invalid-display` in both sides. No inappropriate eliminations found.
