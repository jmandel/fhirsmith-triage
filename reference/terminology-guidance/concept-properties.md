<!-- Source: https://hl7.org/fhir/R4/codesystem-concept-properties.html -->
<!-- Reference material for triage agents: Standard concept properties for code systems in FHIR R4 -->

# FHIR Defined Concept Properties

## System URI

`http://hl7.org/fhir/concept-properties`

**Version**: 4.0.1
**Maturity Level**: Normative
**Committee**: Vocabulary Work Group

## Overview

A set of common concept properties for use on coded systems throughout the FHIR ecosystem. These properties can be returned by `$lookup` and `$validate-code` operations, and used in `$expand` results.

## Standard Properties

| Code | Display | Type | Description |
|------|---------|------|-------------|
| `inactive` | Inactive | boolean | True if the concept is not considered active (not a valid concept any more). Default value is false. |
| `deprecated` | Deprecated | dateTime | The date at which a concept was deprecated. Deprecated but not inactive concepts can still be used, but their use is discouraged. They should be expected to be made inactive in a future release. |
| `notSelectable` | Not Selectable | boolean | The concept is not intended to be chosen by the user -- only intended to be used as a selector for other concepts. Interpretation is contextual. |
| `parent` | Parent | code | The concept identified in this property is a parent of the concept on which it is a property. Meaning defined by hierarchyMeaning attribute. |
| `child` | Child | code | The concept identified in this property is a child of the concept on which it is a property. Meaning defined by hierarchyMeaning attribute. |

## Usage in Operations

### $lookup
When a `$lookup` is performed, the server may return these properties as part of the response. The `inactive` and `deprecated` properties are particularly important for determining whether a code should still be used.

### $validate-code
During validation, the `inactive` property can affect whether a code is considered valid. Some value sets explicitly include or exclude inactive codes.

### $expand
During expansion, `notSelectable` concepts may be included for hierarchy display but should not be selectable by users. The `inactive` property can be used to filter results.

## Code System-Specific Properties

Individual code systems define additional properties beyond these standard ones:

- **SNOMED CT**: `effectiveTime`, `moduleId`, `normalForm`, `normalFormTerse`, `semanticTag`, `sufficientlyDefined`, plus concept model attributes as properties
- **LOINC**: `STATUS`, `COMPONENT`, `PROPERTY`, `TIME_ASPCT`, `SYSTEM`, `SCALE_TYP`, `METHOD_TYP`, `CLASS`, and others
- **RxNorm**: Semantic types (STY), source (SAB), term types (TTY)

## Relevance to Triage

When comparing `$validate-code` or `$lookup` responses between prod and dev servers, differences in property values (especially `inactive` and `deprecated`) may indicate:
- Different code system versions loaded
- Different handling of deprecated/inactive concepts
- Different property resolution logic
