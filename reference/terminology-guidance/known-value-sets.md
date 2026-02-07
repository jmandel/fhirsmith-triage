<!-- Source: https://hl7.org/fhir/R4/terminologies-valuesets.html -->
<!-- Reference material for triage agents: Known value sets in FHIR R4 -->

# Known Value Sets in FHIR

## Overview

Value sets in FHIR represent curated collections of codes used across the specification. They are available as FHIR resources and can be downloaded. The standard namespace is `http://hl7.org/fhir/ValueSet`.

## Key Characteristics

- **Case Sensitivity**: Implicit code systems are case-sensitive (though FHIR never defines codes differing only by case)
- **Extensional vs. Intensional**: Value sets may be explicitly defined (extensional) or defined by rules (intensional)
- **Expansion**: Value sets can be expanded to show all included concepts
- **Binding**: Elements bind to value sets at varying conformance levels (required, extensible, preferred, example)

## Value Set Sources

| Source | Description |
|--------|-------------|
| **Internal** | Defined within FHIR itself |
| **V2/V3** | HL7 Version 2 and Version 3 codes |
| **SNOMED CT** | Systematized Nomenclature of Medicine codes |
| **LOINC** | Logical Observation Identifiers Names and Codes |
| **DICOM** | Digital Imaging and Communications in Medicine |
| **Other** | External standards and terminologies |

## Notable Value Set Categories

### Administrative and Demographic
- `administrative-gender` - Gender for administrative purposes
- `marital-status` - V3-based relationship status codes
- `address-use`, `address-type` - Contact information classifications
- `name-use` - Human name usage patterns

### Clinical and Observation
- `observation-status` - Status of an observation
- `observation-interpretation` - Qualitative assessment codes (normal/abnormal, low/high)
- `condition-clinical` - Clinical status of diagnoses
- `procedure-code` - SNOMED CT procedure terminology

### Medication and Treatment
- `medication-codes` - Drug and pharmaceutical substance codes from SNOMED CT
- `medication-statement-status` - Status codes for medication statements
- `medication-admin-status` - Administration status indicators
- `immunization-status` - Vaccine administration status

### Document and Communication
- `doc-typecodes` - LOINC-based document classification
- `document-reference-status` - Document lifecycle status
- `composition-status` - Workflow/clinical status of compositions

### Regulatory and Conformance
- `binding-strength` - Degree of conformance expectations
- `standards-status` - Normative or STU marking
- `publication-status` - Lifecycle status of artifacts

## Standards Status Indicators

- **[N]** designates Normative Content
- **[Informative]** indicates non-binding guidance

## Technical Integration

Value sets relate to code systems through:
1. **Inclusion**: Referencing codes from external systems
2. **Composition**: Inline code system definitions within value set resources
3. **Filtering**: Property-based filters for dynamic code selection
4. **Mapping**: Concept maps relating codes across systems

## Relevance to Terminology Operations

When expanding value sets (`$expand`), the server must:
- Resolve all included code systems
- Apply any filters or constraints
- Return the complete list of matching concepts
- Include proper system URIs for each code

When validating codes (`$validate-code`), the server must:
- Determine if a given code is within the value set
- Consider both extensional and intensional definitions
- Handle version-specific references appropriately
