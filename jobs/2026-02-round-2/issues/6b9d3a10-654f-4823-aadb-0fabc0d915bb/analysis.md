# Analysis: `temp-tolerance`

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-procedure-code&_format=json`
**Category**: dev-crash-on-error
**Status**: prod=422 dev=500
**Bug**: f73e488
**Tolerance**: expand-dev-crash-on-error

## What differs

Dev crashes with HTTP 500 on $expand requests where prod returns a graceful 422 error. Multiple issues in the dev response:

1. **JavaScript source code leak**: Dev's error message contains interpolated JS function body instead of the content mode value: `"The code system definition for http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets is a contentMode() {\r\n    return this.codeSystem.content;\r\n  }, so this expansion is not permitted..."`. The `contentMode()` method's `.toString()` is being used where the content mode string value should be.

2. **Wrong HTTP status**: Dev returns 500 (server error) instead of 422 (semantic/business error). The request is valid but the expansion can't be completed due to code system constraints — this should be a 4xx, not 5xx.

3. **Different issue code**: Dev uses `business-rule`, prod uses `too-costly`. Prod's `too-costly` is more specific and appropriate for expansion that can't be enumerated.

4. **Different code system in error**: Prod stops at CPT (`http://www.ama-assn.org/go/cpt`), dev stops at HCPCS (`http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets`). Both are included in the us-core-procedure-code ValueSet. The servers hit different code systems first when attempting expansion.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev crashes where it should return a graceful error. The JS source code leak is a bug (exposing implementation internals). The wrong status code (500 vs 422) is a bug. Filed as git-bug f73e488.

## Tolerance

Updated the existing `expand-dev-crash-on-error` tolerance to also cover GET requests (which have query parameters in the URL). The original tolerance only matched the exact URL `/r4/ValueSet/$expand` (POST style). Changed to match on URL base (before `?`), and also added coverage for `/r4/CodeSystem/$validate-code` crash (1 record).

The tolerance matches records where:
- URL base is `/r4/ValueSet/$expand` or `/r4/CodeSystem/$validate-code`
- Prod returns 4xx, dev returns 500

**Eliminated 258 records** (3258 → 3000 deltas). Validated 12 randomly sampled eliminated records — all legitimate dev-crash-on-error with the expected pattern (prod=422 too-costly, dev=500 with JS source code leak or other crash).
