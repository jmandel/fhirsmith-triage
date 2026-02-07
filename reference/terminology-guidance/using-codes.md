<!-- Source: https://hl7.org/fhir/R4/terminologies.html -->
<!-- Reference material for triage agents: How terminologies work in FHIR R4 -->

# Using Codes in FHIR

## Overview

FHIR uses coded values throughout its resources to represent defined concepts. Code systems define concepts and assign codes; value sets specify which codes from one or more code systems are permitted in specific contexts.

## The Code Pair Pattern

All codes in FHIR are represented as pairs:

- **system**: A URI identifying the code system (always case-sensitive)
- **code**: The string identifier for the concept (case-sensitivity depends on the code system)
- **version**: The code system version (optional)
- **display**: Human-readable description of the concept

Example:
```json
{
  "system": "http://loinc.org",
  "version": "2.62",
  "code": "55423-8",
  "display": "Number of steps in unspecified time Pedometer"
}
```

## Data Types for Coded Values

| Type | Description |
|------|-------------|
| **code** | Only the code; system is implicit from the element definition |
| **Coding** | Contains both code and system, identifying the code's origin |
| **CodeableConcept** | Represents a concept through text and/or one or more Coding elements |
| **Quantity** | Can carry system and code for unit types |
| **string** | Can be bound to value sets when codes are used directly |
| **uri** | Can be treated as coded when bound to value sets |

## System URI Selection

The system URI must reference a code system, never a value set. Priority order:

1. The FHIR Specification Code System Registry (mandatory if listed)
2. A system URI or OID defined by the code system publisher
3. The FHIR community code system registry with active status
4. An OID from the HL7 OID registry (using syntax: `urn:oid:[oid]`)

### Important Notes

- System values are always case-sensitive
- HTTP addresses should resolve to code system descriptions (ideally FHIR CodeSystem resources)
- URIs should be permanent; changing them requires agreement from all implementers
- When accessing codes from a ValueSet resource, the correct system URL is `ValueSet.codeSystem.system`, not `ValueSet.uri`

## Complex Code Systems (Post-coordination)

Some code systems allow building complex expressions from base concepts:

- SNOMED CT
- UCUM
- MIME Types
- Language codes
- ICD-[X]

Complex expressions are still valid code elements. Example:
```json
{
  "system": "http://snomed.info/sct",
  "code": "128045006:{363698007=56459004}"
}
```

## Value Set Bindings

When an element is bound to a value set, the binding includes:
- **Name**: Descriptive identifier
- **Strength**: How strictly the value set should be followed
- **Reference**: URL defining the value set
- **Description**: Usage context and implementation notes

### Value Set Reference Types

**Direct References**: Point directly to a ValueSet URL via a FHIR RESTful API.

**Logical References**: Use URI type matching `ValueSet.url`. These are more reliable for long-term stability.

**Version-Specific Logical References**: Append version with pipe separator:
```
http://hl7.org/fhir/ValueSet/clinical-findings|0.8
```

When a reference lacks a version and multiple versions exist, systems should use the latest version.

## Binding Strengths

### Required

Code MUST be from the specified value set. For `code` type, codes are fixed and case-sensitive. For `CodeableConcept`, at least one Coding must be from the specified value set. Derived profiles may remove codes but cannot add new ones.

### Extensible

Code MUST be from the specified value set if any of the codes can apply (based on human review). If no applicable concept exists, alternate concepts may be used. This is the most common binding for clinical elements.

Key rules:
- For CodeableConcept: one Coding must be from the value set if applicable
- Gaps should be reported to the value set administrator
- If using the valueset-reference extension and the code is outside the extensibly-bound value set, the extension must reference the alternate value set used

### Preferred

Systems are encouraged but not required to use the specified codes. Used when there is consensus on optimal codes but implementation contexts may prevent their use.

### Example

Instances are not expected or encouraged to draw from the specified value set. The value set merely provides examples. Value sets with restrictive licenses (e.g., SNOMED CT) are often used as example bindings.

## Binding Strength Summary

| Strength | Conformance Requirement | Profile Override Rules |
|----------|------------------------|------------------------|
| Required | Code must be from value set | Can remove codes, not add |
| Extensible | Code from value set if applicable; alternate if none apply | Cannot add codes unless gap exists |
| Preferred | Should use value set codes; text allowed | Can bind to any value set |
| Example | May use value set codes | Can bind to any value set |

## Code Validation and Display

- All codes defined by FHIR are case-sensitive and must be used in the provided case (typically lowercase)
- Display text comes from the code system definition
- Different code systems provide display text through different mechanisms

## Terminology Service

FHIR defines a Terminology Service specification establishing requirements for systems supporting codes, value sets, and code systems. Key operations:
- `$validate-code` - Check if a code is in a value set or code system
- `$lookup` - Get details about a code
- `$expand` - Expand a value set to its full list of codes
- `$subsumes` - Test subsumption relationship between codes
