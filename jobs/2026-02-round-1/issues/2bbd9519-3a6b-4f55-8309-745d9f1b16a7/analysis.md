# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bugs**: 2abe02d (empty id), d1b7d3b (includeDefinition param), 515117b (used-codesystem version skew)
**Tolerances**: expand-dev-empty-id, expand-dev-includeDefinition-param, expand-used-codesystem-version-skew, expand-metadata-identifier-timestamp

## What differs

Four differences between prod and dev in the normalized output:

1. **`id: ""`** — Dev includes `"id": ""` (empty string) at the top level of the ValueSet. Prod omits `id` entirely. Empty strings are invalid FHIR. Affects 690 expand delta records.

2. **Extra `includeDefinition` parameter** — Dev echoes `{"name":"includeDefinition","valueBoolean":false}` in `expansion.parameter`. Prod omits this (presumably because `false` is the default). Affects 677 expand delta records.

3. **`used-codesystem` version skew** — The `used-codesystem` expansion parameter reports different code system versions. For this record: prod reports SNOMED US edition `20250901`, dev reports `20230301`. This affects 37 expand records across SNOMED (6), ICD-9-CM (11), LOINC (2), medicationrequest-category (2), v3-NullFlavor (1), ICD-10-CM (1), and 14 with empty/missing system.

4. **`identifier` and `timestamp`** — Server-generated UUID and timestamp in expansion metadata differ between implementations. Purely transient metadata, genuinely cosmetic.

## Category: `temp-tolerance`

Issues 1-3 are real, meaningful differences (not equivalent):
- The empty `id` string is an invalid FHIR conformance violation
- The extra `includeDefinition` parameter is a behavioral difference in what the server echoes
- The version skew reflects different loaded code system editions

Issue 4 is `equiv-autofix` — identifier/timestamp are server-generated transient metadata.

Three bugs were filed for issues 1-3. Issue 4 was handled as an `equiv-autofix` tolerance.

## Tolerance

Four tolerances were written:

1. **`expand-metadata-identifier-timestamp`** (`equiv-autofix`) — Strips `identifier` and `timestamp` from expansion metadata on both sides.
2. **`expand-dev-empty-id`** (`temp-tolerance`, bug 2abe02d) — Removes `id: ""` from dev responses.
3. **`expand-dev-includeDefinition-param`** (`temp-tolerance`, bug d1b7d3b) — Removes the extra `includeDefinition` parameter from dev expansion metadata.
4. **`expand-used-codesystem-version-skew`** (`temp-tolerance`, bug 515117b) — Normalizes `used-codesystem` to prod's value.

Together, these tolerances eliminated **453 records** from the delta file (1549 → 1096). Validation of 12 randomly sampled eliminated records confirmed all had exactly the targeted patterns and no other differences were hidden.
