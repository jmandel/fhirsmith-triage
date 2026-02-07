# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7258b41
**Tolerance**: ndc-validate-code-extra-inactive-params

## What differs

For NDC validate-code requests (system `http://hl7.org/fhir/sid/ndc`), both servers agree `result=true` and return matching `system`, `code`, and `display` parameters. However, dev returns four additional parameters that prod omits entirely:

- `version: "2021-11-01"` -- the NDC code system version dev used
- `inactive: true` -- flags the concept as inactive
- `message: "The concept '<code>' has a status of null and its use should be reviewed"` -- a warning about concept status
- `issues` -- an OperationOutcome with severity=warning, code=business-rule, tx-issue-type=code-comment, message-id=INACTIVE_CONCEPT_FOUND

Prod's diagnostics show it uses unversioned NDC: `Using CodeSystem "http://hl7.org/fhir/sid/ndc|"` (empty version after the pipe). Dev uses NDC version 2021-11-01 and performs inactive concept checking that prod does not.

All 16 affected records involve three NDC codes: 0777-3105-02, 0002-8215-01, and 0169-4132-12.

## Category: `temp-tolerance`

This is a real, meaningful difference -- not cosmetic. Dev provides additional terminology information (inactive status, version, warning about concept status) that prod does not. The `inactive` parameter and associated warning message are clinically significant: they tell callers that a concept should be reviewed. The version difference (dev has 2021-11-01, prod has no version) indicates different NDC loading configurations.

This is not equivalent because:
1. `inactive: true` is a meaningful terminology property -- it changes what callers understand about the code's validity
2. The `version` parameter communicates which edition was used for validation
3. The `message` and `issues` provide actionable warnings about concept status

## Tolerance

Tolerance `ndc-validate-code-extra-inactive-params` matches validate-code responses where system is `http://hl7.org/fhir/sid/ndc` and dev has an `inactive` parameter that prod lacks. It strips the four extra parameters (`inactive`, `version`, `message`, `issues`) from dev only when prod doesn't have them.

- **Records eliminated**: 16 (from 906 to 890 deltas)
- **Validation**: All 16 eliminated records confirmed to be NDC validate-code with result agreement (true/true) and only the expected extra dev parameters
