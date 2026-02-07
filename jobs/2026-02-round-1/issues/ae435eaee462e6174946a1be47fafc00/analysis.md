# Analysis: temp-tolerance

**MD5**: `ae435eaee462e6174946a1be47fafc00`
**Operation**: `POST /r4/ValueSet/$validate-code?`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: e9c7e58
**Tolerance**: dev-empty-string-expression-location

## What differs

In the OperationOutcome `issues` parameter, the second issue entry (message ID `TX_GENERAL_CC_ERROR_MESSAGE`, severity `error`) differs:

- **Prod**: Omits `expression` and `location` fields entirely (correct — this is a general error with no specific FHIRPath location)
- **Dev**: Returns `"expression": [""]` and `"location": [""]` (invalid FHIR — strings must be non-empty if present)

All other parameters (result, message, version, codeableConcept) and the first issue entry are identical between prod and dev.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. Dev emits invalid FHIR by including empty strings where prod correctly omits the fields. Empty strings violate FHIR's requirement that string values be non-empty. The pattern affects 318 delta records across three OperationOutcome message types:
- TX_GENERAL_CC_ERROR_MESSAGE (311 records)
- MSG_DRAFT (4 records)
- MSG_DEPRECATED (3 records)

All are $validate-code operations (both ValueSet and CodeSystem).

## Tolerance

Tolerance `dev-empty-string-expression-location` (kind: temp-tolerance, bugId: e9c7e58) normalizes by removing `expression: [""]` and `location: [""]` from dev OperationOutcome issues. It only modifies the dev side — prod is left unchanged.

After adding the tolerance:
- Delta count went from 3320 to 3106 (214 records eliminated)
- The 214 eliminated records were ones where the empty-string expression/location was the sole remaining difference
- The remaining 104 affected records have other differences beyond this pattern and remain in the delta file
- Validated 12 randomly sampled eliminated records: all confirmed identical after normalization, with no other differences hidden
