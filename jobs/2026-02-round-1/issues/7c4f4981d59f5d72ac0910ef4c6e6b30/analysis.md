# Analysis: temp-tolerance

**MD5**: `7c4f4981d59f5d72ac0910ef4c6e6b30`
**Operation**: `GET /r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: d3b49ff
**Tolerance**: v2-0360-lookup-version-skew

## What differs

Three differences remain after the existing tolerance pipeline (diagnostics stripping, parameter sorting):

1. **Version parameter**: prod returns `"2.0.0"`, dev returns `"3.0.0"` — different editions of the v2-0360 (DegreeLicenseCertificate) CodeSystem are loaded.

2. **Definition parameter**: dev includes a top-level `definition` parameter with value `"Registered Nurse"`. Prod does not have this top-level parameter, but does include the definition as a `property` with `code: "definition"` and `value: "Registered Nurse"`.

3. **Designation parameter**: dev includes a `designation` parameter with `use` coding `preferredForLanguage` from `hl7TermMaintInfra`. Prod does not return any designation.

All three differences are consistent with dev loading a newer edition (3.0.0) of the CodeSystem that surfaces richer content (top-level definition, designation data).

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The version skew means clients get different content depending on which server they hit. The definition being returned differently (top-level param vs property) and the extra designation represent actual data differences. Filed as bug d3b49ff.

## Tolerance

Tolerance `v2-0360-lookup-version-skew` matches all `$lookup` requests on the `v2-0360` system. It strips `version`, `definition`, and `designation` parameters and the `property` with `code=definition` from both sides.

- **Records affected**: 157 (all lookup deltas in the dataset; all are for v2-0360 with code=RN)
- **Delta reduction**: 3477 → 3320 (exactly 157 eliminated)
- **Validation**: Sampled all 10 randomly selected eliminated records. All show the identical pattern: version 2.0.0 vs 3.0.0, extra-in-dev definition and designation. No false positives — nothing else is hidden.
