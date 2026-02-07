# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 43d6cfa
**Tolerance**: multi-coding-cc-system-code-version-disagree

## What differs

When `POST /r4/CodeSystem/$validate-code` is called with a CodeableConcept containing two codings (one from the custom `el-observation-code-cs` CodeSystem, one from SNOMED CT), both servers return `result=true` and return identical `codeableConcept` parameters. However, the scalar output parameters disagree on which coding to report:

- **Prod** reports the SNOMED coding: `system=http://snomed.info/sct`, `code=19657006`, `version=http://snomed.info/sct/900000000000207008/version/20250201`
- **Dev** reports the custom CodeSystem coding: `system=http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs`, `code=physical.evaluation.alertnessAndOrientation.disorientatedtime`, `version=1.0.0`

The `display` parameter also differs (`Disturbance of orientation in time` vs `Disorientation as to time`), but this is already handled by the `snomed-same-version-display-differs` tolerance (bug 8f739e9).

## Category: `temp-tolerance`

This is a real, meaningful behavioral difference. The FHIR spec defines these output parameters as "the system/code/version that was validated" — when a CodeableConcept has multiple codings, the servers disagree on which one to select for the scalar parameters. A client parsing the response would get different system/code/version values depending on which server they hit. This is not cosmetic — it reflects different internal logic for selecting the "primary" coding from a multi-coding CodeableConcept.

## Tolerance

Tolerance `multi-coding-cc-system-code-version-disagree` matches `POST $validate-code` where `result=true`, both sides return a `codeableConcept` with >1 coding, and the `system` param differs. Normalizes `system`, `code`, and `version` on both sides to prod's values.

Affects exactly 3 records, all involving the same custom CodeSystem (`el-observation-code-cs`) paired with SNOMED CT. Validated by rerunning comparison (143 -> 140 deltas) and confirming only the 3 expected IDs were removed.
