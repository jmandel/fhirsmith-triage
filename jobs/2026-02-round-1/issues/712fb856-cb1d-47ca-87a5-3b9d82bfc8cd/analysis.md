# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: c9d8333
**Tolerance**: validate-code-undefined-code-message-diff

## What differs

POST ValueSet/$validate-code with a coding that has no code value. Both sides agree `result=false`, but dev stringifies the absent code as the literal string `"undefined"` (JavaScript undefined-to-string coercion):

- **Prod message**: `The provided code 'http://loinc.org#' was not found in the value set '...'`
- **Dev message**: `The provided code 'http://loinc.org#undefined' was not found in the value set '...'; Unknown code 'undefined' in the CodeSystem 'http://loinc.org' version '2.81'`

Additional differences:
- Dev returns 2 OperationOutcome issues (extra `invalid-code` issue for "Unknown code 'undefined'"), prod returns 1 (`not-in-vs` only)
- Dev's `not-in-vs` issue uses code `#undefined` in its text, prod uses `#` (empty code)
- Prod returns `version: "2.81"` parameter, dev omits it

## Category: `temp-tolerance`

This is a real, meaningful difference caused by JavaScript undefined-to-string coercion when dev processes POST request bodies with absent code values. Dev treats missing code as the literal string "undefined" rather than recognizing it as absent/empty. This is the same root cause as bugs 19283df (result-disagrees variant where dev=false, prod=true) and 4cdcd85 (crash variant).

The 14 CodeSystem/$validate-code records with this root cause are already handled by tolerance `validate-code-undefined-system-result-disagrees` (result disagrees). These 2 remaining ValueSet/$validate-code records are the variant where both sides agree `result=false` but the error messages differ.

## Tolerance

Tolerance `validate-code-undefined-code-message-diff` skips POST $validate-code records where both sides return `result=false` and dev's message contains `#undefined'` while prod's message contains `#'` (empty code). Eliminates 2 delta records (from 39 to 37). Both eliminated records validated as correct matches for the pattern.
