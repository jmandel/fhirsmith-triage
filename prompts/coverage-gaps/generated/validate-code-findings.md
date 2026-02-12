# $validate-code Coverage Gap Findings

## Overview

Investigated coverage gaps in `tx/workers/validate.js` (58% covered, ~2500 lines) by reading the source code, understanding uncovered branches, and testing 55 requests against both production (tx.fhir.org/r4, Java/Pascal) and dev (tx-dev.fhir.org/r4, JavaScript/FHIRsmith).

## Significant Findings

### 1. CRITICAL: abstract=false parameter ignored by dev (result disagrees)

**Code path**: `doValidationCS()` line 2294 reads `abstract` param, passes to `checkCodeableConcept()`, which passes to `check()`. In `check()` around line 532, the abstract check `!(abstractOk || !(await cs.IsAbstract(ctxt)))` should reject abstract codes when `abstractOk=false`.

**Request**: `GET /r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode&abstract=false`

- **Prod**: `result=false`, message: "Code is abstract, and not allowed in this context"
- **Dev**: `result=true`, no error

**Impact**: Dev ignores the `abstract=false` parameter entirely. This means abstract codes are always accepted, regardless of the client's request. This is a functional correctness bug.

### 2. CRITICAL: codeableConcept against CodeSystem with non-matching codings (result disagrees)

**Code path**: `checkCodeableConcept()` iterates codings at line 1027. When validating against a CodeSystem, prod appears to validate each coding against its own system (broad validation), while dev only validates codings matching the target CS.

**Request**: POST CS `$validate-code` with url=SNOMED but codeableConcept containing only LOINC codings.

- **Prod**: `result=true` (validates the LOINC codings against LOINC, returns LOINC system/code)
- **Dev**: `result=false` (no coding matches the SNOMED CS)

**Impact**: Major result disagreement. The question is whether CodeSystem `$validate-code` with a codeableConcept should validate any coding against any system, or only codings matching the specified CodeSystem. Prod behavior seems intentional -- it validates all codings broadly and reports the first valid one.

### 3. BUG: Inline codeSystem resource parameter crashes dev

**Code path**: `resolveCodeSystem()` line 2126 checks for `csResource` parameter. When found, it returns it directly. But then `doValidationCS()` calls `codeSystem.contentMode()` which expects a CodeSystem provider, not a raw resource.

**Request**: POST CS `$validate-code` with a `codeSystem` resource parameter (inline CodeSystem).

- **Prod**: Returns OperationOutcome (also fails, but gracefully)
- **Dev**: Crashes with "codeSystem.contentMode is not a function" (500 error)

**Impact**: Inline CodeSystem resource via the `codeSystem` parameter causes a server crash. The `resolveCodeSystem()` method returns the raw resource without wrapping it in a provider.

### 4. MISSING FEATURE: context parameter not supported on dev

**Code path**: The `resolveValueSet()` method (line 2190) only checks for `valueSet` resource and `url` parameters. It does not handle the `context` parameter (which resolves a ValueSet from a StructureDefinition element binding).

**Request**: `GET /r4/ValueSet/$validate-code?context=http://hl7.org/fhir/StructureDefinition/Observation%23code&system=http://loinc.org&code=8480-6`

- **Prod**: `result=true` (resolves the VS from the Observation.code binding)
- **Dev**: OperationOutcome error "No ValueSet specified"

**Impact**: The `context` parameter is specified in the FHIR spec for ValueSet `$validate-code`. Dev does not implement it.

### 5. Behavioral difference: code-only without system in CS validate-code

**Code path**: `extractCodedValue()` line 2247 extracts the code. In CS mode (line 2254), it looks for `url` first, then `system`. If neither is present, the coded value has no system. Prod rejects this at the parameter extraction level ("Unable to find code to validate"), while dev processes it through the validation pipeline and returns result=false with a warning.

**Request**: `GET /r4/CodeSystem/$validate-code?code=22298006`

- **Prod**: OperationOutcome error (400-level rejection)
- **Dev**: Parameters with result=false, message about no system

**Impact**: Different error handling approach. Prod is stricter (rejects upfront), dev is more permissive (processes and returns a structured failure).

### 6. Behavioral difference: system inference without explicit inferSystem

**Request**: `GET /r4/ValueSet/$validate-code?url=http://hl7.org/fhir/ValueSet/administrative-gender&code=male` (no system, no inferSystem parameter)

- **Prod**: OperationOutcome error ("Unable to find code to validate")
- **Dev**: Parameters with result=true, inferred system=http://hl7.org/fhir/administrative-gender

**Impact**: Dev automatically infers the system when code is provided without system against a single-system ValueSet. Prod requires either `system` or `inferSystem=true`. Looking at the code at line 2342: `const inferSystem = ... || (mode === 'code' && !coded.coding[0].system)` -- dev explicitly enables inferSystem when no system is given. This is actually a feature improvement in dev.

### 7. Multi-system VS system inference crashes dev

**Request**: `GET /r4/ValueSet/$validate-code?url=http://hl7.org/fhir/ValueSet/condition-code&code=22298006` (large multi-system VS)

- **Prod**: OperationOutcome error (rejects upfront)
- **Dev**: OperationOutcome exception: "expansion has too many codes to display (>10000)"

**Impact**: Dev attempts to expand the entire ValueSet to infer the system (via `determineSystemFromExpansion()` at line 105), which fails for large ValueSets. The expansion limit of 10000 at line 109 is insufficient for large VS like condition-code.

### 8. Instance-level CS validate-code behavioral difference

**Request**: `GET /r4/CodeSystem/contact-point-system/$validate-code?code=phone`

- **Prod**: OperationOutcome error ("Unable to find code to validate")
- **Dev**: Parameters with result=false ("Coding has no system")

**Impact**: For instance-level requests, the CodeSystem identity is implied by the URL path. Prod requires the system to be explicitly provided even in instance-level requests, while dev processes the request but warns about no system. Neither correctly uses the CodeSystem identity from the instance path to supply the system.

## Content Differences (Non-Critical)

### Display message verbosity

When a display mismatch occurs, prod lists only the single preferred display, while dev lists all available synonyms (12 for SNOMED MI). Both use the same message ID (`Display_Name_for__should_be_one_of__instead_of`) but prod uses the `_one` variant and dev uses the `_other` variant.

This occurs consistently in:
- GET CS display validation with wrong display
- POST coding with wrong display
- POST codeableConcept with wrong display
- VS validate-code with wrong display

**Root cause**: The `Designations` class likely has different display counting behavior. In the `checkCoding()` method (line 891), `list.hasDisplay()` and `list.displayCount()` drive which message variant is selected.

### Display ordering in LOINC

When listing LOINC displays for wrong display in VS codeableConcept validation, the order of display choices differs between prod and dev. Both show 9 choices but in different order.

### Expression path format

For some error responses, the `expression` field in OperationOutcome issues differs:
- Prod: `["system"]`
- Dev: `[".system"]` (with leading dot)

This occurs in the non-absolute URL test and the ValueSet-as-CodeSystem-URL test. The expression path creation in dev may have a bug in `addToPath()` or in how the issue path is constructed.

### Version differences for some code systems

- HL7 v2-0001: prod returns version=2.9, dev returns version=3.0.0
- NDC: prod returns version='', dev returns version='2021-11-01'
- SNOMED version lists differ slightly (dev missing some editions)

These are data loading differences, not code bugs.

### VS codeableConcept duplicate version parameter

For VS codeableConcept with multi-coding (LOINC + SNOMED), prod returns two `version` parameters (one for each code system version encountered), while dev returns only one. This happens because prod accumulates version from both coding iterations, while dev only keeps the last.

## Code Paths NOT Exercised

### 1. `findCode()` method (line 386)
This method is dead code -- it contains `throw new Error("Check this")` at line 399. It was likely used in Pascal for CodeSystem validation with nested concept lists but has been replaced by the `locate()` approach.

### 2. `DEV_IGNORE_VALUESET` branch (line 567)
The constant is set to `false` (line 27), so the entire `else if (DEV_IGNORE_VALUESET)` block (lines 567-642) is dead code. It appears to be a debugging/development toggle ported from Pascal.

### 3. `checkSystemCode()` method (line 1416)
This appears to be an alternative validation entry point that is not called from any HTTP handler. It may be used internally by other workers or may be dead code.

### 4. Version negotiation with ValueSet-pinned version conflicts
The `determineVersion()` method (line 204) has complex logic for handling version conflicts between ValueSet pinning and coding version. I was unable to construct a test case that exercises the version mismatch branches because the test servers don't have ValueSets that pin specific non-current SNOMED versions.

### 5. `checkExpansion()` method (line 1764)
This is used as a fallback when validation against compose fails. It would require a ValueSet that has an expansion but no compose, which is unusual in the server's loaded content.

### 6. `requiredSupplements` validation (line 331)
This checks for required supplements specified via `valueset-supplement` extensions. Testing would require a ValueSet with this specific extension, which is uncommon.

## Summary of Test Coverage

| Category | Tests | Matches | Differences |
|----------|-------|---------|-------------|
| CS basic GET | 18 | 15 | 3 (abstract, code-only, expression path) |
| CS POST coding | 3 | 2 | 1 (version list) |
| CS POST codeableConcept | 7 | 2 | 5 (multi-coding, display, inline CS) |
| VS basic GET | 12 | 6 | 6 (inference, context, no params, multi-system, version) |
| VS POST coding | 1 | 1 | 0 |
| VS POST codeableConcept | 4 | 2 | 2 (multi-coding version, display order) |
| VS POST inline resources | 3 | 2 | 1 (context) |
| Instance-level | 2 | 1 | 1 (CS instance) |
| Display checking | 5 | 2 | 3 (message verbosity) |
| Other edge cases | 5 | 4 | 1 (NDC version) |
| **Total** | **60** | **37** | **23** |

Of the 23 differences:
- 3 are CRITICAL (result disagrees or crashes)
- 1 is a missing feature (context parameter)
- 5 are behavioral differences in error handling
- 14 are content differences (message text, ordering, version data)
