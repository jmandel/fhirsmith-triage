# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 451c583
**Tolerance**: validate-code-x-unknown-system-extra

## What differs

When validating code `2054-5` (Black or African American) from system `urn:oid:2.16.840.1.113883.6.238|v1` against ValueSet `omb-race-category|4.1.0`, both servers return `result=false` (code not in value set). However, they handle the unrecognized system version differently:

1. **x-unknown-system parameter**: Dev returns `x-unknown-system: urn:oid:2.16.840.1.113883.6.238|v1`. Prod does not return this parameter.
2. **Extra OperationOutcome issue**: Dev includes an additional issue (code `not-found`, message-id `UNKNOWN_CODESYSTEM_VERSION`) stating the version "v1" could not be found and listing valid versions ("1.2"). Prod only includes the `not-in-vs` issue.
3. **Message text**: Dev prepends the unknown-version error message before the not-in-vs message. Prod only includes the not-in-vs message.
4. **Display parameter**: Prod returns `display: "Black or African American"` (looked up from its known version 1.2). Dev omits display since it considers the system version unknown.
5. **Version parameter**: Prod returns two version parameters — the known version (`1.2`) and the requested version (`v1`). Dev returns only the requested version (`v1`).

## Category: `temp-tolerance`

This is a real, meaningful behavioral difference. Dev treats the code system version "v1" as entirely unknown, while prod falls back to a known version ("1.2") and provides additional information (display text, actual version). The validation result agrees (`false`), but the handling of unrecognized versions differs. This affects how informative the response is to clients.

The pattern affects 5 delta records total:
- 4 involve `urn:oid:2.16.840.1.113883.6.238|v1` (CDC Race and Ethnicity)
- 1 involves a SNOMED edition version (`http://snomed.info/sct|http://snomed.info/sct/731000124108/version/20250301`) but also has a separate SNOMED version skew issue

## Tolerance

Tolerance `validate-code-x-unknown-system-extra` matches validate-code responses where dev has an `x-unknown-system` parameter that prod lacks. Normalizes by:
- Stripping `x-unknown-system` from dev
- Canonicalizing message, issues, display, and version to prod's values
- Re-sorting parameters after modifications

Eliminates 4 delta records (the 4 CDC Race/Ethnicity records). The 5th record (SNOMED) remains in deltas due to a separate version value difference unrelated to this pattern.

Validated all 4 eliminated records — each shows the same pattern: both `result=false`, dev has `x-unknown-system` and extra issue, prod has display and extra version. No unrelated differences are being masked.
