# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1240.3&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 9fd2328 (existing — Dev loads older SNOMED CT edition than prod, causing $expand to return different code sets)
**Tolerance**: expand-snomed-version-skew-content-no-used-cs

## What differs

This is a $expand of VSAC ValueSet 2.16.840.1.113762.1.4.1240.3 ("Sex"). The expansion contains SNOMED CT codes plus one data-absent-reason code.

Two differences in the normalized output:

1. **SNOMED version**: Prod uses SNOMED US edition `20250901`, dev uses `20250301`. Visible in `contains[].version` strings on the SNOMED entries.

2. **Code membership**: Dev returns 5 codes (total: 5) including SNOMED code `184115007` ("Patient sex unknown (finding)"), while prod returns 4 codes (total: 4) without that code. The other 4 codes are identical between the two sides (same system, code, and display text).

The expansion has no `used-codesystem` expansion parameter, which is why the existing `expand-snomed-version-skew-content` tolerance (which detects version skew via that parameter) did not match this record.

## Category: `temp-tolerance`

This is a real, meaningful difference caused by SNOMED CT edition skew between prod and dev. Dev loads an older SNOMED US edition (20250301) that includes code 184115007 in the ValueSet's compositional definition, while prod's newer edition (20250901) does not include it. Same root cause as existing bug 9fd2328.

## Tolerance

Tolerance `expand-snomed-version-skew-content-no-used-cs` was added under existing bug 9fd2328. It matches $expand records where:
- Both sides return 200 with SNOMED codes in `contains[]`
- SNOMED versions differ (detected from `contains[].version` strings)
- Code membership differs

Normalization: intersects code membership, adjusts total to common count, and normalizes dev's SNOMED version strings to prod's values.

Affects 7 records (all ValueSet 2.16.840.1.113762.1.4.1240.3 with different query parameter variations). All 7 were validated — identical pattern in every case. Delta count went from 2307 to 2300.
