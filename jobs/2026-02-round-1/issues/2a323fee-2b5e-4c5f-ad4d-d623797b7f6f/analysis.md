# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 36675d4
**Tolerance**: snomed-expression-parse-message-diff

## What differs

The only difference between prod and dev (after normalization) is in the informational OperationOutcome issue text for the SNOMED expression parser fallback error. When validating the invalid SNOMED code "freetext", both servers correctly return result=false with the same error issue, but the informational follow-up message about expression parsing differs in two ways:

- **Wording**: prod says "and neither could it be parsed as an expression", dev says "and could not be parsed as an expression"
- **Character offset**: prod reports "at character 1" (1-based), dev reports "at character 0" (0-based)

Prod: `Code freetext is not a valid SNOMED CT Term, and neither could it be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 1)`
Dev:  `Code freetext is not a valid SNOMED CT Term, and could not be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 0)`

## Category: `temp-tolerance`

This is a real, meaningful difference in message text (per AGENTS.md, validation messages matter). The wording difference ("neither could it be" vs "could not be") and the off-by-one character offset indicate different SNOMED expression parser implementations. Filed as bug 36675d4.

## Tolerance

Tolerance ID: `snomed-expression-parse-message-diff`. Matches OperationOutcome issues where prod text contains "neither could it be parsed as an expression" and the corresponding dev issue contains "could not be parsed as an expression". Normalizes dev text to prod text. Handles both top-level Parameters (direct validate-code) and nested batch-validate-code structures.

Eliminates 2 records (146 -> 144 deltas):
- 2a323fee: POST /r4/ValueSet/$batch-validate-code (batch)
- 1160ac1d: POST /r4/CodeSystem/$validate-code (direct)

Both eliminations validated — the SNOMED expression parse message text was the sole remaining difference in each record.
