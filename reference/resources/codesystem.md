<!-- Source: https://hl7.org/fhir/R4/codesystem.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 CodeSystem Resource

## Resource Overview

The CodeSystem resource declares the existence of and describes a code system or code system supplement and its key properties, optionally defining part or all of its content. Code systems define which codes (symbols and/or expressions) exist, and how they are understood.

- **Status**: Normative (from v4.0.0)
- **Security Category**: Anonymous
- **Maturity Level**: N (Normative)
- **ANSI Approved**: Yes

## Purpose and Scope

CodeSystem establishes fundamental terminology infrastructure by:
- Declaring existence and describing code systems or supplements
- Publishing code system properties for FHIR ecosystem use
- Supporting value set expansion and code validation
- Providing optional partial or complete concept definitions

The CodeSystem resource is not intended to support the process of maintaining code systems. It focuses on publishing properties and content for distribution.

**Code System vs. Value Set**:
- **Code System**: Declares the existence of and describes a code system or supplement and its key properties
- **Value Set**: Specifies codes drawn from one or more code systems for particular contexts

## Resource Structure and Elements

### Metadata Elements

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **url** | 0..1 | uri | Canonical identifier; should be globally unique and ideally resolvable |
| **identifier** | 0..* | Identifier | Additional formal identifiers (business identifiers) |
| **version** | 0..1 | string | Version identifier; arbitrary value not expected to be globally unique |
| **name** | 0..1 | string | Natural language name usable as machine-processable identifier |
| **title** | 0..1 | string | Short, descriptive, user-friendly title |
| **status** | 1..1 | code | Publication status (required); values: draft | active | retired | unknown |
| **experimental** | 0..1 | boolean | If authored for testing/education rather than genuine usage |
| **date** | 0..1 | dateTime | Publication date; must change when business version or status changes |
| **publisher** | 0..1 | string | Organization or individual publishing the code system |
| **contact** | 0..* | ContactDetail | Publisher contact details |
| **description** | 0..1 | markdown | Free text natural language description |
| **useContext** | 0..* | UsageContext | Contexts supporting content |
| **jurisdiction** | 0..* | CodeableConcept | Legal or geographic regions for intended use |
| **purpose** | 0..1 | markdown | Explanation of necessity and design rationale |
| **copyright** | 0..1 | markdown | Copyright statement and publication restrictions |

### Terminology Characteristic Elements

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **caseSensitive** | 0..1 | boolean | Indicates case sensitivity in code comparison |
| **valueSet** | 0..1 | canonical(ValueSet) | Canonical reference to value set containing entire code system |
| **hierarchyMeaning** | 0..1 | code | Hierarchy type: grouped-by | is-a | part-of | classified-with |
| **compositional** | 0..1 | boolean | Whether code system defines compositional (post-coordination) grammar |
| **versionNeeded** | 0..1 | boolean | Whether version must be specified when referencing |
| **content** | 1..1 | code | Extent of content (required); values: not-present | example | fragment | complete | supplement |
| **supplements** | 0..1 | canonical(CodeSystem) | Canonical URL of code system being supplemented |
| **count** | 0..1 | unsignedInt | Total number of concepts defined |

### Filter Elements

**filter** (0..* BackboneElement) - Filters usable in ValueSet.compose statements

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **code** | 1..1 | code | Identifies filter for use in ValueSet.compose.include.filter |
| **description** | 0..1 | string | Description of filter usage rationale |
| **operator** | 1..* | code | Permitted operators: = | is-a | descendent-of | is-not-a | regex | in | not-in | generalizes | exists |
| **value** | 1..1 | string | Description of expected filter value |

### Property Elements

**property** (0..* BackboneElement) - Additional concept information slots

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **code** | 1..1 | code | Property identifier used internally and in operations |
| **uri** | 0..1 | uri | Formal meaning reference |
| **description** | 0..1 | string | Definition and value usage explanation |
| **type** | 1..1 | code | Property value type: code | Coding | string | integer | boolean | dateTime | decimal |

### Concept Elements

**concept** (0..* BackboneElement) - Inherently hierarchical concept definitions

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **code** | 1..1 | code | Text symbol uniquely identifying concept within system |
| **display** | 0..1 | string | Recommended human-readable presentation |
| **definition** | 0..1 | string | Formal concept definition |
| **designation** | 0..* | BackboneElement | Additional representations (languages, aliases) |
| **property** | 0..* | BackboneElement | Property values for concept |
| **concept** | 0..* | BackboneElement | Child concepts (hierarchical nesting) |

#### Designation Sub-elements

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **language** | 0..1 | code | Human language of designation |
| **use** | 0..1 | Coding | Designation usage details |
| **value** | 1..1 | string | Text value for designation |

#### Concept Property Sub-elements

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **code** | 1..1 | code | Reference to CodeSystem.property.code |
| **value[x]** | 1..1 | code|Coding|string|integer|boolean|dateTime|decimal | Property value (7 type options) |

## Identifiers and References

CodeSystem uses three identification mechanisms:

1. **Logical ID** (`CodeSystem.id`): Server-specific resource instance identifier; changes across servers
2. **Canonical URL** (`CodeSystem.url`): Permanent identifier remaining constant across all copies; used for FHIR references
3. **External Identifier** (`CodeSystem.identifier`): System/value pair for non-FHIR contexts (OID references, HL7 v3 specs)

Because it is common practice to copy (cache) code systems locally, most references to code systems use the canonical URL.

## Constraints and Invariants

- Within a code system definition, all the codes SHALL be unique
- Name should be usable as an identifier for the module by machine processing applications
- Status is a modifier element affecting resource interpretation

## Important Behavioral Notes

### Content Modes

The **content** element determines representation extent:
- **not-present**: Content not included in the resource
- **example**: Sample concepts only
- **fragment**: Partial concept set
- **complete**: All concepts defined
- **supplement**: Extends an existing code system

### Supplements

Code system supplements extend existing code systems with additional designations and properties. Supplements define inherent properties and semantics of the concepts in the code system, while ConceptMaps express relationships within particular usage contexts.

### Hierarchy Meaning

The **hierarchyMeaning** element defines how nested concepts relate:
- **grouped-by**: No particular relationship, just organized together
- **is-a**: Child is-a type of parent (subsumption)
- **part-of**: Child is part-of parent
- **classified-with**: Child is classified-with parent

### Stability Considerations

The **versionNeeded** flag signals whether the code system commits to concept permanence across versions. When true, versions must be specified in references.

### Code System vs. NamingSystem

CodeSystem resources are managed by code system publishers who define features and content, while NamingSystem resources are frequently defined by third parties encountering code systems in use. Ideally, one authoritative CodeSystem resource exists (by canonical URL) with multiple copies distributed.

## Operations

- **$lookup**: Get details about a concept (definition, status, designations, properties)
- **$validate-code**: Validate that a coded value is in the code system
- **$subsumes**: Test subsumption relationship between two codes

## References and Relationships

CodeSystem is referenced by:
- Coding data type (via `CodeSystem.url`)
- ConceptMap resources
- TerminologyCapabilities resources
- ValueSet resources
