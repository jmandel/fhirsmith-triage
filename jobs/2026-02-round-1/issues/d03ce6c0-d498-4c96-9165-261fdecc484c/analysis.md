# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 1176a4a
**Tolerance**: cpt-expand-empty-results

## What differs

Prod returns a successful expansion with `total: 1` and `expansion.contains` containing CPT code 83036 ("Hemoglobin; glycosylated (A1C)") from system `http://www.ama-assn.org/go/cpt`. Dev returns an empty expansion with `total: 0` and no `contains` array at all.

Both servers report the same `used-codesystem` parameter (`http://www.ama-assn.org/go/cpt|2023`), indicating dev believes it has CPT loaded but fails to resolve any codes from it.

After existing tolerances normalize away cosmetic differences (expansion identifier/timestamp, dev's empty-string id, dev's extra includeDefinition parameter), the only remaining difference is the expansion content itself: prod has codes, dev has nothing.

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev's CPT code system appears non-functional — it claims to have CPT version 2023 loaded but cannot resolve any codes from it. This is the same root cause as bug f559b53 (CPT validate-code returns "Unknown code" for valid CPT codes).

The pattern affects 45 $expand records (all POST /r4/ValueSet/$expand where the used-codesystem is CPT). An additional 14 validate-code records show the same root cause (dev returning "Unknown code" for CPT codes, covered by existing tolerance cpt-validate-code-result-disagrees).

## Tolerance

Tolerance `cpt-expand-empty-results` skips expand records where:
- Both responses are ValueSets with expansion sections
- Dev returns `total: 0` and prod returns `total > 0`
- The expansion's `used-codesystem` parameter references CPT (`ama-assn.org/go/cpt`)

Eliminated 45 records (136 -> 91 deltas). Validated 10 random samples — all legitimate: every eliminated record is a POST /r4/ValueSet/$expand with CPT as the code system, dev returning total=0 with 0 codes, prod returning actual CPT codes.
