# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: display-lang-invalid-display-different-coding

## What differs

This is a `$validate-code` on a multi-coding CodeableConcept (SNOMED 82799009, LOINC 8741-1, ISO 11073 150276) with `displayLanguage=de`. Both servers agree `result=true` and return the same `codeableConcept`, `system`, `code`, `version`, and `display` parameters.

After existing tolerances run (strip-diagnostics, sort-parameters-by-name, strip-oo-message-id-extension, oo-missing-location-field, invalid-display-message-format, multi-coding-cc-system-code-version-disagree, display-comment-vs-invalid-display-issues), the only remaining difference is in the `issues` OperationOutcome:

- **Prod**: `invalid-display` issue referencing `http://loinc.org#8741-1` at `CodeableConcept.coding[1].display` — "There are no valid display names found for the code http://loinc.org#8741-1 for language(s) 'de'. The display is 'Left ventricular Cardiac output' the default language display"
- **Dev**: `invalid-display` issue referencing `http://snomed.info/sct#82799009` at `CodeableConcept.coding[0].display` — "There are no valid display names found for the code http://snomed.info/sct#82799009 for language(s) 'de'. The display is 'Cardiac output' which is the default language display"

Both sides report that no language-specific display exists for a coding in the CodeableConcept, but they disagree on **which coding** triggers the warning.

## Category: `temp-tolerance`

This is a real, meaningful difference in display language handling for multi-coding CodeableConcepts. Same root cause as bug bd89513: dev does not pass `defLang` to `hasDisplay`, causing display language resolution to differ from prod. Which coding gets the warning depends on internal processing order, which differs between implementations.

## Tolerance

The tolerance `display-lang-invalid-display-different-coding` (already existed at line 1358 of tolerances.js) handles this pattern. It matches when both sides have the same number of issues, both have `invalid-display` issues at the same index, but the issues reference different text or expression paths. It canonicalizes dev's `invalid-display` issues to match prod's text and expression.

This tolerance eliminated 78 records from the delta file (1575 → 1497). Validated by sampling 10 eliminated records — all followed the same pattern: displayLanguage present, multi-coding CodeableConcept, 1 invalid-display issue on each side referencing different codings.

Note: 77 additional records with a related pattern (`issues` + `message` diff, where prod has 1 more `invalid-display` issue than dev) remain in deltas and may need a separate tolerance extension.
