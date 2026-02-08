# Coverage Gap Findings: $subsumes, Search, and Read Workers

## Servers Compared

- **Production** (Pascal): `https://tx.fhir.org/r4`
- **Dev** (JavaScript/FHIRsmith v0.4.2): `https://tx-dev.fhir.org/r4`

---

## 1. CodeSystem $subsumes (`tx/workers/subsumes.js`, 28% coverage)

### Code Paths Targeted

| Path | Lines | Description | Status |
|------|-------|-------------|--------|
| `handle()` type-level GET | 41-56 | Top-level handler with error catch | Tested |
| `handleInstance()` instance-level GET | 64-78 | Instance handler with error catch | Tested |
| `handleTypeLevelSubsumes()` codeA/codeB branch | 113-131 | Codes + system param | Tested |
| `handleTypeLevelSubsumes()` codingA/codingB branch | 101-112 | Codings from Parameters body | Tested |
| `handleTypeLevelSubsumes()` missing params error | 133-134 | Neither code pair provided | Tested |
| `handleTypeLevelSubsumes()` missing system error | 115-117 | codeA/codeB without system | Tested |
| `handleTypeLevelSubsumes()` coding system mismatch | 107-108 | codingA/codingB different systems | Tested |
| `handleInstanceLevelSubsumes()` CS not found | 155-157 | Instance with nonexistent ID | Tested |
| `handleInstanceLevelSubsumes()` codingA/codingB | 178-180 | Instance with codingA/codingB | Tested |
| `handleInstanceLevelSubsumes()` codeA/codeB | 181-191 | Instance with codeA/codeB | Tested |
| `doSubsumes()` system mismatch A | 271-276 | System uri mismatch for codingA | Covered by coding mismatch test |
| `doSubsumes()` system mismatch B | 277-282 | System uri mismatch for codingB | Covered by coding mismatch test |
| `doSubsumes()` invalid code A | 285-291 | Code not found in system | Tested |
| `doSubsumes()` invalid code B | 293-299 | Code not found in system | Tested |
| `doSubsumes()` all 4 outcomes | 302-312 | equivalent, subsumes, subsumed-by, not-subsumed | Tested |
| `parseParameters()` GET query | 214-216 | Query string parsing | Tested |
| `parseParameters()` POST body | 210-212 | Parameters resource body | Tested |
| `simpleParamsToParametersResource()` | 224-256 | Convert flat params to FHIR Parameters | Tested |
| Error handler: `Issue` type | 47-50 | Error catch for Issue instances | Tested |
| Error handler: generic Error | 51-54 | Error catch for generic errors | Tested |

### Findings

#### Behavioral Match (Happy Path)
All four subsumes outcomes (equivalent, subsumes, subsumed-by, not-subsumed) match between prod and dev for type-level GET with codeA/codeB/system. Tested with SNOMED codes (404684003, 71620000, 22298006, 73211009, 64572001) and LOINC codes (8480-6, 85354-9).

#### Difference: POST with codingA/codingB
- **Prod**: Always returns "No CodeSystem Identified" error -- does not extract system from codingA/codingB Coding values.
- **Dev**: Successfully extracts system from codingA.system and performs subsumes check.
- **Assessment**: Dev is more spec-compliant. The FHIR spec defines codingA/codingB as valid input parameters.

#### Difference: Instance-level $subsumes
- **Prod**: Returns "A value must be provided" for GET and POST on `contact-point-system` and `snomedct`.
- **Dev**: Successfully performs subsumes on complete CodeSystems (contact-point-system). For SNOMED CT (content: not-present), returns "Invalid code not found" since the FhirCodeSystemProvider can't look up codes in a not-present CodeSystem.
- **Assessment**: Dev handles instance-level correctly for complete CodeSystems. The SNOMED failure on dev is expected given that instance-level uses FhirCodeSystemProvider (resource-backed) rather than the SNOMED factory provider.

#### Difference: Instance-level POST with codingA/codingB
- **Prod**: Crashes with Pascal error "Attempt to free a class again (of type TFhirCoding or n/a (?))".
- **Dev**: Works correctly, returns `not-subsumed`.
- **Assessment**: Production has a memory management bug. Dev behavior is correct.

#### Error Message Differences
Error messages differ in structure between prod and dev:
- Prod includes `text.div` field with generated HTML
- Dev uses `details.text` instead of `diagnostics` for some errors (Issue class)
- Issue codes differ: prod uses `invalid` where dev uses `not-found` for missing system

---

## 2. Resource Search (`tx/workers/search.js`, 22% coverage)

### Code Paths Targeted

| Path | Lines | Description | Status |
|------|-------|-------------|--------|
| `handle()` main dispatch | 49-103 | Parse params, dispatch by type | Tested |
| `searchCodeSystems()` | 108-172 | Iterate all CS, match params | Tested |
| `searchCodeSystems()` no filter | 127-129 | Return all when no search params | Tested |
| `searchCodeSystems()` system skip | 136-138 | Skip `system` param for CS search | Tested |
| `searchCodeSystems()` content-mode | 141 | Map content-mode to content prop | Tested |
| `searchCodeSystems()` jurisdiction | 143-147 | Special jurisdiction matching | Tested |
| `searchCodeSystems()` text | 149-154 | Search title+description | Tested |
| `searchCodeSystems()` standard match | 156-161 | Partial text match on property | Tested |
| `searchValueSets()` | 177-201 | Delegate to valueSetProviders | Tested |
| ConceptMap search | 73-74 | Returns empty array | Tested |
| `matchValue()` | 206-213 | Case-insensitive partial match | Tested |
| `matchJurisdiction()` | 218-242 | Match CodeableConcept array | Tested |
| `sortResults()` | 247-264 | Sort by field, vurl special case | Tested |
| `sortResults()` invalid field | 248-249 | Skip sort for unknown field | Tested |
| `buildSearchBundle()` | 269-362 | Pagination links and entries | Tested |
| `buildSearchBundle()` previous link | 310-316 | Show previous when offset > 0 | Tested |
| `buildSearchBundle()` next link | 320-326 | Show next when more results | Tested |
| `filterElements()` | 367-381 | Filter resource to requested elements | Tested |
| POST `_search` | via route | Form-encoded POST search | Tested (BUG FOUND) |

### Findings

#### BUG: POST _search with form-encoded body crashes on dev
- **Request**: `POST /r4/CodeSystem/_search` with `Content-Type: application/x-www-form-urlencoded`
- **Dev response**: 500 error: "Cannot read properties of undefined (reading '_offset')"
- **Prod response**: Works correctly, returns results.
- **Root cause**: The Express middleware parses `application/x-www-form-urlencoded` bodies as objects via `express.urlencoded()`, but the server uses `express.raw()` for FHIR types and `express.json()` for JSON. There is no `express.urlencoded()` middleware configured, so the body arrives as a raw Buffer or string rather than a parsed object.
- **Workaround**: POST _search with `Content-Type: application/json` works on dev.

#### Difference: `text` search parameter
- **Prod**: Returns all CodeSystems (total=2010) regardless of text value, suggesting it ignores the `text` parameter.
- **Dev**: Properly filters by title+description (returns 20 for `text=blood`).
- **Assessment**: Dev behavior appears correct per the FHIR search spec.

#### Difference: `jurisdiction` search parameter
- **Prod**: Returns 0 for `jurisdiction=US`.
- **Dev**: Returns 6 CodeSystems matching US jurisdiction.
- **Assessment**: Prod may not implement jurisdiction search. Dev searches CodeableConcept.coding[].code and .display.

#### Difference: `system` parameter behavior
- **Prod**: Returns 1 result for `system=http://snomed.info/sct` (appears to treat it like `url`).
- **Dev**: Returns all CodeSystems (2007), because `system` is explicitly skipped in searchCodeSystems.
- **Assessment**: The dev code comments say "system doesn't do anything for CodeSystem search". Prod seems to repurpose it as a url search.

#### Difference: `_sort` parameter
- **Prod**: Appears to not implement sorting -- all results return in the same default order regardless of `_sort` value.
- **Dev**: Implements sorting for fields: id, url, version, date, name, vurl. The `vurl` sort does a composite url+version sort.

#### Difference: `_elements` filtering
- **Prod**: Returns extra fields beyond requested elements (always includes meta, status, content).
- **Dev**: Correctly filters to only resourceType, id, and requested elements.

#### Difference: `_count` edge cases
- `_count=5000` with `_elements`: Prod caps at 200 entries, dev caps at 2000 (matching the code).
- `_count=0`: Prod returns 10 entries (fallback), dev returns 20 entries (due to `parseInt("0")||20` = `0||20` = 20).
- `_count=-1`: Prod returns 10, dev returns 1 (via `Math.max(1, -1)`).

#### Difference: `_offset` beyond total
- **Prod**: Returns entries even when offset exceeds total (does not paginate properly).
- **Dev**: Returns 0 entries (correct behavior).

#### Pagination link differences
- **Prod**: Self links use relative URLs without query params; uses `offset` (no underscore) in links.
- **Dev**: Uses full absolute URLs with proper `_offset` parameter; includes `previous` link when applicable.

---

## 3. Resource Read (`tx/workers/read.js`, 27% coverage)

### Code Paths Targeted

| Path | Lines | Description | Status |
|------|-------|-------------|--------|
| `handle()` dispatch by type | 35-80 | Route to CS/VS/CM handler | Tested |
| `handleCodeSystem()` found by ID | 86-89 | Direct CS read | Tested |
| `handleCodeSystem()` x- prefix path | 91-127 | Factory CS with x- prefix | Tested |
| `handleCodeSystem()` iteratable factory | 103-125 | Build concept list from factory | Tested |
| `handleCodeSystem()` non-iteratable factory | 94-102 | Return stub with not-present | Tested |
| `handleCodeSystem()` not found | 130-137 | 404 for unknown ID | Tested |
| `handleValueSet()` found | 143-151 | VS read with provider loop | Tested |
| `handleValueSet()` not found | 153-160 | 404 for unknown VS ID | Tested |
| ConceptMap read | 49-56 | 501 Not Implemented | Tested |
| Default (unknown type) | 58-66 | 404 for unknown resource type | Not reachable via routes |

### Findings

#### Standard reads match
CodeSystem reads by ID (snomedct, contact-point-system, v3-ActRelationshipType) and ValueSet reads (administrative-gender) produce matching results between prod and dev.

#### Factory CodeSystem reads (x- prefix) are dev-only
The `x-` prefix code path is unique to the JavaScript implementation. Production returns 404 for all `x-` prefixed IDs. On dev:
- `x-us-states`: Returns 200 with concepts (iteratable=true), 62 concepts listed.
- `x-currencies`, `x-countries`, `x-areas`, `x-mimetypes`, `x-languages`, `x-ucum`, `x-hgvs`, `x-unii`, `x-loinc2.81`, `x-RxNorm`: Return 200 with content: not-present (iteratable=false).
- `x-urls`: Returns 404 (factory ID "urls" not found -- possibly a registration issue).

#### BUG: Typo in factory CodeSystem content value
- **File**: `tx/workers/read.js`, line 107
- **Code**: `json.content = "conplete"` (missing 'l', should be "complete")
- **Impact**: The `x-us-states` CodeSystem (and any other iteratable factory) returns `content: "conplete"` instead of `content: "complete"`. This is an invalid FHIR CodeSystem content code.

#### ConceptMap read difference
- **Prod**: Returns 404 "not found".
- **Dev**: Returns 501 "ConceptMap read not yet implemented".
- **Assessment**: Different HTTP status codes for unimplemented feature. The 501 is more semantically correct.

---

## 4. Paths NOT Exercised

| Path | Reason |
|------|--------|
| `doSubsumes()` system mismatch for codingB only | Requires codingA to match but codingB to differ, which is blocked by the earlier same-system check for codingA/codingB |
| `handleInstanceLevelSubsumes()` with SNOMED factory | Instance-level uses `getCodeSystemById()` which returns the resource, not the factory; the FhirCodeSystemProvider can't locate codes in not-present CodeSystems |
| Default resource type in search (line 77-78) | Routes only register CodeSystem, ValueSet, ConceptMap |
| Error catch in search `handle()` (line 91-101) | Would require an internal exception during search |
| Error catch in read `handle()` (line 68-79) | Would require an internal exception during read |
| `setupAdditionalResources()` in subsumes | Requires a Parameters body with tx-resource or cache-id parameters (used by validator clients) |
| `loadSupplements()` in instance subsumes | Requires CodeSystem supplements to be loaded in additional resources |

---

## Summary of Suspected Bugs

1. **Typo in read.js line 107**: `"conplete"` should be `"complete"` for factory CodeSystem content value.
2. **POST _search crashes**: Form-encoded POST body not parsed properly -- `application/x-www-form-urlencoded` not handled.
3. **`_count=0` behavior**: `parseInt("0")||20` evaluates to 20, so `_count=0` returns 20 results instead of the expected summary-only (0 entries) or a minimum of 1.

## Summary of Behavioral Differences (Not Necessarily Bugs)

1. **codingA/codingB in type-level POST**: Dev handles them (more spec-compliant), prod does not.
2. **Instance-level $subsumes**: Dev handles complete CodeSystems correctly; prod fails with errors.
3. **`text` search**: Dev filters correctly; prod ignores the parameter.
4. **`jurisdiction` search**: Dev matches CodeableConcept codings; prod returns 0.
5. **`system` param on CS search**: Dev skips it (per code comment); prod treats as url search.
6. **`_sort`**: Dev implements; prod does not.
7. **`_elements` filtering**: Dev filters correctly; prod includes extra fields.
8. **Pagination**: Dev generates proper absolute URLs with `_offset`; prod uses relative URLs with `offset`.
9. **ConceptMap search**: Dev returns empty (hardcoded); prod returns 86 results.
10. **ConceptMap read**: Dev returns 501; prod returns 404.
11. **x- factory reads**: Dev-only feature; prod returns 404 for all x- IDs.
