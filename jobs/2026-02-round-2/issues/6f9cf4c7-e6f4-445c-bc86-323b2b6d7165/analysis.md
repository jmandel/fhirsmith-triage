# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1267.23&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 4f12dda
**Tolerance**: expand-contains-version-skew

## What differs

In the normalized output, the only difference is the `version` field on each `expansion.contains[]` entry:

- **SNOMED CT US edition** (98 codes): prod returns `http://snomed.info/sct/731000124108/version/20250901`, dev returns `http://snomed.info/sct/731000124108/version/20250301`
- **CPT (AMA)** (182 codes): prod returns `2026`, dev returns `2025`

Both sides return 200 with identical code membership (280 codes). The version differences reflect that prod has newer SNOMED CT and CPT editions loaded than dev. Additionally, 5 CPT codes have display text differences between editions (handled by the existing `expand-display-text-differs` tolerance).

The `expand-used-codesystem-version-skew` tolerance already normalizes the `used-codesystem` parameter in `expansion.parameter[]`. The `expand-display-text-differs` tolerance already normalizes display text. The remaining gap was the `version` field on each `contains[]` entry.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev loads older code system editions (SNOMED US 20250301 vs 20250901, CPT 2025 vs 2026). It follows the same version skew pattern as existing bugs 9fd2328 (SNOMED expand code membership differences) and 515117b (used-codesystem version parameter differences). Filed as bug 4f12dda.

## Tolerance

Tolerance `expand-contains-version-skew` matches expand records where both sides return 200, the code membership is identical (same system+code pairs), but `contains[].version` strings differ. It normalizes all dev `contains[].version` values to prod's values.

- **Records eliminated**: 198 (all from ValueSet `2.16.840.1.113762.1.4.1267.23`)
- **Validation**: 10 sampled eliminated records all confirmed — every record has 280 identical codes with version-only differences (plus 5 display diffs handled by existing tolerance), no other differences hidden
- **Delta count**: 3456 → 3258
