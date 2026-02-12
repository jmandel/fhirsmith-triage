# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: display-lang-invalid-display-different-coding (updated)

## What differs

After existing tolerances normalize away display-comment vs invalid-display text and expression differences, the only remaining difference was **severity**: prod returns `"warning"` while dev returns `"information"` on the same `invalid-display` issue (same text, same expression pointing to `CodeableConcept.coding[1].display`).

The request validates a multi-coding CodeableConcept (SNOMED #1153592008 + LOINC #8336-0) with `displayLanguage=de`. Both servers agree `result=true` and generate equivalent invalid-display issues, but disagree on the severity level.

## Category: `temp-tolerance`

This is variant 5 of bug bd89513 — the displayLanguage/defLang handling issue. The existing `display-lang-invalid-display-different-coding` tolerance already handled text and expression differences, but missed the severity difference. This is a real behavioral difference (warning vs information severity), not cosmetic.

## Tolerance

Updated the existing `display-lang-invalid-display-different-coding` tolerance to also normalize `severity` (in addition to `details.text` and `expression`) when canonicalizing dev's invalid-display issues to match prod. This fixed 16 additional records that were previously unresolved because only severity differed after text/expression normalization.

Validation: all 16 eliminated records confirmed to be validate-code on CodeSystem with displayLanguage + multi-coding CodeableConcept, result=true on both sides, with the only diff being invalid-display issue severity (warning vs information or vice versa).
