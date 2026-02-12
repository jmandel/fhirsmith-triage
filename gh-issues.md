# FHIRsmith Upstream Bug Reports

**Server**: FHIRsmith (tx-dev.fhir.org)
**Verified**: 2026-02-09 — all repros confirmed against live servers
**30 bugs** verified as reproducing and non-duplicate (Bug 48 excluded: did not reproduce)

---

## Issue 1: `$validate-code` crashes with 500 when no code/coding/codeableConcept provided

**Labels**: `bug`, `severity: critical`, `crash`, `input-validation`
**Affects**: CodeSystem/$validate-code on /r4, /r5

### Description

Calling `CodeSystem/$validate-code` with a `url` but without any of the required `code`, `coding`, or `codeableConcept` parameters causes a server crash (HTTP 500) with `Cannot read properties of null (reading 'coding')`.

The server should return HTTP 400 with an OperationOutcome explaining the missing required parameter.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct' \
  -H 'Accept: application/fhir+json'
```

**Expected**: HTTP 400 with OperationOutcome: "Must provide one of: code, coding, or codeableConcept"
**Actual**: HTTP 500 with `"code":"exception"` — `Cannot read properties of null (reading 'coding')`

### FHIR spec reference

R4 CodeSystem/$validate-code requires at least one of `code`, `coding`, or `codeableConcept` (all marked 0..1 but at least one is needed). Missing required input should produce a 400, not a server crash.

---

## Issue 2: `$validate-code` crashes on text-only CodeableConcept (no `.coding` array)

**Labels**: `bug`, `severity: critical`, `crash`, `input-validation`
**Affects**: ValueSet/$validate-code on /r4, /r5

### Description

Submitting a CodeableConcept that has `.text` but no `.coding` array causes a 500 crash with `Invalid arguments to renderCoded`. Text-only CodeableConcepts are valid FHIR and common in clinical data.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {"name": "url", "valueUri": "http://hl7.org/fhir/ValueSet/administrative-gender"},
      {"name": "codeableConcept", "valueCodeableConcept": {"text": "Male gender"}}
    ]
  }'
```

**Expected**: HTTP 200 with `result=false` and message explaining no codings to validate
**Actual**: HTTP 500 — `Invalid arguments to renderCoded`

---

## Issue 3: POST with empty body crashes server with 500

**Labels**: `bug`, `severity: critical`, `crash`, `input-validation`
**Affects**: All POST-capable operations on /r4, /r5

### Description

An empty POST body causes `Cannot read properties of null (reading 'coding')`. The server doesn't validate that a request body is present before attempting to parse parameters.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json'
```

**Expected**: HTTP 400 — "Request body is required for POST operations"
**Actual**: HTTP 500 — NPE on null.coding

---

## Issue 4: POST with non-Parameters resourceType crashes server

**Labels**: `bug`, `severity: critical`, `crash`, `input-validation`
**Affects**: All POST-capable operations on /r4, /r5

### Description

Posting a valid FHIR resource that isn't a Parameters resource (e.g. Patient) causes a 500 crash. The server doesn't check `resourceType` before extracting operation parameters.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{"resourceType": "Patient", "id": "1"}'
```

**Expected**: HTTP 400 — "Expected Parameters resource, got Patient"
**Actual**: HTTP 500 — NPE on null.coding

---

## Issue 5: POST with wrong Content-Type crashes server

**Labels**: `bug`, `severity: critical`, `crash`, `input-validation`
**Affects**: All POST-capable operations on /r4, /r5

### Description

Posting with `Content-Type: text/plain` (or other non-FHIR content types) causes a 500 crash. The server attempts JSON parsing regardless of Content-Type.

Related to (but distinct from) previously-closed bug about `POST _search` with form-encoded body — that was a different code path (missing form parser for `_search`). This affects operation endpoints with arbitrary content types.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: text/plain' \
  -H 'Accept: application/fhir+json' \
  -d 'hello world'
```

**Expected**: HTTP 415 (Unsupported Media Type) or HTTP 400 with OperationOutcome
**Actual**: HTTP 500 — server crash

---

## Issue 6: `/r4` `$translate` rejects R4-defined parameter names (`code`, `system`)

**Labels**: `bug`, `severity: high`, `conformance`, `$translate`
**Affects**: ConceptMap/$translate on /r4

### Description

The R4 `$translate` operation defines parameters named `code` and `system`, but the /r4 endpoint rejects them. Only R5/R6 parameter names (`sourceCode`, `sourceSystem`) are accepted. This means any R4-compliant client will get a 400 error.

### Reproduction

```bash
# R4 parameter names — REJECTED on /r4
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?code=male&system=http://hl7.org/fhir/administrative-gender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"

# R5 names on /r4 — works (but shouldn't be required)
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 200
```

### FHIR spec reference

R4 section 6.14.18 defines `$translate` with parameters `code` (IN, code), `system` (IN, uri), `source` (IN, uri), `target` (IN, uri). The /r4 endpoint must accept these names.

---

## Issue 7: `/r5` `$translate` rejects R5-defined `system` parameter

**Labels**: `bug`, `severity: high`, `conformance`, `$translate`
**Affects**: ConceptMap/$translate on /r5

### Description

On the /r5 endpoint, the R5-defined parameter name `system` is rejected. Only `sourceSystem` (the R6 name) is accepted.

### Reproduction

```bash
# R5 uses "system" alongside "sourceCode" — REJECTED
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?sourceCode=male&system=http://hl7.org/fhir/administrative-gender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "sourceSystem parameter is required when using sourceCode"

# Only "sourceSystem" (R6 name) works
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 200
```

### FHIR spec reference

R5 section 6.15.22 defines `system` (IN, uri) for `$translate`. R6 renamed this to `sourceSystem`. The /r5 endpoint should accept the R5 name.

---

## Issue 8: R5 `$translate` reverse translation (`targetCode`/`targetCoding`) unimplemented

**Labels**: `bug`, `severity: high`, `conformance`, `$translate`
**Affects**: ConceptMap/$translate on /r5

### Description

R5 added reverse translation parameters (`targetCode`, `targetSystem`, `targetCoding`, `targetCodeableConcept`) to look up source concepts that map to a given target. The server rejects all of these, demanding source-direction parameters instead.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?targetCode=M&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"
```

**Expected**: Either a successful reverse translation result, or HTTP 501 with OperationOutcome stating that reverse translation is not supported.

### FHIR spec reference

R5 section 6.15.22: the server SHALL accept one of `sourceCode`+`sourceSystem`, `sourceCoding`, `sourceCodeableConcept`, `targetCode`+`targetSystem`, `targetCoding`, or `targetCodeableConcept`.

---

## Issue 9: `_format` query parameter completely ignored (Accept header always wins)

**Labels**: `bug`, `severity: high`, `conformance`, `content-negotiation`
**Affects**: All operations on /r4, /r5

### Description

The FHIR `_format` query parameter has no effect on response format. The `Accept` header always determines the response content type, regardless of `_format`. Per the FHIR spec, `_format` SHALL override the Accept header.

### Reproduction

```bash
# _format=xml with Accept: JSON — returns JSON (_format ignored)
curl -s -o /dev/null -w '%{content_type}' \
  'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://hl7.org/fhir/administrative-gender&code=male&_format=xml' \
  -H 'Accept: application/fhir+json'
# Returns: application/json; charset=utf-8  (should be XML)

# _format=json with Accept: XML — returns XML (_format ignored again)
curl -s -o /dev/null -w '%{content_type}' \
  'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://hl7.org/fhir/administrative-gender&code=male&_format=json' \
  -H 'Accept: application/fhir+xml'
# Returns: application/fhir+xml; charset=utf-8  (should be JSON)
```

### FHIR spec reference

R4 section 2.21.0.6.1: "The `_format` parameter overrides the accept type specified in the HTTP Headers." This is a SHALL. The `_format` parameter is the primary format negotiation mechanism in contexts where Accept headers can't be set (e.g., browser URL bar).

---

## Issue 10: `$subsumes` returns `not-subsumed` for identical codes (reflexivity broken) on LOINC, UCUM, BCP-47, ISO-3166

**Labels**: `bug`, `severity: high`, `conformance`, `$subsumes`
**Affects**: CodeSystem/$subsumes on /r4, /r5

### Description

When the same code is provided as both `codeA` and `codeB`, the server should always return `equivalent` (reflexivity). For four code systems, it incorrectly returns `not-subsumed`. SNOMED CT works correctly.

| Code System | codeA=codeB | Expected | Actual |
|---|---|---|---|
| LOINC | 1963-8 | equivalent | **not-subsumed** |
| UCUM | kg | equivalent | **not-subsumed** |
| BCP-47 | en | equivalent | **not-subsumed** |
| ISO-3166 | US | equivalent | **not-subsumed** |
| SNOMED CT | 22298006 | equivalent | equivalent (correct) |

Root cause is likely that the subsumption logic doesn't check code equality before attempting hierarchy traversal, and for systems without hierarchy support it falls through to `not-subsumed`.

### Reproduction

```bash
# LOINC — returns not-subsumed (WRONG)
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://loinc.org&codeA=1963-8&codeB=1963-8' \
  -H 'Accept: application/fhir+json'

# UCUM — returns not-subsumed (WRONG)
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://unitsofmeasure.org&codeA=kg&codeB=kg' \
  -H 'Accept: application/fhir+json'

# SNOMED — returns equivalent (CORRECT, for comparison)
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=22298006&codeB=22298006' \
  -H 'Accept: application/fhir+json'
```

### FHIR spec reference

Subsumption is reflexive by definition — every concept subsumes itself. The outcome `equivalent` means "A subsumes B and B subsumes A", which must always be true when A=B. The fix is simple: check `codeA === codeB` before hierarchy lookup.

---

## Issue 11: Response `Content-Type` is `application/json` instead of `application/fhir+json`

**Labels**: `bug`, `severity: high`, `conformance`, `content-negotiation`
**Affects**: All operations returning JSON on /r4, /r5 (dev only — prod uses correct type)

### Description

JSON responses use `Content-Type: application/json` instead of the FHIR-specified `application/fhir+json`. XML responses correctly use `application/fhir+xml`.

### Reproduction

```bash
# JSON — wrong Content-Type
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/fhir+json' 2>&1 | grep -i content-type
# Returns: application/json; charset=utf-8
# Expected: application/fhir+json; charset=utf-8

# XML — correct Content-Type (for comparison)
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/fhir+xml' 2>&1 | grep -i content-type
# Returns: application/fhir+xml; charset=utf-8 (correct)
```

### FHIR spec reference

R4 section 2.21.0.6: "The formal MIME-type for FHIR resources is `application/fhir+json`." Servers SHALL use this Content-Type for JSON responses.

---

## Issue 12: `$expand` with `count=0` returns all codes instead of empty expansion

**Labels**: `bug`, `severity: high`, `wrong-result`, `$expand`
**Affects**: ValueSet/$expand on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

`count=0` should return an empty `contains` array with just the `total` (used to discover expansion size without transferring codes). Instead, the server returns all codes. It appears `count=0` is treated as "no limit" due to a falsy-zero check (likely `parseInt("0") || defaultLimit`).

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&count=0' \
  -H 'Accept: application/fhir+json' | jq '{total: .expansion.total, returned: (.expansion.contains | length)}'
# Returns: {"total": 4, "returned": 4}
# Expected: {"total": 4, "returned": 0}
```

Reproduces on both tx-dev.fhir.org and tx.fhir.org.

### FHIR spec reference

R4 section 7.8.2: "Paging: if count = 0, the client is asking how large the expansion is." The server should return `expansion.total` but `expansion.contains` should be empty.

---

## Issue 13: `$expand` `exclude-system` parameter completely non-functional

**Labels**: `bug`, `severity: high`, `wrong-result`, `$expand`
**Affects**: ValueSet/$expand on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

The `exclude-system` parameter is accepted without error but has zero effect. Codes from the excluded system remain in the expansion.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/jurisdiction&exclude-system=urn:iso:std:iso:3166&count=5' \
  -H 'Accept: application/fhir+json' | jq '[.expansion.contains[].system] | unique'
# Returns: ["urn:iso:std:iso:3166"]
# Expected: Only urn:iso:std:iso:3166:-2 codes (the other system in this VS)
```

Reproduces on both tx-dev.fhir.org and tx.fhir.org.

### FHIR spec reference

R4 section 7.8.2: `exclude-system` (0..*, canonical) — "Code system, or a particular version of a code system to be excluded from the value set expansion."

---

## Issue 14: `$validate-code` `abstract=false` parameter ignored (dev only)

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$validate-code`, `dev-regression`
**Affects**: CodeSystem/$validate-code, ValueSet/$validate-code on /r4, /r5 (dev only — prod is correct)

### Description

When `abstract=false` is specified, abstract codes should be rejected. Instead, the parameter is ignored and abstract codes return `result=true`. Prod correctly returns `result=false`.

### Reproduction

```bash
# _ActAccountCode is abstract (notSelectable=true) in v3-ActCode
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode&abstract=false' \
  -H 'Accept: application/fhir+json' | jq '[.parameter[] | {(.name): (.valueBoolean // .valueString)}] | add'
# Returns: {"result": true, ...}
# Expected: {"result": false, ...}
```

### FHIR spec reference

R5 section 6.4.22: `abstract` (IN, 0..1, boolean) — "If abstract=false, abstract codes are excluded from the check."

---

## Issue 15: `$expand` `expansion.total` incorrect when compose uses excludes (off-by-one, dev only)

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$expand`, `dev-regression`
**Affects**: ValueSet/$expand on /r4, /r5 (dev only)

### Description

When a ValueSet compose includes codes via `is-a` filter and excludes specific codes, `expansion.total` reflects the pre-exclude count rather than the post-exclude count. The `contains` array is correctly filtered.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
  -H 'Content-Type: application/fhir+json' -H 'Accept: application/fhir+json' \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {"name": "count", "valueInteger": 200},
      {"name": "valueSet", "resource": {
        "resourceType": "ValueSet", "status": "active",
        "compose": {
          "include": [{"system": "http://snomed.info/sct",
            "filter": [{"property": "concept", "op": "is-a", "value": "73211009"}]}],
          "exclude": [{"system": "http://snomed.info/sct",
            "concept": [{"code": "73211009"}]}]
        }
      }}
    ]
  }' | jq '{total: .expansion.total, actual: (.expansion.contains | length)}'
# Returns: {"total": 124, "actual": 123}
# Expected: {"total": 123, "actual": 123}
```

---

## Issue 16: `$expand` `expansion.total` wrong for multi-system ValueSet (dev only)

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$expand`, `dev-regression`
**Affects**: ValueSet/$expand on /r4, /r5 (dev only — prod reports correct total)

### Description

The `jurisdiction` ValueSet (two code systems) reports `total=789` but actually contains 1000+ concepts. The server appears to count only one of the included systems when computing total.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/jurisdiction&count=1000' \
  -H 'Accept: application/fhir+json' | jq '{total: .expansion.total, returned: (.expansion.contains | length)}'
# Returns: {"total": 789, "returned": 1000}
# Expected: total >= returned
```

---

## Issue 17: `$expand` include+exclude same code produces `total=1` with 0 entries

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$expand`
**Affects**: ValueSet/$expand on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

Including a code and then excluding the same code produces an empty expansion (correct) but `total=1` (wrong — should be 0).

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
  -H 'Content-Type: application/fhir+json' -H 'Accept: application/fhir+json' \
  -d '{
    "resourceType": "Parameters",
    "parameter": [{"name": "valueSet", "resource": {
      "resourceType": "ValueSet", "status": "active",
      "compose": {
        "include": [{"system": "http://hl7.org/fhir/administrative-gender",
          "concept": [{"code": "male"}]}],
        "exclude": [{"system": "http://hl7.org/fhir/administrative-gender",
          "concept": [{"code": "male"}]}]
      }
    }}]
  }' | jq '{total: .expansion.total, returned: (.expansion.contains | length)}'
# Returns: {"total": 1, "returned": 0}
# Expected: {"total": 0, "returned": 0}
```

Reproduces on both tx-dev.fhir.org and tx.fhir.org.

---

## Issue 18: `$expand` with nonexistent `valueSetVersion` silently succeeds (dev only)

**Labels**: `bug`, `severity: medium`, `silent-failure`, `$expand`, `dev-regression`
**Affects**: ValueSet/$expand on /r4, /r5 (dev only — prod correctly returns 422)

### Description

When `valueSetVersion=99.99` is provided for a ValueSet that has no such version, the server silently ignores the version and expands the current version instead of returning an error.

### Reproduction

```bash
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&valueSetVersion=99.99' \
  -H 'Accept: application/fhir+json'
# Returns: 200 (with full expansion of current version)
# Expected: 404 or 422 — version 99.99 does not exist

# Prod correctly rejects:
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&valueSetVersion=99.99' \
  -H 'Accept: application/fhir+json'
# Returns: 422
```

---

## Issue 19: `$expand` with nonexistent version in URL pipe notation silently succeeds (dev only)

**Labels**: `bug`, `severity: medium`, `silent-failure`, `$expand`, `dev-regression`
**Affects**: ValueSet/$expand on /r4, /r5 (dev only — prod correctly returns 422)

### Description

Same as Issue 18 but using canonical URL pipe notation (`url|version`). The bogus version is silently ignored.

### Reproduction

```bash
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender%7C99.0&count=2' \
  -H 'Accept: application/fhir+json'
# Returns: 200 (should be 404/422)
```

---

## Issue 20: `$validate-code` returns wrong `display` for multi-coding CodeableConcept

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$validate-code`
**Affects**: CodeSystem/$validate-code on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

When validating a CodeableConcept with codings from multiple systems against a specific CodeSystem, the `display` output comes from the wrong coding. Validating against SNOMED where the CC contains both SNOMED and LOINC codings returns the LOINC display instead of the SNOMED display.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: application/fhir+json' -H 'Accept: application/fhir+json' \
  -d '{
    "resourceType": "Parameters",
    "parameter": [
      {"name": "url", "valueUri": "http://snomed.info/sct"},
      {"name": "codeableConcept", "valueCodeableConcept": {
        "coding": [
          {"system": "http://snomed.info/sct", "code": "122298005"},
          {"system": "http://loinc.org", "code": "8480-6"}
        ]
      }}
    ]
  }' | jq '[.parameter[] | {(.name): (.valueBoolean // .valueString)}] | add'
# Returns: display = "Systolic blood pressure" (LOINC display)
# Expected: display = SNOMED display for 122298005
```

Reproduces on both servers.

---

## Issue 21: `$lookup` `displayLanguage` parameter completely ignored

**Labels**: `bug`, `severity: medium`, `feature-gap`, `$lookup`
**Affects**: CodeSystem/$lookup on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

The `displayLanguage` parameter has no effect on `$lookup` responses. The display is always in English regardless of the requested language. Even a nonexistent language tag like `xx` produces no error.

This contrasts with `$validate-code`, where `displayLanguage` works correctly.

### Reproduction

```bash
# Request German display — returns English
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=8480-6&displayLanguage=de' \
  -H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name=="display") | .valueString'
# Returns: "Systolic blood pressure"
# Expected: "Systolischer Blutdruck" (or similar German translation)

# $validate-code DOES honor displayLanguage (for comparison):
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://loinc.org&code=8480-6&displayLanguage=de' \
  -H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name=="display") | .valueString'
# Returns: "Systolischer Blutdruck" (correct)
```

Reproduces on both servers.

### FHIR spec reference

R4 section 6.4.18: `displayLanguage` (IN, 0..1, code) for $lookup — "The requested language for display."

---

## Issue 22: `$lookup` LOINC `property` filter parameter ignored (returns all properties)

**Labels**: `bug`, `severity: medium`, `feature-gap`, `$lookup`
**Affects**: CodeSystem/$lookup on /r4, /r5 — **both tx-dev AND tx.fhir.org**

### Description

When requesting specific properties via the `property` parameter for LOINC codes, the filter is ignored and all 25+ properties are returned. SNOMED property filtering works correctly.

### Reproduction

```bash
# Request only COMPONENT — returns ALL 25+ properties
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=1963-8&property=COMPONENT' \
  -H 'Accept: application/fhir+json' | jq '[.parameter[] | select(.name=="property")] | length'
# Returns: 25 (should be 1)

# SNOMED filter works correctly:
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=inactive' \
  -H 'Accept: application/fhir+json' | jq '[.parameter[] | select(.name=="property")] | length'
# Returns: 1 (correct)
```

Reproduces on both servers.

### FHIR spec reference

R4 section 6.4.18: `property` (IN, 0..*, code) — the server should return only the requested properties.

---

## Issue 23: `$translate` returns duplicate matches (dev only)

**Labels**: `bug`, `severity: medium`, `wrong-result`, `$translate`, `dev-regression`
**Affects**: ConceptMap/$translate on /r4, /r5 (dev only — prod returns 1 match)

### Description

A single translation request returns 4 identical match entries instead of 1. Each match has the same concept and relationship.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json' | jq '[.parameter[] | select(.name=="match")] | length'
# Returns: 4
# Expected: 1
```

---

## Issue 24: `$closure` system-level endpoint returns HTML 404 instead of FHIR OperationOutcome

**Labels**: `bug`, `severity: medium`, `conformance`, `$closure`
**Affects**: System-level $closure on /r4, /r5

### Description

`POST /r4/$closure` returns an HTML page (`Cannot POST /r4/$closure`) instead of a FHIR OperationOutcome. All FHIR server error responses must be OperationOutcome resources.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/$closure' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[{"name":"name","valueString":"test-closure"}]}'
# Returns: HTML body with "<pre>Cannot POST /r4/$closure</pre>"
# Expected: FHIR OperationOutcome (either proper $closure response or "not-supported")
```

### FHIR spec reference

R4 section 2.21.0.1: All error responses SHALL be OperationOutcome resources.

---

## Issue 25: `$closure` on `ConceptMap/$closure` routes to `$translate` handler

**Labels**: `bug`, `severity: medium`, `wrong-dispatch`, `$closure`
**Affects**: ConceptMap/$closure on /r4, /r5

### Description

`POST /r4/ConceptMap/$closure` is dispatched to the `$translate` handler instead of a `$closure` handler. The error message references `$translate` parameters (`sourceCode`, `sourceCoding`, `sourceCodeableConcept`).

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/ConceptMap/$closure' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[{"name":"name","valueString":"test-closure"}]}' | jq '.issue[0].details.text'
# Returns: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"
# Expected: Either proper $closure handling or "Operation $closure is not supported"
```

---

## Issue 26: `$expand` paging hard-capped at offset 1000 (dev only)

**Labels**: `bug`, `severity: medium`, `limitation`, `$expand`, `dev-regression`
**Affects**: ValueSet/$expand on /r4, /r5 (dev only — prod allows deeper paging)

### Description

For large value sets, requesting `offset >= 1000` triggers a "too costly" error even with a small `count`. This prevents clients from paging through the full expansion. Offset 990 works fine; offset 1000 fails.

### Reproduction

```bash
# offset=990 works
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://loinc.org/vs&offset=990&count=10' \
  -H 'Accept: application/fhir+json'
# Returns: 200

# offset=1000 fails
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://loinc.org/vs&offset=1000&count=10' \
  -H 'Accept: application/fhir+json'
# Returns: 400 — "The value set expansion has too many codes to display (>1000)"
```

---

## Issue 27: `displayLanguage` value truncated in error messages

**Labels**: `bug`, `severity: low`, `cosmetic`
**Affects**: $validate-code on /r4, /r5

### Description

When an invalid `displayLanguage` is provided, the error message shows a truncated value. `displayLanguage=xx` is reported as `'x'` in the error. The parser appears to read only the first character of the language tag.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=80146002&displayLanguage=xx' \
  -H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name=="message") | .valueString'
# Error message refers to 'x' instead of 'xx'
```

---

## Issue 28: `useSupplement` parameter silently ignored (even for nonexistent supplement URLs)

**Labels**: `bug`, `severity: low`, `feature-gap`
**Affects**: $lookup, $expand on /r5

### Description

The `useSupplement` parameter is accepted but has no effect. Even a completely nonexistent supplement URL produces no error and no change in output.

### Reproduction

```bash
# $lookup with nonexistent supplement — no error
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r5/CodeSystem/$lookup?system=http://loinc.org&code=8480-6&useSupplement=http://example.org/nonexistent' \
  -H 'Accept: application/fhir+json'
# Returns: 200 (should error — supplement doesn't exist)

# $expand with nonexistent supplement — no error
curl -s -o /dev/null -w '%{http_code}' \
  'https://tx-dev.fhir.org/r5/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&useSupplement=http://example.org/fake' \
  -H 'Accept: application/fhir+json'
# Returns: 200 (should error)
```

### FHIR spec reference

R5: `useSupplement` (IN, 0..*, canonical) — "The supplement must be used when performing an expansion." Unknown supplements should produce an error.

---

## Issue 29: `application/xml` Accept header (without `fhir+`) not recognized, falls back to JSON

**Labels**: `bug`, `severity: low`, `conformance`, `content-negotiation`
**Affects**: All operations on /r4, /r5

### Description

`Accept: application/xml` falls back to JSON. Only `application/fhir+xml` triggers XML output. The generic MIME type should be accepted as an alias per the FHIR spec.

### Reproduction

```bash
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/xml' 2>&1 | grep -i content-type
# Returns: application/json; charset=utf-8
# Expected: XML response
```

### FHIR spec reference

R4 section 2.21.0.6: "FHIR resources can also be exchanged with `application/json` and `application/xml`."

---

## Issue 30: OperationOutcome error message placement inconsistent (`details.text` vs `diagnostics`)

**Labels**: `bug`, `severity: low`, `cosmetic`
**Affects**: All operations on /r4, /r5

### Description

Different error types place the error message in different fields, making programmatic error handling unreliable:
- Some errors use `issue[].details.text`
- Others use `issue[].diagnostics`

### Reproduction

```bash
# 400 — message in details.text
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?code=male' \
  -H 'Accept: application/fhir+json' | jq '{details_text: .issue[0].details.text, diagnostics: .issue[0].diagnostics}'
# Returns: {"details_text": "Must provide system and code, or a coding", "diagnostics": null}

# 422 — message in diagnostics
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://example.org/fake&code=x' \
  -H 'Accept: application/fhir+json' | jq '{details_text: .issue[0].details?.text, diagnostics: .issue[0].diagnostics}'
# Returns: {"details_text": null, "diagnostics": "Code System http://example.org/fake not found"}
```

---

## Cross-reference notes

For bugs that overlap with existing issues in the bug database:

| Issue | Original Bug # | Existing xref | Relationship |
|-------|---------------|---------------|-------------|
| 5 | Bug 9 | `9f41615` (closed) | Distinct — different trigger path (text/plain on operations vs form-encoded on _search) |
| 12 | Bug 17 | `e3866e4` (closed) | Near-duplicate root cause (falsy zero) but different operation ($expand vs search) |
| 15 | Bug 20 | `f2b2cef` (open) | Related — both expansion.total issues but different failure modes |
| 16 | Bug 21 | `2ed80bd` (open) | Related — 2ed80bd is missing total; this is wrong total |
| 18/19 | Bugs 23/24 | `2f5929e` (open) | Distinct — opposite problems (2f5929e errors when should succeed; these succeed when should error) |
| 20 | Bug 26 | `d70be11` (open) | Likely same root cause — d70be11 no longer reproducible; this provides fresh repro |
| 22 | Bug 30 | `5f3b796` (open) | Related — 5f3b796 is extra output; this is filter being ignored |
| 26 | Bug 49 | `44d1916` (open) | Related — both about too-costly limits but different triggers |
| 30 | Bug 46 | `8ef44d0` (open) | Related — 8ef44d0 is 500-specific; this is broader inconsistency |
