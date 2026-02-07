# Analysis: `temp-tolerance`

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fdavinci-pdex-plan-net%2FValueSet%2FPractitionerRoleVS&code=ho&_format=json&system=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fdavinci-pdex-plan-net%2FCodeSystem%2FProviderRoleCS`
**Category**: status-mismatch
**Status**: prod=422 dev=400
**Bug**: cd4b7d1
**Tolerance**: error-status-422-vs-400

## What differs

Prod returns HTTP 422 (Unprocessable Entity) while dev returns HTTP 400 (Bad Request) for the same error condition. Both servers return an OperationOutcome with identical error content:

- Issue code: `not-found`
- Issue details coding: `tx-issue-type#not-found`
- Error text: "A definition for the value Set 'http://hl7.org/fhir/us/davinci-pdex-plan-net/ValueSet/PractitionerRoleVS' could not be found"
- Extension: `operationoutcome-message-id` = "Unable_to_resolve_value_Set_"

Prod also includes an extra informational diagnostics issue (`"X-Request-Id: "`) which dev omits — this is a known cosmetic difference (server trace metadata).

After normalization (key ordering), the only remaining differences are: (1) the HTTP status code and (2) the extra diagnostics issue in prod.

## Category: `temp-tolerance`

This is a real, meaningful difference — HTTP 422 and 400 have different semantics (422 = syntactically valid but semantically unprocessable; 400 = bad request). Both are reasonable for "ValueSet not found" but they disagree, which is observable by clients. This is not cosmetic — it's a genuine status code disagreement that should be resolved.

This pattern is extremely widespread: **1897 records** across two operation types (validate-code: 1331, expand: 566). All 1897 have OperationOutcome on both sides with matching error codes. The status code is the only systemic difference.

## Tolerance

Tolerance `error-status-422-vs-400` skips records where:
- `prod.status === 422` and `dev.status === 400`
- Both response bodies are `OperationOutcome` resources

This eliminates exactly 1897 records (from 6569 deltas to 4672). Validated by sampling 12 random eliminated records — all confirmed as valid eliminations with matching error codes on both sides (not-found, not-supported, too-costly) and the status code difference being the fundamental issue.
