# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 530eeb3
**Tolerance**: validate-code-undefined-system-missing-params

## What differs

Both servers agree `result=false` (the submitted display text is wrong for SNOMED code 785126002). However the response shape differs significantly:

1. **Missing parameters in dev**: Prod returns `code` (785126002), `system` (http://snomed.info/sct), and `display` ("Methylphenidate hydrochloride 5 mg chewable tablet"). Dev omits all three.

2. **Extra OperationOutcome issues in dev**: Dev returns 3 issues vs prod's 1:
   - Dev adds `this-code-not-in-vs` (information) — "code was not found in the value set"
   - Dev adds `not-in-vs` (error) — "No valid coding was found for the value set"
   - Both have `invalid-display` (error), though with different message text (already handled by `invalid-display-message-format` tolerance)

3. **Message text**: Dev prepends "No valid coding was found for the value set..." to the message. Also lists "one of 4 choices" for valid display (with duplicates) vs prod's single valid display.

Root cause: Dev diagnostics show `Validate "[undefined#785126002 ...]"` — the system URI is JavaScript `undefined`, meaning dev failed to extract the system from the POST request body's codeableConcept. This is the same root cause as bugs 19283df (89 result-disagrees records) and 4cdcd85 (1 crash record).

## Category: `temp-tolerance`

These are real, meaningful differences — the response is structurally different and dev's behavior is incorrect (it should return code/system/display and not generate spurious not-in-vs issues). However, the root cause is a known bug (undefined system extraction from POST body) that already has 90+ records tracked. These 3 records are the variant where both sides happen to agree on result=false despite the extraction failure.

## Tolerance

Tolerance `validate-code-undefined-system-missing-params` skips POST $validate-code records where:
- Both results are false
- Prod has code/system params, dev lacks them
- Dev diagnostics contain "undefined"

Eliminates exactly 3 records, all validated. All 3 are the same SNOMED code (785126002) against the medication-uv-ips ValueSet.
