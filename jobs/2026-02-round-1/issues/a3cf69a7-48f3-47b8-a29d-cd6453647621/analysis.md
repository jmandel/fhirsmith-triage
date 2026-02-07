# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: de8b2f7
**Tolerance**: unknown-version-valid-versions-message

## What differs

Both prod and dev agree: `result=false`, `system=http://snomed.info/sct`, `code=116101001`, `version=2017-09`, `x-caused-by-unknown-system=http://snomed.info/sct|2017-09`. The core validation result and parameters are identical.

The differences are in the `message` parameter and `issues` OperationOutcome `details.text`, which both contain an UNKNOWN_CODESYSTEM_VERSION error listing available SNOMED editions. Three specific differences:

1. **Different editions listed**: Prod lists 3 editions dev doesn't have (449081005/20250510, 45991000052106/20220531, 900000000000207008/20240801). Dev lists 1 edition prod doesn't have (731000124108/20230301). This reflects different SNOMED edition configurations (related to existing bug da50d17).

2. **"and undefined" appended in dev**: Dev's message ends with "...and undefined". This is a JS `undefined` value leaking into the version list string — a dev-specific bug.

3. **Separator formatting**: Prod uses "," (comma-no-space) between versions; dev uses ", " (comma-space).

## Category: `temp-tolerance`

These are real, meaningful differences — not equivalent. The version list reflects genuinely different SNOMED editions loaded on each server, and "and undefined" is a real dev bug. However, the core validation result agrees, and the pattern is consistent across 13 records. Filed as bug de8b2f7 for the "and undefined" issue specifically.

## Tolerance

Tolerance `unknown-version-valid-versions-message` normalizes both sides by truncating the message and issues text at "Valid versions:", leaving only the error prefix ("A definition for CodeSystem ... could not be found, so the code cannot be validated.") which is identical between prod and dev.

**Scope**: Only matches when BOTH prod and dev have "Valid versions:" in the message AND the prefix before "Valid versions:" is identical. This ensures no false positives — records where prod and dev disagree on the error type itself are not affected.

**Impact**: Eliminates 13 records (623 -> 610 deltas). All 13 validated: core parameters match, issue structure matches, only the version list suffix differs.

**Not covered**: The 27 other records containing "Valid versions:" only in dev's message are NOT matched by this tolerance — those represent more serious issues (result-disagrees where dev can't find a version prod has, different error messages entirely, etc.).
