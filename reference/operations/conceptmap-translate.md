<!-- Source: https://hl7.org/fhir/R4/conceptmap-operation-translate.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# ConceptMap $translate

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/ConceptMap-translate`

**Endpoints:**
- `[base]/ConceptMap/$translate`
- `[base]/ConceptMap/[id]/$translate`

**Type:** Idempotent Operation

**Standards Status:** Trial Use (Maturity Level 3)

## Description

Translates a code from one value set to another based on existing value set and concept map resources, plus other server knowledge.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **url** | 0..1 | uri | Canonical URL for a concept map the server recognizes, either explicitly defined or implicitly known through code systems. |
| **conceptMap** | 0..1 | ConceptMap | Concept map provided directly in the request; servers may decline this approach. |
| **conceptMapVersion** | 0..1 | string | Identifier for a specific concept map version, managed arbitrarily by the author (e.g., timestamp like yyyymmdd). |
| **code** | 0..1 | code | Code requiring translation; requires a `system` parameter when provided. |
| **system** | 0..1 | uri | System URI for the code being translated. |
| **version** | 0..1 | string | Version of the system if provided in source data. |
| **source** | 0..1 | uri | Value set URI (logical id or absolute/relative location) where the code was selected. SHOULD always be supplied to enable safe concept map identification. |
| **coding** | 0..1 | Coding | A coding structure to translate. |
| **codeableConcept** | 0..1 | CodeableConcept | Full CodeableConcept for translation; server may translate any included coding values. |
| **target** | 0..1 | uri | Value set URI where translation is sought. If omitted, the server returns all known translations. |
| **targetsystem** | 0..1 | uri | Target code system URI for mapping; alternative to the `target` parameter -- only one is required. Unrestricted system searches may yield unsafe results. |
| **dependency** | 0..* | (part) | Additional elements supporting correct mapping. |
| **dependency.element** | 0..1 | uri | Element identifier for the dependency. |
| **dependency.concept** | 0..1 | CodeableConcept | Value for the dependency. |
| **reverse** | 0..1 | boolean | When true, returns all codes potentially mapping to the provided code, reversing source/target meanings. |

**Constraint:** Exactly one of `code`, `coding`, or `codeableConcept` must be provided.

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **result** | 1..1 | boolean | Success indicator. True only when at least one match has an equivalence other than "unmatched" or "disjoint". |
| **message** | 0..1 | string | Human-readable error or advisory text. When present with result=true, provides hints and warnings (e.g., suggestions for improving matches). |
| **match** | 0..* | (part) | Concept in the target value set with equivalence. May include multiple matches with equal or differing equivalences, and may include values indicating no match. |
| **match.equivalence** | 0..1 | code | Equivalence code from the ConceptMapEquivalence value set. |
| **match.concept** | 0..1 | Coding | Translation result. Never has `userSelected=true` since translation is not user-driven. |
| **match.product** | 0..* | (part) | Additional element produced by the mapping. |
| **match.product.element** | 0..1 | uri | Element identifier for the product. |
| **match.product.concept** | 0..1 | Coding | Product value. |
| **match.source** | 0..1 | uri | Canonical reference to the concept map source for this mapping. |

### ConceptMapEquivalence Values

The `match.equivalence` field uses the ConceptMapEquivalence value set, which includes:

| Value | Description |
|-------|-------------|
| `relatedto` | The concepts are related but the exact relationship is not specified. |
| `equivalent` | The definitions of the concepts mean the same thing. |
| `equal` | The concepts are exactly the same (i.e., same definition, same code). |
| `wider` | The target concept is broader in meaning than the source concept. |
| `subsumes` | The target concept subsumes the source concept. |
| `narrower` | The target concept is narrower in meaning than the source concept. |
| `specializes` | The target concept specializes the source concept. |
| `inexact` | The target concept overlaps but has both broader and narrower meaning. |
| `unmatched` | There is no match for this concept in the target. |
| `disjoint` | There is no match and the concepts are explicitly disjoint. |

## Behavioral Notes

- The client passes either a concept map or value sets for source/destination.
- If no concept map is provided, the server determines the mapping from context.
- If no context is provided, the server uses entire coding system value sets.
- The server returns an error if the mapping cannot be determined.
- Some servers may require an explicit concept map.
- The `source` parameter SHOULD always be supplied to enable safe concept map identification.
- The `target` parameter limits results to a specific destination value set; omitting it returns all known translations.

## Examples

### GET Request

```
GET [base]/ConceptMap/$translate?system=http://hl7.org/fhir/composition-status&code=preliminary&source=http://hl7.org/fhir/ValueSet/composition-status&target=http://hl7.org/fhir/ValueSet/v3-ActStatus
```

### Success Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "result",
      "valueBoolean": true
    },
    {
      "name": "match",
      "part": [
        {
          "name": "equivalence",
          "valueCode": "equivalent"
        },
        {
          "name": "concept",
          "valueCoding": {
            "system": "http://hl7.org/fhir/v3/ActStatus",
            "code": "active",
            "userSelected": false
          }
        }
      ]
    }
  ]
}
```
