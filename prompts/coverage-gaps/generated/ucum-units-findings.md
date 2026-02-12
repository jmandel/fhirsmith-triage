# UCUM Units Coverage Gap Findings

## Summary

Systematic testing of 75+ queries against the UCUM CodeSystem provider revealed **5 categories of differences** between prod (tx.fhir.org/r4) and dev (tx-dev.fhir.org/r4). Several are likely translation bugs in the JavaScript port.

## Findings

### 1. CRITICAL: $subsumes returns "not-subsumed" for identical codes (BUG)

**Code path:** `cs-ucum.js` line 418-423, `subsumesTest()` method

When two identical UCUM codes are compared via `$subsumes`, prod correctly returns `"equivalent"` but dev always returns `"not-subsumed"`.

The root cause is clear from the source code:
```javascript
async subsumesTest(codeA, codeB) {
    await this.#ensureContext(codeA);
    await this.#ensureContext(codeB);
    return 'not-subsumed'; // No subsumption in UCUM
}
```

The method unconditionally returns `'not-subsumed'` without first checking if the two codes are the same. The prod server (Pascal implementation) likely checks for code equality before returning the subsumption result, returning `'equivalent'` when codeA === codeB.

**Affected queries:**
- `GET /r4/CodeSystem/$subsumes?system=http://unitsofmeasure.org&codeA=mg&codeB=mg` -- prod: equivalent, dev: not-subsumed
- Same for any identical pair (kg/kg, Cel/Cel, mL/mL, m2/m2, etc.)

### 2. CRITICAL: $expand with canonical filter returns 500 (BUG)

**Code path:** `cs-ucum.js` lines 276-342 -- `filter()`, `executeFilters()`, `filterMore()`, `filterConcept()`, `filterLocate()`, `filterCheck()` methods

When expanding a ValueSet with a UCUM `canonical` filter (e.g., `property=canonical, op=equals, value=g`), prod successfully returns matching units (e.g., [dr_av], [gr], [lb_av], [oz_av], etc.) with a 200 status and `valueset-toocostly`/`valueset-unclosed` extensions. Dev returns HTTP 500 for all canonical filter expansions.

This means the entire canonical filter code path in `cs-ucum.js` is broken on dev. The filter methods (`filter()`, `filterMore()`, `filterConcept()`, `filterLocate()`, `filterCheck()`) are never successfully exercised.

Similarly, `$validate-code` against a ValueSet containing a canonical filter returns 200 on prod but 400 on dev.

**Affected queries:**
- `POST /r4/ValueSet/$expand` with `canonical=g` filter -- prod: 200, dev: 500
- `POST /r4/ValueSet/$expand` with `canonical=m` filter -- prod: 200, dev: 500
- `POST /r4/ValueSet/$expand` with `canonical=s` filter -- prod: 200, dev: 500
- `POST /r4/ValueSet/$expand` with `canonical=K` filter -- prod: 200, dev: 500
- `POST /r4/ValueSet/$expand` with `canonical=mol` filter -- prod: 200, dev: 500
- `POST /r4/ValueSet/$validate-code` with canonical=g filter ValueSet -- prod: 200, dev: 400

### 3. SIGNIFICANT: $lookup display uses FormalStructureComposer instead of human-readable names (BUG)

**Code path:** `cs-ucum.js` lines 126-158, `display()` method; `ucum-parsers.js` lines 394-449, `FormalStructureComposer`

For every UCUM code, the dev server's `$lookup` display is produced by `FormalStructureComposer.compose()`, which wraps each unit symbol in parentheses. The prod server produces clean human-readable display names.

Examples:
| Code | Prod display | Dev display |
|------|-------------|-------------|
| mg | milligram | (milligram) |
| mg/dL | milligram per deciliter | (milligram) / (deciliter) |
| mmol/L | millimole per liter | (millimole) / (liter) |
| mm[Hg] | millimeter of mercury | (millimeter of mercury column) |
| 10*3/uL | Thousands Per MicroLiter | (the number ten for arbitrary powers ^ 3) / (microliter) |
| kg/m2 | kilogram / (meter ^ 2) | (kilogram) / (meter ^ 2) |
| {score} | "score" | 1 |
| {copies}/mL | copies per milliliter | 1 / (milliliter) |
| {titer} | titer | 1 |

Root cause: The `display()` method in `cs-ucum.js` calls `ucumService.analyse()` which uses `FormalStructureComposer`. The Pascal prod server likely has a different display resolution mechanism -- possibly it looks up the unit name from the model definition directly rather than using the formal structure composer. The `FormalStructureComposer._composeSymbol()` method always wraps in parentheses (line 426-435).

Additionally, annotation-only codes (like `{score}`) lose their annotation text entirely because the parser treats annotations as `Factor(1)` (line 214 of ucum-parsers.js), discarding the annotation string.

### 4. SIGNIFICANT: $lookup returns extra designations (DIFFERENCE)

**Code path:** `cs-ucum.js` lines 184-206, `designations()` method

Dev returns 2 designations for every UCUM code (the code itself as "preferredForLanguage" and the analysis output as another "preferredForLanguage" designation). Prod returns 0 designations for UCUM codes.

This causes a downstream effect: when `$validate-code` is called with a `display` parameter matching the FormalStructureComposer output (e.g., `display=(milligram)` for code `mg`), dev accepts it as valid while prod rejects it.

**Affected queries:**
- `GET /r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=mg&display=(milligram)` -- prod: false, dev: true
- Same pattern for all UCUM codes with their parenthesized analysis form

### 5. MINOR: Error message format and HTTP status differences

Several minor differences in error handling:

- **$lookup for invalid code:** prod returns HTTP 400, dev returns HTTP 404
- **$subsumes with invalid code:** prod returns `"Invalid code"` diagnostic, dev returns `"Invalid code: 'xyz' not found in CodeSystem 'http://unitsofmeasure.org'"`
- **$validate-code display mismatch messages:** prod says "Valid display is 'mg'", dev says "Valid display is one of 2 choices: 'mg' (en) or '(milligram)' (en)"
- **Bare UCUM $expand (no filter):** prod returns HTTP 422 with "too-costly" issue, dev returns HTTP 400

## Code Paths Successfully Confirmed (No Differences)

The following code paths produce identical results between prod and dev:

- **$validate-code for all tested valid UCUM expressions** (simple units, compound units, prefixed units, bracket units, exponents, negative exponents, parenthesized groups, special handler units, annotations)
- **$validate-code for invalid codes** (xyz, mg/, empty) -- both return result=false
- **$validate-code for deprecated codes** (ppb, pptr) -- both return result=false
- **$validate-code with abstract parameter** -- both handle correctly
- **$validate-code with displayLanguage parameter** -- both handle correctly
- **$subsumes for non-identical codes** (mg vs g) -- both return "not-subsumed"
- **$validate-code within enumerated ValueSets** -- both correctly include/exclude codes
- **POST $validate-code with coding and codeableConcept parameters** -- both match

## Code Paths Not Exercised

The following code paths could not be directly exercised via HTTP:

1. **`extendLookup()` canonical property path** (cs-ucum.js line 430-436): Both servers fail to return the canonical property when `property=canonical` is requested in `$lookup`. On dev, this is because `responseParams` is a plain array without an `addProperty` method, so the guard `typeof params.addProperty === 'function'` always fails. On prod, the canonical property is also not returned, suggesting this may be an upstream issue as well.

2. **`searchFilter()` and `specialFilter()`** (cs-ucum.js lines 256-273): These methods throw "not implemented" errors. No FHIR operation triggers these code paths because UCUM cannot be text-searched.

3. **`commonUnitList` paths** (cs-ucum.js lines 132-138, 193-199, 306-327, etc.): The `commonUnitList` appears to always be null/empty on both servers. The `_setupCommonUnits()` method has commented-out code. These paths relate to a "common units" ValueSet feature that is not configured.

4. **`convert()` method** (ucum-service.js lines 233-279): This is not exposed via any standard FHIR terminology operation. It is only called internally for canonical form computation.

5. **Decimal arithmetic edge cases** (ucum-types.js): Many `Decimal` methods for add, subtract, and precision handling are only exercised indirectly through canonical form computation during `$expand` with canonical filters (which is broken on dev).

6. **`multiply()` and `divideBy()` methods** (ucum-service.js lines 103-126): These are utility methods not exposed through FHIR operations.
