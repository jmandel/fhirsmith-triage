# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 4f27f83
**Tolerance**: ucum-error-message-format

## What differs

Both prod and dev agree on all core fields: `result=false`, `system=http://unitsofmeasure.org`, `code=Torr`, and the primary error message (`Unknown code 'Torr' in the CodeSystem 'http://unitsofmeasure.org' version '2.2'`).

The only difference is in the second (informational) OperationOutcome issue's `details.text`, which describes the UCUM parsing error:

- **Prod**: `Error processing Unit: 'Torr': The unit "Torr" is unknown at character 1`
- **Dev**: `Error processing unit 'Torr': The unit 'Torr' is unknown at character 1`

Three formatting differences:
1. Capitalization: `Unit:` (prod) vs `unit` (dev)
2. Punctuation: extra colon after unit name in prod (`'Torr':`) vs none in dev (`'Torr'`)
3. Quoting style: escaped double quotes in prod (`"Torr"`) vs single quotes in dev (`'Torr'`)

## Category: `temp-tolerance`

This is a real message text formatting difference. Per AGENTS.md, validation messages are meaningful content. While both messages convey the same error, the formatting is different — this isn't cosmetic JSON/key-ordering noise but a difference in how the UCUM error message is constructed. Filed as bug 4f27f83.

## Tolerance

Tolerance `ucum-error-message-format` normalizes dev's UCUM error message text to match prod's formatting. It handles both top-level and nested (batch-validate-code) issue structures by scanning for `Error processing Unit` (prod) vs `Error processing unit` (dev) patterns and canonicalizing to prod's text.

- Records eliminated: 1 (from 10 to 9 deltas)
- Only the target record 392830d5-650f-42a4-9149-a8f7a1246016 was removed
- No false positives: diff of old vs new delta IDs confirms only this record was affected
