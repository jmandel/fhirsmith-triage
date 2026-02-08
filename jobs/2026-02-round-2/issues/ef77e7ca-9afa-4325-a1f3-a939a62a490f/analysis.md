# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-simple-observation-category&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (existing — HL7 terminology version skew)
**Tolerance**: expand-hl7-terminology-version-skew-params

## What differs

After existing tolerances normalize away code set intersection (handled by `expand-hl7-terminology-version-skew-content`) and metadata (identifier, timestamp, contact), the only remaining difference is in `expansion.parameter`:

1. **`used-codesystem` version mismatch**: Prod reports `observation-category|4.0.1`, dev reports `observation-category|2.0.0`. Different loaded editions of the same HL7 terminology CodeSystem.

2. **`warning-draft` parameter**: Prod includes a `warning-draft` parameter (`http://terminology.hl7.org/CodeSystem/observation-category|4.0.1`) indicating the CodeSystem has draft status. Dev omits this parameter entirely.

Both differences are consequences of version skew — prod and dev load different versions of `http://terminology.hl7.org/CodeSystem/observation-category`.

## Category: `temp-tolerance`

This is a real, meaningful difference (different CodeSystem versions loaded), not cosmetic equivalence. It's part of the same root cause already tracked in bug `6edc96c` — dev loads different versions of HL7 terminology CodeSystems than prod. The existing `expand-hl7-terminology-version-skew-content` tolerance handles the code set differences but didn't handle the parameter metadata differences.

## Tolerance

Added `expand-hl7-terminology-version-skew-params` (linked to bug `6edc96c`). This tolerance:

- **Matches**: $expand responses where `expansion.parameter` contains `warning-draft` entries OR `used-codesystem` version mismatches for `terminology.hl7.org/CodeSystem/*` systems
- **Normalizes**: Strips `warning-draft` from both sides; normalizes `used-codesystem` versions for HL7 terminology systems to prod values using per-base-URI mapping
- **Placement**: Before `expand-used-codesystem-version-skew` (which uses `.find()` and corrupts multi-parameter records)
- **Records eliminated**: 236 (from 3000 to 2764 deltas)
  - ~130 observation-category records (with extra `symptom` code from version skew, handled by content tolerance)
  - ~106 condition-category records (same codes, only parameter version diffs)
- **Validation**: 15/15 sampled eliminated records confirmed valid — all differences are HL7 terminology version skew in parameters only
