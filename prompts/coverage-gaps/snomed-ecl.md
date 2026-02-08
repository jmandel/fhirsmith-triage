# Coverage Gap: SNOMED CT ECL Expression Handling

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `snomed-ecl` for output files.

## The gap

SNOMED expression parsing and evaluation is mostly untested:

| File | Coverage | Role |
|------|----------|------|
| `tx/sct/expressions.js` | 33% | Expression AST, refinements, subsumption, rendering |
| `tx/sct/structures.js` | 43% | Binary data readers (descriptions, reference sets) |
| `tx/cs/cs-snomed.js` | 60% | SNOMED CodeSystem provider (lookup, validate, expand) |

The existing traffic mostly uses simple SNOMED codes. Complex ECL expressions, refinements,
attribute groups, and hierarchy operators are largely untested.

## Where to start

### 1. Read the ECL evaluator

Open `tx/sct/expressions.js`. This is large — focus on:
- The ECL parsing functions (look for `parse`, `evaluate`, `ECL` in function names)
- `evaluateSubExpressionConstraint()` — which hierarchy operators are implemented
  vs stubbed?
- `evaluateRefinedExpression()` — is refinement evaluation actually implemented?
- `findMatchingConcepts()` — how does refinement matching work?
- `expressionSubsumes()` — how does complex expression subsumption work?
- `rationaliseExpression()` / `mergeGroups()` — expression normalization
- `renderExpression()` — expression serialization

### 2. Read the SNOMED provider

Open `tx/cs/cs-snomed.js`:
- `subsumesTest()` — how does $subsumes handle complex expressions?
- `designations()` — how are designations returned for complex expressions?
- `searchFilter()` — text search across descriptions
- `expandValueSet()` paths that use ECL

### 3. Read the structures

Open `tx/sct/structures.js`:
- `SnomedReferenceSetIndex.getMembersByConcept()` — reference set membership lookup
- `SnomedDescriptions` methods — description retrieval
- What binary format operations are uncovered?

### 4. Read the FHIR spec

Fetch these for context:
- `https://hl7.org/fhir/R4/snomedct.html` — SNOMED CT usage in FHIR
- The ECL specification from SNOMED International defines the expression constraint
  language. The key operators to understand: `<` (descendantOf), `<<` (descendantOrSelfOf),
  `>` (ancestorOf), `>>` (ancestorOrSelfOf), `^` (memberOf), `:` (refinement),
  `{ }` (attribute groups), `.` (dot notation).

## Queries to explore

### Hierarchy operators in $expand

These use ECL in the `filter` parameter or in the ValueSet definition:

```
# descendantOf — children of Clinical Finding
GET /r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/<< 404684003&count=5

# ancestorOf — parents of Fracture of femur
GET /r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/>> 71620000&count=5

# childOf (immediate children only)
GET /r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/< 404684003&count=5

# parentOf (immediate parents only)
GET /r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/> 71620000&count=5
```

### Reference set membership (memberOf operator)

```
# memberOf — codes in a specific reference set
GET /r4/ValueSet/$expand?url=http://snomed.info/sct?fhir_vs=ecl/^ 447562003&count=10
```

### Refinements (the biggest untested area)

ECL refinements filter by relationships/attributes:

```
# Clinical findings with a specific associated morphology
ecl/<< 404684003 : 116676008 = 72704001

# Disorders of a specific body site
ecl/<< 64572001 : 363698007 = 71341001

# Multiple attributes
ecl/<< 404684003 : 116676008 = 72704001 , 363698007 = 71341001
```

### Attribute groups

```
# Grouped refinements
ecl/<< 404684003 : { 116676008 = 72704001 , 363698007 = 71341001 }
```

### Compound expressions

```
# AND — intersection
ecl/<< 404684003 AND << 64572001

# OR — union
ecl/<< 404684003 OR << 71388002

# MINUS — difference
ecl/<< 404684003 MINUS << 64572001
```

### $subsumes with complex expressions

```
GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003&codeB=71620000
```

Try with version parameter, try with codes from different hierarchies, try with codes
that are in a parent-child relationship vs codes that are not.

### $lookup with designations

```
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=404684003&property=designation
GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=404684003&displayLanguage=es
```

### $validate-code with ECL-based ValueSets

```
POST /r4/ValueSet/$validate-code with url pointing to an ECL-based implicit ValueSet
and a code to validate against it.
```

## Important SNOMED codes to use

These are well-known, widely-used SNOMED concepts:
- `404684003` — Clinical finding
- `71388002` — Procedure
- `64572001` — Disease (disorder)
- `71620000` — Fracture of femur
- `73211009` — Diabetes mellitus
- `22298006` — Myocardial infarction
- `116676008` — Associated morphology (attribute)
- `363698007` — Finding site (attribute)
- `72704001` — Fracture (morphology)
- `71341001` — Bone structure
- `27624003` — Chronic disease
- `370135005` — Pathological process (attribute)

## URL encoding reminder

ECL expressions in GET URLs need to be URL-encoded. Spaces become `%20`, `<` becomes
`%3C`, `>` becomes `%3E`, `:` becomes `%3A`, `^` becomes `%5E`, etc.

For readability, you may prefer POST requests with the expression in the body.
