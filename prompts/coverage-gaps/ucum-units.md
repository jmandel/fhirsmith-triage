# Coverage Gap: UCUM Unit Handling

Read `prompts/coverage-exploration.md` first for the general approach and output format.
Use area name `ucum-units` for output files.

## The gap

The UCUM (Unified Code for Units of Measure) pipeline has significant untested code:

| File | Coverage | Role |
|------|----------|------|
| `tx/cs/cs-ucum.js` | 48% | UCUM CodeSystem provider (validate, lookup, expand, filter) |
| `tx/library/ucum-service.js` | 50% | UCUM service (parse, validate, analyse, convert, compare) |
| `tx/library/ucum-parsers.js` | 60% | UCUM expression parser, composer, converter, validator |
| `tx/library/ucum-types.js` | 46% | Decimal arithmetic, unit model types, special handlers |

UCUM is a grammar-based code system — rather than a fixed set of codes, any syntactically
valid UCUM expression is a valid code. This means the parser/validator/converter logic is
critical and complex. The existing traffic probably only exercises simple units like `mg`
or `kg`, missing complex expressions, conversions, and edge cases.

## Where to start

### 1. Read the UCUM CodeSystem provider

Open `tx/cs/cs-ucum.js`. Key methods:

- **`locate()`** (line ~228) — validates a UCUM code by calling `ucumService.validate()`.
  Returns context if valid, error message if not.
- **`display()`** (line ~126) — returns human-readable display for a unit. Checks
  commonUnitList first, then supplements, then falls back to `ucumService.analyse()`.
- **`designations()`** (line ~184) — returns display designations including common unit names.
- **`filter()`** (line ~276) — supports `canonical` property with `equals` operator. This
  filters units by their canonical form.
- **`searchFilter()`** (line ~256) — throws "not implemented". Text search over UCUM codes
  is not supported.
- **`specialFilter()`** (line ~265) — throws "not presently implemented".
- **`doesFilter()`** (line ~246) — only `canonical:equals` is supported.
- **`subsumesTest()`** — check if UCUM has subsumption support (unlikely, since UCUM has
  no hierarchy).
- **`properties()`** — check what properties UCUM exposes.

### 2. Read the UCUM service

Open `tx/library/ucum-service.js`. This wraps the parser/model:

- **`validate(unit)`** (line 199) — validates a UCUM expression. Returns null if valid,
  error message if not.
- **`analyse(unit)`** (line 35) — produces human-readable description (e.g., "mg" → "milligram").
- **`getCanonicalUnits(unit)`** (line 54) — returns canonical form (e.g., "kg" → "g").
- **`isComparable(units1, units2)`** (line 80) — checks if two units can be compared/converted.
- **`convert(value, sourceUnit, destUnit)`** (line 233) — converts a value between units.
- **`multiply(o1, o2)`** (line 103) — multiplies two unit expressions.
- **`divideBy(dividend, divisor)`** (line 114) — divides unit expressions.
- **`getCanonicalForm(pair)`** (line 134) — gets the canonical form of a value+unit pair.
- **`search(kind, text, isRegex)`** (line 358) — searches units by text.

### 3. Read the parsers

Open `tx/library/ucum-parsers.js`:

- **`Lexer`** (line 15) — tokenizes UCUM expressions. Handles brackets, annotations, numbers.
- **`ExpressionParser`** (line 187) — parses tokens into an AST (Term, Symbol, Factor).
- **`ExpressionComposer`** (line 306) — converts AST back to string.
- **`Converter`** (line 779) — normalizes units to canonical form for comparison/conversion.
  This is where the complex arithmetic happens.
- **`UcumEssenceParser`** (line 502) — parses the UCUM XML definition file.
- **`UcumValidator`** (line 940) — validates the UCUM model consistency.

### 4. Read the types

Open `tx/library/ucum-types.js`:

- **`Decimal`** (line 7) — arbitrary-precision decimal arithmetic. Many methods for
  multiply, divide, add, subtract with precision tracking. This is likely heavily undertested.
- **Special unit handlers** (line ~991) — `CelsiusHandler`, `FahrenheitHandler`,
  `HoldingHandler` for temperature conversions which have offset handling.

### 5. Read the FHIR spec

Fetch:
- `https://hl7.org/fhir/R4/terminologies-systems.html#ucum` — UCUM in FHIR
- `https://ucum.org/ucum` — UCUM specification (the grammar)
- `https://hl7.org/fhir/R4/codesystem-operation-validate-code.html` — for $validate-code
- `https://hl7.org/fhir/R4/codesystem-operation-lookup.html` — for $lookup

## Queries to explore

### $validate-code — simple units

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=kg
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=m
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=s
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=L
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=%
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=1
```

### $validate-code — compound units

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg/dL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mmol/L
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=kg/m2
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mL/min
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mm[Hg]
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=10*3/uL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=g/dL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=ug/mL
```

### $validate-code — with display

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg&display=milligram
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg/dL&display=milligram per deciliter
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg&display=wrong display
```

### $validate-code — invalid units

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=xyz
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg/
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=/dL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg//dL
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=
```

### $validate-code — special units (temperature, etc.)

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=Cel
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=[degF]
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=K
```

### $validate-code — annotations

UCUM supports annotations in curly braces:
```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code={score}
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mL{drip}
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=/min{beat}
```

### $validate-code — exponents and powers

```
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=m2
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=m3
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=cm2
GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=m-1
```

### $lookup — UCUM codes

```
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=mg
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=mg/dL
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=mmol/L
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=mm[Hg]
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=Cel
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=[degF]
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code={score}
GET /r4/CodeSystem/$lookup?system=http://unitsofmeasure.org&code=10*3/uL
```

### $expand — UCUM ValueSet

UCUM is grammar-based so it can't be fully expanded. But it may have a "common units"
ValueSet or support filtered expansion.

```
# Try expanding UCUM (should either error or return common units)
POST /r4/ValueSet/$expand with ValueSet compose including http://unitsofmeasure.org

# Try with canonical filter
POST /r4/ValueSet/$expand with ValueSet compose containing:
  filter: { property: "canonical", op: "equals", value: "g" }
```

### CodeSystem read/search

```
GET /r4/CodeSystem?url=http://unitsofmeasure.org
GET /r4/CodeSystem?url=http://unitsofmeasure.org&_elements=url,version,name,content
```

### $subsumes — UCUM (if supported)

UCUM doesn't have hierarchy, so this should probably error or return not-subsumed:
```
GET /r4/CodeSystem/$subsumes?system=http://unitsofmeasure.org&codeA=mg&codeB=g
```

## Important UCUM codes to use

**Simple base units:** g, m, s, A, K, cd, mol, rad, sr
**Prefixed units:** mg, kg, cm, mm, um, nm, mL, uL, ms
**Clinical units:** mm[Hg], mg/dL, mmol/L, mL/min, 10*3/uL, g/dL, ug/mL, ng/mL,
  mEq/L, U/L, IU/L, /min, /uL
**Temperature:** Cel, [degF], K
**Annotations:** {score}, {copies}/mL, {cells}/uL, /min{beat}
**Special:** %, [pH], [IU], 1 (unity)

## Strategy notes

- **The UCUM parser exercises ucum-parsers.js heavily** — every $validate-code and $lookup
  call parses the unit expression. Complex expressions (compound, exponents, brackets,
  annotations) exercise deeper parser paths.
- **The converter in ucum-parsers.js** is likely the biggest coverage gap — it's only
  exercised when `getCanonicalUnits()`, `isComparable()`, or `convert()` are called.
  Look for FHIR operations that trigger canonical form computation.
- **Decimal arithmetic** in ucum-types.js is exercised during conversion. Test conversions
  that require precision (e.g., very large or very small values).
- **Temperature special handlers** (Celsius, Fahrenheit) have offset logic that differs
  from simple unit conversion — worth specific testing.
- **The canonical filter** (`property=canonical, op=equals`) in cs-ucum.js is a unique
  code path that other providers don't have.
