# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7b694ba
**Tolerance**: validate-code-missing-extra-version-params

## What differs

After normalization, the sole difference is that prod returns an extra `version` parameter for SNOMED CT (`"http://snomed.info/sct/900000000000207008/version/20250201"`) that dev omits. Both sides agree on `result: true`, return the same LOINC version `"2.81"`, identical `code`, `display`, `system`, `codeableConcept`, and `issues` parameters.

The request validates a CodeableConcept with two codings (LOINC 85354-9 + SNOMED 75367002) against the observation-vitalsignresult ValueSet. Prod reports version strings for both code systems used during validation; dev only reports the LOINC version.

## Category: `temp-tolerance`

This is a real, meaningful difference. The `version` output parameter tells clients which code system edition was used during validation. Dev systematically omits version info for secondary codings in multi-coding CodeableConcept responses, losing provenance information. This isn't cosmetic — it's a behavioral gap in dev's validate-code implementation.

The pattern affects ~459 records across the dataset (prod returning more version params than dev), spanning SNOMED version URIs, LOINC versions, ICD-10 date versions, and other code system versions.

## Tolerance

Tolerance ID: `validate-code-missing-extra-version-params`

Matches validate-code records where prod has more `version` parameters than dev. Normalizes by adding the missing version values from prod to dev's parameter list, then applying stable sort by name+value to both sides for consistent ordering.

Eliminates 148 records (those where version count was the only remaining difference after the full pipeline). An additional ~311 records have their version params normalized but remain as deltas due to other differences.

Validated by sampling 10 eliminated records — all confirmed to have version param count as the only semantic difference, with other superficial diffs (OO key order, location field, diagnostics) handled by earlier tolerances.
