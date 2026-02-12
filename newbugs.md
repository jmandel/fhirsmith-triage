# New Bugs in FHIRsmith tx-dev.fhir.org — Triage Report

**Server**: FHIRsmith v0.4.2 at `https://tx-dev.fhir.org`  
**Tested**: R4 (`/r4`) and R5 (`/r5`) endpoints  
**Existing bug DB**: 97 bugs cross-referenced — these 31 are **not covered** by any existing filing  
**Reference server**: `https://tx.fhir.org` (prod) used for comparison where noted  

---

## Summary

| # | Bug | Severity | Category | Scope | Cross-ref |
|---|-----|----------|----------|-------|-----------|
| 3 | CS/$validate-code: missing code/coding/CC → 500 NPE | Critical | Server Crash | — | — |
| 6 | VS/$validate-code: text-only CodeableConcept crashes | Critical | Server Crash | — | — |
| 7 | POST with empty body → 500 NPE | Critical | Server Crash | — | — |
| 8 | POST with non-Parameters resourceType → 500 NPE | Critical | Server Crash | — | — |
| 9 | POST with wrong Content-Type → 500 | Critical | Server Crash | — | xref 9f41615 |
| 11 | /r4 $translate rejects R4 parameter names | High | Conformance | — | — |
| 12 | /r5 $translate rejects R5 `system` parameter name | High | Conformance | — | — |
| 13 | R5 $translate: reverse translation unimplemented | High | Conformance | — | — |
| 14 | `_format` parameter completely ignored | High | Conformance | — | — |
| 15 | $subsumes reflexivity broken for LOINC, UCUM, BCP-47, ISO-3166 | High | Conformance | — | — |
| 17 | $expand `count=0` returns all codes instead of empty expansion | High | Wrong Result | Dev+Prod | — |
| 18 | $expand `exclude-system` completely non-functional | High | Wrong Result | Dev+Prod | — |
| 19 | $validate-code `abstract=false` parameter ignored | Medium | Wrong Result | Dev-only | — |
| 20 | $expand `expansion.total` wrong for SNOMED excludes | Medium | Wrong Result | Dev-only | xref f2b2cef |
| 21 | $expand `expansion.total` wrong for multi-system ValueSet | Medium | Wrong Result | Dev-only | xref 2ed80bd |
| 22 | $expand include+exclude same code gives wrong total | Medium | Wrong Result | Dev+Prod | — |
| 23 | $expand `valueSetVersion` with wrong version silently succeeds | Medium | Silent Failure | Dev-only | xref 2f5929e |
| 24 | $expand URL pipe with wrong version silently succeeds | Medium | Silent Failure | Dev-only | xref 2f5929e |
| 26 | CS/$validate-code: CC display contamination across systems | Medium | Wrong Result | Dev+Prod | xref d70be11 |
| 29 | $lookup `displayLanguage` completely ignored | Medium | Feature Gap | Dev+Prod | — |
| 30 | $lookup LOINC `property` filter ignored | Medium | Feature Gap | Dev+Prod | xref 5f3b796 |
| 33 | $translate returns duplicate matches | Medium | Wrong Result | Dev-only | — |
| 34 | `displayLanguage` value truncated in error message | Low | Cosmetic | — | — |
| 35 | `useSupplement` parameter silently ignored | Low | Feature Gap | — | — |
| 37 | `$closure` returns HTML 404 instead of FHIR OperationOutcome | Medium | Conformance | — | — |
| 38 | Response Content-Type uses `application/json` instead of `application/ | High | Conformance | Dev-only | — |
| 40 | `application/xml` (without `fhir+`) not recognized as XML | Low | Conformance | Dev-only | — |
| 46 | Error OperationOutcome field usage inconsistent | Low | Cosmetic | — | xref 8ef44d0 |
| 48 | $expand `property` parameter (R5) accepted but non-functional | Low | Feature Gap | — | — |
| 49 | $expand paging cannot go past offset 1000 | Medium | Limitation | — | xref 44d1916 |
| 50 | `$closure` endpoint routes to `$translate` handler | Medium | Wrong Dispatch | — | — |

**Total: 31 new bugs** — 5 critical crashes, 7 high conformance violations, 12 medium wrong-result/feature-gap, 7 low cosmetic/edge-case

### Bugs affecting BOTH prod and dev (upstream issues)

These exist on tx.fhir.org too — not dev regressions:

- **Bug 17**: count=0 returns all codes (both servers)
- **Bug 18**: exclude-system non-functional (both servers)
- **Bug 22**: include+exclude same code → wrong total (both servers)
- **Bug 26**: CC display contamination across systems (both servers)
- **Bug 29**: $lookup displayLanguage ignored (both servers)
- **Bug 30**: LOINC property filter ignored (both servers)

### Dev-only regressions (prod is correct)

- **Bug 19**: abstract=false param ignored
- **Bug 21**: expansion.total wrong for multi-system VS
- **Bug 23/24**: Wrong valueSetVersion silently succeeds (prod returns 422)
- **Bug 33**: $translate returns 4 duplicate matches (prod returns 1)
- **Bug 38**: Content-Type application/json not fhir+json

---

## Detailed Bug Reports

### Critical — Server Crashes

## Bug 3: CS/$validate-code: missing code/coding/CC → 500 NPE

> **Triage**: NEW | **Severity**: Critical | **Category**: Server Crash  
> **Summary**: Missing input validation: no code/coding/CC → NPE on null.coding

**Severity**: Critical (HTTP 500)  
**Operations**: CodeSystem/$validate-code  
**Endpoints**: /r4, /r5

### Behavior

When CS/$validate-code is invoked with a `url` but no `code`, `coding`, or `codeableConcept`, the server crashes with `Cannot read properties of null (reading 'coding')` — a null pointer exception (NPE) in JavaScript. The server fails to check for required parameters before accessing them.

### Reproducing

```bash
# url provided, but no code/coding/CC
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct' \
  -H 'Accept: application/fhir+json'
```

### Spec Expectation

The spec states (R4, R5, R6) the client SHALL provide one of `code`, `coding`, or `codeableConcept`. When none is provided, the server should return HTTP 400 with an OperationOutcome explaining the missing required parameter, e.g.: `"Must provide one of: code, coding, or codeableConcept"`. A 500 crash is a server defect.

---

## Bug 6: VS/$validate-code: text-only CodeableConcept crashes

> **Triage**: NEW | **Severity**: Critical | **Category**: Server Crash  
> **Summary**: Text-only CodeableConcept (valid FHIR) → 500 renderCoded crash

**Severity**: Critical (HTTP 500)  
**Operations**: ValueSet/$validate-code  
**Endpoints**: /r4, /r5

### Behavior

When a CodeableConcept with `.text` but no `.coding` array is submitted, the server crashes with `Invalid arguments to renderCoded`. The server assumes the CC always has at least one coding.

### Reproducing

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

### Spec Expectation

A CodeableConcept with only `.text` and no codings is valid FHIR. The server should return `result=false` with a message like `"CodeableConcept has no codings to validate against the value set"`. Text-only CCs are common in clinical data and must be handled gracefully.

---

## Bug 7: POST with empty body → 500 NPE

> **Triage**: NEW | **Severity**: Critical | **Category**: Server Crash  
> **Summary**: Empty POST body → NPE. No request body validation.

**Severity**: Critical (HTTP 500)  
**Operations**: All POST-capable operations  
**Endpoints**: /r4, /r5

### Behavior

A POST request with an empty body (no JSON content) causes `Cannot read properties of null (reading 'coding')`.

### Reproducing

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json'
```

### Spec Expectation

HTTP 400 with OperationOutcome: `"Request body is required for POST operations"` or similar.

---

## Bug 8: POST with non-Parameters resourceType → 500 NPE

> **Triage**: NEW | **Severity**: Critical | **Category**: Server Crash  
> **Summary**: Non-Parameters resourceType → NPE. No resourceType check.

**Severity**: Critical (HTTP 500)  
**Operations**: All POST-capable operations  
**Endpoints**: /r4, /r5

### Behavior

Posting a valid FHIR resource that is not a Parameters resource (e.g., a Patient) causes the same NPE crash. The server attempts to extract parameters from it without checking `resourceType`.

### Reproducing

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{"resourceType": "Patient", "id": "1"}'
```

### Spec Expectation

HTTP 400: `"Expected Parameters resource, got Patient"`.

---

## Bug 9: POST with wrong Content-Type → 500

> **Triage**: NEW | **Severity**: Critical | **Category**: Server Crash  
> **Cross-reference**: xref 9f41615  
> **Summary**: Wrong Content-Type → 500. Related to closed 9f41615 but different path.

**Severity**: Critical (HTTP 500)  
**Operations**: All POST-capable operations  
**Endpoints**: /r4, /r5

### Behavior

Posting with `Content-Type: text/plain` (or other non-FHIR content types) causes a 500 crash. The server attempts to JSON-parse the body regardless of Content-Type.

### Reproducing

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Content-Type: text/plain' \
  -H 'Accept: application/fhir+json' \
  -d 'hello world'
```

### Spec Expectation

HTTP 415 (Unsupported Media Type) or HTTP 400 with OperationOutcome explaining that `text/plain` is not acceptable — only `application/fhir+json` or `application/fhir+xml`.

---

### High — Conformance Violations

## Bug 11: /r4 $translate rejects R4 parameter names

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Summary**: /r4 endpoint demands R5+ parameter names for $translate

**Severity**: High (conformance violation)  
**Operations**: ConceptMap/$translate  
**Endpoints**: /r4

### Behavior

The `/r4` endpoint does not accept R4-spec parameter names for `$translate`. The R4 spec defines `code` and `system` as input parameters, but the server rejects them with _"Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"_. Only R5/R6 parameter names (`sourceCode`, `sourceSystem`) are accepted.

This means any R4-compliant client that sends `code` and `system` will get a 400 error on the R4 endpoint.

### Reproducing

```bash
# R4 parameter names — REJECTED on /r4 endpoint
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?code=male&system=http://hl7.org/fhir/administrative-gender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"

# R5 names work on /r4 endpoint
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 200 with result=true, 4 match entries
```

### Spec Expectation

R4 §6.14.18 defines the $translate operation with parameters named `code` (IN, 0..1, code), `system` (IN, 0..1, uri), `source` (IN, 0..1, uri), and `target` (IN, 0..1, uri). The /r4 endpoint MUST accept these R4 parameter names. R5 renamed them to `sourceCode`, `sourceSystem`, `sourceScope`, `targetScope` respectively. The server appears to have implemented only R5/R6 names and served them on all endpoints.

---

## Bug 12: /r5 $translate rejects R5 `system` parameter name

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Summary**: /r5 endpoint demands R6 `sourceSystem` instead of R5 `system`

**Severity**: High (conformance violation)  
**Operations**: ConceptMap/$translate  
**Endpoints**: /r5

### Behavior

Even on the `/r5` endpoint, the R5 parameter name `system` is rejected. The server requires `sourceSystem` (which is the R6 name). The R5 spec uses `system` alongside `sourceCode`.

### Reproducing

```bash
# R5 spec uses "system" alongside "sourceCode" — REJECTED
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?sourceCode=male&system=http://hl7.org/fhir/administrative-gender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "sourceSystem parameter is required when using sourceCode"

# Only "sourceSystem" (R6 name) works
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 200
```

### Spec Expectation

R5 §6.15.22 defines `system` (IN, 0..1, uri) — _"The system for the code that is to be translated."_ R6 renamed this to `sourceSystem`. The /r5 endpoint should accept the R5 name `system`.

---

## Bug 13: R5 $translate: reverse translation unimplemented

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Summary**: Reverse translation (targetCode/targetCoding) completely unimplemented

**Severity**: High (conformance violation)  
**Operations**: ConceptMap/$translate  
**Endpoints**: /r5

### Behavior

R5 added `targetCode`, `targetCoding`, and `targetCodeableConcept` parameters for reverse translation (find source concepts that map to a given target). The server rejects all of these with _"Must provide sourceCode..."_, meaning reverse translation is completely non-functional.

### Reproducing

```bash
# targetCode — R5 feature for reverse lookup
curl -s 'https://tx-dev.fhir.org/r5/ConceptMap/$translate?targetCode=M&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json'
# Returns 400: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"
```

### Spec Expectation

R5 §6.15.22: the server SHALL accept ONE of `sourceCode`+`sourceSystem`, `sourceCoding`, `sourceCodeableConcept`, `targetCode`+`targetSystem`, `targetCoding`, or `targetCodeableConcept`. Target-based inputs trigger reverse translation. The server should process these or return 501 (not implemented) with a FHIR OperationOutcome — not a 400 claiming the source params are missing.

---

## Bug 14: `_format` parameter completely ignored

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Summary**: `_format` param ignored — SHALL per FHIR spec override Accept header

**Severity**: High (conformance violation)  
**Operations**: All  
**Endpoints**: /r4, /r5

### Behavior

The FHIR `_format` query parameter has no effect on response format. Regardless of `_format=xml`, `_format=json`, or `_format=application/fhir+xml`, the server always follows the `Accept` header. The FHIR spec says `_format` SHALL override the Accept header.

### Reproducing

```bash
# Request XML via _format, JSON via Accept — gets JSON (Accept wins, _format ignored)
curl -s -o /dev/null -w '%{content_type}' \
  'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://hl7.org/fhir/administrative-gender&code=male&_format=xml' \
  -H 'Accept: application/fhir+json'
# Returns: application/json; charset=utf-8 (should be XML)

# Request JSON via _format, XML via Accept — gets XML (Accept wins again)
curl -s -o /dev/null -w '%{content_type}' \
  'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://hl7.org/fhir/administrative-gender&code=male&_format=json' \
  -H 'Accept: application/fhir+xml'
# Returns: application/fhir+xml; charset=utf-8 (should be JSON)
```

### Spec Expectation

FHIR R4 §2.21.0.6.1 / R5 §2.21.0.6.1: _"The _format parameter overrides the accept type specified in the HTTP Headers."_ This is a SHALL — the `_format` parameter is the primary mechanism for format negotiation in contexts where Accept headers cannot be set (e.g., browser URL bar). The server MUST honor it.

---

## Bug 15: $subsumes reflexivity broken for LOINC, UCUM, BCP-47, ISO-3166

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Summary**: Same-code $subsumes returns not-subsumed for LOINC/UCUM/BCP-47/ISO-3166

**Severity**: High (semantic error)  
**Operations**: CodeSystem/$subsumes  
**Endpoints**: /r4, /r5

### Behavior

When the same code is provided as both `codeA` and `codeB`, the server should always return `equivalent` — this is reflexivity, a fundamental property of subsumption. However, for four code systems, the server returns `not-subsumed` instead:

| Code System | codeA=codeB | Expected | Actual |
|---|---|---|---|
| LOINC (http://loinc.org) | 1963-8=1963-8 | equivalent | **not-subsumed** |
| UCUM (http://unitsofmeasure.org) | kg=kg | equivalent | **not-subsumed** |
| BCP-47 (urn:ietf:bcp:47) | en=en | equivalent | **not-subsumed** |
| ISO-3166 (urn:iso:std:iso:3166) | US=US | equivalent | **not-subsumed** |
| SNOMED (http://snomed.info/sct) | 22298006=22298006 | equivalent | ✅ equivalent |
| admin-gender | male=male | equivalent | ✅ equivalent |
| data-absent-reason | unknown=unknown | equivalent | ✅ equivalent |

The root cause is likely that these code systems lack hierarchy support in the server, and the subsumption logic falls through to a default `not-subsumed` without first checking whether codeA == codeB.

### Reproducing

```bash
# LOINC same code — WRONG
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://loinc.org&codeA=1963-8&codeB=1963-8' \
  -H 'Accept: application/fhir+json'
# Returns: outcome=not-subsumed (should be equivalent)

# UCUM same code — WRONG
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://unitsofmeasure.org&codeA=kg&codeB=kg' \
  -H 'Accept: application/fhir+json'
# Returns: outcome=not-subsumed (should be equivalent)

# BCP-47 same code — WRONG
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=urn:ietf:bcp:47&codeA=en&codeB=en' \
  -H 'Accept: application/fhir+json'
# Returns: outcome=not-subsumed (should be equivalent)

# ISO-3166 same code — WRONG
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=urn:iso:std:iso:3166&codeA=US&codeB=US' \
  -H 'Accept: application/fhir+json'
# Returns: outcome=not-subsumed (should be equivalent)

# SNOMED same code — CORRECT (for comparison)
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=22298006&codeB=22298006' \
  -H 'Accept: application/fhir+json'
# Returns: outcome=equivalent ✓
```

### Spec Expectation

R4 §6.4.20 / R5 §6.4.22: $subsumes _"tests the subsumption relationship between code/Coding A and code/Coding B given the semantics of subsumption in the underlying code system."_ Subsumption is reflexive by definition — every concept subsumes itself. The outcome `equivalent` is defined as _"A is equivalent to B (means A subsumes B and B subsumes A)"_, which must always be true when A=B. The server should check code equality before attempting hierarchy traversal.

---

## Bug 38: Response Content-Type uses `application/json` instead of `application/fhir+json`

> **Triage**: NEW | **Severity**: High | **Category**: Conformance  
> **Scope**: Dev-only  
> **Summary**: JSON Content-Type is application/json not application/fhir+json. Dev-only.

**Severity**: Medium (conformance violation)  
**Operations**: All operations  
**Endpoints**: /r4, /r5

### Behavior

JSON responses have `Content-Type: application/json; charset=utf-8` instead of the FHIR-specified `application/fhir+json`. Interestingly, XML responses correctly use `application/fhir+xml`.

### Reproduction

```bash
# JSON response — wrong Content-Type
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/fhir+json' 2>&1 | grep -i 'content-type'
# Returns: content-type: application/json; charset=utf-8
# Expected: content-type: application/fhir+json; charset=utf-8

# XML response — correct Content-Type (for comparison)
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/fhir+xml' 2>&1 | grep -i 'content-type'
# Returns: content-type: application/fhir+xml; charset=utf-8 (correct!)
```

### Spec Expectation

FHIR R4 §2.21.0.6: "The formal MIME-type for FHIR resources is `application/fhir+json`." FHIR servers SHALL use this Content-Type for JSON responses.

---

### High — Wrong Results

## Bug 17: $expand `count=0` returns all codes instead of empty expansion

> **Triage**: NEW | **Severity**: High | **Category**: Wrong Result  
> **Scope**: Both prod and dev  
> **Summary**: count=0 should return empty expansion + total; returns all codes. Both servers.

**Severity**: High (wrong result)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

When `count=0` is passed, the server returns all codes in the expansion instead of an empty `contains` array with just the `total`. The server appears to treat `count=0` as "no limit" rather than "return zero entries."

### Reproducing

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&count=0' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin); e=d['expansion']
print(f'total={e.get(\"total\")} contains_count={len(e.get(\"contains\",[]))}')
"
# Returns: total=4 contains_count=4 (should be total=4 contains_count=0)
```

### Spec Expectation

R4 §7.8.2 / R5 §7.8.2 for the `count` parameter: _"Paging: if count=0, the client is asking how large the expansion is."_ The server should return `expansion.total` with the count, but `expansion.contains` should be empty (or absent). This allows clients to discover expansion size without transferring all codes.

---

## Bug 18: $expand `exclude-system` completely non-functional

> **Triage**: NEW | **Severity**: High | **Category**: Wrong Result  
> **Scope**: Both prod and dev  
> **Summary**: exclude-system parameter completely non-functional. Both servers.

**Severity**: High (parameter ignored)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

The `exclude-system` parameter is accepted without error but has zero effect. Codes from the excluded system are still present in the expansion.

### Reproducing

```bash
# Jurisdiction VS has codes from urn:iso:std:iso:3166 and urn:iso:std:iso:3166:-2
# Exclude 3166 — should only get 3166:-2 codes
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/jurisdiction&exclude-system=urn:iso:std:iso:3166&count=5' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin); e=d['expansion']
systems=set(c['system'] for c in e.get('contains',[]))
print(f'total={e.get(\"total\")} systems_present={systems}')
"
# Returns: total=789 systems_present={'urn:iso:std:iso:3166'}
# Expected: Only urn:iso:std:iso:3166:-2 codes
```

### Spec Expectation

R4 §7.8.2: `exclude-system` (0..*, canonical) — _"Code system, or a particular version of a code system to be excluded from the value set expansion."_ The server MUST filter out concepts from the excluded system(s).

---

### Medium — Wrong Results & Silent Failures

## Bug 19: $validate-code `abstract=false` parameter ignored

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Dev-only  
> **Summary**: abstract=false ignored. Dev-only regression (prod correct).

**Severity**: Medium (conformance gap)  
**Operations**: CodeSystem/$validate-code, ValueSet/$validate-code  
**Endpoints**: /r4, /r5

### Behavior

The `abstract` parameter (R5+) controls whether abstract codes should be considered valid. When `abstract=false`, the server should return `result=false` for codes marked as abstract/not-selectable. Instead, the server ignores this parameter entirely and always returns `result=true` for valid abstract codes regardless of the `abstract` value.

### Reproducing

```bash
# _ActAccountCode is an abstract code in v3-ActCode (notSelectable=true)
# abstract=false should reject it
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode&abstract=false' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueBoolean',p.get('valueString','')) for p in d['parameter']}
print(f'result={ps[\"result\"]} display={ps.get(\"display\",\"\")}')
"
# Returns: result=True display=ActAccountCode (should be result=False)

# Also fails on VS endpoint
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http://terminology.hl7.org/ValueSet/v3-ActCode&system=http://terminology.hl7.org/CodeSystem/v3-ActCode&code=_ActAccountCode&abstract=false' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueBoolean',p.get('valueString','')) for p in d['parameter']}
print(f'result={ps[\"result\"]}')
"
# Returns: result=True (should be result=False)
```

### Spec Expectation

R5 §6.4.22 / R6: `abstract` (IN, 0..1, boolean) — _"If abstract=false, abstract codes are excluded from the check; If abstract=true or not present, abstract codes are included in the check."_ When `abstract=false` and the code is abstract, result MUST be `false`.

---

## Bug 20: $expand `expansion.total` wrong for SNOMED excludes

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Dev-only  
> **Cross-reference**: xref f2b2cef  
> **Summary**: SNOMED expansion.total not adjusted for excludes. Dev-specific.

**Severity**: Medium (wrong result)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

When a ValueSet compose includes SNOMED codes via `is-a` filter and excludes specific codes, the `expansion.total` reflects the pre-exclude count, not the post-exclude count. The actual `contains` entries are correctly filtered.

### Reproducing

```bash
# Include is-a 73211009 (Diabetes mellitus, 124 descendants), exclude the root
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
  }' | python3 -c "
import sys,json; d=json.load(sys.stdin); e=d['expansion']
print(f'total={e.get(\"total\")} actual_count={len(e.get(\"contains\",[]))}')
# First code should NOT be 73211009
print(f'first_code={e[\"contains\"][0][\"code\"]}')
"
# Returns: total=124 actual_count=123 first_code=2751001
# Expected: total=123 (should match actual count after exclude)
```

### Spec Expectation

`expansion.total` is defined as _"the total number of concepts in the expansion."_ If the expansion has 123 concepts (because one was excluded), total should be 123, not 124. Clients use `total` for paging calculations, and a mismatch causes incorrect page counts.

---

## Bug 21: $expand `expansion.total` wrong for multi-system ValueSet

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Dev-only  
> **Cross-reference**: xref 2ed80bd  
> **Summary**: Jurisdiction VS: total=789 but 1000 entries. Dev-specific.

**Severity**: Medium (wrong result)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

The `jurisdiction` ValueSet includes codes from two systems: `urn:iso:std:iso:3166` (countries) and `urn:iso:std:iso:3166:-2` (subdivisions). The expansion reports `total=789` but actually returns 1000 `contains` entries when requested with `count=1000`.

### Reproducing

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/jurisdiction&count=1000' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin); e=d['expansion']
print(f'total={e.get(\"total\")} actual_contains={len(e.get(\"contains\",[]))}')
"
# Returns: total=789 actual_contains=1000
```

### Spec Expectation

`expansion.total` must equal the actual number of concepts in the full expansion. Reporting 789 when there are 1000 is incorrect — it appears the server counts only the first included system.

---

## Bug 22: $expand include+exclude same code gives wrong total

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Both prod and dev  
> **Summary**: Include+exclude same code → total=1 with 0 entries. Both servers.

**Severity**: Medium (wrong result)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

When a ValueSet compose includes a code and then excludes the same code, the result is an empty expansion (correct), but `total=1` (wrong — should be 0).

### Reproducing

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
  }' | python3 -c "
import sys,json; d=json.load(sys.stdin); e=d['expansion']
print(f'total={e.get(\"total\")} contains_count={len(e.get(\"contains\",[]))}')
"
# Returns: total=1 contains_count=0 (should be total=0)
```

### Spec Expectation

The total must reflect the actual expansion size. After exclusion, zero codes remain, so `total` must be 0.

---

## Bug 23: $expand `valueSetVersion` with wrong version silently succeeds

> **Triage**: NEW | **Severity**: Medium | **Category**: Silent Failure  
> **Scope**: Dev-only  
> **Cross-reference**: xref 2f5929e  
> **Summary**: Wrong valueSetVersion silently succeeds. Dev-only (prod returns 422).

**Severity**: Medium (silent failure)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

When `valueSetVersion=99.99` is provided for a ValueSet that has no such version, the server silently ignores the bad version and expands the current version. No error, no warning.

### Reproducing

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&valueSetVersion=99.99' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'total={d[\"expansion\"][\"total\"]} version={d.get(\"version\")}')
"
# Returns: total=4 version=4.0.1 (should error — version 99.99 doesn't exist)
```

### Spec Expectation

When `valueSetVersion` specifies a version that doesn't exist, the server should return an error (HTTP 404 or 422) indicating the requested version was not found. Compare: `check-system-version` with a wrong version correctly returns an error ("version '99.99' could not be found"), so the server has this capability for CS versions but not VS versions.

---

## Bug 24: $expand URL pipe with wrong version silently succeeds

> **Triage**: NEW | **Severity**: Medium | **Category**: Silent Failure  
> **Scope**: Dev-only  
> **Cross-reference**: xref 2f5929e  
> **Summary**: URL pipe wrong version silently succeeds. Dev-only (prod returns 422).

**Severity**: Medium (silent failure)  
**Operations**: ValueSet/$expand  
**Endpoints**: /r4, /r5

### Behavior

Same as Bug 23, but triggered by embedding the version in the canonical URL using pipe notation (`|99.0`).

### Reproducing

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender%7C99.0&count=2' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
print(f'total={d[\"expansion\"][\"total\"]} version={d.get(\"version\")}')
"
# Returns: total=4 version=4.0.1 (should error — version 99.0 doesn't exist)
```

### Spec Expectation

FHIR canonical URLs with pipe-delimited versions (`url|version`) are a standard mechanism for requesting specific versions. The server should resolve the version and error if not found.

---

## Bug 26: CS/$validate-code: CC display contamination across systems

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Both prod and dev  
> **Cross-reference**: xref d70be11  
> **Summary**: CC with SNOMED+LOINC codings: returns LOINC display for SNOMED. Both servers.

**Severity**: Medium (wrong output)  
**Operations**: CodeSystem/$validate-code  
**Endpoints**: /r4, /r5

### Behavior

When validating a CodeableConcept containing codings from multiple systems (e.g., SNOMED + LOINC) against a specific CodeSystem, the `display` output parameter returns the display from the wrong coding. Specifically, validating against SNOMED with a CC containing both SNOMED 122298005 and LOINC 8480-6, the server returns `display="Systolic blood pressure"` (the LOINC display) instead of `display="Astrovirus RNA assay"` (the SNOMED display).

### Reproducing

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
  }' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueBoolean',p.get('valueString','')) for p in d['parameter']}
print(f'result={ps[\"result\"]} display={ps.get(\"display\")} code={ps.get(\"code\")}')
"
# Returns: result=True display=Systolic blood pressure
# Expected: display=Astrovirus RNA assay (the SNOMED coding's display)
```

### Spec Expectation

When validating a CC against a CodeSystem, the `display` output should reflect the matching coding from that CodeSystem. The LOINC coding's display is irrelevant to SNOMED validation.

---

## Bug 33: $translate returns duplicate matches

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Result  
> **Scope**: Dev-only  
> **Summary**: Single translation returns 4 identical matches. Dev-only (prod returns 1).

**Severity**: Medium (wrong result)  
**Operations**: ConceptMap/$translate  
**Endpoints**: /r4, /r5

### Behavior

A single translation request returns 4 identical match entries instead of 1. Each match has the same `concept` and `relationship`.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ConceptMap/$translate?sourceCode=male&sourceSystem=http://hl7.org/fhir/administrative-gender&targetSystem=http://terminology.hl7.org/CodeSystem/v3-AdministrativeGender' \
  -H 'Accept: application/fhir+json' | jq '[.parameter[] | select(.name=="match") | .part[] | select(.name=="concept") | .valueCoding.code]'
# Returns: ["M", "M", "M", "M"]
# Expected: ["M"] (single match)
```

### Spec Expectation

Each match should represent a distinct translation target. Four identical matches for the same concept with the same relationship suggests a join/duplication error in the ConceptMap lookup logic.

---

### Medium — Feature Gaps & Misrouting

## Bug 29: $lookup `displayLanguage` completely ignored

> **Triage**: NEW | **Severity**: Medium | **Category**: Feature Gap  
> **Scope**: Both prod and dev  
> **Summary**: displayLanguage ignored for $lookup. $validate-code honors it. Both servers.

**Severity**: Medium (parameter non-functional)  
**Operations**: CodeSystem/$lookup  
**Endpoints**: /r4, /r5

### Behavior

The `displayLanguage` parameter has zero effect on $lookup responses. The display is always in English. Designations are never filtered by language. Even `displayLanguage=xx` (nonexistent) causes no error.

This contrasts with $validate-code, where `displayLanguage` works correctly (returns German/Dutch/Spanish displays for LOINC, filters valid displays by language).

### Reproducing

```bash
# Request German display for LOINC — ignored, returns English
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=8480-6&displayLanguage=de' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueString','') for p in d['parameter']}
print(f'display={ps.get(\"display\")}')
"
# Returns: display=Systolic blood pressure (should be Systolischer Blutdruck)

# For comparison, $validate-code DOES honor displayLanguage:
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://loinc.org&code=8480-6&displayLanguage=de' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueString','') for p in d['parameter']}
print(f'display={ps.get(\"display\")}')
"
# Returns: display=Systolischer Blutdruck ✓

# Even a bogus language doesn't error on $lookup:
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&displayLanguage=xx' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
ps={p['name']:p.get('valueString','') for p in d['parameter']}
print(f'display={ps.get(\"display\")}')
"
# Returns: display=Myocardial infarction (no error for 'xx')
```

### Spec Expectation

R4 §6.4.18 defines `displayLanguage` (IN, 0..1, code) for $lookup: _"The requested language for display."_ The server should return the display in the requested language (if available), and filter designations to that language. The inconsistency with $validate-code (which honors the parameter) suggests this is an implementation oversight specific to the $lookup code path.

---

## Bug 30: $lookup LOINC `property` filter ignored

> **Triage**: NEW | **Severity**: Medium | **Category**: Feature Gap  
> **Scope**: Both prod and dev  
> **Cross-reference**: xref 5f3b796  
> **Summary**: LOINC property filter ignored (always returns all). Both servers.

**Severity**: Medium (parameter non-functional)  
**Operations**: CodeSystem/$lookup  
**Endpoints**: /r4, /r5

### Behavior

When requesting specific properties via the `property` parameter for LOINC codes, the filter is ignored and ALL properties are returned (25+). This happens regardless of which property is requested.

For SNOMED, the property filter works correctly (e.g., `property=inactive` returns only `inactive`).

### Reproducing

```bash
# Request only COMPONENT property for LOINC — returns ALL properties
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://loinc.org&code=1963-8&property=COMPONENT' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
props=[p for p in d['parameter'] if p['name']=='property']
codes=[sp.get('valueCode','') for p in props for sp in p.get('part',[]) if sp['name']=='code']
print(f'requested: COMPONENT, returned {len(props)} properties: {codes[:5]}...')
"
# Returns: requested: COMPONENT, returned 25 properties: ['COMPONENT', 'CLASS', 'PROPERTY', 'TIME_ASPCT', 'SYSTEM']...

# SNOMED filter works correctly for comparison:
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006&property=inactive' \
  -H 'Accept: application/fhir+json' | python3 -c "
import sys,json; d=json.load(sys.stdin)
props=[p for p in d['parameter'] if p['name']=='property']
print(f'returned {len(props)} properties')
"
# Returns: returned 1 properties ✓
```

### Spec Expectation

R4 §6.4.18 / R5 §6.4.20: `property` (IN, 0..*, code) — the server should return only the requested properties. When `property=COMPONENT`, only COMPONENT should be in the output. The wildcard `property=*` should return all properties, but an explicit filter should narrow the result.

---

## Bug 37: `$closure` returns HTML 404 instead of FHIR OperationOutcome

> **Triage**: NEW | **Severity**: Medium | **Category**: Conformance  
> **Summary**: $closure returns raw HTML 404, not FHIR OperationOutcome.

**Severity**: Medium (conformance violation)  
**Operations**: ConceptMap/$closure  
**Endpoints**: /r4, /r5

### Behavior

The $closure operation endpoint does not exist. Instead of returning a FHIR OperationOutcome with HTTP 404, the server returns an HTML page (`Cannot POST /r4/ConceptMap/$closure`). This applies to both GET and POST.

### Reproduction

```bash
# POST (correct method for $closure)
curl -s -X POST 'https://tx-dev.fhir.org/r4/$closure' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -D- \
  -d '{"resourceType":"Parameters","parameter":[{"name":"name","valueString":"test-closure"}]}' 2>&1 | head -5
# Returns: HTML body: <!DOCTYPE html><html>...<pre>Cannot POST /r4/$closure</pre>
# Expected: HTTP 404 with {"resourceType": "OperationOutcome", ...}
```

### Spec Expectation

FHIR R4 §3.1.0.9 / §2.21.0.1: All error responses from a FHIR server SHALL be OperationOutcome resources. HTML error pages violate this requirement. If $closure is not implemented, the server should return `OperationOutcome` with `issue.code = "not-supported"`.

---

## Bug 49: $expand paging cannot go past offset 1000

> **Triage**: NEW | **Severity**: Medium | **Category**: Limitation  
> **Cross-reference**: xref 44d1916  
> **Summary**: Paging hard-capped at offset 1000 with HTTP 400.

**Severity**: Medium (functional limitation)  
**Operations**: VS/$expand  
**Endpoints**: /r4, /r5

### Behavior

For large value sets (e.g., SNOMED ECL expressions), requesting offset+count values exceeding ~1000 triggers a "too costly" error. This means clients cannot page through the full expansion — they're capped at the first 1000 entries.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=isa/404684003&offset=1000&count=10' \
  -H 'Accept: application/fhir+json' | jq '.issue[0].details.text // .expansion.total'
# Returns: Error about expansion being too costly
# Expected: 10 codes at offset 1000 (paging should work for full expansion)
```

### Spec Expectation

R4 §6.4.18: Paging via offset+count is specifically designed for large expansions. If the server imposes a limit, it should document it in TerminologyCapabilities and the error message should indicate the maximum supported offset.

---

## Bug 50: `$closure` endpoint routes to `$translate` handler

> **Triage**: NEW | **Severity**: Medium | **Category**: Wrong Dispatch  
> **Summary**: $closure routes to $translate handler. Error references $translate params.

**Severity**: Medium (wrong dispatch)  
**Operations**: ConceptMap/$closure  
**Endpoints**: /r4, /r5

### Behavior

The `ConceptMap/$closure` path appears to be handled by the `$translate` handler rather than a dedicated `$closure` handler. Error messages reference $translate parameter expectations.

### Reproduction

```bash
curl -s -X POST 'https://tx-dev.fhir.org/r4/ConceptMap/$closure' \
  -H 'Content-Type: application/fhir+json' \
  -H 'Accept: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[{"name":"name","valueString":"test-closure"}]}' | jq '.issue[0].details.text'
# Returns: "Must provide sourceCode (with system), sourceCoding, or sourceCodeableConcept"
# Expected: Either proper $closure handling or "Operation $closure is not supported"
```

### Spec Expectation

$closure has its own distinct parameter set (`name`, `concept[]`). It should not be dispatched to the $translate handler. If unimplemented, the error should clearly state that $closure is not supported.

---

### Low — Cosmetic & Edge Cases

## Bug 34: `displayLanguage` value truncated in error message

> **Triage**: NEW | **Severity**: Low | **Category**: Cosmetic  
> **Summary**: displayLanguage=xx shows 'x' in error. Parsing truncation.

**Severity**: Low (cosmetic / input parsing)  
**Operations**: CS/$validate-code, VS/$validate-code  
**Endpoints**: /r4, /r5

### Behavior

When an invalid `displayLanguage` is provided, the error message shows a truncated value. For example, `displayLanguage=xx` is reported as `'x'` (truncated to 1 char). `displayLanguage=xx-invalid` is also truncated to `'x'`.

### Reproduction

```bash
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=80146002&displayLanguage=xx' \
  -H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name=="message") | .valueString'
# Returns something like: "Invalid displayLanguage: 'x'"
# Expected: "Invalid displayLanguage: 'xx'"
```

### Spec Expectation

Error messages should reflect the actual input value so the client can understand what went wrong. Truncation suggests a parsing bug (possibly reading only the first character of the language tag).

---

## Bug 35: `useSupplement` parameter silently ignored

> **Triage**: NEW | **Severity**: Low | **Category**: Feature Gap  
> **Summary**: useSupplement (R5) silently ignored, even for nonexistent URLs.

**Severity**: Medium (R5 feature gap)  
**Operations**: CS/$lookup, VS/$expand  
**Endpoints**: /r4, /r5

### Behavior

The `useSupplement` parameter (R5+) is accepted without error but has no observable effect. Even a completely nonexistent supplement URL produces no error and no change in behavior.

### Reproduction

```bash
# $lookup with nonexistent supplement — no error, normal result
curl -s 'https://tx-dev.fhir.org/r5/CodeSystem/$lookup?system=http://loinc.org&code=8480-6&useSupplement=http://example.org/nonexistent-supplement' \
  -H 'Accept: application/fhir+json' | jq '{display: .parameter[0].valueString, param_count: (.parameter | length)}'
# Returns normal lookup result with no error/warning about the supplement

# $expand with nonexistent supplement — same
curl -s 'https://tx-dev.fhir.org/r5/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&useSupplement=http://example.org/fake' \
  -H 'Accept: application/fhir+json' | jq '.expansion.contains | length'
# Returns: 4 (normal expansion, supplement ignored)
```

### Spec Expectation

R5 §6.4.12/6.4.18: `useSupplement` (IN, 0..*, canonical) — "The supplement must be used when performing an expansion." If the supplement URL is unknown, the server SHOULD return an error. At minimum, a valid supplement should modify the output (e.g., adding/replacing designations or properties).

---

## Bug 40: `application/xml` (without `fhir+`) not recognized as XML

> **Triage**: NEW | **Severity**: Low | **Category**: Conformance  
> **Scope**: Dev-only  
> **Summary**: application/xml (without fhir+) falls back to JSON. Dev-only.

**Severity**: Low (usability)  
**Operations**: All operations  
**Endpoints**: /r4, /r5

### Behavior

Sending `Accept: application/xml` (the generic XML MIME type) falls back to JSON instead of returning XML. Only `application/fhir+xml` triggers XML output.

### Reproduction

```bash
# Generic XML MIME type — falls back to JSON
curl -s -D- 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://hl7.org/fhir/administrative-gender&code=male' \
  -H 'Accept: application/xml' 2>&1 | grep -i 'content-type'
# Returns: content-type: application/json; charset=utf-8
# Expected: application/fhir+xml (or at least some XML)
```

### Spec Expectation

FHIR R4 §2.21.0.6: "FHIR resources can also be exchanged with `application/json` and `application/xml`." The generic MIME types should be accepted as aliases.

---

## Bug 46: Error OperationOutcome field usage inconsistent

> **Triage**: NEW | **Severity**: Low | **Category**: Cosmetic  
> **Cross-reference**: xref 8ef44d0  
> **Summary**: details.text vs diagnostics usage inconsistent across error types.

**Severity**: Low (consistency)  
**Operations**: All operations  
**Endpoints**: /r4, /r5

### Behavior

Different error conditions place the error message in different fields: some errors use `issue[].details.text`, others use `issue[].diagnostics`. This makes it harder for clients to extract error messages.

### Reproduction

```bash
# 400 error: message in details.text
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?code=male' \
  -H 'Accept: application/fhir+json' | jq '{details: .issue[0].details.text, diagnostics: .issue[0].diagnostics}'
# Returns: {"details": "Must provide system and code, or a coding", "diagnostics": null}

# 404 error: message in diagnostics
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://example.org/fake&code=x' \
  -H 'Accept: application/fhir+json' | jq '{details: .issue[0].details?.text, diagnostics: .issue[0].diagnostics}'
# Returns: {"details": null, "diagnostics": "Code System http://example.org/fake not found"}
```

### Spec Expectation

While both fields are valid, consistent use of one field (or both) for error messages improves client interoperability. `details.text` is for human-readable summary, `diagnostics` is for additional diagnostic information. Mixing them makes error parsing unreliable.

---

## Bug 48: $expand `property` parameter (R5) accepted but non-functional

> **Triage**: NEW | **Severity**: Low | **Category**: Feature Gap  
> **Summary**: R5 $expand property param partially functional (definition works, others don't).

**Severity**: Medium (R5 feature gap)  
**Operations**: VS/$expand  
**Endpoints**: /r5

### Behavior

The `property` parameter (added in R5 to request specific properties in expansion) is accepted without error but has no effect on the output. Codes in the expansion never include additional properties regardless of the parameter value.

### Reproduction

```bash
# Request specific properties in expansion
curl -s 'https://tx-dev.fhir.org/r5/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/observation-status&property=status&property=definition' \
  -H 'Accept: application/fhir+json' | jq '.expansion.contains[0] | keys'
# Returns: ["code", "display", "system"] — no property field
# Expected: Each concept should include requested properties

# Compare with no property param — identical output
curl -s 'https://tx-dev.fhir.org/r5/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/observation-status' \
  -H 'Accept: application/fhir+json' | jq '.expansion.contains[0] | keys'
# Returns: ["code", "display", "system"] — same
```

### Spec Expectation

R5 §6.4.18: `property` (IN, 0..*, string) — "A request to return a particular property in the expansion." The expansion.contains entries should include the requested property values.

---
