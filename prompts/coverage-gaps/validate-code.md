# Coverage Gap: $validate-code

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `validate-code` for output files.

## The gap

The `$validate-code` worker is the most-used terminology operation, yet 42% of its code
is uncovered:

| File | Coverage | Role |
|------|----------|------|
| `tx/workers/validate.js` | 58% | HTTP worker for $validate-code (CodeSystem + ValueSet) |

This file is ~2500 lines with two major classes: `ValueSetChecker` (the validation engine)
and `ValidateWorker` (the HTTP handler). The existing traffic exercises basic code+system
validation but likely misses many edge cases in display checking, codeableConcept handling,
version resolution, canonical status checking, and the complex `check()` method branches.

## Where to start

### 1. Read the ValidateWorker class (line ~1866)

This is the HTTP handler. Trace these entry points:

- **`handleCodeSystem()`** (line 1893) — type-level `/CodeSystem/$validate-code`
- **`handleCodeSystemInstance()`** (line 1979) — instance-level `/CodeSystem/{id}/$validate-code`
- **`handleValueSet()`** (line 2023) — type-level `/ValueSet/$validate-code`
- **`handleValueSetInstance()`** (line 2076) — instance-level `/ValueSet/{id}/$validate-code`

Key methods:
- **`extractCodedValue()`** (line 2229) — three extraction modes:
  1. `codeableConcept` parameter (highest priority) → mode 'codeableConcept'
  2. `coding` parameter → mode 'coding'
  3. `code` + `system` + `display` → mode 'code'
- **`resolveCodeSystem()`** (line 2124) — resolves from url param, coding.system, or additional resources
- **`resolveValueSet()`** (line 2190) — resolves from url param, resource param, or additional resources
- **`doValidationCS()`** (line ~2287) — CodeSystem validation orchestration
- **`doValidationVS()`** (line ~2336) — ValueSet validation orchestration

### 2. Read the ValueSetChecker class (line 42)

This is the validation engine. Key methods:

- **`checkCoding()`** (line 858) — validates a single coding against the ValueSet. Calls
  `check()` internally. Pay attention to the `inferSystem` parameter.
- **`checkCodeableConcept()`** (line 974) — validates a CodeableConcept. Important: any
  single coding match means success. It iterates all codings and combines results.
- **`check()`** (line 440) — the core validation method, ~400 lines with many branches:
  - System determination when system is missing (calls `determineSystem()`)
  - Version resolution (calls `determineVersion()`)
  - Unknown system handling
  - Supplement existence checking
  - Include/exclude concept set checking
  - Expansion-based checking as fallback
- **`checkConceptSet()`** (line 1488) — validates against a specific compose include/exclude entry
- **`checkExpansion()`** (line 1764) — fallback: expands the ValueSet and searches the expansion
- **`checkDisplays()`** (line 1342) — display text validation with different checking styles
- **`checkCanonicalStatus()`** (line 58) — adds informational issues about resource status
  (deprecated, withdrawn, retired, experimental, draft)
- **`determineSystem()`** (line 151) — infers system from ValueSet compose
- **`determineVersion()`** (line 204) — complex version negotiation between ValueSet, coding, and server
- **`prepare()`** (line 290) — prepares the checker, loads required supplements

### 3. Read the FHIR spec

Fetch these pages:
- `https://hl7.org/fhir/R4/codesystem-operation-validate-code.html` — CodeSystem $validate-code
- `https://hl7.org/fhir/R4/valueset-operation-validate-code.html` — ValueSet $validate-code
- `https://hl7.org/fhir/R4/terminology-service.html` — overall terminology service behavior

## Queries to explore

### CodeSystem $validate-code — basic

```
# Simple code + system
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=22298006

# With display validation (correct display)
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=22298006&display=Myocardial infarction

# With display validation (wrong display)
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=22298006&display=Wrong display

# With display validation (synonym, not preferred display)
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=22298006&display=Heart attack

# Non-existent code
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=99999999999

# Inactive code
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=62479008

# Abstract code (try HL7 code systems which have abstract concepts)
GET /r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode
```

### CodeSystem $validate-code — POST with coding

```
POST /r4/CodeSystem/$validate-code with Parameters body:
- coding: { system: "http://snomed.info/sct", code: "22298006" }

POST with coding including version:
- coding: { system: "http://snomed.info/sct", version: "...", code: "22298006" }
```

### CodeSystem $validate-code — POST with codeableConcept

This is a key untested path — codeableConcept has multiple codings.

```
POST /r4/CodeSystem/$validate-code with Parameters body:
- url: "http://snomed.info/sct"
- codeableConcept: { coding: [
    { system: "http://snomed.info/sct", code: "22298006" },
    { system: "http://loinc.org", code: "8480-6" }
  ] }
```

### CodeSystem $validate-code — instance-level

```
# Discover some CodeSystem IDs first
GET /r4/CodeSystem?_count=5&_elements=url,id

# Then use a discovered ID
GET /r4/CodeSystem/{id}/$validate-code?code=<valid-code>
```

### CodeSystem $validate-code — with version

```
GET /r4/CodeSystem/$validate-code?url=http://snomed.info/sct&version=http://snomed.info/sct/900000000000207008/version/20250201&code=22298006
```

### ValueSet $validate-code — basic

```
# Code in a well-known ValueSet
GET /r4/ValueSet/$validate-code?url=http://hl7.org/fhir/ValueSet/observation-codes&system=http://loinc.org&code=8480-6

# Code NOT in the ValueSet
GET /r4/ValueSet/$validate-code?url=http://hl7.org/fhir/ValueSet/observation-codes&system=http://snomed.info/sct&code=22298006

# With display validation
GET /r4/ValueSet/$validate-code?url=http://hl7.org/fhir/ValueSet/observation-codes&system=http://loinc.org&code=8480-6&display=Systolic blood pressure
```

### ValueSet $validate-code — system inference

When validating code-only against a ValueSet (no system), the checker must infer the system.

```
# Code without system — ValueSet has only one system
GET /r4/ValueSet/$validate-code?url=<single-system-valueset>&code=<code>

# Code without system — ValueSet has multiple systems
GET /r4/ValueSet/$validate-code?url=<multi-system-valueset>&code=<code>
```

### ValueSet $validate-code — codeableConcept

```
POST /r4/ValueSet/$validate-code with Parameters body:
- url: "http://hl7.org/fhir/ValueSet/observation-codes"
- codeableConcept: { coding: [
    { system: "http://loinc.org", code: "8480-6" },
    { system: "http://snomed.info/sct", code: "22298006" }
  ] }
```

### ValueSet $validate-code — instance-level

```
GET /r4/ValueSet?_count=5&_elements=url,id

GET /r4/ValueSet/{id}/$validate-code?system=http://loinc.org&code=8480-6
```

### ValueSet $validate-code — with inline ValueSet (tx-resource)

```
POST /r4/ValueSet/$validate-code with Parameters body containing:
- tx-resource: an inline ValueSet with specific compose
- system + code to validate

This exercises findInAdditionalResources()
```

### Edge cases — non-SNOMED systems

```
# LOINC
GET /r4/CodeSystem/$validate-code?url=http://loinc.org&code=8480-6
GET /r4/CodeSystem/$validate-code?url=http://loinc.org&code=8480-6&display=Systolic blood pressure

# HL7 v3
GET /r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=AMB
GET /r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-NullFlavor&code=UNK

# UCUM
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg/dL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=invalid-unit-xyz

# Unknown system entirely
GET /r4/CodeSystem/$validate-code?url=http://example.org/unknown&code=foo
```

### Edge cases — version conflicts

```
# Coding version differs from ValueSet version pinning
POST /r4/ValueSet/$validate-code with:
- url pointing to a VS that pins a specific SNOMED version
- coding with a different SNOMED version
```

### Edge cases — error handling

```
# No parameters at all
GET /r4/CodeSystem/$validate-code

# Code but no system and no url
GET /r4/CodeSystem/$validate-code?code=22298006

# Non-absolute system URL
GET /r4/CodeSystem/$validate-code?url=relative-url&code=test

# System that's actually a ValueSet URL
GET /r4/CodeSystem/$validate-code?url=http://hl7.org/fhir/ValueSet/observation-codes&code=test
```

### Canonical status checking

Look for CodeSystems or ValueSets with status=draft, experimental=true, retired, or
deprecated. These should trigger informational issues in the response.

## Strategy notes

- **codeableConcept mode is likely the biggest gap** — it has multi-coding logic where
  any match is success. Test with various combinations: first coding matches, second matches,
  none match, both match.
- **Display checking** has multiple styles (error vs warning vs ignore). Test with
  `displayWarning` parameter if available, and with various display mismatches (case,
  synonym, partial match).
- **System inference from ValueSet** (`determineSystem()`) is a complex path that's likely
  poorly tested. Try validating a bare code against ValueSets with different structures.
- **Version negotiation** between ValueSet pinning and coding version is ~80 lines of
  complex logic — worth exercising with version mismatches.
- **Instance-level requests** (`/CodeSystem/{id}/$validate-code`, `/ValueSet/{id}/$validate-code`)
  probably have near-zero traffic.
