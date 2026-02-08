# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fsecurity-labels&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7716e08 (R5 property vs R4 extension), 6edc96c (HL7 terminology version skew)
**Tolerance**: expand-contains-sort-order, expand-r4-deprecated-status-representation, expand-hl7-terminology-used-valueset-version-skew

## What differs

After existing tolerances ran (expand-metadata-identifier-timestamp, expand-dev-extra-contact-metadata, expand-hl7-terminology-version-skew-content), three categories of differences remained in the normalized output:

1. **Contains code ordering**: Codes from `v3-ActReason` (HMARKT, HOPERAT, HRESCH, PATRQT, TREAT, ETREAT, HPAYMT, COVERAGE, PUBHLTH) appear in different order between prod and dev. Same codes, just different sorting.

2. **R4 extension vs R5 property for deprecated status**: For 8 deprecated codes from `v3-ActUSPrivacyLaw`, prod uses the R4-compatible extension `http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.contains.property` with nested sub-extensions `{url:"code", valueCode:"status"}` and `{url:"value", valueCode:"deprecated"}`. Dev uses the R5-native `property` element directly: `"property": [{"code": "status", "valueCode": "deprecated"}]`. In R4, `expansion.contains` does not define a `property` element — it was introduced in R5.

3. **used-valueset version strings**: Prod reports newer HL7 terminology ValueSet versions (e.g., `|3.0.0`, `|3.1.0`) while dev reports older versions (e.g., `|2014-03-26`, `|2018-08-12`). Prod also includes `displayLanguage: "en"` and `warning-retired` parameters that dev omits.

## Category: `temp-tolerance`

The contains ordering difference is cosmetic (equiv-autofix). The R5 property vs R4 extension difference is a real FHIR conformance issue — dev returns R5 structural elements in an R4 context (bug 7716e08). The used-valueset version differences reflect the same HL7 terminology version skew already tracked in bug 6edc96c.

## Tolerance

Three tolerances were written:

- **`expand-contains-sort-order`** (equiv-autofix): Sorts `expansion.contains` by system+code to normalize ordering differences. Applies broadly to all $expand operations with identical code membership.

- **`expand-r4-deprecated-status-representation`** (temp-tolerance, bug 7716e08): Strips both the R5 backport extension (from prod) and R5-native property (from dev) from contains entries. Covers the broader pattern across 26 records (18 security-labels + 5 patient-contactrelationship + 3 TribalEntityUS), though only the 18 security-labels records were fully eliminated since the other 8 have additional differences.

- **`expand-hl7-terminology-used-valueset-version-skew`** (temp-tolerance, bug 6edc96c): Normalizes used-valueset version strings to prod values for terminology.hl7.org ValueSets, and strips displayLanguage/warning-retired parameters.

Combined, these eliminated 18 records (all security-labels $expand). Validated by sampling all 18 — each had the same three patterns (extension/property, ordering, used-valueset versions) and no other hidden differences.
