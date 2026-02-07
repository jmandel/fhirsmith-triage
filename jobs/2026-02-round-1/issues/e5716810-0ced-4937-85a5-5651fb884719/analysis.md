# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: da50d17
**Tolerance**: snomed-version-skew

## What differs

The only difference in the normalized output is the `version` parameter:

- Prod: `http://snomed.info/sct/900000000000207008/version/20250201`
- Dev: `http://snomed.info/sct/900000000000207008/version/20240201`

Prod has SNOMED CT International Edition dated 2025-02-01; dev has 2024-02-01. All other parameters (result=true, system, code=408463005, display="Vascular surgery (qualifier value)") are identical.

## Pattern scope

This is part of a broad SNOMED CT edition version skew affecting 279 records across multiple modules:

| Module | Prod version | Dev version | Records |
|--------|-------------|-------------|---------|
| International (900000000000207008) | 20250201 | 20240201 | 256 |
| US (731000124108) | 20250901 | 20230301 | ~46 |
| Swedish (45991000052106) | 20220531 | 20231130 | 13 |
| Other national editions | various | various | ~10 |

Of these 279: 190 have version as the only diff, ~80 also have display text diffs, ~9 have message diffs, and 14 have result-disagrees (codes valid in one edition but not the other).

## Category: `temp-tolerance`

This is a real, meaningful difference — dev is loaded with older SNOMED CT editions than prod. This is not cosmetic; it affects which codes are valid, what display text is returned, and in 14 cases produces a different validation result. Filed as bug da50d17.

## Tolerance

Tolerance `snomed-version-skew` normalizes the `version` parameter to prod's value when both sides return SNOMED CT version URIs that differ. This only affects the version string — other diffs (display, message, result) are preserved and still surface as deltas for separate triage.

- Records eliminated: 181 (from 1733 to 1552 deltas)
- Validated 12 sampled eliminations: all were content-differs records where version was the only difference
- No false positives detected — all eliminated records had identical result, system, code, and display parameters
