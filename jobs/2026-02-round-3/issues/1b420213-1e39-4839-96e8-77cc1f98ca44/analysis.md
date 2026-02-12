# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: display-lang-invalid-display-different-coding

## What differs

After existing tolerances run (strip-diagnostics, sort-parameters-by-name, strip-oo-message-id-extension, oo-missing-location-field, invalid-display-message-format, multi-coding-cc-system-code-version-disagree, display-comment-vs-invalid-display-issues), the only remaining difference is in the `issues` OperationOutcome:

- **Prod**: `invalid-display` issue for `http://loinc.org#8741-1` at `CodeableConcept.coding[1].display` — "There are no valid display names found for the code http://loinc.org#8741-1 for language(s) 'de'"
- **Dev**: `invalid-display` issue for `http://snomed.info/sct#82799009` at `CodeableConcept.coding[0].display` — "There are no valid display names found for the code http://snomed.info/sct#82799009 for language(s) 'de'"

Both sides agree on `result=true`, `system=urn:iso:std:iso:11073:10101`, `code=150276`, `version=2024-12-05`, `display=Cardiac output`, and `message` (about LOINC). The `status-check` issue (draft CodeSystem) is identical. They only disagree on which coding in the multi-coding CodeableConcept gets the `invalid-display` warning for the display language.

The request is a multi-coding CodeableConcept with SNOMED, LOINC, and ISO 11073 codings, using `displayLanguage=de`.

## Category: `temp-tolerance`

This is a real difference — prod and dev flag different codings for the display language warning. Same root cause as bug bd89513: dev does not pass `defLang` to `hasDisplay` in the `checkDisplays` method, which changes how display language resolution works and which codings trigger warnings.

## Tolerance

Wrote `display-lang-invalid-display-different-coding` tolerance under existing bug bd89513. The tolerance matches when both sides have the same number of issues but `invalid-display` issues differ in text/expression (referencing different codings), and normalizes dev's invalid-display issues to match prod's values.

Eliminated 78 records (1575 -> 1497 deltas). Validated 12 randomly sampled eliminations — all legitimate: all have `displayLanguage` in request, both sides agree `result=true`, the only difference is which coding gets the `invalid-display` issue, and non-invalid-display issues match exactly.

Updated bug bd89513 comment 0 with Variant 5 description, new tolerance ID, new representative record ID, and updated Records-Impacted count (525+ -> 603+).
