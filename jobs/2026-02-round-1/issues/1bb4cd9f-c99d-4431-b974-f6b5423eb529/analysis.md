# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=500 dev=500
**Bug**: 98ae4ce
**Tolerance**: error-operationoutcome-structure-diff

## What differs

Both prod and dev return HTTP 500 with OperationOutcome for the same error condition (CodeSystem `http://hl7.org/fhir/v3/AdministrativeGender` not found). The error messages in `issue[0].details.text` are identical. However, the OperationOutcome structure differs in three ways:

1. **`issue[0].code`**: Dev includes `code: "exception"`, prod omits it entirely. Per FHIR R4, `OperationOutcome.issue.code` is required (1..1), so prod is technically non-conformant.

2. **`issue[0].diagnostics`**: Dev includes a `diagnostics` string that duplicates the `details.text` content. Prod omits it. This field is optional (0..1) per spec.

3. **`text` narrative element**: Prod includes `text: {status: "generated", div: "..."}`, dev omits the `text` element entirely. The div was already stripped by the existing `read-resource-text-div-diff` tolerance, leaving `text: {status: "generated"}` on the prod side only.

## Category: `temp-tolerance`

These are real structural differences in how the two servers format 500-error OperationOutcome responses — not truly equivalent. The core error information (error message in details.text) is identical, but:
- Dev is more FHIR-conformant by including the required `code` field
- Dev includes additional (redundant) `diagnostics`
- Prod includes additional narrative `text`

Filed as bug 98ae4ce to track the structural discrepancy.

## Tolerance

Tolerance `error-operationoutcome-structure-diff` normalizes both sides by:
- Setting canonical `issue.code` from whichever side provides it (dev has `"exception"`)
- Stripping `diagnostics` from issues (redundant with `details.text`)
- Stripping `text` narrative element (already partially handled by existing tolerance)

After normalization, both sides have the same structure with the same error message.

**Impact**: Eliminated exactly 4 records from deltas (30 → 26). All 4 are POST /r4/ValueSet/$validate-code? requests with both sides returning 500 for unknown CodeSystems. Validated all 4 eliminated records — each has identical error messages and only differs in the structural fields being normalized.
