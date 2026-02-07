# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 9390fe4
**Tolerance**: validate-code-display-echo-on-unknown-system

## What differs

When `$validate-code` returns `result=false` because the CodeSystem is unknown (`x-caused-by-unknown-system`), dev echoes back the input `display` parameter in the response while prod omits it.

In this record, validating code `U` against unknown system `https://codesystem.x12.org/005010/1338`:
- Prod: returns result=false, system, code, message, x-caused-by-unknown-system, issues — no display parameter
- Dev: returns all of the above plus `display: "Urgent"` (echoed from the request input)

After normalization (diagnostics stripped, parameters sorted, message-id extensions removed), the display parameter is the only remaining difference.

## Category: `temp-tolerance`

This is a real, meaningful difference. The FHIR `$validate-code` spec defines the output `display` parameter as "a valid display for the concept if the system wishes to present it to users." When the CodeSystem is unknown and cannot be validated, the server has no basis to return a valid display. Dev is simply echoing back the unvalidated input display, which could mislead clients into thinking the display has been confirmed.

Prod's behavior (omitting display when the system is unknown) is more correct per the spec.

## Tolerance

**Tolerance ID**: `validate-code-display-echo-on-unknown-system`
**Match**: $validate-code Parameters responses where result=false, prod has no display parameter, and dev has a display parameter.
**Action**: Strips the display parameter from dev to match prod.
**Records eliminated**: 73 (from 867 to 794 deltas). The 74th matching record has additional diffs beyond display (different message format) and remains in deltas.

**Validation**: Sampled 12 of 73 eliminated records. All confirmed:
- result=false with unknown CodeSystem
- display present only in dev (echoed from input)
- display was the sole remaining diff after existing normalizations
- No other differences hidden by the tolerance
