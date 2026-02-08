# Analysis: temp-tolerance

**Operation**: `POST /r5/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513 (existing, updated)
**Tolerance**: dev-extra-display-lang-not-found-message (existing, extended)

## What differs

Both servers agree on `result=true` and return matching `system`, `code`, `version`, `display`, and `codeableConcept` parameters for SNOMED code 108252007 with `displayLanguage=es-AR`.

The difference is in how they communicate "no display name found in the requested language":

- **Prod** returns `issues` with an OperationOutcome containing an informational issue with tx-issue-type `display-comment` and text: "'Laboratory procedure' is the default display; the code system http://snomed.info/sct has no Display Names for the language es-AR"
- **Dev** returns a `message` parameter ("There are no valid display names found for the code http://snomed.info/sct#108252007 for language(s) 'es-AR'...") and `issues` with tx-issue-type `invalid-display` with corresponding text

Both are conveying the same information but using different issue type codes (`display-comment` vs `invalid-display`) and different message wording.

## Category: `temp-tolerance`

This is a real, meaningful difference — the servers use different OperationOutcome coding and different message text for the same informational feedback. It's part of the same root cause as existing bug bd89513 (display language resolution feedback differs between prod and dev). The existing tolerance handled the case where prod had no issues at all; this extends it to also handle the case where prod has its own `display-comment` issues about the same topic.

## Tolerance

Extended the existing `dev-extra-display-lang-not-found-message` tolerance to also strip prod's `display-comment` issues when they are about display language defaults (matching on `display-comment` code and text containing "default display" or "no Display Names for the language"). This covers 2 additional records (both SNOMED 108252007 with displayLanguage=es-AR on /r5/CodeSystem/$validate-code), bringing the total from 19 to 21 records eliminated by this tolerance.

Validation: both eliminated records confirmed — result, system, code, version, display all match between prod and dev; the only difference was the display-language informational feedback.
