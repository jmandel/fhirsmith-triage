# Round-2 Bug Re-verification Status

**Date**: 2026-02-08
**Context**: Re-verified all 38 open reproduced round-2 bugs against live prod (tx.fhir.org) and dev (tx-dev.fhir.org) servers, then cross-referenced against closed round-1 bugs.

## Summary

- 38 bugs re-verified
- 37 still reproduce, 1 fixed
- 10 of 37 match closed round-1 bugs (potential duplicates or incomplete fixes)
- 26 are truly new to round-2
- 1 Opus agent still running: exploring a unified "version skew" tolerance

## Changes Already Applied to git-bug

| Bug | Action | Reason |
|-----|--------|--------|
| fdc587a | Relabeled: `reproduced` → `not-reproduced` + comment added | ISO 3166 code AA now returns result=true on both servers |
| 4aebc14 | Closed as won't-fix + comment added | Duplicate of round-1 5b3ae71 (SNOMED version skew, "by design for VSAC") |

## Pending Decisions

### Decision 1: Close 9fd2328 and 4f12dda as won't-fix?

**Bugs**:
- **9fd2328** "Dev loads older SNOMED CT edition (20240201) than prod (20250201)" — 82 records, 3 tolerances
- **4f12dda** "Dev loads older SNOMED CT and CPT editions, causing expand contains[].version to differ" — 198 records, 1 tolerance

**Round-1 match**: 5b3ae71 (SNOMED CT edition version skew), adjudicated by GG as "By design — added an old version to better support VSAC"

**Status**: Agreed these are same root cause as 5b3ae71. Was about to close them but then pivoted to the broader version-skew tolerance discussion. **Should close as won't-fix once the tolerance story is settled.**

**Re-verification notes**:
- 9fd2328: SNOMED International edition is now aligned (both 20250201), but US edition still skewed (prod 20250901, dev 20250301). Partially improved.
- 4f12dda: Both return identical 280 codes, only version annotations differ. SNOMED US 20250901 vs 20250301, CPT 2026 vs 2025.

### Decision 2: Close 6edc96c as won't-fix?

**Bug**: **6edc96c** "Dev loads different versions of HL7 terminology CodeSystems" — ~465 records, 6 tolerances

**Round-1 match**: be888eb "v2-0360 $lookup returns version 3.0.0 vs prod 2.0.0", adjudicated by GG as "Dev is correct"

**Open question**: The round-1 adjudication was narrow (just v2-0360). Does "dev is correct" generalize to ALL terminology.hl7.org CodeSystems? The affected systems include: consentcategorycodes (prod 4.0.1 vs dev 1.0.1), observation-category (prod 4.0.1 vs dev 2.0.0), condition-clinical (prod 4.0.1 vs dev 3.0.0), v3-TribalEntityUS, v3-ActEncounterCode, and others.

**Complication**: For 6edc96c, dev is loading OLDER versions, not newer. This is the opposite of the SNOMED case. The proposed "dev-is-newer" tolerance wouldn't cover this. Need to check whether the version comparison holds here.

### Decision 3: Unified version-skew tolerance

**Concept discussed**: Replace ~9-10 per-system tolerances with a single general tolerance:
- Trigger: request doesn't pin a version, prod and dev resolve to different defaults
- Constraint (proposed): only apply when dev version is NEWER than prod
- Action: normalize version strings, intersect code membership

**9 tolerances that could be replaced**:
1. `hl7-terminology-cs-version-skew` (~58 records)
2. `expand-hl7-terminology-version-skew-params` (~236 records)
3. `expand-hl7-terminology-version-skew-content` (~163 records)
4. `validate-code-hl7-terminology-vs-version-skew` (4 records)
5. `expand-hl7-terminology-version-skew-vs-metadata` (3 records)
6. `hl7-terminology-lookup-definition-designation-skew` (1 record)
7. `expand-snomed-version-skew-content` (40 records)
8. `expand-snomed-version-skew-content-no-used-cs` (7 records)
9. `snomed-version-skew-message-text` (35 records)

Plus: `expand-contains-version-skew` (198 records, bug 4f12dda)

**Problem with "dev-is-newer" constraint**: 6edc96c has dev loading OLDER HL7 terminology versions. So either:
- (a) The constraint should be "versions differ" not "dev is newer", OR
- (b) 6edc96c needs separate handling because dev loading older versions is a different situation (arguably a config issue, not "by design")

**Opus agent running**: Analyzing the actual tolerance code and comparison data to measure coverage of a unified approach. Results will be at `triage/prompts/coverage-gaps/generated/version-skew-tolerance-analysis.md`.

### Decision 4: Bugs with incomplete round-1 fixes (keep open)

These 7 bugs share root cause with "confirmed fixed" round-1 bugs, but the fix was incomplete. They should stay open:

| Round-2 | Title | Round-1 match | What wasn't fixed |
|---------|-------|---------------|-------------------|
| 2337986 | 404 vs 422 for ValueSet not found | 0d164f0 (fixed) | Fix only addressed CodeSystem path, not ValueSet path in expand.js |
| cd4b7d1 | 400 vs 422 across operations (1897 records!) | 0d164f0 (fixed) | Fix only addressed 404, not broader 400-vs-422 pattern |
| f9f6206 | undefined/null as literal strings | 6c31e76 (fixed) | Fix only addressed "and undefined" in version lists |
| af1ce69 | literal "null" in inactive concept message | 6c31e76 (fixed) | Same — null rendering not fixed in all message templates |
| 1e5268a | empty status in INACTIVE_DISPLAY_FOUND | 6c31e76 (fixed) | Same class of null/undefined rendering |
| 801aef1 | extra expression on info issues | 1fff165 (closed) | Related but different manifestation |
| f33ebd3 | UNKNOWN_CODESYSTEM vs VERSION | 5b3ae71 (by design) | Different core issue — error classification, not version skew |

**No action needed** — these stay open as-is. But it's worth noting the "null/undefined rendering" cluster (f9f6206, af1ce69, 1e5268a) shares a common fix pattern.

## All 38 Bugs: Current Status

### Fixed (1)
| ID | Title | Action taken |
|----|-------|-------------|
| fdc587a | ISO 3166 user-assigned code AA | Relabeled not-reproduced |

### Already closed as won't-fix (1)
| ID | Title | Duplicate of |
|----|-------|-------------|
| 4aebc14 | SNOMED validate-code result disagrees | 5b3ae71 |

### Pending close as won't-fix (2) — awaiting tolerance decision
| ID | Title | Duplicate of | Records |
|----|-------|-------------|---------|
| 9fd2328 | SNOMED edition version skew (code sets) | 5b3ae71 | 82 |
| 4f12dda | SNOMED/CPT version annotations | 5b3ae71 | 198 |

### Needs discussion (1) — "dev is correct" scope
| ID | Title | Round-1 match | Records |
|----|-------|--------------|---------|
| 6edc96c | HL7 terminology version skew | be888eb | ~465 |

### Related to incomplete round-1 fixes (7) — stay open
| ID | Title | Records |
|----|-------|---------|
| 2337986 | 404 vs 422 for $expand ValueSet not found | 756 |
| cd4b7d1 | 400 vs 422 across operations | 1897 |
| f9f6206 | undefined/null as literal strings | 1 |
| af1ce69 | literal "null" in inactive concept message | 24 |
| 1e5268a | empty status in INACTIVE_DISPLAY_FOUND | 1 |
| 801aef1 | extra expression on info issues | 6 |
| f33ebd3 | UNKNOWN_CODESYSTEM vs VERSION | 1 |

### Truly new round-2 bugs (26) — no round-1 match, stay open

**Critical/High Impact**:
| ID | Title | Records | Notes |
|----|-------|---------|-------|
| 167be81 | v3 hierarchy result=false (subsumedBy bug) | 187 | Same root cause as 4336772 |
| 4336772 | v3 hierarchical ValueSets missing child codes | 246 | Same root cause as 167be81 |
| 36da928 | SNOMED implicit ValueSet (fhir_vs) 404 | 36 | Missing feature |
| 6b31694 | Crash on GET $expand with filter | 58 | JS TypeError |
| 1932f81 | SQLITE_MISUSE on RxNorm $expand | 16 | Crash |
| e4e45bc | 200 instead of 422 for no-system validate-code | 133 | Spec compliance |
| dc0132b | SNOMED $lookup URI name + missing properties | 2170 | Largest record count |

**Medium Impact**:
| ID | Title | Records |
|----|-------|---------|
| f2b2cef | Missing valueset-unclosed + spurious total | 292 |
| 2ed80bd | Dev omits expansion.total | 47 |
| f33161f | 400 instead of 200 toocostly for grammar CS | 12 |
| 44d1916 | 200 instead of 422 too-costly for LOINC | 17 |
| 44136eb | Dev returns codes when prod marks too-costly | 1 |
| c7004d3 | Missing toocostly extension on grammar CS | 13 |
| 1433eb6 | 400 ValueSet-not-found for @all etc. | 10 |
| 80ce6b2 | Message omits issue texts for multi-coding | 10 |
| 7716e08 | R5-style property vs R4 extension deprecated | 26 |
| bd89513 | Extra display language message | 21 |
| 7b445b0 | SNOMED Synonym vs Inactive designation | 4 |
| d05a4a6 | Missing retired status-check issues | 13 |
| b6d19d8 | Missing system/code params on CC validate | 5 |

**Low Impact/Edge Cases**:
| ID | Title | Records |
|----|-------|---------|
| 3103b01 | Extra HGVS syntax issue | 62 |
| e02b03e | Prod HGVS timeout (transient) | 62 |
| 5f3b796 | LOINC $lookup extra designations | 1 |
| e107342 | SNOMED $lookup 400 vs 404 | 1 |
| 2f5929e | ISO 3166 version fallback rejected | 1 |
| 15f5ce0 | R5 $subsumes returns 400 (prod bug?) | 2 |

## Notable Clusters Among New Bugs

1. **v3 hierarchy** (167be81 + 4336772): Dev fails to build parent-child hierarchy from `subsumedBy` properties. Fix: consult CodeSystem property declarations by URI, not just hardcoded code names. 433 records.

2. **Too-costly expansion** (f33161f + 44d1916 + 44136eb + c7004d3 + f2b2cef): Inconsistent handling of expansions too large to enumerate. Multiple related but distinct symptoms. ~335 records combined.

3. **SNOMED $lookup quality** (dc0132b + 7b445b0): Dev returns URI-based name and fewer properties. 2174 records.

4. **Crash bugs** (6b31694 + 1932f81): Dev returns 500 errors. 74 records.

5. **Null/undefined rendering** (f9f6206 + af1ce69 + 1e5268a): Dev renders JS null/undefined as literal strings in message templates. 26 records.

6. **HTTP status code mismatches** (2337986 + cd4b7d1 + e4e45bc): Dev uses wrong HTTP status codes. 2786 records total.

## Re-verification Nuances

Bugs where the re-verification had interesting judgment calls:

| Bug | Finding |
|-----|---------|
| 4aebc14 | Specific repro code 39154008 now passes on both servers, but version skew pattern persists |
| 9fd2328 | SNOMED International now aligned; only US edition still skewed |
| 2f5929e | Dev HTTP status changed from 404 to 422, but core rejection behavior unchanged |
| f9f6206 | Partial fix — `version 'null'` gone, but `'undefined'` for code persists |
| e02b03e | Prod HGVS timeout still happening — external service still timing out |
| 7716e08 | Additional finding: dev returns 11 codes vs prod's 12 for patient-contactrelationship |

## Files Generated

- `round2-repro-check.ndjson` — 38 bug bodies extracted from git-bug
- `round2-reverify-results-{0,1,2,3,4}.ndjson` — per-batch verification results
- `round2-reverify-results.ndjson` — merged results (38 lines)
- `round2-vs-round1-crossref.json` — 10 cross-reference matches
- `round2-vs-round1-crossref-summary.md` — human-readable summary
- `version-skew-tolerance-analysis.md` — (being generated by running Opus agent)

## Version-Skew Tolerance Analysis (completed)

Full analysis at: `triage/prompts/coverage-gaps/generated/version-skew-tolerance-analysis.md`
Analysis scripts at: `version-skew-analysis-final.js`, `version-skew-pinned-check.js`, etc.

### Key findings

**16 total version-skew tolerances exist** (not just 9). Together they match **10,160 records**. A unified detector catches 10,138 of those (the 22-record gap is false positives in existing tolerances).

| Group | Tolerances | Records |
|-------|-----------|---------|
| 9 target tolerances (bugs 6edc96c, 9fd2328) | hl7-terminology-cs-version-skew, expand-hl7-terminology-version-skew-params, expand-hl7-terminology-version-skew-content, validate-code-hl7-terminology-vs-version-skew, expand-hl7-terminology-version-skew-vs-metadata, hl7-terminology-lookup-definition-designation-skew, expand-snomed-version-skew-content, expand-snomed-version-skew-content-no-used-cs, snomed-version-skew-message-text | ~1,024 |
| 7 additional version-skew tolerances | snomed-version-skew (8,018), v2-0360-lookup-version-skew (802), expand-hl7-terminology-used-valueset-version-skew (264), expand-contains-version-skew (198), expand-used-codesystem-version-skew (142), snomed-version-skew-validate-code-result-disagrees (46), ndc-validate-code-unknown-code-version-diffs (16) | ~9,136 |

### "Dev-is-newer" constraint doesn't work

Version skew direction is mixed:
- SNOMED: prod is newer (8,038 records)
- HL7 Terminology: incomparable (prod reports FHIR version "4.0.1", dev reports actual THO version "2.0.0")
- CPT: prod is newer (198 records)
- v2-0360, NDC: dev is newer

**Recommendation from analysis: drop the "dev-is-newer" constraint.** Just detect "versions differ".

### "Request didn't pin version" check

- 91% of affected records have no version pinning
- 9% pin a version for one system but get skew in OTHER systems in the same request
- Should check per-system, not per-request

### Proposed architecture

One tolerance with shared detection, dispatching to operation-specific normalizers:
- `normalizeExpandVersionSkew()` — used-codesystem, contains intersection, VS metadata
- `normalizeValidateCodeVersionSkew()` — version param, message text, issues text
- `normalizeLookupVersionSkew()` — extra definition/designation stripping

**Exception**: `snomed-version-skew-validate-code-result-disagrees` (46 records) should stay separate — it SKIPS records where the validation result boolean disagrees, which is a different action than normalizing.

### 4 normalization strategies used across the 16 tolerances

- **A**: Replace version strings (params, message text) — cosmetic
- **B**: Normalize expansion parameters (used-codesystem URIs) — cosmetic
- **C**: Intersect code sets — DESTRUCTIVE, hides membership differences
- **D**: Strip extra params from lookup — removes content

### Incidental captures

Only 20 additional records beyond existing tolerances (NHS England SNOMED supplement versions). These are arguably a different issue class.

### Risks

- Code set intersection (Strategy C) can mask real bugs unrelated to version skew
- HL7 Terminology version strings are fundamentally incomparable between prod and dev
- Broader tolerance could suppress bugs that aren't really about version skew
- Mitigation: confirm version differences in raw bodies before normalizing

## Next Steps

1. ~~Wait for version-skew tolerance analysis~~ **DONE** — see above
2. **Decide on 6edc96c** — does "dev is correct" from v2-0360 generalize? Note that dev has OLDER versions here, complicating the "dev-is-newer" tolerance idea
3. **Close 9fd2328 + 4f12dda** as won't-fix once tolerance approach is settled
4. **Consider consolidating tolerances** if the unified approach is feasible
5. **No changes needed** for the 26 truly-new bugs or 7 incomplete-fix bugs — they stay open as-is
