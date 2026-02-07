<!-- Source: https://hl7.org/fhir/R4/conceptmap.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 ConceptMap Resource

## Resource Overview

The ConceptMap resource defines a statement of relationships from one set of concepts to one or more other concepts -- across code systems, data elements, or class models. It enables mapping between terminology systems within specific business contexts.

- **Status**: Trial Use (STU)
- **Security Category**: Anonymous
- **Maturity Level**: 3

## Purpose and Scope

ConceptMaps establish one-way mappings from source to target concept systems. These mappings are contextual -- valid only within defined business use cases. The mappings may work bidirectionally in practice, but reverse mappings cannot be assumed automatically.

Key principle: Mappings are context-dependent. For example, a clinical terminology (SNOMED CT) mapping to a classification (ICD-10) differs based on whether the mapping supports data analysis versus billing.

## Resource Structure and Elements

### Metadata Elements

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **url** | 0..1 | uri | Canonical URI identifier; globally unique when possible |
| **identifier** | 0..1 | Identifier | Additional formal identifier |
| **version** | 0..1 | string | Business version; arbitrary, author-managed |
| **name** | 0..1 | string | Computer-friendly name for code generation |
| **title** | 0..1 | string | Human-friendly descriptive title |
| **status** | 1..1 | code | draft | active | retired | unknown (Required) |
| **experimental** | 0..1 | boolean | For testing/educational use only |
| **date** | 0..1 | dateTime | Publication date |
| **publisher** | 0..1 | string | Publishing organization or individual |
| **contact** | 0..* | ContactDetail | Publisher contact information |
| **description** | 0..1 | markdown | Consumer-perspective description |
| **useContext** | 0..* | UsageContext | Intended contexts |
| **jurisdiction** | 0..* | CodeableConcept | Legal/geographic regions (Extensible binding) |
| **purpose** | 0..1 | markdown | Rationale for creation |
| **copyright** | 0..1 | markdown | Legal restrictions |

### Source and Target Specification

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **source[x]** | 0..1 | uri | canonical(ValueSet) | Source value set context for mapped concepts |
| **target[x]** | 0..1 | uri | canonical(ValueSet) | Target value set context |

Note: Mapping occurs at the concept level, not value set level. The source/target value sets provide context.

## Mapping Groups

**group** (0..* BackboneElement) - All mappings sharing identical source and target systems.

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **source** | 0..1 | uri | Source code system URI |
| **sourceVersion** | 0..1 | string | Source code system version |
| **target** | 0..1 | uri | Target code system URI |
| **targetVersion** | 0..1 | string | Target code system version |
| **element** | 1..* | BackboneElement | Mappings for source concepts (at least one required) |
| **unmapped** | 0..1 | BackboneElement | Strategy for unmapped source concepts |

## Element Mapping Details

Each **element** represents a source concept requiring mapping.

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **code** | 0..1 | code | Identity of source element being mapped |
| **display** | 0..1 | string | Display text (editorial aid only) |
| **target** | 0..* | BackboneElement | Target concept mappings |

## Target Mapping Structure

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **code** | 0..1 | code | Identity of target element |
| **display** | 0..1 | string | Display text (editorial aid) |
| **equivalence** | 1..1 | code | Mapping relationship type (Required) |
| **comment** | 0..1 | string | Mapping issues not captured structurally |
| **dependsOn** | 0..* | BackboneElement | Additional dependencies for valid mapping |
| **product** | 0..* | BackboneElement | Additional outcomes of mapping |

## Equivalence Types

The **equivalence** element grades mapping similarity. Semantics are read from target to source (e.g., target is 'wider' than source):

| Value | Description |
|-------|-------------|
| **equal** | Source and target concepts are identical |
| **equivalent** | Concepts semantically equivalent |
| **wider** | Target concept broader than source |
| **subsumes** | Target subsumes source (equivalent to wider) |
| **narrower** | Target concept narrower than source |
| **specializes** | Target specializes source (equivalent to narrower) |
| **inexact** | Imprecise mapping with limitations |
| **relatedto** | Related but not equivalent |
| **unmatched** | No valid mapping exists |
| **disjoint** | Concepts mutually exclusive |

## Dependency Structure (dependsOn/product)

Context-dependent mapping requirements.

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **property** | 1..1 | uri | Code system property reference |
| **system** | 0..1 | canonical(CodeSystem) | Code system URI for cross-system dependencies |
| **value** | 1..1 | string | Identity/code/text that mapping depends on |
| **display** | 0..1 | string | Display text for code values |

Mapping only applies when specified element resolves and matches specified value.

## Unmapped Element Structure

Defines behavior when source concepts have no target mapping.

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **mode** | 1..1 | code | Action strategy: provided | fixed | other-map |
| **code** | 0..1 | code | Fixed code (mode='fixed' only) |
| **display** | 0..1 | string | Display text for fixed code |
| **url** | 0..1 | canonical(ConceptMap) | Alternative ConceptMap (mode='other-map' only) |

### Unmapped Constraints
- If mode='fixed', code must be provided
- If mode='other-map', url must be provided
- "Unmapped" excludes codes with equivalence='unmatched'

### Unmapped Modes
- **provided**: Use the source code as-is in the target system
- **fixed**: Use a single fixed code for all unmapped concepts
- **other-map**: Delegate to another ConceptMap

## Key Constraints and Invariants

1. Name should be machine-processable for code generation
2. If map is narrower or inexact, comments are required
3. At least one element per group is required
4. Unmapped fixed and other-map modes require additional data elements

## Key Behavioral Concepts

### Mapping Context Dependency

Mappings apply only within specified business contexts. The same source concept may map differently based on use case (analysis vs. billing).

### Multiple Targets Per Source

A source concept may have multiple targets to:
- Represent ambiguous mappings
- Specify correct and invalid alternatives
- Handle context-dependent mappings via dependsOn

### Comparison to Related Resources

- **StructureMap**: Executable transforms for structured instances; ConceptMap defines concept relationships
- **CodeSystem Supplements**: Define inherent properties; ConceptMaps assert use-case-specific relationships

## Operations

- **$translate**: Translate a code from one value set to another based on ConceptMap content

## References

ConceptMap references itself in the `unmapped.url` element (chaining alternative maps). Included in ImplementationGuide resources for background knowledge supporting operations.
