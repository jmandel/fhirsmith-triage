# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513 (variant 6 — prod-only invalid-display with lenient-display-validation)
**Tolerance**: display-lang-prod-only-invalid-display

## What differs

In the normalized output, prod has an extra `invalid-display` warning issue in its OperationOutcome that dev omits entirely:

- **Prod**: includes a warning-severity issue with `tx-issue-type=invalid-display` and text "Wrong Display Name 'Body temperature - Core' for http://loinc.org#8329-5. Valid display is one of choices: ..." plus a `message` parameter containing the same text.
- **Dev**: omits this `invalid-display` issue and has no `message` parameter.

Both servers agree on `result=true`, `system=http://loinc.org`, `code=8310-5`, `display=Körpertemperatur`, and all other issues (this-code-not-in-vs, status-check). The request uses `mode=lenient-display-validation` with `displayLanguage=de`.

## Pattern search

All 114 records matching this pattern share these characteristics:
- `lenient-display-validation` mode: 114/114
- `displayLanguage` parameter present: 114/114
- validate-code operation: 114/114 (77 ValueSet, 37 CodeSystem)
- Prod has `invalid-display` issue, dev doesn't: 114/114
- Only diffs are `issues` and `message` params: 114/114

22 unique display warning texts across LOINC, SNOMED, ISO 11073, UCUM, and other code systems.

## Category: `temp-tolerance`

This is a real behavioral difference — prod generates display validation warnings that dev silently omits. Same root cause as bug bd89513: dev does not pass `defLang` to `hasDisplay`, causing it to handle display language validation differently. In this specific variant with lenient-display-validation mode, dev skips the warning path entirely while prod still generates it.

## Tolerance

Tolerance `display-lang-prod-only-invalid-display` matches validate-code records where prod has `invalid-display` issues that dev lacks entirely. It normalizes by stripping the prod-only `invalid-display` issues and the corresponding `message` parameter.

- Records in dataset matching pattern: 114
- Records eliminated by tolerance: 98
- Records remaining (due to additional result-disagrees): 16
- Validated by sampling 10 eliminated records: all legitimate
