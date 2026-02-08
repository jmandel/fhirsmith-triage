# Coverage Gap: ConceptMap $translate

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `conceptmap-translate` for output files.

## The gap

The ConceptMap translation pipeline is barely tested:

| File | Coverage | Role |
|------|----------|------|
| `tx/workers/translate.js` | 23% | HTTP worker for $translate |
| `tx/cm/cm-database.js` | 21% | Database-backed ConceptMap provider |
| `tx/cm/cm-package.js` | 35% | Package-backed ConceptMap provider |
| `tx/library/conceptmap.js` | 37% | ConceptMap resource model |

The existing comparison traffic has almost no `$translate` requests.

## Where to start

### 1. Read the translate worker

Open `tx/workers/translate.js`. This is the HTTP handler. Trace:
- How does it extract parameters from GET query strings vs POST Parameters bodies?
- What is the difference between type-level (`/ConceptMap/$translate`) and
  instance-level (`/ConceptMap/{id}/$translate`)?
- What parameters does it support? (`code`, `system`, `coding`, `codeableConcept`,
  `source`, `target`, `targetsystem`, `url`, `conceptMapVersion`, `reverse`)
- Which parameter combinations hit which code branches?

### 2. Read the ConceptMap model

Open `tx/library/conceptmap.js`. This has the translation logic:
- How does `translate()` work? What about `providesTranslation()`?
- How does it match source concepts to target concepts?
- What are the different relationship types (equivalent, wider, narrower, etc.)?
- How does it handle `unmapped` entries (what happens when no mapping exists)?

### 3. Read the providers

Open `tx/cm/cm-database.js` and `tx/cm/cm-package.js`:
- How does `findConceptMapForTranslation()` work in each?
- What search parameters trigger `_buildSearchQuery()` in the database provider?
- What does ConceptMap search look like (`GET /ConceptMap?...`)?

### 4. Read the FHIR spec

Fetch `https://hl7.org/fhir/R4/conceptmap-operation-translate.html` to understand the
full $translate parameter space.

Also fetch `https://hl7.org/fhir/R4/conceptmap.html` to understand ConceptMap structure
(groups, elements, targets, unmapped modes).

## Queries to explore

Start with these directions, then iterate based on what you find in the code:

**Basic $translate:**
- Translate a SNOMED code to ICD-10 (a common clinical mapping)
- Translate with `system` + `code` parameters
- Translate with a full `coding` parameter
- Translate with a `codeableConcept` (multiple codings)

**Source/target scoping:**
- $translate with `source` (source ValueSet URL) to constrain which maps are used
- $translate with `target` (target ValueSet URL)
- $translate with `targetsystem` (target code system URL)
- Combinations of source + target + targetsystem

**ConceptMap selection:**
- Type-level $translate (server picks the ConceptMap)
- Instance-level $translate with a specific ConceptMap ID
- $translate with explicit `url` and `conceptMapVersion`

**Edge cases:**
- Code with no mapping (should trigger unmapped handling)
- Reverse translation (`reverse=true`)
- Code from a system not covered by any ConceptMap
- Multiple applicable ConceptMaps (how does priority work?)

**ConceptMap search:**
- `GET /ConceptMap?url=...`
- `GET /ConceptMap?system=...`
- `GET /ConceptMap?source=...`
- `GET /ConceptMap?target=...`
- Combined search parameters

**ConceptMap read:**
- `GET /ConceptMap/{id}`

## Well-known ConceptMaps to try

Look at what's loaded by checking the npm packages in the library config (`tx/tx.fhir.org.yml`).
The HL7 terminology package includes maps like:
- ICD-10 to/from SNOMED CT
- v2 tables to FHIR code systems
- v3 code systems to FHIR

Try fetching `GET /ConceptMap?_count=10` from tx.fhir.org to discover what's available.
