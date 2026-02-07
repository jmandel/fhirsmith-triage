# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 9fd2328
**Tolerance**: expand-snomed-version-skew-content

## What differs

Prod and dev return different SNOMED CT editions in their $expand responses:
- Prod: `http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201`
- Dev: `http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20240201`

This version difference causes the expansion to contain different code sets. In this specific record (expanding descendants of concept 365636006 "Finding of blood group"):
- Prod returns 208 codes, dev returns 207
- Code `1351894008` "Mixed field RhD (finding)" is present in prod but absent from dev, consistent with it being added in the SNOMED 2025 edition

The `used-codesystem` parameter value was already normalized by the existing `expand-used-codesystem-version-skew` tolerance, and display text differences on common codes were already normalized by `expand-display-text-differs`. The remaining difference was the code membership itself.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev loads an older SNOMED CT edition (20240201) than prod (20250201), causing expansions to return different code sets. This is a data/configuration issue (dev needs the 2025 SNOMED edition loaded), not a cosmetic difference. The codes returned by each server are correct for their loaded edition.

## Tolerance

Tolerance `expand-snomed-version-skew-content` matches POST /r4/ValueSet/$expand records where:
1. Both sides return 200
2. At least one used-codesystem parameter references SNOMED CT
3. The raw (pre-normalization) SNOMED used-codesystem versions differ between prod and dev
4. The expansion contains arrays have different code membership

It normalizes both sides to the intersection of codes present in both responses and adjusts the total count. This is the same approach used by the existing `expand-hl7-terminology-version-skew-content` tolerance.

**Impact**: Eliminates 40 records (3603 -> 3563 deltas). Validated 12 sampled eliminations — all confirmed to be SNOMED version skew with code membership differences.
