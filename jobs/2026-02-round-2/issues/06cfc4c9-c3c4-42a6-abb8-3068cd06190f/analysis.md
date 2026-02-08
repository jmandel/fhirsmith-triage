# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: f33ebd3
**Tolerance**: unknown-system-vs-unknown-version

## What differs

When `$validate-code` is called on `CodeSystem` with `system-version` pinning an unavailable SNOMED CT edition (Canadian edition `http://snomed.info/sct/20611000087101`), prod and dev classify the error differently:

- **Prod**: Treats the entire CodeSystem as unknown
  - message-id: `UNKNOWN_CODESYSTEM`
  - message: "A definition for CodeSystem 'http://snomed.info/sct' could not be found, so the code cannot be validated"
  - `x-caused-by-unknown-system`: `http://snomed.info/sct` (no version)
  - No `display` parameter

- **Dev**: Recognizes SNOMED is loaded but the specific edition is not
  - message-id: `UNKNOWN_CODESYSTEM_VERSION`
  - message: "A definition for CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/20611000087101' could not be found, so the code cannot be validated. Valid versions: ..." (lists 13 available editions)
  - `x-caused-by-unknown-system`: `http://snomed.info/sct|http://snomed.info/sct/20611000087101` (with version)
  - Returns `display: "Chest pain"` parameter

Both agree `result: false`. The request includes `system-version` parameter `http://snomed.info/sct|http://snomed.info/sct/20611000087101`, `default-to-latest-version: true`, and code 29857009 (Chest pain).

## Category: `temp-tolerance`

This is a real, meaningful difference in how the two servers handle version resolution for SNOMED CT editions. Dev's behavior is arguably more helpful (identifies the specific version problem and lists alternatives), but it differs from prod's error classification. The `display` parameter in dev's response is also notable — dev apparently resolves the code's display text despite declaring the version unknown. Filed as bug f33ebd3.

## Tolerance

Tolerance `unknown-system-vs-unknown-version` matches validate-code records where prod's message says the system "could not be found" (without mentioning a version) and dev's message includes "Valid versions:". It normalizes dev's message, issues text, x-caused-by-unknown-system, and strips dev's display parameter to match prod. Eliminates 1 record. Validated: exactly 1 record removed (the target), no false positives.
