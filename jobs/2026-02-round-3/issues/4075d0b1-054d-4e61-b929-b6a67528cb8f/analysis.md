# Analysis: temp-tolerance

**Operation**: `POST /r5/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: dev-message-appends-display-lang-text

## What differs

Both servers agree on result=true, system, code, version, display, inactive, codeableConcept, and the OperationOutcome issues (after existing tolerances normalize the display-comment vs invalid-display issue differences). The only remaining difference is in the `message` parameter:

- **Prod**: `"The concept '103693007' has a status of inactive and its use should be reviewed"`
- **Dev**: `"The concept '103693007' has a status of inactive and its use should be reviewed; There are no valid display names found for the code http://snomed.info/sct#103693007 for language(s) 'de'. The display is 'Diagnostic procedure' which is the default language display"`

Dev concatenates extra display-language text onto the existing inactive-concept message. The request includes `displayLanguage=de` for an inactive SNOMED code (103693007). Since the code system has no German display names, dev appends the display-language warning to the message parameter. Prod does not include this text in the message.

The OperationOutcome issues for the display-language difference are already handled by the `display-comment-vs-invalid-display-issues` tolerance (prod has `display-comment` issue, dev has `invalid-display` issue, both stripped). But the `message` parameter concatenation was not previously addressed.

## Category: `temp-tolerance`

This is a real difference in how the `message` parameter is composed — dev includes extra text that prod omits. It's part of the same root cause as bug bd89513 (display language handling). Not cosmetic — the message content meaningfully differs. Filed under the existing bug.

## Tolerance

Tolerance `dev-message-appends-display-lang-text` normalizes dev's message to match prod's when dev's message starts with prod's message and the extra appended text contains "no valid display names found". Eliminates 1 record from deltas (13 records in the full comparison have this pattern, but 12 are already handled by earlier tolerances). Validated by confirming exactly 1 record was removed and it was the target record.
