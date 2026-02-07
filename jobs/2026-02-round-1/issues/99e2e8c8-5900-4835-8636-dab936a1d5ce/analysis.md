# Analysis: equiv-autofix + temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: e9c7e58 (existing, for null expression/location); none new (message-id extension is cosmetic)
**Tolerance**: `strip-oo-message-id-extension` (equiv-autofix), `dev-null-expression-location` (temp-tolerance)

## What differs

Both servers agree on all terminology content: `result: false`, identical error message ("A definition for the value Set 'http://snomed.info/sct?fhir_vs=refset/92991000087108' could not be found"), identical `codeableConcept` echo-back, identical OperationOutcome issue structure (severity, code, details).

The only differences in the normalized output are three extra fields on dev's OperationOutcome issue:

1. **`location: [null]`** — Dev includes this; prod omits it. Null values in FHIR arrays are invalid.
2. **`expression: [null]`** — Same as above. Invalid FHIR.
3. **`extension` with `operationoutcome-message-id`** — Dev includes `"valueString": "Unable_to_resolve_value_Set_"`; prod omits the extension entirely.

## Category: `equiv-autofix` (message-id extension) + `temp-tolerance` (null arrays)

The `operationoutcome-message-id` extension is explicitly listed in AGENTS.md Known Cosmetic Differences as "server-generated message IDs" — implementation-specific metadata with no terminology significance. Both servers include this extension inconsistently across the dataset (204 records match, 95 differ, 122 dev-only, 47 prod-only). This is an `equiv-autofix` normalization.

The `location: [null]` and `expression: [null]` are the same root cause as existing bug e9c7e58 (which covers the `[""]` empty-string variant). Dev adds location/expression fields to OO issues that don't have a specific location, using invalid FHIR values (null instead of a non-empty string). This is a `temp-tolerance` linked to the same bug.

## Tolerance

Two tolerances were added:

1. **`strip-oo-message-id-extension`** (equiv-autofix): Strips the `operationoutcome-message-id` extension from OperationOutcome issues on both sides. Affects ~467 delta records as normalization. Only 1 record was eliminated (this one, where the extension was the sole remaining diff after null-array normalization). Validated against 10 sampled records — all remain in deltas with legitimate other diffs.

2. **`dev-null-expression-location`** (temp-tolerance, bugId e9c7e58): Removes `expression: [null]` and `location: [null]` from dev OO issues. Affects 2 delta records (5 total in comparison.ndjson). Combined with the message-id extension normalization, eliminates 1 record (this one). The other affected record remains in deltas due to other real differences.

Delta count: 879 → 878 (1 eliminated).
