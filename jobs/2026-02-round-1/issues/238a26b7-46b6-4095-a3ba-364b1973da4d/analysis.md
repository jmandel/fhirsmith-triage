# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: ac95424
**Tolerance**: hcpcs-codesystem-availability

## What differs

Prod returns `result: false` with error "A definition for CodeSystem 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets' could not be found, so the code cannot be validated" and `x-caused-by-unknown-system` pointing to the HCPCS URI. Dev returns `result: true` with `version: "2025-01"`, `display: "health or hospice setting, each 15 minutes"`, `system`, and `code` parameters — successfully finding and validating code G0154.

The diagnostics confirm the root cause:
- Prod: "CodeSystem not found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets"
- Dev: "CodeSystem found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets|2025-01"

Dev has the HCPCS CodeSystem loaded (version 2025-01); prod does not have it at all. This is a code system availability discrepancy, not a logic bug.

## Category: `temp-tolerance`

This is a real, meaningful difference — the two servers disagree on whether HCPCS codes are valid because they have different code systems loaded. This isn't cosmetic or equivalent; it's a configuration/data discrepancy. Filed as bug ac95424.

The 110 affected records all show the same pattern: prod's `x-caused-by-unknown-system` identifies the HCPCS URI, and dev successfully validates with version 2025-01.

Note: 13 additional HCPCS-mentioning records in the deltas (4 result-disagrees prod=true/dev=false for CPT code 33206, 9 content-differs for SNOMED codes) are NOT covered by this tolerance. Those records mention HCPCS only because the ValueSet (us-core-procedure-code) includes HCPCS as a component system — they have different root causes.

## Tolerance

Tolerance `hcpcs-codesystem-availability` matches validate-code records where prod has `x-caused-by-unknown-system` = `http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets` and skips them. This is narrowly scoped to only catch records where the HCPCS system is the specific unknown system reported by prod.

- Records eliminated: 110 (794 -> 684 deltas)
- Validated 10 random samples: all 10 confirmed the exact pattern (prod=false with unknown HCPCS, dev=true with version 2025-01)
- No false positives: the 13 other HCPCS-mentioning records remain in deltas as expected
