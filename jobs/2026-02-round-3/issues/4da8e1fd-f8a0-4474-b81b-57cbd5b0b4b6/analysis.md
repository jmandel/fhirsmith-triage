# Analysis: already-handled

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: none (existing tolerances cover this)
**Tolerance**: validate-code-display-text-differs, validate-code-missing-extra-version-params

## What differs

The original difference was in the `display` parameter for LOINC code `8478-0`:
- **Prod**: `"Mean blood pressure"`
- **Dev**: `"Mean arterial pressure"`

Additionally, prod returned an extra `version` parameter (SNOMED CT version string) that dev omitted.

Both servers agree on `result=true`, `system=http://loinc.org`, `code=8478-0`, and the `codeableConcept` output. The request validated a multi-coding CodeableConcept (LOINC 8478-0 + SNOMED 6797001) against the Vital Signs ValueSet.

## Category: `already-handled`

After the existing tolerance pipeline runs, **prod-normalized.json and dev-normalized.json are identical**. The record is no longer present in deltas.ndjson (0 matches). Six tolerances were applied:

1. `strip-diagnostics` — removed trace diagnostics (different formats by design)
2. `sort-parameters-by-name` — sorted parameters for stable comparison
3. `strip-oo-message-id-extension` — removed server-generated message ID extensions
4. `oo-missing-location-field` — stripped deprecated `location` field from prod
5. `validate-code-display-text-differs` (bugId: b9034b0) — normalized display text to prod value
6. `validate-code-missing-extra-version-params` (bugId: 7b694ba) — added missing SNOMED version param to dev

## Tolerance

No new tolerance needed. The existing pipeline fully resolves all differences for this record. The two bugs already filed (b9034b0 for display text, 7b694ba for missing version params) cover the root causes.
