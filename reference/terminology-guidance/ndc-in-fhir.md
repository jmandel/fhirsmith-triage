<!-- Source: https://terminology.hl7.org/NDC.html -->
<!-- Reference material for triage agents: NDC representation and behavior in FHIR -->

# NDC (National Drug Code) in FHIR

## System Identification

- **System URI**: `http://hl7.org/fhir/sid/ndc`
- **OID**: 2.16.840.1.113883.6.69

## Version Format

Use `YYYYMMDD` format corresponding to the publication date from FDA distributions.

**Important limitation**: The complete marketplace NDC set cannot be fully versioned since organizations may use codes not yet reported to the FDA.

## Code Format

- **Structure**: 10-digit NDC code with hyphens included
- **Three valid hyphen formats**:
  - `1234-5678-90` (4-4-2)
  - `12345-6789-0` (5-4-1)
  - `12345-678-90` (5-3-2)
- **Critical requirement**: The hyphens MUST be correct for each NDC code. The position of the hyphens varies by code and is significant.

## Display

Use the `PACKAGEDESCRIPTION` column value from FDA's TSV or Excel distribution files.

## Source

- National Drug Code Directory (FDA)
- NHRIC Labeler Codes (FDA)
- Updated daily by FDA for finished drug products

## Properties

| Aspect | Status |
|--------|--------|
| Subsumption relationships | Not defined |
| Filter properties | Not yet specified |
| Implicit value sets | Not needed |
| Copyright/License | None required |
| Inactive concept determination | Not yet documented |

## Known Quirks and Special Handling

1. **Hyphen format is critical**: NDC codes have three different hyphen patterns (4-4-2, 5-4-1, 5-3-2). The correct pattern depends on the specific code. Incorrect hyphenation makes the code invalid.
2. **Incomplete code set**: The full set of NDCs in the marketplace is unknown and cannot be completely enumerated, as organizations may use codes prior to FDA reporting.
3. **Daily updates**: The FDA updates the NDC directory daily, so code validity can change frequently.
4. **No subsumption**: NDC does not define hierarchical relationships.
5. **No standardized filters**: Unlike SNOMED CT or LOINC, no filter properties are defined for NDC value set composition.
6. **10-digit vs 11-digit**: Be aware that NDC codes are sometimes represented in an 11-digit format (without hyphens, with zero-padding) in some systems. The FHIR representation uses the 10-digit hyphenated format.
7. **Package-level identification**: NDC codes identify specific drug packages, not just drug products. The same drug in different package sizes will have different NDC codes.
