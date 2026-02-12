# Round-2 vs Round-1 Cross-Reference Summary

## Matches Found: 10 round-2 bugs match 5 distinct round-1 bugs

### Recommended to close as won't-fix (2 bugs, ~280 records)
These are direct duplicates of round-1 bugs adjudicated as "by design":

| Round-2 | Round-1 | Adjudication | Records |
|---------|---------|-------------|---------|
| 9fd2328 - SNOMED edition version skew (different code sets) | 5b3ae71 | By design (VSAC support) | 82 |
| 4f12dda - SNOMED/CPT edition version skew (version annotations) | 5b3ae71 | By design (VSAC support) | 198 |

### Needs discussion (1 bug, ~465 records)
| Round-2 | Round-1 | Adjudication | Records |
|---------|---------|-------------|---------|
| 6edc96c - HL7 terminology version skew | be888eb | Dev is correct | ~465 |

Round-1 said "dev is correct" for v2-0360, but 6edc96c is a much broader set of terminology.hl7.org version mismatches. Need to confirm the same adjudication applies to all affected CodeSystems.

### Keep open despite round-1 match (7 bugs)
These share a root cause with round-1 bugs that were "confirmed fixed", but the fix was incomplete:

| Round-2 | Round-1 | Why keep open | Records |
|---------|---------|--------------|---------|
| 2337986 - 404 vs 422 for $expand (ValueSet not found) | 0d164f0 | Fix addressed CodeSystem path only, not ValueSet path | 756 |
| cd4b7d1 - 400 vs 422 for error responses | 0d164f0 | Fix addressed 404 case only, not broader 400-vs-422 pattern | 1897 |
| f9f6206 - undefined/null as literal strings in messages | 6c31e76 | Fix addressed version list only, not all message templates | 1 |
| af1ce69 - literal "null" in inactive concept message | 6c31e76 | Same incomplete fix for null rendering | 24 |
| 1e5268a - empty status in INACTIVE_DISPLAY_FOUND message | 6c31e76 | Same incomplete fix for null rendering | 1 |
| 801aef1 - extra expression field on OperationOutcome issues | 1fff165 | Related but different manifestation | 6 |
| f33ebd3 - UNKNOWN_CODESYSTEM vs UNKNOWN_CODESYSTEM_VERSION | 5b3ae71 | Different core issue (error classification, not version skew) | 1 |

---

## Truly New Round-2 Bugs (26 bugs with no round-1 match)

### Critical / High Impact

| ID | Title | Records | Category |
|----|-------|---------|----------|
| 167be81 | Dev returns result=false for valid v3 terminology codes (hierarchy bug) | 187 | Code defect - v3 hierarchy |
| 4336772 | Dev returns only root concept for v3 hierarchical ValueSets | 246 | Code defect - v3 hierarchy |
| 36da928 | Dev returns 404 for SNOMED CT implicit ValueSet (fhir_vs URLs) | 36 | Missing feature |
| 6b31694 | Dev crashes (500) on GET $expand with filter parameter | 58 | Crash bug |
| 1932f81 | Dev returns SQLITE_MISUSE error on RxNorm $expand | 16 | Crash bug |
| e4e45bc | Dev returns 200 instead of 422 for validate-code with code but no system | 133 | Spec compliance |
| dc0132b | Dev SNOMED $lookup returns URI-based name and omits most properties | 2170 | Code defect - $lookup |

### Medium Impact

| ID | Title | Records | Category |
|----|-------|---------|----------|
| f2b2cef | Missing valueset-unclosed extension and spurious expansion.total | 292 | Content difference |
| 2ed80bd | Dev omits expansion.total when prod includes it | 47 | Content difference |
| f33161f | Dev returns 400 error instead of 200 toocostly expansion | 12 | Status mismatch |
| 44d1916 | Dev returns 200 expansion instead of 422 too-costly for large code systems | 17 | Status mismatch |
| 44136eb | Dev returns expansion codes when prod marks as too-costly | 1 | Content difference |
| c7004d3 | Dev omits valueset-toocostly extension on grammar-based code systems | 13 | Content difference |
| 1433eb6 | Dev returns 400 ValueSet-not-found for validate-code prod handles | 10 | Status mismatch |
| 80ce6b2 | Dev message omits issue texts for CodeableConcept with multiple codings | 10 | Content difference |
| 7716e08 | Dev uses R5-style property instead of R4 extension for deprecated status | 26 | Spec compliance |
| bd89513 | Dev returns extra message/issues for display language resolution | 21 | Content difference |
| 7b445b0 | SNOMED $lookup: dev returns Synonym instead of Inactive designation use | 4 | Code defect - $lookup |
| d05a4a6 | Dev omits retired status-check informational issues | 13 | Content difference |
| b6d19d8 | Dev omits system/code/version/display params on CodeableConcept validate | 5 | Content difference |

### Low Impact / Edge Cases

| ID | Title | Records | Category |
|----|-------|---------|----------|
| 3103b01 | Dev returns extra informational HGVS syntax issue | 62 | Extra info |
| e02b03e | Prod HGVS timeout (prod=500, comparison invalid) | 62 | Prod transient |
| 5f3b796 | LOINC $lookup: dev returns extra designations/properties | 1 | Content difference |
| e107342 | SNOMED $lookup: prod returns 400 where dev returns 404 | 1 | Status mismatch |
| 2f5929e | Dev returns 404 for unknown ISO 3166 version that prod resolves by fallback | 1 | Missing fallback |
| 15f5ce0 | GET /r5/CodeSystem/$subsumes returns 400 despite valid system parameter | 2 | Prod bug? |

### Notable clusters among new bugs

1. **v3 hierarchy handling (167be81 + 4336772)**: Two bugs that are likely the same root cause -- dev fails to build parent-child hierarchy from `subsumedBy` properties on v3 CodeSystems, affecting both $validate-code (187 records) and $expand (246 records). Together they impact 433 records.

2. **Too-costly expansion handling (f33161f + 44d1916 + 44136eb + c7004d3)**: Four bugs about inconsistent handling of expansions that are too large or grammar-based. Dev sometimes returns 400, sometimes returns 200 with codes, while prod uses the `valueset-toocostly` extension or 422 status. Together ~43 records.

3. **SNOMED $lookup differences (dc0132b + 7b445b0)**: Two bugs about SNOMED-specific $lookup response quality. Dev returns a URI-based name (2170 records) and uses Synonym instead of Inactive for designation use types (4 records).

4. **Crash/server error bugs (6b31694 + 1932f81)**: Two bugs where dev returns 500 errors -- one is a JS TypeError on filter processing, the other is a SQLITE_MISUSE error on RxNorm expands. Together 74 records.
