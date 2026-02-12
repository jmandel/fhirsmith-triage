# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 3071698
**Tolerance**: expand-missing-limited-expansion

## What differs

The only remaining difference in the normalized output is that prod includes `limitedExpansion: true` in `expansion.parameter` and dev omits it entirely. Both servers return identical expansion contents (1000 LOINC codes), the same used-codesystem version (LOINC 2.81), and agree on all other expansion parameters (displayLanguage, excludeNested, offset, count).

The request includes `_incomplete: true` (which maps to the `limitedExpansion` expansion profile parameter). Prod echoes this back as `limitedExpansion: true` in the expansion parameters to signal that the expansion was truncated. Dev does not report this parameter.

For large code systems like LOINC (~100K+ codes) where only 1000 are returned, this parameter tells clients the expansion is incomplete. Without it, a client cannot distinguish "these are all the codes" from "there are more codes not shown."

## Category: `temp-tolerance`

This is a real, meaningful difference. The `limitedExpansion` parameter is a defined FHIR expansion parameter that conveys information about whether the expansion is complete. Dev's failure to report it is a bug — clients relying on this parameter will incorrectly assume expansions are complete.

24 records across the dataset show this pattern (prod has `limitedExpansion: true`, dev omits it), spanning both /r4/ and /r5/ $expand operations across multiple code systems (LOINC, SNOMED, and others). Of these, 10 had limitedExpansion as the sole remaining difference; the other 14 have additional diffs (e.g., missing used-codesystem, warning-experimental params).

## Tolerance

Tolerance `expand-missing-limited-expansion` (bugId: 3071698) matches $expand responses where prod has `limitedExpansion: true` in expansion.parameter and dev doesn't. Normalizes by stripping the parameter from prod.

- Records eliminated: 10 (where limitedExpansion was the only remaining diff)
- Records partially cleaned: 14 (where other diffs also exist)
- Validation: All 10 eliminated records confirmed — prod had limitedExpansion: true, dev omitted it, and all other differences were already handled by existing tolerances (identifier/timestamp, extension ordering, contact metadata).
