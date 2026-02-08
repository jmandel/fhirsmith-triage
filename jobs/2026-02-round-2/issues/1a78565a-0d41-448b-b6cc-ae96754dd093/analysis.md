# Analysis: temp-tolerance

**Operation**: `GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=446050000`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: dc0132b
**Tolerance**: snomed-lookup-name-and-properties

## What differs

Three differences between prod and dev for SNOMED CT $lookup responses:

1. **`name` parameter**: Prod returns `"SNOMED CT"` (human-readable display name). Dev returns `"http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201"` (system|version URI). Per the FHIR R4 $lookup spec, the `name` output parameter is defined as "A display name for the code system", so prod's value is correct.

2. **Missing properties**: Prod returns properties `copyright`, `moduleId`, `normalForm`, `normalFormTerse`, `parent`, and `child` (when applicable). Dev returns only `inactive`. The FHIR spec says "If no properties are specified, the server chooses what to return", but dev returns significantly fewer SNOMED-specific properties.

3. **Missing `abstract` parameter on R5**: For R5 SNOMED lookups, prod returns `abstract: false` but dev omits it entirely. This affects 2170 of 2176 R5 lookup records.

## Category: `temp-tolerance`

These are real, meaningful differences in terminology operation output. The `name` parameter uses the wrong format (URI instead of display name), and the missing properties mean clients get significantly less information from dev than from prod. Filed as git-bug dc0132b.

## Tolerance

Tolerance `snomed-lookup-name-and-properties` normalizes:
- Dev's `name` to prod's value (`"SNOMED CT"`)
- Removes SNOMED-only properties from prod that dev lacks (copyright, moduleId, normalForm, normalFormTerse, parent, child)
- Removes `abstract` from prod when dev doesn't have it

Eliminated 2170 records (from 2288 to 118 total deltas). Validated 15 randomly sampled eliminated records: 11 were fully resolved by this tolerance alone, 4 had additional display differences already handled by the pre-existing `snomed-same-version-display-differs` tolerance. All eliminations are legitimate.
