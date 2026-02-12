# ConceptMap $translate Coverage Gap Findings

## Summary

The ConceptMap translation pipeline in the dev server (FHIRsmith/JS) has several significant bugs compared to the production server (Pascal). Testing was performed against `https://tx.fhir.org/r4` (prod) and `https://tx-dev.fhir.org/r4` (dev) using a combination of GET and POST requests.

## Critical Bugs

### 1. Relationship/Equivalence Name Mismatch (translateUsingGroups)

**File**: `tx/workers/translate.js`, line 270
**Severity**: Critical

The `translateUsingGroups` method checks `map.relationship` against a list of R4 equivalence names:
```js
['null', 'equivalent', 'equal', 'wider', 'subsumes', 'narrower', 'specializes', 'inexact']
```

But `_convertEquivalenceToRelationship` in `conceptmap.js` converts R4 equivalence values to R5 relationship values:
- `wider` -> `source-is-broader-than-target`
- `narrower` -> `source-is-narrower-than-target`
- `subsumes` -> `source-is-broader-than-target`
- `specializes` -> `source-is-narrower-than-target`
- `inexact` -> `not-related-to`
- `relatedto` -> `related-to`
- `equal` -> `equivalent`

Since the check list uses R4 names but the ConceptMap stores R5 values in `relationship`, only `equivalent` (same in both R4 and R5) ever matches. All other equivalence types silently produce no translation results.

**Evidence**: POST with tx-resource having `wider` + `narrower` equivalences:
- Prod returns both matches
- Dev returns "No translations found"

POST with all 6 non-equivalent equivalence types:
- Prod returns 3 matches (inexact, specializes, subsumes)
- Dev returns 0 matches

### 2. Comment Field Name Wrong (translateUsingGroups)

**File**: `tx/workers/translate.js`, line 287
**Severity**: Medium

The code checks `map.comments` (plural) but the R4 ConceptMap field is `comment` (singular). The R5 conversion does not rename this field. Result: comments/messages are never included in translation output.

**Evidence**: POST with tx-resource having `comment: "Test comment"`:
- Prod includes `{"name":"message","valueString":"This is a test comment"}` in the match
- Dev omits the message entirely

### 3. Product Field Name Wrong (translateUsingGroups)

**File**: `tx/workers/translate.js`, line 293
**Severity**: Medium

The code iterates over `map.products` (plural) but the R4 ConceptMap field is `product` (singular). Result: product dependencies are never included in translation output.

**Evidence**: POST with tx-resource having a `product` array:
- Prod includes the product part in the match output
- Dev omits it entirely

### 4. ConceptMap Search Not Implemented

**File**: `tx/workers/search.js`, line 72-74
**Severity**: High

ConceptMap search always returns an empty result set:
```js
case 'ConceptMap':
  // Not implemented yet - return empty set
  matches = [];
  break;
```

**Evidence**: All ConceptMap searches (by url, source, target, name, status, publisher) return `total: 0` on dev, while prod returns results.

### 5. ConceptMap Read Not Implemented

**File**: `tx/workers/read.js`, line 48-56
**Severity**: High

ConceptMap read returns HTTP 501 "ConceptMap read not yet implemented".

**Evidence**: `GET /r4/ConceptMap/cm-name-use-v2` returns 200 with full resource on prod, 501 on dev.

### 6. Instance-Level Parameter Name Inconsistency

**File**: `tx/workers/translate.js`, line 222
**Severity**: Medium

The instance-level translate (`handleInstanceLevelTranslate`) checks for `system` (R4 name) at line 222:
```js
if (!params.has('system')) {
```

But the type-level translate (`handleTypeLevelTranslate`) checks for `sourceSystem` (R5 name) at line 126:
```js
if (!params.has('sourceSystem')) {
```

This means the same parameter name works differently depending on whether you use type-level or instance-level invocation.

**Evidence**:
- Type-level: `sourceSystem=...` works, `system=...` fails
- Instance-level: `system=...` works, `sourceSystem=...` fails

### 7. R5 Output Format on R4 Endpoint

**File**: `tx/workers/translate.js`, line 283-285
**Severity**: Medium

The translation output uses R5 field names:
```js
matchParts.push({ name: 'relationship', valueCode: map.relationship });
```

But R4 clients expect:
```js
{ name: 'equivalence', valueCode: ... }
```

**Evidence**: All successful translations on dev return `"relationship"` while prod returns `"equivalence"`.

### 8. $closure Routes to $translate Handler

**File**: `tx/tx.js`, lines 555-572
**Severity**: Low

The `$closure` operation routes are handled by `TranslateWorker.handle()`, which is the same handler as `$translate`. This means $closure requests are treated as translate requests rather than getting their own proper handler.

**Evidence**: `POST /r4/ConceptMap/$closure` on dev returns "Must provide sourceCode..." (a translate error) instead of a proper closure operation response.

## Behavioral Differences (Not Necessarily Bugs)

### A. listTranslations Without targetSystem or targetScope

When neither `targetSystem` nor `targetScope` is specified, the `listTranslations` method in `conceptmap.js` requires either:
1. `all = canonicalMatches(targetScope, this.targetScope)` to be true, OR
2. Both `canonicalMatches(vurl, g.source)` AND `canonicalMatches(targetSystem, g.target)` to be true

When targetSystem is null, `canonicalMatches(null, g.target)` returns false. This means translations only work when targetSystem or matching targetScope is provided. This may be intentional but differs from prod behavior in some cases.

### B. Error Priority Differences

When no parameters are provided:
- Prod checks for ConceptMap first: "Unable to find a conceptMap..."
- Dev checks for source coding first: "Must provide sourceCode..."

When ConceptMap URL doesn't exist:
- Prod: generic "Unable to find a conceptMap..." (HTTP 422)
- Dev: specific "ConceptMap not found: ..." (HTTP 404)

### C. Parameter Order in Output

- Prod puts `result` first, then `match` entries
- Dev puts `match` entries first, then `result`

### D. Duplicate Matches

When translating without explicit URL but with sourceScope + targetSystem (test 8), dev returns 4 duplicate matches for the same code. This is because `findConceptMapForTranslation` finds the same ConceptMap multiple times from the in-memory map (stored under multiple keys: url, id, url|version, url|major.minor).

### E. conceptMapVersion Handling

When a non-existent version is specified (e.g., `conceptMapVersion=99.99.99`):
- Prod returns not-found error
- Dev still finds and uses the ConceptMap (falls back to URL-only match)

## Code Paths Exercised

| Code Path | Coverage Status |
|-----------|----------------|
| `handleTypeLevelTranslate` - sourceCode + sourceSystem | Exercised |
| `handleTypeLevelTranslate` - sourceCoding | Exercised (POST) |
| `handleTypeLevelTranslate` - sourceCodeableConcept | Exercised (POST) |
| `handleTypeLevelTranslate` - url parameter | Exercised |
| `handleTypeLevelTranslate` - conceptMapVersion | Exercised |
| `handleTypeLevelTranslate` - sourceScope/targetScope | Exercised |
| `handleTypeLevelTranslate` - targetSystem | Exercised |
| `handleTypeLevelTranslate` - findConceptMapsInAdditionalResources | Exercised (tx-resource) |
| `handleTypeLevelTranslate` - findConceptMapForTranslation | Exercised (no url) |
| `handleInstanceLevelTranslate` - sourceCode + system | Exercised |
| `handleInstanceLevelTranslate` - sourceCoding | Exercised (POST) |
| `handleInstanceLevelTranslate` - not found | Exercised |
| `translateUsingGroups` - equivalent match | Exercised |
| `translateUsingGroups` - wider/narrower/etc | Exercised (BUG: never matches) |
| `translateUsingGroups` - comments | Exercised (BUG: wrong field name) |
| `translateUsingGroups` - products | Exercised (BUG: wrong field name) |
| `translateUsingCodeSystem` - internalSource | Not exercised (no ConceptMaps with internalSource available) |
| `doTranslate` - exception handling | Not directly exercised |
| `isOkTarget` | Not exercised (always returns false) |
| `checkCode` | Not exercised (not called from translate path) |
| Error handling - Issue exception | Exercised (parameter validation errors) |
| Error handling - generic exception | Not directly exercised |
| ConceptMap search | Exercised (returns empty - not implemented) |
| ConceptMap read | Exercised (returns 501 - not implemented) |

## Code Paths Not Exercisable via HTTP

- `translateUsingCodeSystem` requires a ConceptMap with `internalSource` property, which is set during code system provider initialization for terminology systems like SNOMED CT that have built-in translation support. This cannot be tested with simple HTTP requests without a loaded code system that has this capability.
- `checkCode` method is defined but not called from the translate execution path.
- `isOkTarget` always returns false and appears to be dead code.

## Files Analyzed

- `/home/jmandel/hobby/FHIRsmith-main/tx/workers/translate.js` - Main translate worker (23% coverage)
- `/home/jmandel/hobby/FHIRsmith-main/tx/library/conceptmap.js` - ConceptMap resource model (37% coverage)
- `/home/jmandel/hobby/FHIRsmith-main/tx/cm/cm-database.js` - Database-backed CM provider (21% coverage)
- `/home/jmandel/hobby/FHIRsmith-main/tx/cm/cm-package.js` - Package-backed CM provider (35% coverage)
- `/home/jmandel/hobby/FHIRsmith-main/tx/workers/worker.js` - Base worker class
- `/home/jmandel/hobby/FHIRsmith-main/tx/workers/search.js` - Search worker
- `/home/jmandel/hobby/FHIRsmith-main/tx/workers/read.js` - Read worker
- `/home/jmandel/hobby/FHIRsmith-main/tx/tx.js` - Route setup
- `/home/jmandel/hobby/FHIRsmith-main/tx/cm/cm-api.js` - Abstract CM provider interface
