# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b6d19d8
**Tolerance**: cc-validate-code-missing-known-coding-params

## What differs

POST CodeSystem/$validate-code with a multi-coding CodeableConcept (SNOMED + LOINC). The SNOMED coding references an unknown edition version (`http://snomed.info/sct/11000274103/version/20231115`), so both servers agree `result=false` with `x-caused-by-unknown-system`.

However, prod still validates the known LOINC coding and returns:
- `code`: "74043-1"
- `system`: "http://loinc.org"
- `display`: "Alcohol use disorder"
- `issues`: OperationOutcome with an informational `invalid-display` issue about display language resolution

Dev omits all four of these parameters entirely — it doesn't echo back the known coding's details when an unknown system version is present in the CodeableConcept.

## Category: `temp-tolerance`

This is a real, meaningful difference. Prod correctly returns information about the coding it was able to validate, while dev omits it. Both agree on the overall result (false) due to the unknown system, but dev loses information about the secondary coding.

## Tolerance

Already covered by the existing tolerance `cc-validate-code-missing-known-coding-params` (bugId: `b6d19d8`). This tolerance normalizes dev by copying prod's `code`, `system`, `display` params and `issues` to dev. After normalization, both sides are identical.

The record was picked from an older delta file before this tolerance was added. It no longer appears in the current `deltas.ndjson` (0 of 155 originally matching records remain). No new tolerance or bug filing needed.
