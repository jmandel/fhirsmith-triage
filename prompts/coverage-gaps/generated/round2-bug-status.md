# Round 2 Bug Status (38 bugs)

**Date**: 2026-02-08
**Verified**: All 33 open bugs re-tested against live tx.fhir.org (prod) and tx-dev.fhir.org (dev) on 2026-02-08. All 33 still reproduce.
**Context**: Re-verified all 38 round-2 bugs against live prod/dev, cross-referenced round-1, consolidated version-skew tolerances.

## Summary

| Category | Count | Records |
|----------|-------|---------|
| Not reproducing | 1 | 3 |
| Won't-fix (version skew) | 4 | ~791 |
| Open — incomplete round-1 fix | 7 | 2,686 |
| Open — critical/high | 7 | 2,846 |
| Open — medium | 13 | ~471 |
| Open — low/edge | 6 | ~129 |
| **Total open** | **33** | **~6,132** |

## Resolved (5)

| ID | Bug | Records | Resolution |
|----|-----|---------|------------|
| fdc587a | `validate-code` returns `result=false` for ISO 3166 user-assigned code AA | 3 | **Not reproducing** — both servers now return `result=true` |
| 4aebc14 | SNOMED `validate-code` result disagrees due to edition version skew | 46 | **Won't-fix** — dup of round-1 5b3ae71; by design for VSAC |
| 6edc96c | HL7 Terminology CodeSystems loaded at different versions (terminology.hl7.org) | ~465 | **Won't-fix** — covered by unified version-skew tolerance; round-1 be888eb "dev is correct" |
| 9fd2328 | Dev loads older SNOMED CT edition, causing `$expand` to return different code sets | 82 | **Won't-fix** — covered by unified version-skew tolerance; same root cause as 5b3ae71 |
| 4f12dda | Dev loads older SNOMED CT + CPT editions, causing `contains[].version` to differ in `$expand` | 198 | **Won't-fix** — covered by unified version-skew tolerance; same root cause as 5b3ae71 |

## Open — incomplete round-1 fixes (7)

| ID | Bug | Records | Status |
|----|-----|---------|--------|
| cd4b7d1 | Dev returns 400 instead of 422 for error responses across `validate-code` and `$expand` | 1897 | **Reproduces.** Round-1 fix (0d164f0) only addressed 404->422; the broader 400->422 pattern remains. |
| 2337986 | Dev returns 404 instead of 422 when ValueSet not found for `$expand` | 756 | **Reproduces.** Round-1 fix (0d164f0) only addressed CodeSystem path, not ValueSet path in expand.js. |
| af1ce69 | `validate-code` renders null status as literal `"null"` in inactive concept message | 24 | **Reproduces.** Round-1 fix (6c31e76) only addressed `"and undefined"` in version lists. |
| 801aef1 | Dev adds `expression` field on informational OperationOutcome issues where prod omits it | 6 | **Reproduces.** Round-1 1fff165 fixed empty-string expression; this is extra expression on info issues. |
| f9f6206 | `validate-code` renders JS `undefined`/`null` as literal strings when code/version absent | 1 | **Partially fixed.** `version 'null'` gone, but `'undefined'` for code still appears. |
| 1e5268a | `validate-code` renders empty status in `INACTIVE_DISPLAY_FOUND` message where prod shows `'inactive'` | 1 | **Reproduces.** Same null/undefined rendering class as f9f6206. |
| f33ebd3 | Prod reports `UNKNOWN_CODESYSTEM`, dev reports `UNKNOWN_CODESYSTEM_VERSION` when `system-version` pins unavailable SNOMED edition | 1 | **Reproduces.** Different core issue from version skew — error classification logic. |

## Open — new bugs, critical/high impact (7)

| ID | Bug | Records | Status |
|----|-----|---------|--------|
| dc0132b | SNOMED `$lookup` returns URI-based `name` and omits most properties (parent, child, designations) | 2170 | **Reproduces.** Largest record count. |
| 4336772 | Dev returns only root concept for v3 hierarchical ValueSets (missing child codes from `subsumedBy`) | 246 | **Reproduces.** Same root cause as 167be81. |
| 167be81 | Dev returns `result=false` for valid v3 terminology codes in ValueSet `$validate-code` | 187 | **Reproduces.** Same root cause as 4336772 — dev doesn't build hierarchy from `subsumedBy` properties. |
| e4e45bc | Dev returns 200 instead of 422 for `validate-code` with code but no `system` parameter | 133 | **Reproduces.** Spec compliance: should reject, dev accepts. |
| 6b31694 | Dev crashes (500) on GET `$expand` with `filter` parameter — `searchText.toLowerCase is not a function` | 58 | **Reproduces.** JS TypeError. |
| 36da928 | Dev returns 404 for SNOMED CT implicit ValueSet (`fhir_vs` URLs) | 36 | **Reproduces.** Missing feature. |
| 1932f81 | Dev returns `SQLITE_MISUSE` error on RxNorm-related `$expand` requests | 16 | **Reproduces.** SQLite crash. |

## Open — new bugs, medium impact (13)

| ID | Bug | Records | Status |
|----|-----|---------|--------|
| f2b2cef | Dev missing `valueset-unclosed` extension and emits spurious `expansion.total` on incomplete expansions | 292 | **Reproduces.** |
| 2ed80bd | Dev omits `expansion.total` when prod includes it | 47 | **Reproduces.** |
| 7716e08 | Dev uses R5-style `property` instead of R4 `extension` for deprecated status in `$expand` `contains` | 26 | **Reproduces.** Also: dev returns 11 vs prod's 12 codes for `patient-contactrelationship`. |
| bd89513 | Dev returns extra message/issues for display language resolution on `validate-code` `result=true` | 21 | **Reproduces.** |
| 44d1916 | Dev returns 200 expansion instead of 422 too-costly for large code systems (LOINC, MIME) | 17 | **Reproduces.** |
| d05a4a6 | Dev omits retired status-check informational issues in `validate-code` OperationOutcome | 13 | **Reproduces.** |
| c7004d3 | Dev omits `valueset-toocostly` extension and adds spurious `used-codesystem` for grammar-based CS | 13 | **Reproduces.** |
| f33161f | Dev returns 400 instead of 200 toocostly expansion for grammar-based code systems | 12 | **Reproduces.** |
| 80ce6b2 | Dev `message` parameter omits issue texts when validating CodeableConcept with multiple coding errors | 10 | **Reproduces.** |
| 1433eb6 | Dev returns 400 ValueSet-not-found for `validate-code` requests prod handles (e.g. `@all`) | 10 | **Reproduces.** |
| b6d19d8 | Dev omits `system`/`code`/`version`/`display` params on CodeSystem `validate-code` with unknown-system CodeableConcept | 5 | **Reproduces.** |
| 7b445b0 | SNOMED `$lookup`: dev returns `Synonym` designation use type where prod returns `Inactive` | 4 | **Reproduces.** |
| 44136eb | Dev returns expansion codes when prod marks expansion as too-costly (both HTTP 200) | 1 | **Reproduces.** |

## Open — new bugs, low impact / edge cases (6)

| ID | Bug | Records | Status |
|----|-----|---------|--------|
| 3103b01 | Dev returns extra informational HGVS syntax issue in `validate-code` for `varnomen.hgvs.org` | 62 | **Reproduces.** |
| e02b03e | Prod HGVS timeout: 62 records have `prod=500` due to external service timeout, comparison invalid | 62 | **Reproduces** (prod-side). External service still timing out. |
| 15f5ce0 | GET `/r5/CodeSystem/$subsumes` returns 400 despite valid system parameter | 2 | **Reproduces.** Possibly a prod bug. |
| 5f3b796 | LOINC `$lookup`: dev returns extra designations, `RELATEDNAMES2` properties, different `CLASSTYPE` format | 1 | **Reproduces.** |
| e107342 | SNOMED `$lookup`: prod returns 400 where dev returns 404 for unknown code | 1 | **Reproduces.** |
| 2f5929e | `$expand`: dev returns 404 for unknown ISO 3166 version that prod resolves by fallback | 1 | **Partially changed.** Dev status changed 404->422, but still rejects where prod falls back. |

## Bug Clusters

| Cluster | Records | Bugs | Notes |
|---------|---------|------|-------|
| HTTP status mismatches (400/404 vs 422) | 2,786 | cd4b7d1, 2337986, e4e45bc | Largest cluster by record count |
| SNOMED `$lookup` quality | 2,174 | dc0132b, 7b445b0 | URI-based name, missing properties |
| v3 hierarchy | 433 | 167be81, 4336772 | Dev doesn't build hierarchy from `subsumedBy` |
| Too-costly expansion | ~335 | f2b2cef, f33161f, 44d1916, 44136eb, c7004d3 | Multiple distinct symptoms |
| Crash bugs | 74 | 6b31694, 1932f81 | JS TypeError + SQLite crash |
| Null/undefined rendering | 26 | f9f6206, af1ce69, 1e5268a | Literal `"null"`/`"undefined"` in messages |
