# Coverage Gap: CodeSystem $subsumes, Search, and Read

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `codesystem-subsumes-search-read` for output files.

## The gap

The CodeSystem $subsumes operation, resource search, and resource read workers are poorly covered:

| File | Coverage | Role |
|------|----------|------|
| `tx/workers/subsumes.js` | 28% | HTTP worker for $subsumes |
| `tx/workers/search.js` | 22% | HTTP worker for resource search (CodeSystem, ValueSet, ConceptMap) |
| `tx/workers/read.js` | 27% | HTTP worker for resource read by ID |

The existing traffic exercises simple lookups and expansions but rarely touches $subsumes,
resource search with varied parameters, or direct resource read.

## Where to start

### 1. Read the $subsumes worker

Open `tx/workers/subsumes.js`. Trace these paths:

- **Type-level vs instance-level**: `handle()` (type-level `/CodeSystem/$subsumes`) vs
  `handleInstance()` (instance-level `/CodeSystem/{id}/$subsumes`) — how do they differ?
- **Parameter formats**: Two ways to specify codes:
  - `codingA` + `codingB` (Coding objects, from a Parameters POST body)
  - `codeA` + `codeB` + `system` (simple strings, from GET query params)
  - What error is returned when neither format is provided?
- **System validation**: The worker validates that both codes use the same system. What
  happens when they don't match?
- **Code existence check**: It calls `locate()` on each code. What happens when a code
  doesn't exist in the system?
- **`doSubsumes()`**: This calls `subsumesTest()` on the provider. What are the four
  possible outcomes? (equivalent, subsumes, subsumed-by, not-subsumed)

### 2. Read the search worker

Open `tx/workers/search.js`. This handles `GET /{type}?{params}`:

- **Resource type branching**: CodeSystem, ValueSet, ConceptMap — ConceptMap search returns
  empty. Focus on CodeSystem and ValueSet search.
- **Search parameters**: url, version, date, description, name, publisher, status, title,
  identifier, jurisdiction, supplements, content-mode, system, text
- **Special parameter handling**:
  - `text` searches both title AND description (combined text search)
  - `jurisdiction` matches against an array of CodeableConcepts
  - `content-mode` maps to the `content` property for CodeSystems
  - `system` parameter is ignored for CodeSystem searches
- **Pagination**: `_offset`, `_count` (max 200, or 2000 with `_elements`), link generation
  (self, first, previous, next, last)
- **Element filtering**: `_elements` parameter strips resources to only requested fields
- **Sorting**: `_sort` accepts id, url, version, date, name, vurl

### 3. Read the read worker

Open `tx/workers/read.js`. This handles `GET /{type}/{id}`:

- **CodeSystem read**: Look up by ID from the provider. What IDs are valid?
- **Factory CodeSystems**: IDs starting with `x-` trigger a "factory" path that generates
  a placeholder CodeSystem. If the factory is iterable, it generates a full concept list.
  What factory CodeSystems exist?
- **ValueSet read**: Loops through all ValueSet providers calling `fetchValueSetById()`.
- **ConceptMap read**: Returns 501 Not Implemented — worth testing to verify the error
  response format.
- **404 handling**: What does the Not Found response look like?

### 4. Read the FHIR spec

Fetch these for context:
- `https://hl7.org/fhir/R4/codesystem-operation-subsumes.html` — full $subsumes spec
- `https://hl7.org/fhir/R4/codesystem.html#search` — CodeSystem search parameters
- `https://hl7.org/fhir/R4/valueset.html#search` — ValueSet search parameters
- `https://hl7.org/fhir/R4/search.html` — General FHIR search mechanics
  (_count, _offset, _elements, _sort, etc.)

## Queries to explore

### $subsumes — basic usage

```
# Simple subsumption test: is Fracture of femur subsumed by Clinical finding?
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003&codeB=71620000

# Reversed order (should give subsumed-by instead of subsumes)
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=71620000&codeB=404684003

# Same code (should return equivalent)
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003&codeB=404684003

# Unrelated codes (should return not-subsumed)
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=71620000&codeB=22298006
```

### $subsumes — POST with Coding parameters

```
POST /r4/CodeSystem/$subsumes with Parameters body containing:
- codingA: { system: "http://snomed.info/sct", code: "404684003" }
- codingB: { system: "http://snomed.info/sct", code: "71620000" }
```

### $subsumes — instance-level

```
# Same test but against a specific CodeSystem instance
GET /r4/CodeSystem/[id]/$subsumes?codeA=404684003&codeB=71620000
```
(You'll need to discover valid CodeSystem IDs first — try `GET /r4/CodeSystem?_count=5`.)

### $subsumes — error cases

```
# Missing required parameters
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003

# Non-existent code
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003&codeB=999999999

# System mismatch between codingA and codingB (POST)
POST /r4/CodeSystem/$subsumes with codingA system=snomed, codingB system=loinc

# Non-SNOMED systems (try LOINC, HL7 code systems)
GET /r4/CodeSystem/$subsumes?system=http://loinc.org&codeA=8480-6&codeB=85354-9
```

### $subsumes — with version

```
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&version=http://snomed.info/sct/900000000000207008/version/20250201&codeA=404684003&codeB=71620000
```

### Resource search — CodeSystem

```
# List all CodeSystems
GET /r4/CodeSystem?_count=10

# Search by URL
GET /r4/CodeSystem?url=http://snomed.info/sct

# Search by name (partial match)
GET /r4/CodeSystem?name=SNOMED

# Search by publisher
GET /r4/CodeSystem?publisher=HL7

# Full-text search (searches title + description)
GET /r4/CodeSystem?text=medication

# Search by status
GET /r4/CodeSystem?status=active

# Combined search
GET /r4/CodeSystem?publisher=HL7&status=active&_count=5

# Search by content-mode
GET /r4/CodeSystem?content-mode=complete

# With _elements filter (should strip response to only listed fields)
GET /r4/CodeSystem?_count=5&_elements=url,version,name

# With pagination
GET /r4/CodeSystem?_count=5&_offset=5

# With sort
GET /r4/CodeSystem?_sort=name&_count=10

# Search by supplements (CodeSystems that supplement another)
GET /r4/CodeSystem?supplements=http://snomed.info/sct
```

### Resource search — ValueSet

```
# List all ValueSets
GET /r4/ValueSet?_count=10

# Search by URL
GET /r4/ValueSet?url=http://hl7.org/fhir/ValueSet/observation-codes

# Search by name
GET /r4/ValueSet?name=observation

# Combined search
GET /r4/ValueSet?publisher=HL7&_count=5&_elements=url,name

# Search by system (ValueSets containing codes from a system)
GET /r4/ValueSet?system=http://loinc.org&_count=5
```

### Resource search — ConceptMap (should return empty)

```
GET /r4/ConceptMap?_count=10
```

### Resource read — CodeSystem

```
# Read a known CodeSystem by ID (discover IDs from search first)
GET /r4/CodeSystem/[id]

# Try factory CodeSystem IDs (x- prefix)
# These generate placeholder resources — look for factory registrations in the codebase

# Non-existent ID
GET /r4/CodeSystem/nonexistent-id-12345
```

### Resource read — ValueSet

```
# Read a known ValueSet by ID
GET /r4/ValueSet/[id]

# Non-existent ID
GET /r4/ValueSet/nonexistent-id-12345
```

### Resource read — ConceptMap (should return 501)

```
GET /r4/ConceptMap/[id]
```

## Important systems and codes to use

- **SNOMED CT**: `http://snomed.info/sct` — codes 404684003 (Clinical finding), 71620000
  (Fracture of femur), 73211009 (Diabetes mellitus), 22298006 (Myocardial infarction),
  64572001 (Disease), 71388002 (Procedure)
- **LOINC**: `http://loinc.org` — codes 8480-6 (Systolic BP), 85354-9 (Blood pressure panel),
  29463-7 (Body weight)
- **RxNorm**: `http://www.nlm.nih.gov/research/umls/rxnorm` — try common drug codes
- **HL7 v3**: `http://terminology.hl7.org/CodeSystem/v3-ActCode` and similar

## Strategy notes

- **$subsumes has four possible results** (equivalent, subsumes, subsumed-by, not-subsumed) —
  make sure you have queries that produce each outcome.
- **Search is rich** — the most coverage-impactful queries will use parameters like `text`,
  `jurisdiction`, `_elements`, `_sort`, and `_offset` that are rarely exercised.
- **Read's factory path** (`x-` prefix IDs) is likely completely untested. Finding valid
  factory IDs will require reading the provider registration code.
- **ConceptMap search/read** returns empty/501 — test these to verify error response format
  matches between prod and dev.
