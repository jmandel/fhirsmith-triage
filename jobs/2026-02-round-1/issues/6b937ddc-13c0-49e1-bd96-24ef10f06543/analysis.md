# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: dev-crash-on-valid
**Status**: prod=200 dev=500
**Bug**: 4cdcd85
**Tolerance**: validate-code-crash-undefined-system-code

## What differs

Prod returns a successful Parameters response with result=true, validating code `2108-9` (display "European") in system `urn:oid:2.16.840.1.113883.6.238` (CDC Race and Ethnicity) version 1.2, within the `http://hl7.org/fhir/us/core/ValueSet/detailed-race|6.1.0` ValueSet.

Dev returns HTTP 500 with an OperationOutcome error: `"No Match for undefined|undefined"`. The `undefined|undefined` in the error message indicates dev failed to extract the `system` and `code` parameters from the POST request body — both resolved to JavaScript `undefined` instead of the actual values.

Dev's response also contains `location: [null]` and `expression: [null]` (invalid FHIR), though the primary issue is the 500 crash itself.

## Pattern search

- Only 1 record in the comparison dataset has this `undefined|undefined` error pattern.
- Only 1 record has `dev-crash-on-valid` for `$validate-code` (all other dev-crash-on-valid records are `$expand`, already tolerated by `expand-dev-crash-on-valid`).
- 3 records in total involve the `detailed-race` ValueSet; the other 2 succeed on both sides.
- The request body was not captured during data collection, so the exact input parameters are unknown.

## Category: `temp-tolerance`

This is a real bug — dev crashes on a valid request that prod handles successfully. The error reveals a parameter extraction failure (system and code not parsed from the request body). Filed as git-bug 4cdcd85.

## Tolerance

Tolerance `validate-code-crash-undefined-system-code` matches POST $validate-code records where prod=200, dev=500, and the dev OperationOutcome contains "undefined|undefined". It skips the matched record. Eliminates 1 record (437 → 436 deltas). Validated by confirming the single eliminated record is the target record.
