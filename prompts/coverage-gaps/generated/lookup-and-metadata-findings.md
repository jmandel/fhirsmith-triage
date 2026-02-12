# Lookup and Metadata Coverage Gap Findings

## Summary

Tested 56 requests against both prod (tx.fhir.org/r4) and dev (tx-dev.fhir.org/r4) targeting
the `$lookup` operation (`tx/workers/lookup.js`, 63% coverage) and metadata/capabilities
generation (`tx/workers/metadata.js`, 62% coverage). Found multiple substantive differences,
several suspected translation bugs, and one major missing feature in the dev SNOMED provider.

## Code Paths Targeted

### LookupWorker (tx/workers/lookup.js)

1. **`handleTypeLevelLookup()` (line 92)** -- two input modes:
   - `coding` parameter with system + code: TESTED via POST with Parameters body
   - `system` + `code` + optional `version` params: TESTED via GET query params
   - Error branches: missing code, missing system, unknown system, invalid code

2. **`handleInstanceLevelLookup()` (line 168)** -- by resource ID:
   - TESTED on dev (works), but prod rejects instance-level lookup entirely ("Lookup does not take an identified resource")
   - Error branches: non-existent ID, missing code param

3. **`doLookup()` (line 234)** -- core lookup logic:
   - `hasProp()` helper: TESTED with no props (defaults), specific props, wildcard `*`
   - Definition, abstract, inactive top-level params: TESTED
   - Designation iteration: TESTED via various code systems
   - `extendLookup()`: TESTED for SNOMED, LOINC, ICD-10, RxNorm, UCUM, HL7 v3, inline CS

4. **`setupAdditionalResources()`** -- tx-resource handling:
   - TESTED with inline CodeSystem (flat and hierarchical)

### MetadataHandler (tx/workers/metadata.js)

1. **`handle()` (line 32)** -- dispatches to metadata or terminology mode: TESTED
2. **`handleVersions()` (line 54)** -- TESTED with and without FHIR Accept header
3. **`buildCapabilityStatement()` (line 109)** -- TESTED, compared structure
4. **`buildTerminologyCapabilities()` (line 280)** -- TESTED, compared code system lists
5. **`buildCodeSystemEntries()` (line 320)** -- TESTED via TerminologyCapabilities
6. **`addCodeSystemEntry()` (line 360)** -- TESTED (dedup observed via multiple versions)
7. **`mapFhirVersion()` (line 455)** -- TESTED via CapabilityStatement fhirVersion field

---

## Findings

### Finding 1: SNOMED `name` parameter differs (BUG)

**Code path:** `doLookup()` line 263, `csProvider.name()`

- **PROD:** Returns `"SNOMED CT"` for the `name` parameter
- **DEV:** Returns `"http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201"`

The dev SNOMED provider's `name()` method returns the system URI + version concatenation instead
of the human-readable name. This affects all SNOMED lookups. The FHIR spec says the `name` output
should be "A display name for the code system."

**Severity:** Content difference -- wrong human-readable name for the code system.

### Finding 2: SNOMED missing extendLookup properties (BUG)

**Code path:** `doLookup()` line 362, `csProvider.extendLookup()`

The SNOMED provider (`cs-snomed.js`) does not override `extendLookup()` from the base
`CodeSystemProvider` class, which has an empty implementation. This means:

- **property=parent** -- PROD returns parent concepts; DEV returns nothing
- **property=child** -- PROD returns child concepts (14 for MI, 16 for Diabetes); DEV returns nothing
- **property=normalForm** -- PROD returns the SNOMED normal form expression; DEV returns nothing
- **property=sufficientlyDefined** -- PROD returns definitional status; DEV returns nothing
- **property=copyright** -- PROD returns copyright notice; DEV returns nothing

When specific properties are requested, `hasProp()` correctly suppresses defaults (definition,
abstract, inactive, designation) but `extendLookup` never adds the requested properties.

This is the most significant coverage gap found. PROD returns 8-39 parameters for SNOMED lookups
with property requests; DEV returns only the 5 base params (name, code, system, version, display).

**Severity:** Major functionality gap -- SNOMED hierarchy browsing and property introspection broken.

### Finding 3: HL7 v3 FhirCodeSystemProvider parent property missing (BUG)

**Code path:** `FhirCodeSystemProvider.extendLookup()` (cs-cs.js line 922-932)

- **PROD** returns `parent` property with code `_ActEncounterCode` for AMB
- **DEV** returns `subsumedBy` property (from CodeDB properties) instead of `parent`
- The `FhirCodeSystemProvider.extendLookup()` has a `parent()` method call path
  (line 924), but when the code goes through the CodeDB provider path, parent/child
  properties are not returned. Only `status`, `internalId`, and `subsumedBy` come from
  the DB properties.

**Severity:** Semantic difference -- `parent` vs `subsumedBy` property names differ.

### Finding 4: Dev includes abstract/inactive by default; PROD sometimes does not

**Code path:** `doLookup()` lines 305-323

- **DEV** always returns `abstract` (as top-level param) and `inactive` (as property) by default
- **PROD** returns `abstract` (as top-level param, usually last) and `inactive` (as property)
  but ordering differs, and for some code systems (like SNOMED defaults) PROD omits abstract
  in the middle of the parameter list while DEV includes it early

This is mainly an ordering/inclusion difference that could be cosmetic.

### Finding 5: UCUM display text formatting differs (BUG)

**Code path:** `doLookup()` line 288, `csProvider.display()`

UCUM display strings differ in parenthesization:
- `mg`: PROD="milligram", DEV="(milligram)"
- `mmol/L`: PROD="millimole per liter", DEV="(millimole) / (liter)"
- `mm[Hg]`: PROD="millimeter of mercury", DEV="(millimeter of mercury column)"
- `kg/m2`: PROD="kilogram / (meter ^ 2)", DEV="(kilogram) / (meter ^ 2)"

The DEV UCUM provider wraps unit name components in parentheses that PROD does not.

**Severity:** Content difference -- display text formatting inconsistency.

### Finding 6: SNOMED display text includes semantic tag on DEV (BUG)

**Code path:** `doLookup()` line 288, `csProvider.display()`

For high-level SNOMED concepts:
- **PROD:** `"Clinical finding"` for code 404684003
- **DEV:** `"Clinical finding (finding)"` for code 404684003

DEV appends the SNOMED semantic tag in parentheses to the display, which PROD does not.

**Severity:** Content difference -- display text format inconsistency.

### Finding 7: Definition handling differs between prod and dev (BUG)

**Code path:** `doLookup()` line 294-302

For inline CodeSystems via tx-resource:
- **PROD:** Returns definition as a `property` (with code="definition")
- **DEV:** Returns definition as a top-level `definition` parameter

For HL7 v3 codes:
- **PROD:** Does not return definitions for IMP, EMER, AMB
- **DEV:** Returns definitions for IMP, EMER, AMB

The spec says `definition` is an output parameter of $lookup (not a property), so DEV's
approach of returning it as a top-level parameter is arguably more correct, but the
inconsistency with PROD is still a behavioral difference.

### Finding 8: Instance-level $lookup not supported by PROD

**Code path:** `handleInstanceLevelLookup()` (line 168)

- **PROD:** Returns HTTP 422 with "Lookup does not take an identified resource"
- **DEV:** Supports instance-level lookup (HTTP 200 with correct results)

This means the `handleInstanceLevelLookup()` code path is entirely DEV-only functionality.
It cannot be compared against PROD. The FHIR spec does define instance-level $lookup, so
DEV implementing it is correct, but tests should note that PROD does not support it.

### Finding 9: HTTP status code differences for errors

Error handling produces different HTTP status codes:
- Invalid code (not found): PROD=400, DEV=404
- Unknown system: PROD=400, DEV=422
- Code without system: PROD=500, DEV=400

The OperationOutcome issue codes also differ:
- Invalid code: PROD `code: "invalid"`, DEV `code: "not-found"`
- Unknown system: PROD returns "Access violation", DEV returns proper not-found message

**Severity:** Status code and error message differences. DEV's error handling is more informative.

### Finding 10: $versions endpoint response format differs

**Code path:** `handleVersions()` (line 54-85)

With FHIR Accept header:
- **PROD:** Returns `valueString: "4.0.1"` for both version and default
- **DEV:** Returns `valueCode: "4.0"` for both version and default

The value type (`valueString` vs `valueCode`) and the version granularity (`4.0.1` vs `4.0`) differ.
The `getShortFhirVersion()` method truncates to major.minor, while PROD returns the full version.

**Severity:** Content difference in version reporting.

### Finding 11: TerminologyCapabilities structural differences

**Code path:** `buildTerminologyCapabilities()` (line 280)

- **Code system count:** PROD=1264, DEV=1271 (different loaded content)
- **SNOMED versions:** PROD lists 0 versions; DEV lists 13 versions
- **LOINC version:** PROD="2.77"; DEV="2.81"
- **validateCode:** PROD=empty `{}`; DEV=`{translations: true}`
- **translation:** PROD=empty `{}`; DEV=`{needsMap: false}`
- **closure:** Both empty

The PROD server's TerminologyCapabilities omits validateCode and translation capabilities
that DEV includes. PROD also omits SNOMED version information.

### Finding 12: CapabilityStatement structural differences

**Code path:** `buildCapabilityStatement()` (line 109)

- **Resources:** PROD lists CodeSystem, ValueSet; DEV adds ConceptMap
- **Operations:** PROD includes `batch-validate-code`; DEV does not
- **Software:** PROD="HealthIntersections Server 4.0.7"; DEV="FHIRsmith 0.4.2"
- **instantiates:** PROD duplicates the capability statement URL; DEV has it once
- **Implementation URL:** PROD uses `http://`, DEV uses `https://`

Most of these are expected differences between different server implementations.

### Finding 13: LOINC RELATEDNAMES2 property difference

**Code path:** `extendLookup()` in cs-loinc.js

When requesting property=* on LOINC:
- **PROD:** Does not include RELATEDNAMES2 properties
- **DEV:** Includes multiple RELATEDNAMES2 properties

DEV's LOINC extendLookup includes the `addRelatedNames` method results that PROD omits.

### Finding 14: RxNorm other.display property missing on DEV

With property=* on RxNorm:
- **PROD:** Returns `other.display` property
- **DEV:** Does not return `other.display` property

---

## Code Paths NOT Exercised

1. **Cache-id parameter in lookup** -- The `setupAdditionalResources()` method handles cache-id
   for persisting tx-resources across calls. This requires stateful multi-request sequences
   that are difficult to test with single curl commands.

2. **Supplement loading in instance-level lookup** -- `handleInstanceLevelLookup()` line 205
   calls `loadSupplements()`. Testing this requires a CodeSystem with supplements loaded on
   the server.

3. **Error handling in `handleInstance()` catch block** -- The instance-level error handler
   (line 69) always returns HTTP 400, unlike the type-level handler which uses
   `error.statusCode || 500`. This could be tested by triggering errors in instance-level.

4. **`addProperty()` helper** (line 377) -- This utility method is defined in `LookupWorker`
   but it is unclear if it is called by any extendLookup implementation.

5. **`buildExpansionCapabilities()`** -- returns a static structure; exercised via
   TerminologyCapabilities but there is no conditional logic to test.

6. **`buildValidateCodeCapabilities()`** and **`buildTranslationCapabilities()`** --
   static returns; exercised but trivial.

---

## Suspected Translation Bugs (ranked by severity)

1. **SNOMED extendLookup not implemented** -- Missing parent/child/normalForm/sufficientlyDefined
   properties. This is the most impactful gap.

2. **SNOMED name() returns URI instead of human-readable name** -- Easy fix, high visibility.

3. **UCUM display text parenthesization** -- Systematic formatting difference.

4. **SNOMED display includes semantic tag** -- "Clinical finding (finding)" vs "Clinical finding".

5. **$versions value type and granularity** -- valueCode "4.0" vs valueString "4.0.1".

6. **HTTP status codes for errors** -- 404 vs 400 vs 422 vs 500 disagreements.

7. **Definition as top-level param vs property** -- Structural placement difference.

8. **HL7 v3 parent vs subsumedBy property mapping** -- Name mismatch for hierarchical property.
