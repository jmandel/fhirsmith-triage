# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 1bc5e64
**Tolerance**: validate-code-x-unknown-system-extra

## What differs

Dev does not recognize certain CodeSystem versions that prod resolves. When validating RxNorm code 860995 ("metformin hydrochloride 1000 MG") against ValueSet `2.16.840.1.113762.1.4.1010.4|20240606`, the request pins RxNorm version `04072025`.

**Prod** resolves the version (falls back to known version `??`), performs actual validation, and returns:
- `result: false` (code not found in the valueset)
- Two OperationOutcome issues: `this-code-not-in-vs` (information) and `not-in-vs` (error)
- Message: "No valid coding was found for the value set..."

**Dev** cannot find RxNorm version `04072025` and returns:
- `result: false` (can't validate because CodeSystem not found)
- One OperationOutcome issue: `not-found` (error) saying "A definition for CodeSystem ... version '04072025' could not be found"
- Extra parameter: `x-caused-by-unknown-system: http://www.nlm.nih.gov/research/umls/rxnorm|04072025`
- Duplicated error message (same text repeated twice, semicolon-separated)

Both return `result=false`, but for completely different reasons.

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev fails to resolve CodeSystem versions that prod can handle:
- RxNorm version `04072025` (4 records)
- SNOMED US edition version `20220301` (3 records, `x-caused-by-unknown-system`)
- SNOMED US edition version `20250301` (3 records, `x-unknown-system` — different param name)

The pattern affects 10 records total across two parameter name variants (`x-caused-by-unknown-system` and `x-unknown-system`), all validate-code operations where dev has the unknown-system parameter but prod does not.

## Tolerance

Fixed existing tolerance `validate-code-x-unknown-system-extra` which had a bug — it matched on parameter name `x-unknown-system` but the data also uses `x-caused-by-unknown-system`. Updated to handle both parameter names.

The tolerance normalizes dev's response to match prod by:
1. Stripping `x-caused-by-unknown-system` and `x-unknown-system` from dev
2. Canonicalizing dev's `message` to prod's value
3. Canonicalizing dev's `issues` to prod's OperationOutcome
4. Adding `display` from prod if prod has it and dev doesn't
5. Aligning `version` parameter count

Updated bug ID from defunct `451c583` to new bug `1bc5e64`. Net elimination: 7 records from deltas (3534 → 3527). The other 3 records were already handled by the old tolerance's `x-unknown-system` match — now all 10 are correctly handled by the unified tolerance.

Validated all 10 eliminated records: each has dev's unknown-system parameter without prod counterpart, both agree `result=false`, and normalization correctly targets only the unknown-system-related differences.
