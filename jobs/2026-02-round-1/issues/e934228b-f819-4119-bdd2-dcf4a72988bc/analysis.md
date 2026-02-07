# Analysis: `temp-tolerance`

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 8f148da
**Tolerance**: validate-code-missing-message-on-true

## What differs

After normalization, the only remaining difference is that prod includes a `message` parameter and dev does not. Both agree on `result: true`, `system`, `code`, `version`, and the `issues` OperationOutcome (which contains identical warning text).

Prod's message: `"Unknown Code '441' in the CodeSystem 'http://hl7.org/fhir/sid/icd-9-cm' version '2015' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment"`

This text is duplicated in the `issues` OperationOutcome `details.text` on both sides.

## Pattern

Dev omits the `message` output parameter on all `$validate-code` responses where `result=true`. When `result=false`, dev correctly includes `message`. The FHIR spec explicitly states that when result is true, the message parameter "carries hints and warnings."

Scope across the full comparison.ndjson:
- 150 records total (111 ValueSet, 39 CodeSystem validate-code)
- All 150 have `result=true` and prod has `message` while dev omits it
- 0 records where `result=false` and dev omits `message`

In the current deltas: 38 records matched, 34 had `missing-in-dev:message` as the sole diff, 4 had additional diffs (value-differs:issues, extra-in-dev:normalized-code).

## Category: `temp-tolerance`

This is a real, meaningful difference — the `message` parameter carries warnings that FHIR clients may rely on. The spec explicitly allows and expects `message` when `result=true`. However, the warning text IS available in the `issues` OperationOutcome, so the information is not completely lost — it's just not in the expected location.

## Tolerance

Tolerance `validate-code-missing-message-on-true` matches validate-code Parameters responses where `result=true`, prod has a `message` parameter, and dev does not. Normalizes by stripping `message` from prod (since dev doesn't have it and we can't fabricate it on the dev side).

- Eliminated 34 records from deltas (91 → 57)
- Validated 10/10 sampled eliminations — all legitimate, each had only `missing-in-dev:message` as the diff
- The 4 records with additional diffs (value-differs:issues, extra-in-dev:normalized-code) remain in deltas as expected
