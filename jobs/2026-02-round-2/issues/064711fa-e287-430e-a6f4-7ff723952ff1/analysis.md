# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: status-mismatch
**Status**: prod=200 dev=400
**Bug**: 1433eb6
**Tolerance**: validate-code-valueset-not-found-dev-400

## What differs

Prod returns HTTP 200 with a successful `$validate-code` Parameters response (result=true, system=http://snomed.info/sct, code=148006, display="Preliminary diagnosis"). Dev returns HTTP 400 with an OperationOutcome error: "A definition for the value Set 'https://nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use--0|6.5.0' could not be found."

The request validates SNOMED code 148006 against the Indian NDHM ValueSet `ndhm-diagnosis-use--0` version 6.5.0. Prod resolves this ValueSet and validates the code; dev cannot find the ValueSet definition at all.

## Pattern scope

10 records show this exact pattern (prod=200, dev=400 with "could not be found" in OperationOutcome):

- 3 records: `nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use*` (Indian NDHM ValueSets)
- 5 records: `ontariohealth.ca/fhir/ValueSet/*` (Ontario Health ValueSets)
- 2 records: `hl7.org/fhir/ValueSet/@all` (special @all pseudo-ValueSet)

All are POST $validate-code requests. The root cause is that dev is missing ValueSet definitions from certain IG packages (NDHM India, Ontario Health) and doesn't support the @all pseudo-ValueSet that prod resolves.

Search used: `grep 'could not be found' results/deltas/deltas.ndjson` filtered to prod=200 dev=400.

## Category: `temp-tolerance`

This is a real, meaningful difference. Prod can resolve these ValueSets and return valid terminology results; dev cannot find them at all and returns an error. This is not equivalent behavior — it represents missing ValueSet definitions in the dev server. Filed as bug 1433eb6.

## Tolerance

Tolerance `validate-code-valueset-not-found-dev-400` matches POST validate-code requests where prod=200, dev=400, and dev returns an OperationOutcome with "could not be found" text. Eliminates exactly 10 records. Validated by comparing archived vs new deltas — only the 10 identified records were eliminated, no false positives.
