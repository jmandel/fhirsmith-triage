# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: 85d0977
**Tolerance**: bcp47-case-sensitive-validation

## What differs

Prod returns `result: false` for BCP-47 code `en-us` with error messages:
- "Unknown code 'en-us' in the CodeSystem 'urn:ietf:bcp:47' version ''"
- "Unable to recognise part 2 ("us") as a valid language part"

Dev returns `result: true` with `display: "English (Region=United States)"`.

The core disagreement is whether `en-us` is a valid BCP-47 language tag. BCP-47 is case-sensitive in FHIR (caseSensitive defaults to true per the 2022 update). The correct regional variant format is `en-US` (uppercase region code per IETF standards). Prod correctly rejects the lowercase form; dev incorrectly accepts it via case-insensitive lookup.

## Category: `temp-tolerance`

This is a real bug in dev — it should enforce case-sensitive matching for BCP-47 codes. The `result` boolean disagrees, which is the most critical type of terminology server difference. Filed as bug 85d0977.

## Tolerance

Tolerance ID: `bcp47-case-sensitive-validation`
- Matches: `urn:ietf:bcp:47` validate-code records where prod=false, dev=true (result-disagrees)
- Kind: skip (result disagrees fundamentally, no meaningful normalization possible)
- Records eliminated: 2 (from 436 to 434 deltas)
  - ba44d44e-929e-4b34-8d18-39ead53a68b6: POST /r4/CodeSystem/$validate-code (code: en-us)
  - 175c5449-c70c-4c69-9e2e-4f728d035c1f: POST /r4/ValueSet/$validate-code (code: en-us, ValueSet simple-language--0|6.1.0)
- The third BCP-47 delta record (5d1cbf41, content-differs for $expand) is correctly unaffected
