# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: fd9fd91
**Tolerance**: case-insensitive-code-validation-diffs

## What differs

When validating codes in case-insensitive code systems (ICD-10, ICD-10-CM) where the submitted code has incorrect casing (e.g., "M80.00xA" instead of "M80.00XA"), three differences remain after existing normalizations:

1. **Extra `normalized-code` parameter in dev**: Dev returns a `normalized-code` output parameter containing the correctly-cased form of the code (e.g., `M80.00XA`). Prod omits this parameter entirely. `normalized-code` is a valid $validate-code output parameter per the FHIR spec.

2. **OperationOutcome severity**: Prod returns `severity: "warning"` for the CODE_CASE_DIFFERENCE issue, dev returns `severity: "information"`. Both convey the same case-difference message.

3. **System URI in issue text**: Prod's issue text references the bare system URI (`'http://hl7.org/fhir/sid/icd-10-cm'`), dev appends the version (`'http://hl7.org/fhir/sid/icd-10-cm|2024'`).

Both sides agree on `result: true`, `system`, `code`, `version`, and `display`.

## Category: `temp-tolerance`

These are real, meaningful differences -- not cosmetic equivalences. The severity level difference (warning vs information) affects how clients interpret the issue. The extra `normalized-code` parameter changes the response shape. The system URI text difference, while minor, reflects different message formatting logic. Filed as bug fd9fd91.

## Tolerance

Tolerance `case-insensitive-code-validation-diffs` matches on dev having a `normalized-code` parameter that prod lacks. It normalizes by:
- Stripping `normalized-code` from dev
- Setting dev's issue severity to match prod's
- Setting dev's issue text to match prod's

The pattern affects exactly 4 records in deltas (all POST /r4/CodeSystem/$validate-code with ICD-10 or ICD-10-CM codes). All 4 were validated -- after normalization, prod and dev match perfectly with no hidden differences.

Records:
- `b6d0a8c8-a6e9-4acb-8228-f08aad1b1c49` (ICD-10-CM, code M80.00xA)
- `a5e0d171-faa7-4e4a-889d-2e67b7ba5f1a` (ICD-10, code i50)
- `8b615152-1bb5-4348-b9c0-0d2f1a323745` (ICD-10-CM, code M80.00xA)
- `74fe974b-b524-4048-b122-5aa3efab4090` (ICD-10, code i50)
