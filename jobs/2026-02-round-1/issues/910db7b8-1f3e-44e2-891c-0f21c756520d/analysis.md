# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: da50d17 (SNOMED version skew), 8f739e9 (same-version display differs)
**Tolerance**: snomed-version-skew (extended), snomed-same-version-display-differs (new)

## What differs

After normalization (diagnostics stripped, parameters sorted, version normalized), the only remaining difference is the display parameter:

- **Prod**: `"Rehabilitation specialty (qualifier value)"` (SNOMED 20250201)
- **Dev**: `"Rehabilitation - specialty (qualifier value)"` (SNOMED 20240201)

This specific record's display text difference is caused by SNOMED version skew: prod loads the 20250201 International edition, dev loads 20240201. The preferred term for code 394602003 changed between these editions (hyphen removed).

## Broader pattern

Searching the full delta set for SNOMED display-only diffs revealed **138 records** total, split into two distinct sub-patterns:

1. **79 records**: SNOMED version differs between prod and dev. Display text change is a direct consequence of different SNOMED editions having different preferred terms. Same root cause as existing bug da50d17.

2. **59 records**: SNOMED version is **identical** (both 20250201) but display text still differs. Examples:
   - prod="Hearing loss" vs dev="Deafness"
   - prod="Counselling" vs dev="Counseling (regime/therapy)"
   - prod="Diabetes mellitus type I" vs dev="Insulin dependent diabetes mellitus"

   This is a separate bug (8f739e9) — the two servers select different preferred terms from the same SNOMED edition.

In all 138 records, both servers agree on result=true, system, and code.

## Category: `temp-tolerance`

The display text is meaningful terminology content (it's the preferred term for a SNOMED concept). These are real differences, not cosmetic. The 79 version-skew records share the root cause of existing bug da50d17. The 59 same-version records represent a new bug (8f739e9) where dev selects a different preferred term than prod even for the same SNOMED edition.

## Tolerance

**snomed-version-skew** (extended): Added display normalization to the existing tolerance. When SNOMED versions differ, both version AND display are now normalized to prod's values. Eliminated 79 records (422 → 343).

**snomed-same-version-display-differs** (new): Matches SNOMED validate-code responses where versions agree but display differs. Normalizes display to prod's value. Eliminated 59 records (343 → 284). Bug 8f739e9 filed.

Validation: 10 random samples checked for each tolerance. All confirmed legitimate — SNOMED system, display-only diffs, result agreement on both sides.
