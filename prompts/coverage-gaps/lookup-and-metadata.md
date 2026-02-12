# Coverage Gap: $lookup and Terminology Capabilities / Metadata

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `lookup-and-metadata` for output files.

## The gap

The $lookup worker and metadata/capabilities generation have significant uncovered code:

| File | Coverage | Role |
|------|----------|------|
| `tx/workers/lookup.js` | 63% | HTTP worker for CodeSystem $lookup |
| `tx/workers/metadata.js` | 62% | CapabilityStatement + TerminologyCapabilities generation |

$lookup is a commonly-used operation that returns display, designations, definitions, and
properties for a code. Metadata generation produces the server's CapabilityStatement and
TerminologyCapabilities resources. Both have important untested paths.

## Where to start

### 1. Read the LookupWorker class

Open `tx/workers/lookup.js`. Trace:

- **`handle()`** (line 43) — type-level `/CodeSystem/$lookup`
- **`handleInstance()`** (line 69) — instance-level `/CodeSystem/{id}/$lookup`
- **`handleTypeLevelLookup()`** (line 92) — parameter extraction, two input modes:
  1. `coding` parameter (with system + code)
  2. `system` + `code` + optional `version`
  - Also handles `tx-resource` for inline CodeSystem resources
- **`handleInstanceLevelLookup()`** (line 168) — resolves by resource ID, then code
- **`doLookup()`** (line 234) — the core lookup logic:
  - `hasProp()` helper — checks if a property should be included based on `property` param
  - Always returns: name, code, system, version, display
  - Conditional: definition, abstract, inactive
  - Designation handling — iterates `csProvider.designations()`, builds language/use/value parts
  - **`extendLookup()`** — provider-specific additional properties (this is where SNOMED
    adds parent/child, normalForm, etc.)

### 2. Read the MetadataHandler class

Open `tx/workers/metadata.js`. Trace:

- **`handle()`** (line 32) — dispatches to `/metadata`, `/$versions`, or `/TerminologyCapabilities`
- **`handleVersions()`** (line 54) — returns supported FHIR versions
- **`buildCapabilityStatement()`** (line 109) — generates the server's CapabilityStatement:
  - Server metadata (name, status, kind, software, implementation)
  - REST resources (CodeSystem, ValueSet, ConceptMap, NamingSystem)
  - Operations ($expand, $validate-code, $lookup, $subsumes, $translate, $closure, $versions)
  - Search parameters
- **`buildTerminologyCapabilities()`** (line 280) — generates TerminologyCapabilities:
  - `buildCodeSystemEntries()` — lists all loaded code systems with versions
  - `buildExpansionCapabilities()` — expansion parameters (offset, count, filter, etc.)
  - `buildValidateCodeCapabilities()` — validate-code capabilities
  - `buildTranslationCapabilities()` — translation support
- **`addCodeSystemEntry()`** (line 360) — deduplication logic for code system URLs
- **`mapFhirVersion()`** (line 455) — FHIR version string mapping

### 3. Read the FHIR spec

Fetch these:
- `https://hl7.org/fhir/R4/codesystem-operation-lookup.html` — $lookup parameters
- `https://hl7.org/fhir/R4/capabilitystatement.html` — CapabilityStatement structure
- `https://hl7.org/fhir/R4/terminologycapabilities.html` — TerminologyCapabilities structure

## Queries to explore

### $lookup — basic usage

```
# Simple SNOMED lookup
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006

# LOINC lookup
GET /r4/CodeSystem/$lookup?system=http://loinc.org&code=8480-6

# HL7 v3 code system
GET /r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=AMB

# UCUM lookup
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=mg

# RxNorm lookup (if loaded)
GET /r4/CodeSystem/$lookup?system=http://www.nlm.nih.gov/research/umls/rxnorm&code=161
```

### $lookup — with specific properties

The `property` parameter controls which properties are included. Without it, defaults apply.

```
# Request only specific properties
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=designation

# Request multiple specific properties
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=inactive&property=sufficientlyDefined

# Request parent property (SNOMED hierarchy)
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=parent

# Request child property
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=child

# Request all properties with wildcard
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=*

# Request definition property
GET /r4/CodeSystem/$lookup?system=http://loinc.org&code=8480-6&property=definition
```

### $lookup — POST with coding

```
POST /r4/CodeSystem/$lookup with Parameters body:
- coding: { system: "http://snomed.info/sct", code: "22298006" }

POST with coding + version:
- coding: { system: "http://snomed.info/sct", version: "...", code: "22298006" }
```

### $lookup — with displayLanguage

```
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&displayLanguage=en
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&displayLanguage=es
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&displayLanguage=fr
```

### $lookup — with version

```
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&version=http://snomed.info/sct/900000000000207008/version/20250201&code=22298006
```

### $lookup — instance-level

```
# Discover CodeSystem IDs
GET /r4/CodeSystem?_count=5&_elements=url,id

# Instance-level lookup
GET /r4/CodeSystem/{id}/$lookup?code=<valid-code>

# Instance-level with coding POST
POST /r4/CodeSystem/{id}/$lookup with Parameters body:
- coding: { code: "<valid-code>" }
```

### $lookup — error cases

```
# Missing code
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct

# Invalid code
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=99999999999

# Unknown system
GET /r4/CodeSystem/$lookup?system=http://example.org/unknown&code=foo

# Instance-level with non-existent ID
GET /r4/CodeSystem/nonexistent-id/$lookup?code=test

# Missing system and coding
GET /r4/CodeSystem/$lookup?code=22298006
```

### $lookup — inactive/abstract codes

```
# Inactive SNOMED code
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=62479008

# Abstract concept (HL7 v3)
GET /r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode
```

### $lookup — with tx-resource

```
POST /r4/CodeSystem/$lookup with Parameters body containing:
- tx-resource: an inline CodeSystem
- code: a code from that inline CodeSystem
```

### Metadata endpoints

```
# CapabilityStatement
GET /r4/metadata

# TerminologyCapabilities
GET /r4/metadata?mode=terminology

# $versions operation
GET /r4/$versions
```

### TerminologyCapabilities deep checks

After fetching the TerminologyCapabilities, inspect its structure:
- Does it list all loaded code systems?
- Are versions correct?
- Does it accurately describe supported operations?
- Compare between prod and dev — are the code system lists identical?

```
GET /r4/metadata?mode=terminology
```

## Important codes for testing

- **SNOMED CT**: `http://snomed.info/sct` — 22298006 (MI), 404684003 (Clinical finding),
  71620000 (Fracture of femur), 73211009 (Diabetes), 62479008 (inactive: Benign hypertensive
  renal disease)
- **LOINC**: `http://loinc.org` — 8480-6 (Systolic BP), 85354-9 (BP panel), 29463-7 (Body weight)
- **HL7 v3**: `http://terminology.hl7.org/CodeSystem/v3-ActCode` — AMB, IMP, EMER
- **UCUM**: `http://unitsofmeasure.org` — mg, kg, mmol/L, mm[Hg]
- **ICD-10**: `http://hl7.org/fhir/sid/icd-10-cm` — I21.0, E11.9

## Strategy notes

- **The `property` parameter is the key to $lookup coverage** — without it, only default
  properties are returned. With specific property names, different provider methods get
  called (`extendLookup` in particular). Test with `parent`, `child`, `designation`,
  `definition`, `inactive`, `sufficientlyDefined`, `normalForm`, and `*`.
- **Instance-level $lookup** goes through a different code path (looks up CodeSystem by ID,
  creates a `FhirCodeSystemProvider` wrapper) — this is likely untested.
- **Metadata generation** only runs on server startup or `/metadata` requests. The
  `buildTerminologyCapabilities()` method iterates all providers — its coverage depends on
  what systems are loaded. Compare the output between prod and dev carefully.
- **displayLanguage parameter** exercises language-aware designation filtering that most
  traffic doesn't trigger.
- **The `tx-resource` parameter** for inline CodeSystems exercises `setupAdditionalResources`
  and `findInAdditionalResources` which are tested elsewhere but may have lookup-specific
  behavior.
