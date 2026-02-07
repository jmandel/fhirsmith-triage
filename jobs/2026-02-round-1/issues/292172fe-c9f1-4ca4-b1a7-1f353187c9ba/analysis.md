# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 645fdcf
**Tolerance**: inactive-display-message-extra-synonyms

## What differs

After existing tolerances normalize away the `display` parameter difference (handled by `snomed-same-version-display-differs`) and strip diagnostics/message-id extensions, the only remaining difference is in the OperationOutcome `details.text` for the `display-comment` issue:

- **Prod**: `"The correct display is one of Midgrade"`
- **Dev**: `"The correct display is one of Midgrade,Moderate (severity modifier) (qualifier value),Moderate (severity modifier),Moderate severity"`

Both servers correctly identify that "Moderate" is an inactive display for SNOMED code 6736007 and issue a `display-comment` warning. However, dev lists multiple synonyms/designations as alternative correct displays, while prod lists only the preferred term.

The same pattern appears in 2 other records for SNOMED code 78421000 where prod lists `"Intramuscular route"` (quoted) and dev lists `"Intramuscular route,Intramuscular route (qualifier value),Intramuscular use,IM route,IM use"`.

## Category: `temp-tolerance`

This is a real, meaningful difference in validation message content. The list of "correct" display names differs — dev enumerates multiple synonyms while prod returns only the preferred display. This reflects a behavioral difference in how each server constructs the inactive display warning message. Not equivalent (different information content), but follows a recognizable pattern across all 3 affected records.

## Tolerance

Tolerance `inactive-display-message-extra-synonyms` matches validate-code records where OperationOutcome has `display-comment` issues with `details.text` that share the same prefix up to "The correct display is one of" but differ in the display list that follows. Normalizes dev's text to prod's value.

- Records eliminated: 3 (153 → 150 deltas)
- All 3 eliminated records validated: the only difference was the display-comment issue text; result, system, code, version all match
