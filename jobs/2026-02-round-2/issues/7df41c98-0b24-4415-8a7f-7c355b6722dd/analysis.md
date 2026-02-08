# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-simple-observation-category&code=exam&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fobservation-category`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (existing: "Dev loads different versions of HL7 terminology CodeSystems")
**Tolerance**: hl7-terminology-cs-version-skew (updated)

## What differs

Both servers correctly validate code `exam` in `http://terminology.hl7.org/CodeSystem/observation-category` as valid (`result: true`). Two differences remain in the normalized output:

1. **Version parameter**: prod returns `version: "4.0.1"`, dev returns `version: "2.0.0"`. Prod loads these CodeSystems at the FHIR R4 core version (4.0.1), while dev loads the actual THO-published version (2.0.0).

2. **Missing issues parameter**: Prod includes an informational `issues` OperationOutcome with a `status-check` issue noting "Reference to draft CodeSystem http://terminology.hl7.org/CodeSystem/observation-category|4.0.1 from hl7.fhir.r4.core#4.0.1". Dev omits this entirely — it doesn't detect the draft status, likely because it loads a different version of the CodeSystem.

## Category: `temp-tolerance`

This is a real, meaningful difference — prod and dev load different versions of HL7 terminology CodeSystems. It's part of an existing known bug (6edc96c) that covers version skew across all `terminology.hl7.org/CodeSystem/*` systems.

## Tolerance

Updated the existing `hl7-terminology-cs-version-skew` tolerance to handle three patterns that the original tolerance missed:

1. **Version parameter normalization**: Sets dev's `version` param to prod's value for `terminology.hl7.org/CodeSystem/*` systems.
2. **Draft status-check issue stripping**: Removes prod's informational draft `status-check` issues (which dev doesn't generate).
3. **Version string normalization in messages/issues text**: Also handles records without a `message` parameter (result=true cases) by extracting the target version from the `version` param or message text.

The updated tolerance eliminates 26 records (down from 2764 to 2738 total deltas). The remaining ~235 records from the original 261 version-differs set are still in deltas because they have additional differences beyond version skew (e.g., different issue content unrelated to version). Validated 12/26 eliminated records — all have matching result, code, display, system; only version param and draft issues differed.
