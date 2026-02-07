# Analysis: `temp-tolerance`

**Operation**: `GET /r4/ValueSet?_format=json&url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: 51f23f5
**Tolerance**: missing-dicom-cid29-valueset

## What differs

Prod returns a searchset Bundle with `total: 1` containing the DICOM CID 29 AcquisitionModality ValueSet (`dicom-cid-29-AcquisitionModality`). This ValueSet defines 51 DICOM modality codes (CT, MR, US, etc.) under system `http://dicom.nema.org/resources/ontology/DCM`, version `2025.3.20250714`.

Dev returns an empty searchset Bundle with `total: 0` and `entry: []`. The ValueSet is not found at all. (Note: `entry: []` is also technically invalid FHIR since empty arrays should be omitted.)

The same resource is also missing via direct read: `GET /r4/ValueSet/dicom-cid-29-AcquisitionModality` returns 200 on prod, 404 on dev.

## Category: `temp-tolerance`

This is a real, meaningful difference — a data/configuration gap. The DICOM CID 29 AcquisitionModality ValueSet is loaded in prod but missing from dev entirely. This is not cosmetic; any client attempting to use this ValueSet for validation or expansion would get incorrect results from dev.

## Tolerance

Tolerance `missing-dicom-cid29-valueset` (kind: `temp-tolerance`, bugId: `51f23f5`) skips all records whose URL contains `dicom-cid-29` or `sect_CID_29`. This eliminates 10 records total:
- 5x P3: direct reads returning 404 on dev
- 5x P6: URL searches returning empty Bundle on dev

Validated all 10 eliminated records — every one shows the same missing resource pattern with no other hidden differences.
