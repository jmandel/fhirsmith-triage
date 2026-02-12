# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: display-lang-result-disagrees

## What differs

Prod returns `result: true` for `$validate-code` on `urn:iso:std:iso:3166#FR` with display "FRANCE" and `displayLanguage=fr-FR`. Dev returns `result: false` with error message: "Wrong Display Name 'FRANCE' for urn:iso:std:iso:3166#FR. There are no valid display names found for language(s) 'fr-FR'. Default display is 'France'".

The code itself is valid in both servers. The disagreement is about display validation when `displayLanguage` is specified. Dev's `checkDisplays` method does not pass `defLang` to `hasDisplay`, so default-language displays are not considered valid matches. When the provided display "FRANCE" doesn't exactly match the default display "France" AND no fr-FR-specific displays exist, dev treats it as an error and flips the result to false.

Prod passes `defLang` to `hasDisplay`, which allows the default language display "France" to be found as a match, so prod accepts the code without any display error.

## Category: `temp-tolerance`

This is a real difference in terminology validation behavior, not a cosmetic issue. The `result` boolean disagrees (true vs false), which is the most critical parameter in `$validate-code`. This is the most severe manifestation of bug bd89513 — in the content-differs variant, both sides agree result=true but dev adds extra informational messages; in this variant, dev actually rejects the code.

## Tolerance

Two tolerances were added, both under bug bd89513:

1. **`display-lang-result-disagrees`**: Matches validate-code where prod result=true, dev result=false, and dev's message contains "Wrong Display Name" + "no valid display names found". Normalizes dev's result to true and strips error message/issues. Eliminates 2 records (both `urn:iso:std:iso:3166#FR` with `displayLanguage=fr-FR`).

2. **`dev-extra-display-lang-not-found-message`**: Matches validate-code where result=true on both sides, prod has no message, and dev has a message containing "no valid display names found". Strips dev's extra message/issues. Eliminates 5 records as standalone fixes; additionally normalizes ~504 records that have other co-occurring differences.

Total records eliminated: 7. All 7 were validated — each showed the expected display-language-resolution pattern with no hidden differences.
