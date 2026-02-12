# Unified Version-Skew Tolerance: Speculative Analysis

## Setup

This analysis compares two tolerance strategies for handling version-skew differences
in the FHIRsmith triage pipeline, both run against the same `comparison.ndjson` dataset
(9206 records from round 3).

**Individual approach** (`jobs/2026-02-round-3/`): Uses 4 separate version-skew tolerances:
- `snomed-version-skew` -- SNOMED CT edition version normalization
- `v2-0360-lookup-version-skew` -- v2-0360 $lookup version/definition/designation stripping
- `validate-code-xcaused-unknown-system-disagree` -- x-caused-by-unknown-system disagreements
- `version-not-found-skew` -- "could not be found" version-list differences

**Unified approach** (`jobs/2026-02-round-3-unified-skew-test/`): Replaces those 4 with a
single `version-skew` tolerance using `detectVersionSkew()` and operation-specific normalizers
(`normalizeValidateCodeVersionSkew`, `normalizeExpandVersionSkew`, `normalizeLookupVersionSkew`).
All other tolerances are identical between the two runs.

## Summary Comparison

| Metric                    | Individual (R3)  | Unified          | Delta   |
|---------------------------|------------------|------------------|---------|
| Total records             | 9206             | 9206             | --      |
| Skipped                   | 54               | 56               | +2      |
| OK                        | 7810             | 7682             | -128    |
| content-differs           | 1020             | 1148             | +128    |
| result-disagrees          | 49               | 47               | -2      |
| status-mismatch           | 248              | 248              | 0       |
| dev-crash-on-error        | 20               | 20               | 0       |
| dev-crash-on-valid        | 4                | 4                | 0       |
| missing-resource          | 1                | 1                | 0       |

The unified approach produces **128 more deltas** and **2 fewer result-disagrees**
(net: 126 more unresolved records).

### OK Breakdown

| Kind             | Individual  | Unified  | Delta    |
|------------------|-------------|----------|----------|
| strict           | 0           | 0        | 0        |
| equiv-autofix    | 4355        | 6451     | +2096    |
| temp-tolerance   | 3455        | 1231     | -2224    |

The unified tolerance is `equiv-autofix` while the individual ones include `temp-tolerance` entries,
so the OK breakdown shifts dramatically. The unified approach classifies 2096 more records as
equiv-autofix (the version-skew tolerance itself), and 2224 fewer as temp-tolerance (because the
removed tolerances were temp-tolerances). This shift has no functional impact on which records are
OK vs delta, but it does change the accounting of "how many OK records are permanent vs temporary."

### Operation Breakdown

| Operation          | Individual OK | Unified OK | Delta  |
|--------------------|---------------|------------|--------|
| validate-code      | 7229          | 7159       | -70    |
| lookup             | 58            | 0          | -58    |
| expand             | 393           | 393        | 0      |
| batch-validate-code| 130           | 130        | 0      |

## Record-Level Differences

### 128 New Deltas (OK in individual, content-differs in unified)

These fall into three distinct patterns:

#### Pattern 1: v2-0360 Lookup (58 records)

All 58 records are `$lookup` on `http://terminology.hl7.org/CodeSystem/v2-0360` (code `RN`).

**Why individual handles them:** `v2-0360-lookup-version-skew` strips `version`, `definition`,
and `designation` parameters from both sides, plus removes `property` entries with
`code=definition`. This is a very aggressive normalization that removes content-bearing parameters.

**Why unified misses them:** The unified `normalizeLookupVersionSkew()` only normalizes the
`version` parameter value (aligns dev to prod). After version normalization, dev still has extra
`definition` and `designation` parameters that prod lacks. These are real content differences
caused by dev loading v2-0360 version 3.0.0 vs prod's 2.0.0 -- the newer version added definition
and designation data.

**Assessment:** The individual tolerance was over-aggressive. Stripping `definition` and
`designation` hides real content differences (the newer version has richer metadata). The unified
approach is more honest here -- it normalizes the version string but correctly surfaces the
content differences that stem from the version difference.

#### Pattern 2: version-not-found-skew (59 records)

These are `$validate-code` records where `result=false` on both sides, but prod and dev report
different "could not be found" messages referencing different code systems. For example:
- Prod: "CodeSystem 'http://snomed.info/sct' version '...11000274103/version/20231115' could not be found"
- Dev: "CodeSystem 'http://loinc.org' version '2.77' could not be found"

**Why individual handles them:** `version-not-found-skew` detects the "could not be found"
marker text and strips all matching issues plus the message parameter from both sides.

**Why unified misses them:** `detectVersionSkew()` checks for version parameter differences
between prod and dev. In these records, the returned `version` parameter is the same on both
sides (e.g., both return `2.81` for LOINC). The version skew manifests not in the output version
parameter but in the error messages about *other* code systems referenced in the ValueSet that
one server has and the other does not. The unified detector does not detect this pattern because
there is no explicit version parameter mismatch.

**Assessment:** These records represent a genuine gap in the unified tolerance. The root cause
IS version skew (different servers know about different code system editions), but it manifests
as different "not found" errors rather than as a version parameter difference. The individual
tolerance captured this with a text-based heuristic; the unified detector's version-parameter
approach cannot see it.

#### Pattern 3: x-caused-by-unknown-system disagreements (11 records)

These are `$validate-code` records with `result=false` where prod and dev disagree on which
`x-caused-by-unknown-system` is reported.

**Why individual handles them:** `validate-code-xcaused-unknown-system-disagree` detects when
the `x-caused-by-unknown-system` values differ and normalizes all downstream params to prod's
values.

**Why unified misses them:** `detectVersionSkew()` only fires when version parameters explicitly
differ. These records have the same (or absent) version parameters but differ in which system
is unknown -- a downstream consequence of version skew but not detectable by version parameter
comparison alone.

**Assessment:** Similar to Pattern 2, this is a genuine gap. The root cause is version skew
(each server has different code system editions loaded, so different systems appear "unknown"),
but the unified detector cannot see it because it relies on version parameter signals.

### 2 Resolved Deltas (result-disagrees in individual, skipped in unified)

Both records are `$validate-code` for SNOMED where:
- Prod: `result=true`, version = `snomed.info/sct/900000000000207008/version/20250201`
- Dev: `result=false`, version = undefined (absent)

**Why individual leaves them as deltas:** None of the individual tolerances match these records.
`snomed-version-skew` requires both sides to have version parameters; dev has no version at all.

**Why unified resolves them:** `detectVersionSkew()` parses the raw response bodies and detects
SNOMED version mismatch (prod has a SNOMED version, dev does not), then issues a `skip` because
there is a result disagreement with SNOMED edition mismatch. The unified detector explicitly
handles the case where result disagrees AND raw versions identify SNOMED skew.

**Assessment:** This is a genuine improvement. The individual tolerances had a gap: they
required both sides to have explicit version parameters. The unified approach correctly
identifies these as version-skew-driven result disagreements and skips them.

## Key Findings

### What the unified tolerance does better:
1. **Detects SNOMED result disagreements with absent version parameters** (2 records resolved).
   The individual `snomed-version-skew` only fires when both sides have version params.
2. **Skips records that clearly cannot be compared** due to SNOMED edition mismatch causing
   different validation results, rather than leaving them as unresolved deltas.
3. **More honest about v2-0360 content differences** -- by only normalizing the version
   string rather than stripping entire parameter classes, it surfaces real content differences
   (extra definition/designation data in the newer version).

### What the individual tolerances do better:
1. **Broader version-skew detection** -- `version-not-found-skew` catches cases where version
   skew causes different "not found" error messages about secondary code systems. These have
   matching version parameters but different error text (59 records).
2. **x-caused-by-unknown-system handling** -- catches cases where servers disagree on which
   system is unknown, a downstream consequence of version skew that the unified detector's
   version-parameter-based approach cannot see (11 records).
3. **Aggressive v2-0360 normalization** -- the individual tolerance strips content differences
   (definition/designation) that are caused by version skew, while the unified approach only
   normalizes the version string, leaving 58 content-differs deltas.

### Gap analysis:

| Gap                                           | Records | Whose gap?  |
|------------------------------------------------|---------|-------------|
| v2-0360 definition/designation stripping       | 58      | Unified     |
| "Could not be found" message differences       | 59      | Unified     |
| x-caused-by-unknown-system disagreements       | 11      | Unified     |
| SNOMED result-disagrees with absent version    | 2       | Individual  |

**Net: Individual handles 128 records that unified cannot, unified handles 2 that individual cannot.**

### Recommendation

The unified `version-skew` tolerance is a cleaner architectural approach but has meaningful
coverage gaps compared to the individual tolerances. To achieve parity:

1. **Add "version not found" text detection** to `detectVersionSkew()`: when both sides return
   result=false and error messages contain "could not be found" referencing different code
   systems, treat this as version skew.
2. **Add x-caused-by-unknown-system detection**: when both sides have result=false and the
   `x-caused-by-unknown-system` values differ, treat as version skew.
3. **Decide on v2-0360 handling**: either add content-stripping to `normalizeLookupVersionSkew()`
   for definition/designation parameters (matching the individual tolerance's behavior), or
   accept these 58 records as genuine content differences that should surface as deltas.

Without these additions, switching to unified-only would increase deltas by 126 records.
