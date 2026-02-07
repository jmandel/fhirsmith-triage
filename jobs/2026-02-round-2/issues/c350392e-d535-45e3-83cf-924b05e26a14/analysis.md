# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 80ce6b2
**Tolerance**: message-concat-selective-issues

## What differs

The only difference after normalization is the `message` output parameter. This is a `$validate-code` on a CodeableConcept with two codings (GenomicClinicalIndication#R210 and SNOMED#1365861003), both of which fail validation.

**Prod message** (2 error messages joined with "; "):
> Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/83821000000107/version/20230412' (UK Edition); Unknown Code 'R210' in the CodeSystem 'https://fhir.nwgenomics.nhs.uk/CodeSystem/GenomicClinicalIndication' version '0.1.0' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment

**Dev message** (only 1 error message):
> Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/83821000000107/version/20230412' (UK Edition)

Dev omits the GenomicClinicalIndication fragment code system error from the message. The structured OperationOutcome `issues` resource is identical on both sides (3 issues: 1 informational draft warning, 1 warning about unknown code in fragment, 1 error about unknown SNOMED code). All other parameters (`result`, `system`, `code`, `version`, `codeableConcept`) are identical.

## Category: `temp-tolerance`

This is a real, meaningful difference. The `message` parameter is a human-readable summary of validation results, and dev's version is incomplete — it drops one of the error messages. While the structured `issues` OperationOutcome contains all the information, the `message` parameter should match prod's behavior of concatenating all relevant error/warning messages. This is the same root cause as the existing `message-concat-missing-issues` tolerance (bug 093fde6 from a previous round), but with a different matching pattern.

## Tolerance

Tolerance `message-concat-selective-issues` matches validate-code records where:
- Both sides have identical OperationOutcome issues (compared with key-order-insensitive deep equality)
- Messages differ, with dev's message being a proper substring of prod's
- Prod's message contains "; " (indicating concatenated multiple messages)

Canonicalizes dev's message to prod's value. Eliminates 10 records (3663 → 3653 deltas). All 10 eliminated records were validated: all are POST /r4/CodeSystem/$validate-code with the same GenomicClinicalIndication+SNOMED CodeableConcept pattern, all have only the message diff, and all have identical OO issues.
