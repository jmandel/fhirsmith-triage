<!-- Source: https://hl7.org/fhir/R4/valueset.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 ValueSet Resource

## Resource Overview

A ValueSet resource specifies a set of codes drawn from one or more code systems, intended for use in a particular context. ValueSets function as bridges between CodeSystem definitions and their practical applications in coded elements within FHIR implementations.

- **Status**: Normative (from v4.0.0)
- **Security Category**: Anonymous
- **Maturity Level**: N (Normative)
- **ANSI Approved**: Yes

## Two Fundamental Aspects

ValueSets possess dual representations:
- **Compose (.compose)**: Defines which codes should be included ("intension") -- rules-based selection
- **Expansion (.expansion)**: Lists actual codes meeting those rules ("extension") -- enumerated results

The resource may carry either aspect, both, or neither (metadata-only representations).

## Resource Structure and Elements

### Metadata Elements

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **url** | 0..1 | uri | Canonical identifier for referencing in specifications |
| **identifier** | 0..* | Identifier | Formal identifier for non-FHIR contexts |
| **version** | 0..1 | string | Business version; arbitrary, author-managed |
| **name** | 0..1 | string | Machine-friendly name for code generation |
| **title** | 0..1 | string | Human-friendly descriptive title |
| **status** | 1..1 | code | draft | active | retired | unknown (Required; Modifier element) |
| **experimental** | 0..1 | boolean | For testing purposes only |
| **date** | 0..1 | dateTime | Creation or revision date |
| **publisher** | 0..1 | string | Publishing organization or individual |
| **contact** | 0..* | ContactDetail | Publisher contact information |
| **description** | 0..1 | markdown | Consumer-perspective description |
| **useContext** | 0..* | UsageContext | Intended usage contexts |
| **jurisdiction** | 0..* | CodeableConcept | Geographic/legal region (Extensible binding) |
| **immutable** | 0..1 | boolean | If true, no new versions of content logical definition permitted |
| **purpose** | 0..1 | markdown | Explanation of necessity and design rationale |
| **copyright** | 0..1 | markdown | Legal restrictions on use and publishing |

### Compose Element (0..1)

Defines value set contents via inclusion/exclusion criteria.

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **lockedDate** | 0..1 | date | Effective date determining referenced code system versions when versions unspecified |
| **inactive** | 0..1 | boolean | Whether inactive codes included in expansion |

### Compose.Include (1..*, BackboneElement)

Include one or more codes from a code system or other value set(s).

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **system** | 0..1 | uri | Absolute URI of source code system |
| **version** | 0..1 | string | Specific code system version; '*' indicates all versions |
| **concept** | 0..* | BackboneElement | Individual codes to include |
| **concept.code** | 1..1 | code | Code identifier |
| **concept.display** | 0..1 | string | Context-specific display text |
| **concept.designation** | 0..* | BackboneElement | Alternative representations |
| **filter** | 0..* | BackboneElement | Property-based code selection |
| **filter.property** | 1..1 | code | Code system property identifier |
| **filter.op** | 1..1 | code | = | is-a | descendent-of | is-not-a | regex | in | not-in | generalizes | exists |
| **filter.value** | 1..1 | string | Match criteria |
| **valueSet** | 0..* | canonical(ValueSet) | References to other ValueSets; multiple = union |

### Compose.Exclude (0..*, BackboneElement)

Exclude codes from the value set. Mirrors include structure exactly.

### Compose Constraints

- A value set include/exclude SHALL have a value set or a system
- A value set with concepts or filters SHALL include a system
- Cannot have both concept and filter in the same include/exclude
- If multiple filters are specified within an include, they SHALL all be true (AND logic)

### Expansion Element (0..1)

Represents enumerated value set contents after expansion.

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **identifier** | 0..1 | uri | Unique identifier for this expansion (based on parameters) |
| **timestamp** | 1..1 | dateTime | Expansion generation time (Required) |
| **total** | 0..1 | integer | Total concept count; permits server pagination |
| **offset** | 0..1 | integer | Pagination offset; absent if no paging |
| **parameter** | 0..* | BackboneElement | Parameters that controlled expansion |
| **parameter.name** | 1..1 | string | Parameter identifier |
| **parameter.value[x]** | 0..1 | string|boolean|integer|decimal|uri|code|dateTime | Parameter value |
| **contains** | 0..* | BackboneElement | Enumerated codes; hierarchically nestable |

### Expansion.Contains Elements

| Sub-element | Cardinality | Type | Description |
|-------------|-------------|------|-------------|
| **system** | 0..1 | uri | Code system URI |
| **abstract** | 0..1 | boolean | If true, entry is for navigation only, user cannot select directly |
| **inactive** | 0..1 | boolean | If the concept is inactive in its code system |
| **version** | 0..1 | string | Code system version |
| **code** | 0..1 | code | If missing, entry is a place holder in hierarchy |
| **display** | 0..1 | string | Recommended display text |
| **designation** | 0..* | BackboneElement | Alternative representations |
| **contains** | 0..* | (recursive) | Nested entries in hierarchy |

### Expansion Constraints

- SHALL have a code or a display
- Must have a code if not abstract
- Must have a system if a code is present

## ValueSet Characteristics

**Intensional vs. Extensional:**
- **Intensional**: Algorithmically defined; dynamically updated (e.g., "all beta blocker drugs")
- **Extensional**: Enumerated lists; greater maintenance burden but finer control

## Operations

- **$expand**: Generate an expansion given the composition rules, in a particular context
- **$validate-code**: Check whether a given code or concept is in the value set

## Identification Mechanisms

1. **logical id** (.id): Server-specific; changes during transfers
2. **canonical URL** (.url): Persistent identifier across all copies; SHOULD be globally unique
3. **identifier**: System/value pair for non-FHIR contexts (e.g., HL7 v3)

## Related Resources

ValueSets are referenced by: StructureDefinition, OperationDefinition, Questionnaire, ConceptMap, DataRequirement, ElementDefinition, CodeSystem, ObservationDefinition, and ResearchElementDefinition.
