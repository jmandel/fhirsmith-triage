# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7258b41 (existing NDC version skew bug)
**Tolerance**: ndc-valueset-validate-code-extra-version

## What differs

After normalization, the only remaining difference is that dev returns an extra `version` parameter with `valueString: "2021-11-01"` that prod omits entirely. All other parameters are identical:
- `result`: both false
- `message`: both "No valid coding was found for the value set '...'"
- `codeableConcept`: identical (NDC code 0777-3105-02)
- `issues`: identical OperationOutcome (after existing normalizations for empty-string expression/location and message-id extensions)

The request validates an NDC code against a VSAC ValueSet (2.16.840.1.113762.1.4.1010.4). The code is not found in the ValueSet on either server. Dev reports its loaded NDC edition version (2021-11-01) in the response; prod does not.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev is returning an NDC edition version parameter that prod doesn't include. This is the same root cause as the existing NDC version skew bug (7258b41): dev loads NDC version 2021-11-01 while prod uses unversioned NDC. The existing tolerances (`ndc-validate-code-extra-inactive-params` and `ndc-validate-code-unknown-code-version-diffs`) handle NDC records with a top-level `system` parameter, but these 2 records use `codeableConcept` input to ValueSet $validate-code, so they have no top-level `system` parameter and fall through.

## Tolerance

Tolerance `ndc-valueset-validate-code-extra-version` strips the extra `version` parameter from dev when:
- Both responses are Parameters with result=false
- Dev has `version` but prod doesn't
- The `codeableConcept` contains an NDC system coding

Affects exactly 2 delta records (both validated). Delta count: 454 -> 452.
