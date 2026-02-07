<!-- Source: https://hl7.org/fhir/R4/terminology-service.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# FHIR Terminology Service

**Standards Status:** Trial Use (Maturity Level 4)

## Overview

A FHIR terminology service is a service that lets healthcare applications make use of codes and value sets without having to become experts in the fine details of code system, value set and concept map resources.

Servers declaring full compliance must conform to the Terminology Service Capability Statement and may reference it in their capability statement using:

```
<instantiates value="http://hl7.org/fhir/CapabilityStatement/terminology-server"/>
```

## Security Considerations

### Encryption

SSL SHOULD be used for all production health care data exchange. Even though terminology servers don't directly handle patient data, observers may still be able to infer information about patients by observing the codes and concepts used in terminology service operations, so encryption is still recommended.

### Authentication and Authorization

Servers may choose not to authenticate clients, though authentication may be needed to limit or account for usage, or enforce agreement to licensing terms. For value set maintenance servers allowing edits, some form of authorization and/or authentication would be appropriate.

## Basic Concepts

The service builds on three core resource types:

- **CodeSystem**: Defines codes and their properties
- **ValueSet**: Describes rules for which codes are included
- **ConceptMap**: Maps codes between systems

### External Code Systems

External terminologies like SNOMED CT, LOINC, and RxNorm cannot be distributed via CodeSystem resources due to their size and complexity. Instead, these systems are assumed to be externally known to the terminology server.

Servers publish supported external code systems through capability statements using the extension:

```json
{
  "url": "http://hl7.org/fhir/StructureDefinition/capabilitystatement-supported-system",
  "valueUri": "http://loinc.org"
}
```

### Special Value Set URL

A reserved URL represents all value sets on a server: `http://hl7.org/fhir/ValueSet/@all`

This automatically imports all the existing value sets on the server. Its interpretation remains server-specific regarding version inclusion.

### Implicit Value Sets

Every code system has an implicit value set representing all concepts defined in the system. Some code systems define additional known implicit value sets (e.g., LOINC uses `http://loinc.org/vs`). For unknown systems, the code system URL itself serves as the implicit value set URI.

## Core Operations

### Value Set Expansion ($expand)

**Purpose:** Retrieve the actual list of codes matching value set rules and optional filters.

**Input:**
- Value set identifier (by URL, logical ID, or direct resource)
- Text filter (optional) to restrict results
- Evaluation date (optional; defaults to current)
- Paging parameters (optional offset and count)
- Additional expansion parameters

**Output:** A ValueSet resource containing matching codes, or OperationOutcome with error.

**Behavior Notes:**
- Large expansions should return error code `too-costly`
- Clients may retry with more specific filters
- Hierarchical expansions don't support paging; servers return complete trees
- All expansions should include total code count
- Offset element only appears when paging is used
- The expansion result should be treated as transient - applications should repeat the operation each time the value set is used

**Example Request:**
```
GET [base]/ValueSet/23/$expand?filter=abdo
```

**Example Response:**
```json
{
  "resourceType": "ValueSet",
  "id": "43770626-f685-4ba8-8d66-fb63e674c467",
  "expansion": {
    "timestamp": "20141203T08:50:00+11:00",
    "contains": []
  }
}
```

### Concept Lookup ($lookup)

**Purpose:** Retrieve detailed information about a specific code.

**Input:**
- Code value (as code string or Coding data type)
- Code system ID or URL (optional when invoked at instance level)
- Evaluation date (optional)
- Specific properties to return (optional)

**Output:** Parameters resource containing code information, or error.

**Returned Information:**
- Human description of the system (`name`)
- Recommended display for the code (`display`)
- Code properties (e.g., status)
- Alternative designations (with optional language/use codes)
- Code relationships (parent/child, hierarchy)
- Component properties supporting reasoning/decomposition

**Standard Properties (all code systems):**

| Property | Description |
|----------|-------------|
| `url` | The code system URL |
| `name` | The code system name |
| `version` | Code system version used |
| `display` | Recommended display text |
| `definition` | Code definition |
| `designation` | Alternative designations |
| `lang.X` | Designations in language X (BCP-47 language code) |
| `parent` | Parent codes in hierarchies |
| `child` | Child codes in hierarchies |

Additional properties may be defined by specific code systems (SNOMED CT, LOINC, RxNorm).

**Example Request:**
```
GET [base]/CodeSystem/$lookup?system=http://loinc.org&code=1963-8&property=code&property=display&property=designations
```

**Example Response:**
```json
{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "name", "valueString": "LOINC"},
    {"name": "version", "valueString": "2.56"},
    {"name": "display", "valueString": "Bicarbonate [Moles/volume] in Serum"},
    {"name": "abstract", "valueString": "false"}
  ]
}
```

### Value Set Validation ($validate-code)

**Purpose:** Determine if a code is valid within a specific value set without requiring full expansion.

**Input:**
- Value set (by URL, logical ID, or direct resource)
- Code value (as code + system, Coding, or CodeableConcept)
- Evaluation date (optional; defaults to current)

**Output:** Parameters resource containing validation result, errors, warnings, and appropriate display.

**Behavior Notes:**
- For CodeableConcept input, server checks if any codes are valid and verifies consistency
- Every code system has an implicit value set (all concepts in the system)
- Some value set URIs are predefined (e.g., LOINC: `http://loinc.org/vs`)
- For unknown systems, use the code system URL itself as the implicit value set

**Example Request:**
```
GET [base]/ValueSet/23/$validate-code?system=http://loinc.org&code=1963-8&display=test
```

**Example Response:**
```json
{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "result", "valueBoolean": false},
    {"name": "message", "valueString": "The display \"test\" is incorrect"},
    {"name": "display", "valueString": "Bicarbonate [Moles/volume] in Serum"}
  ]
}
```

### Subsumption Testing ($subsumes)

**Purpose:** Test whether one concept subsumes another based on code system hierarchy.

**Input:**
- Code system identifier (by direct invocation or canonical URL)
- Concept A and B (as codes or Codings)
- Code system version (optional)

**Behavior Notes:**
- If Codings use different code systems, the server SHALL return an error unless relationships are well-defined.
- Based on the CodeSystem definition of subsumption (the `hierarchyMeaning` property).

**Return Outcomes:**

| Value | Description |
|-------|-------------|
| `equivalent` | Concepts A and B are equivalent |
| `subsumes` | Concept A subsumes Concept B |
| `subsumed-by` | Concept A is subsumed by Concept B |
| `not-subsumed` | No subsumption relationship exists |

**Example Request:**
```
GET [base]/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=235856003&codeB=3738000
```

**Example Response:**
```json
{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "outcome", "valueCode": "subsumes"}
  ]
}
```

### Concept Translation ($translate)

**Purpose:** Translate a concept from one value set to another, typically between code systems.

**Input:**
- Code + system, Coding, or CodeableConcept
- Concept map (or source and destination value sets for context)
- Source value set context (optional)
- Destination value set context (optional)

**Behavior Notes:**
- Client passes either a concept map or value sets for source/destination
- If no concept map provided, server determines mapping from context
- If no context, use entire coding system value sets
- Returns error if mapping cannot be determined
- Some servers may require an explicit concept map

**Example Request:**
```
GET [base]/ConceptMap/$translate?system=http://hl7.org/fhir/composition-status&code=preliminary&source=http://hl7.org/fhir/ValueSet/composition-status&target=http://terminology.hl7.org/ValueSet/v3-ActStatus
```

**Example Response:**
```json
{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "result", "valueBoolean": true},
    {
      "name": "outcome",
      "valueCoding": {
        "system": "http://terminology.hl7.org/CodeSystem/v3-ActStatus",
        "code": "active"
      }
    }
  ]
}
```

### Batch Operations

Both `$validate-code` and `$translate` support batch processing via Bundle interaction type "batch", allowing multiple requests in a single call.

## Closure Table Maintenance ($closure)

**Purpose:** Maintain a transitive closure table on the client side to efficiently integrate terminological logic into application searches.

**Problem Addressed:** Direct expansion of subsumption hierarchies is inefficient for large terminology systems (e.g., SNOMED CT with >500,000 records) and doesn't solve non-closed expansions. The closure table approach leaves the FHIR terminology server responsible for the terminological reasoning and the client responsible for the closure table maintenance.

### Workflow

1. Client defines a named context for the closure table
2. Client registers context with server via `$closure` operation (name parameter only)
3. When encountering new codes, client calls `$closure` with context name and Coding
4. Server returns ConceptMap with new entries to add to the closure table
5. Client adds entries to its persistence store
6. For initialization, client can submit multiple codings at once

### Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **name** | 1..1 | string | Closure table context identifier |
| **concept** | 0..* | Coding | Coding values to process |
| **version** | 0..1 | string | For resynchronization from a known point |

**Output:** ConceptMap resource with mappings representing new closure table entries.

### Key Behavioral Details

- Equivalence is read from target to source (target is the "wider" concept)
- Servers don't explicitly state that codes are subsumed by themselves (this is implicit)
- Version increments with each operation (important for replay)
- Each version must be retained by the server for replay capability
- System + code combination is the closure table key
- Server should create "equals" relationship for syntactically different codes with the same meaning

### Resynchronization

Clients can check for missing operations by passing the last known version. The server returns all additions since that version (not including the version itself) with the latest version in the response. Special version value "0" means resync the entire closure table.

### Example Closure Table

| Scope | Source | Target |
|-------|--------|--------|
| patient-problems | `http://snomed.info/sct\|22298006` | `http://snomed.info/sct\|128599005` |
| patient-problems | `http://snomed.info/sct\|24595009` | `http://snomed.info/sct\|90560007` |
| obs-code | `http://loinc.org\|14682-9` | `http://loinc.org\|LP41281-4` |

## Terminology Maintenance

As code systems and value sets are created, updated or deleted, the outcomes of the operational services change. Servers should validate incoming resources and ensure terminology service integrity. Typically servers provide test and production environments, but this is not explicit in the interface.

## Implementation Notes

Implementers should be familiar with:
- Using codes in FHIR principles
- CodeSystem resource specifications
- ValueSet resource specifications
- ConceptMap resource specifications
- Operations framework documentation

For external terminologies where the CodeSystem infrastructure is not suitable, implementers should discuss their needs with HL7.
