# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: prod-display-comment-default-display-lang, display-comment-vs-invalid-display-issues

## What differs

Both servers agree `result=true` for SNOMED code 256262001 ("Silver birch pollen" / "Betula pendula pollen") validated with `displayLanguage=de` and `lenient-display-validation=true`. The request provides display "Betula pendula pollen" (Latin name) and asks for German language validation.

After existing normalizations (diagnostics stripped, parameters sorted, message-id extensions stripped, location field stripped, dev's extra "no valid display names found" message+issues stripped), the sole remaining difference is:

- **Prod** has an `issues` parameter with OperationOutcome containing severity=`information`, issue-type code=`display-comment`, text: "'Betula pendula pollen' is the default display; the code system http://snomed.info/sct has no Display Names for the language de"
- **Dev** has no `issues` parameter (dev's original `invalid-display` warning was stripped by the `dev-extra-display-lang-not-found-message` tolerance)

The root cause is the same as bug bd89513: dev does not pass `defLang` to `hasDisplay`, making it stricter about display language resolution. Prod generates an informational "default display" comment; dev generates a warning "Wrong Display Name" (which gets stripped by an earlier tolerance), leaving prod's informational issue orphaned.

## Category: `temp-tolerance`

This is a real, meaningful difference in how display language resolution is handled — prod treats missing language-specific displays as informational, dev treats them as warnings/errors. Same root cause as existing bug bd89513. Not equivalent (different severity levels and issue type codes carry different meaning), but follows a recognizable pattern affecting 525 records.

## Tolerance

Two tolerances were written under bug bd89513:

1. **`prod-display-comment-default-display-lang`**: Matches validate-code where result=true on both sides, prod has informational display-comment issues about "is the default display", and dev has no issues. Strips prod's orphaned display-comment issues. Eliminates **372 records**.

2. **`display-comment-vs-invalid-display-issues`**: Matches validate-code where prod has display-comment issues and dev also has issues with invalid-display type. Strips display-comment from prod and extra invalid-display issues/message from dev. Eliminates **153 additional records**.

Combined: **525 records eliminated** (1728 → 1575 deltas for the new tolerance; 372 records handled by prod-display-comment-default-display-lang in an earlier pass). Validated by sampling 12 eliminated records — all match the expected pattern with no other differences hidden.
