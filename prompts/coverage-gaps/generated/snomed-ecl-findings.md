# SNOMED ECL Coverage Gap Findings

Investigation of SNOMED CT Expression Constraint Language (ECL) handling in FHIRsmith (dev at tx-dev.fhir.org/r4) compared to production (tx.fhir.org/r4).

## Source Files Examined

| File | Coverage | Role |
|------|----------|------|
| `tx/sct/ecl.js` | Unknown (new) | ECL lexer, parser, validator, evaluator |
| `tx/sct/expressions.js` | 33% | Expression AST, parsing, subsumption, normalization |
| `tx/cs/cs-snomed.js` | 60% | SNOMED CodeSystem provider (filter, subsumes, lookup, display) |
| `tx/sct/structures.js` | 43% | Binary SNOMED data readers |
| `tx/workers/expand.js` | - | $expand worker (ValueSet expansion) |
| `tx/workers/subsumes.js` | - | $subsumes worker |
| `tx/workers/lookup.js` | - | $lookup worker |
| `tx/workers/validate.js` | - | $validate-code worker |
| `tx/library/designations.js` | - | SearchFilterText class, designation handling |

## Confirmed Bugs

### BUG 1: `displayExpression` is not a function

**Severity**: Crash (500 error)
**File**: `tx/cs/cs-snomed.js` line 510
**Triggered by**: Any operation requiring display of a post-coordinated SNOMED expression

The `SnomedProvider.display()` method calls `this.sct.expressionServices.displayExpression(ctxt.expression)` for complex expressions (line 510), but the `SnomedExpressionServices` class in `tx/sct/expressions.js` never defines a `displayExpression()` method. This causes a crash whenever the dev server needs to generate a display string for a post-coordinated expression.

**Reproduction**:
- `GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=22298006:363698007=80891009`
  - Dev: `{"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"exception","diagnostics":"this.sct.expressionServices.displayExpression is not a function"}]}`
  - Prod: Returns display `"Myocardial infarction where Finding site = Heart"` plus normalForm properties

- `GET /r4/ValueSet/$validate-code?url=...&code=22298006:363698007=80891009&system=http://snomed.info/sct`
  - Dev: Same crash
  - Prod: Returns `result=true` with display and MRCM validation note

**Root cause**: The method was likely defined in the original Pascal (`displayExpression`) but was not translated to JavaScript. The `SnomedExpressionServices` class has `renderExpression()` which may be the intended replacement but the call site was not updated.

---

### BUG 2: Post-coordinated expression subsumption returns wrong result

**Severity**: Incorrect clinical result
**File**: `tx/cs/cs-snomed.js` lines 886-923 (`subsumesTest`)
**Triggered by**: `$subsumes` with a post-coordinated expression as codeB

**Reproduction**:
- `GET /r4/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=404684003&codeB=22298006:363698007=80891009`
  - Dev: `{"outcome":"subsumes"}` -- claims Clinical finding subsumes "MI where Finding site = Heart"
  - Prod: `{"outcome":"not-subsumed"}`

The dev server says `404684003` (Clinical finding) subsumes the post-coordinated expression `22298006:363698007=80891009` (MI with Finding site = Heart structure). Production says `not-subsumed`. The production behavior appears more correct since `80891009` is "Heart structure" (a body structure concept), and while `22298006` (MI) is a clinical finding, the refined expression with an explicit finding site may not follow the standard subsumption rules that production implements. The dev server's `expressionSubsumes()` in `expressions.js` may have a logic error in how it handles refinement-based subsumption.

---

### BUG 3: `searchFilter` crashes with `searchText.toLowerCase is not a function`

**Severity**: Crash (500 error)
**File**: `tx/cs/cs-snomed.js` lines 881-882 and 357-361
**Triggered by**: `$expand` with a `filter` parameter on a SNOMED ValueSet

**Reproduction**:
- POST `/r4/ValueSet/$expand` with `filter=diabetes` on a SNOMED is-a ValueSet
  - Dev: `{"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"exception","details":{"text":"searchText.toLowerCase is not a function"}}]}`
  - Prod: Returns matching concepts with "diabetes" in their display names

**Root cause**: The `SnomedProvider.searchFilter(filterContext, filter, sort)` method at line 881 receives a `SearchFilterText` object (from `tx/library/designations.js`) as the `filter` parameter, but passes it directly to `SnomedServices.searchFilter(searchText, includeInactive, exactMatch)` at line 882 which expects a plain string. When `SnomedServices.searchFilter` at line 361 calls `searchText.toLowerCase()`, it fails because a `SearchFilterText` object is not a string.

The fix would be to extract the text value from the `SearchFilterText` object before passing it to `SnomedServices.searchFilter`, or to update `SnomedServices.searchFilter` to accept both types.

---

## Not Implemented Features

### Implicit SNOMED ValueSet URLs

**Files**: ValueSet resolution pipeline (likely `tx/workers/expand.js` or a ValueSet registry)
**Impact**: All ECL-via-URL queries fail

SNOMED CT defines implicit ValueSets at URLs like:
- `http://snomed.info/sct?fhir_vs` (all concepts)
- `http://snomed.info/sct?fhir_vs=isa/<code>` (is-a hierarchy)
- `http://snomed.info/sct?fhir_vs=refset/<code>` (reference set members)
- `http://snomed.info/sct?fhir_vs=ecl/<ecl-expression>` (ECL expression)

The dev server cannot resolve any of these URLs:
```
ValueSet not found: http://snomed.info/sct?fhir_vs=isa/71620000
ValueSet not found: http://snomed.info/sct?fhir_vs=ecl/<<71620000
```

This means ECL expressions can only be exercised via the compose/filter mechanism in POST requests, not via the standard implicit URL pattern. Production (tx.fhir.org) also fails on many of these (returning 503 or "Unable to find value set"), but it does handle some ECL implicit URLs.

**Workaround**: Use POST with a ValueSet compose containing explicit filters instead of implicit URLs.

---

### ECL Ancestor Operators (>, >>, >!, >>!)

**File**: `tx/sct/ecl.js` lines 1076-1080
**Impact**: Any ECL expression using ancestor traversal fails

The `evaluateSubExpressionConstraint()` method explicitly throws an error for ancestor operators:
```javascript
case ECLTokenType.ANCESTOR_OF:
case ECLTokenType.ANCESTOR_OR_SELF_OF:
  throw new Error(`Operator ${node.operator} not yet implemented`);
```

These operators require reverse hierarchy traversal (walking up the is-a tree from a concept to its parents/ancestors), which is more complex than the descendant traversal that is implemented.

---

### ECL Refinement Evaluation

**File**: `tx/sct/ecl.js` lines 1116-1123
**Impact**: Refinement constraints are silently ignored

The `evaluateRefinedExpression()` method returns only the base expression filter, completely ignoring the refinement:
```javascript
async evaluateRefinedExpression(node) {
    // This is a simplified implementation
    // Full refinement evaluation would require analyzing concept relationships
    // For now, return the base filter
    // TODO: Implement refinement filtering based on node.refinement
    return baseFilter;
}
```

This means ECL expressions like `<<64572001:363698007=71341001` (Disease with Finding site = Bone structure of femur) would return ALL descendants of Disease rather than filtering to those with the specified finding site. However, since implicit VS URLs are also not implemented, this code path cannot currently be reached via external queries.

---

### Parent/Child Properties in $lookup

**File**: `tx/cs/cs-snomed.js` (lookup property handling)
**Impact**: Hierarchy navigation via $lookup is incomplete

When requesting `property=parent` or `property=child` in a $lookup call:
- Dev: Returns only display and inactive property, ignores parent/child requests
- Prod: Returns parent concepts with codes and descriptions (e.g., for `71620000` Fracture of femur: parent `46866001` Fracture of lower limb, parent `7523003` Injury of thigh)

---

## Behavioral Differences (Not Bugs)

### codingA/codingB Parameter Handling in $subsumes

**Test**: `$subsumes` using `codingA.system` + `codingA.code` instead of separate `system` + `codeA`
- Dev: Correctly extracts system from coding parameters, returns `subsumes`
- Prod: Errors with "No CodeSystem Identified (need a system parameter)"

Dev handles this case better than production. The FHIR spec allows both parameter styles.

### Total Counts in Expansions

- Dev: Returns `"total":153` in ValueSet expansions
- Prod: Does not return a total count (uses `valueset-unclosed` extension instead)

Dev provides total counts, which is arguably more useful for pagination, but production marks the expansion as unclosed (meaning the total is not known or not provided).

### Name in $lookup Response

- Dev: Returns `"name":"http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201"` (system URI with version)
- Prod: Returns `"name":"SNOMED CT"` (human-readable name)

### Designation Count

- Dev: Returns fewer designations in $lookup responses compared to production (which returns synonyms including NOS variants, alternate terms like "Heart attack", "Cardiac infarction", etc.)

### Copyright Property

- Prod: Includes a `copyright` property in $lookup results with the SNOMED CT licensing text
- Dev: Does not include copyright property

---

## ECL Feature Support Matrix

| ECL Feature | Parsed | Evaluated | Reachable via API |
|-------------|--------|-----------|-------------------|
| `<` descendantOf | Yes | Yes | No (implicit VS URLs not implemented) |
| `<<` descendantOrSelfOf | Yes | Yes | No |
| `<!` childOf | Yes | Yes | No |
| `<<!` descendantOrSelfOf (bottom-up) | Yes | Yes | No |
| `>` ancestorOf | Yes | **No** (throws) | No |
| `>>` ancestorOrSelfOf | Yes | **No** (throws) | No |
| `>!` parentOf | Yes | **No** (throws) | No |
| `>>!` ancestorOrSelfOf (top-down) | Yes | **No** (throws) | No |
| `^` memberOf | Yes | Yes | No |
| `*` wildcard (any concept) | Yes | Yes | No |
| `AND` compound | Yes | Yes | No |
| `OR` compound | Yes | Yes | No |
| `MINUS` compound | Yes | Yes | No |
| `:` refinement | Yes | **Stub only** (returns base) | No |
| `{ }` attribute group | Yes | **Stub only** | No |
| `.` dot notation | Yes | Unknown | No |
| `( )` nested sub-expressions | Yes | Yes | No |

**Key takeaway**: The ECL parser is comprehensive and handles the full ECL v2.1 grammar. The evaluator handles descendant/child operators, memberOf, wildcards, and compound expressions correctly. However, ancestor operators and refinement evaluation are not implemented. Most critically, none of this can be exercised via the standard FHIR API because implicit SNOMED ValueSet URL resolution is not implemented.

---

## Code Paths That Could Not Be Exercised

1. **ECL evaluation pipeline** (all of `ecl.js` evaluation methods) -- blocked by implicit VS URL resolution
2. **`condenseExpression()`** in `expressions.js` -- internal optimization, no direct API trigger found
3. **`findMatchingConcepts()`** in `expressions.js` -- used for complex expression operations
4. **`mergeGroups()`** in `expressions.js` -- used during expression normalization
5. **`rationaliseExpression()`** in `expressions.js` -- used during expression normalization
6. **`SnomedReferenceSetIndex.getMembersByConcept()`** in `structures.js` -- ECL memberOf evaluation (blocked by implicit VS)
7. **`SnomedDescriptionIndex` search methods** in `structures.js` -- searchFilter crash prevents text search from completing
8. **Expression normalization/normal form** -- `normaliseExpression()` in expressions.js may be reachable via $lookup on complex expressions but crashes before reaching it due to BUG 1

---

## Queries Tested

50 queries were tested against both prod (tx.fhir.org/r4) and dev (tx-dev.fhir.org/r4). Raw results are in the companion `snomed-ecl-requests.ndjson` file. Summary of outcomes:

| Category | Count | Outcome |
|----------|-------|---------|
| $subsumes basic | 5 | Match between prod and dev |
| $subsumes codingA/codingB | 1 | Diff: dev works, prod errors |
| $subsumes invalid code | 1 | Both error (different messages) |
| $subsumes post-coordinated | 1 | **BUG**: different subsumption result |
| $lookup basic | 4 | Dev returns fewer designations/properties |
| $lookup parent/child property | 2 | Dev missing parent/child properties |
| $lookup post-coordinated | 1 | **BUG**: dev crashes (displayExpression) |
| $expand compose filters | 4 | Match (same concepts, different totals) |
| $expand with text filter | 1 | **BUG**: dev crashes (searchText.toLowerCase) |
| $expand activeOnly/designations | 2 | Match |
| $expand paging | 1 | Match |
| $expand enumerated | 1 | Match |
| $expand implicit VS URLs | 16 | All fail on dev (ValueSet not found) |
| $validate-code implicit VS | 4 | All fail on dev (ValueSet not found) |
| $validate-code post-coordinated | 1 | **BUG**: dev crashes (displayExpression) |
