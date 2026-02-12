# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: c0fe696
**Tolerance**: result-disagrees-unknown-system-version

## What differs

Prod returns `result: true` — it has LOINC version 2.77 loaded and successfully validates code `LA15920-4` ("Former smoker"). It returns system, code, version, display parameters and an informational issue about display language (no German display found).

Dev returns `result: false` with `x-caused-by-unknown-system: http://loinc.org|2.77` — it only has LOINC 2.81 and cannot find version 2.77 at all. It returns an error-level OperationOutcome with `UNKNOWN_CODESYSTEM_VERSION` and message "A definition for CodeSystem 'http://loinc.org' version '2.77' could not be found, so the code cannot be validated. Valid versions: 2.81".

The request includes `default-to-latest-version: true`, but dev still fails because it doesn't recognize the specific version 2.77 referenced in the request's codeableConcept.

## Category: `temp-tolerance`

This is a version-skew issue — prod and dev have different LOINC versions loaded. Prod has LOINC 2.77 (and presumably 2.81), while dev only has 2.81. The `result` boolean disagrees not because of a code bug, but because dev literally doesn't have the data to answer the question. This pattern also affects SNOMED CT International version 20200131 (6 records) and BCP-47 versions 1.0/2.0.0 (3 records).

Not an actionable code bug. Labeled `version-skew`, `wont-fix`, `no-repro-needed`.

## Tolerance

Tolerance `result-disagrees-unknown-system-version` skips validate-code records where prod `result=true`, dev `result=false`, and dev's raw response body includes `x-caused-by-unknown-system` (checked against raw devBody since earlier pipeline tolerances strip this parameter from the normalized body).

Eliminates 43 records:
- 34 LOINC 2.77
- 6 SNOMED CT International 20200131
- 2 BCP-47 2.0.0
- 1 BCP-47 1.0

Validated 12 randomly sampled eliminated records — all correctly match the pattern (prod=true, dev=false, dev has x-caused-by-unknown-system, prod does not).
