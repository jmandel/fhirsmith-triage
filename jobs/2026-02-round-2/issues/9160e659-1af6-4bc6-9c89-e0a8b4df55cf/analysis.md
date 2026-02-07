# Analysis: temp-tolerance

**Operation**: `GET /r4/CodeSystem/$validate-code?system=http%3A%2F%2Funitsofmeasure.org&code=TEST`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 801aef1
**Tolerance**: oo-extra-expression-on-info-issues

## What differs

Both prod and dev return a Parameters response with `result: false` and two OperationOutcome issues. The error-severity issue (invalid code) is identical in both. The information-severity issue (UCUM parse error detail) differs:

- **Prod**: No `expression` field on the informational issue
- **Dev**: Includes `expression: ["code"]` on the informational issue

Both the error-severity issue in prod and dev include `expression: ["code"]`. The difference is only that prod omits `expression` on the supplementary informational issue while dev includes it.

Additionally, the UCUM error message text differs slightly (already handled by the existing `ucum-error-message-format` tolerance):
- Prod: `Error processing Unit: 'TEST': The unit "TEST" is unknown at character 1`
- Dev: `Error processing unit 'TEST': The unit 'TEST' is unknown at character 1`

After existing tolerances normalize the message text, strip the `location` field, remove the message-id extension, and sort parameters, the only remaining difference is the extra `expression` field on dev's informational issue.

## Category: `temp-tolerance`

This is a real behavioral difference, not cosmetic equivalence. Dev includes `expression: ["code"]` on informational OperationOutcome issues where prod does not. While the `expression` value is semantically correct (the issue relates to the `code` parameter), and dev is arguably being more complete, this is a divergence in OperationOutcome structure that should be tracked as a bug. It's analogous to the existing `oo-missing-location-field` bug (a9cf20c) but in reverse direction.

## Tolerance

Tolerance `oo-extra-expression-on-info-issues` matches Parameters responses where any information-severity OperationOutcome issue in dev has an `expression` field that the corresponding prod issue lacks. Normalizes by removing the extra `expression` from dev.

- **Records affected**: 6 (verified all 6 eliminated)
  - 4 SNOMED CT `code=K29` records
  - 1 UCUM `code=TEST` record
  - 1 SNOMED CT `code=freetext` POST record
- **All are $validate-code operations** with invalid codes where the informational issue provides supplementary context
- **Validation**: All 6 eliminated records manually inspected. Each shows the same pattern: error issue has `expression` in both, informational issue has `expression` only in dev. No other differences are being masked.
- **Delta count**: 3948 -> 3942 (exactly 6 eliminated)
