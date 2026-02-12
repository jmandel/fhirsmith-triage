# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: f9e35f6
**Tolerance**: version-not-found-skew

## What differs

Both servers return `result: false` for a CodeableConcept containing LOINC 2.77 code 29463-7 and SNOMED CT code 27113001 (Danish edition) validated against the Vital Signs ValueSet. The differences are in the issues and message parameters:

1. **Dev has an extra not-found issue**: Dev reports LOINC version 2.77 as unknown ("A definition for CodeSystem 'http://loinc.org' version '2.77' could not be found... Valid versions: 2.81"). Prod does not report this because it has LOINC 2.77 loaded alongside 2.81.

2. **SNOMED valid-versions lists differ**: Both report the Danish SNOMED edition (11000274103/version/20231115) as not found, but their "Valid versions" lists differ — prod lists some editions dev doesn't have (e.g., 449081005/version/20250510, 900000000000207008/version/20240801) and vice versa (e.g., dev has 731000124108/version/20230301).

3. **Message parameter differs**: Dev's message concatenates errors from all its issues (including the extra LOINC one), while prod's message only references the SNOMED error.

All differences stem from the two servers having different code system editions loaded (version skew).

## Category: `temp-tolerance`

This is a real, meaningful difference — the servers have different code system versions available. But both agree on the validation outcome (result=false), and the differences are limited to the explanatory "why" details in error issues and message text. The pattern is widespread (19 records) and caused by version skew, not a logic bug.

## Tolerance

Tolerance `version-not-found-skew` matches validate-code records where both result=false and at least one issue contains "could not be found, so the code cannot be validated". Normalizes by stripping all such issues and the message parameter from both sides, since the remaining non-version-skew issues are the meaningful comparison.

- Eliminates 19 records (down from 2610 to 2591 total deltas)
- All 19 validated: after stripping version-not-found issues and message, remaining issues are identical between prod and dev
- Filed as bug f9e35f6 with tx-compare and content-differs labels
