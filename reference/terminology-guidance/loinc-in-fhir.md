<!-- Source: https://terminology.hl7.org/LOINC.html -->
<!-- Reference material for triage agents: LOINC representation and behavior in FHIR -->

# LOINC in FHIR

## System Identification

- **System URI**: `http://loinc.org`
- **OID**: 2.16.840.1.113883.6.1

## Version Format

Standard LOINC versioning (e.g., "2.48"). When a `$lookup` operation is performed, servers must return the version being used in the `version` property.

## Code Format

- **Primary codes**: LOINC Code Identifiers (e.g., `21176-3`)
- **Part codes**: Non-semantic identifiers with "LP" prefix and mod-10 check digit (e.g., `LP31755-9`), represented in uppercase
- **Answer String IDs**: Valid LOINC codes with "LA" prefix (e.g., `LA11165-0`)
- **Case sensitivity**: LOINC codes are NOT case sensitive, though implementers should maintain correct casing

## Display Handling

Use either the `SHORTNAME` or `LONG_COMMON_NAME` field for display values.

## Code Status

Codes with Property `STATUS = DEPRECATED` are considered inactive for use in `ValueSet.compose.inactive`.

## Concept Properties

| Property | Type | Description |
|----------|------|-------------|
| `STATUS` | string | Term status (active, deprecated, etc.) |
| `COMPONENT` | code | Analyte or component measured |
| `PROPERTY` | code | Kind of property/quantity observed |
| `TIME_ASPCT` | code | Timing of measurement |
| `SYSTEM` | code | Specimen/system type |
| `SCALE_TYP` | code | Scale of measurement |
| `METHOD_TYP` | code | Measurement method |
| `CLASS` | string | Grouping classification |
| `CONSUMER_NAME` | string | Consumer-friendly test name |
| `CLASSTYPE` | string | Laboratory/clinical/claims/survey indicator |
| `ORDER_OBS` | string | Intended use categorization |
| `DOCUMENT_SECTION` | string | Document/section applicability |

## Filter Support

### Property Filter
Selects codes by property values using `=` or `regex` operations. Most useful properties:
- COMPONENT, PROPERTY, TIME_ASPCT, SYSTEM, SCALE_TYP, METHOD_TYP

### Multi-Axial Hierarchy Filter
- `parent` - immediate parents (using part codes)
- `ancestor` - transitive parents (using part codes)

### Copyright Filter
- Property: `copyright`
- Values: `LOINC` or `3rdParty`

## Subsumption Logic

LOINC defines the Multi-Axial Hierarchy, which is the basis for subsumption logic. Subsumption is tested against part codes in the hierarchy.

## Implicit Value Sets

| Pattern | Meaning |
|---------|---------|
| `http://loinc.org/vs` | All LOINC codes |
| `http://loinc.org/vs/[id]` | Answer list (e.g., `LL715-4`) |
| `http://loinc.org/vs/[partcode]` | All codes subsumed by the part code |

## LOINC Answer Lists

Answer list identifiers (e.g., `LL715-4`) are value set identifiers that map to FHIR ValueSet resources. Answer String IDs (LA-prefixed codes) are valid LOINC codes usable in Coding elements.

## Data Element Mapping

LOINC codes can be represented as FHIR Logical Data Models with canonical URLs `http://loinc.org/owl#[code]`.

The `SCALE_TYP` property maps to FHIR data types:

| SCALE_TYP | FHIR Type |
|-----------|-----------|
| Qn | Quantity |
| Ord | CodeableConcept |
| OrdQn | Quantity and CodeableConcept |
| Nom | CodeableConcept |
| Nar | markdown |
| Multi | Attachment |
| Doc | Attachment |

## RDF Representation

Namespace: `http://loinc.org/rdf#`
Example: code `21176-3` becomes `http://loinc.org/rdf#21176-3`

## Copyright Requirements

Any value set including LOINC codes must include the copyright notice in the `_copyright` element referencing LOINC license terms at `http://loinc.org/license`.

## Known Quirks and Special Handling

1. **Case insensitivity**: Unlike most FHIR code systems, LOINC codes are not case sensitive.
2. **Part codes vs primary codes**: Part codes (LP-prefixed) are for hierarchy/filtering, not typically used in clinical data.
3. **Answer lists are value sets**: LA-prefixed answer codes are valid LOINC codes, but LL-prefixed answer list IDs are value set identifiers.
4. **Multi-axial hierarchy**: The LOINC hierarchy is multi-axial (a code can have multiple parents), which affects subsumption testing.
5. **Third-party copyright**: Some LOINC codes include content with third-party copyright restrictions.
