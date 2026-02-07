<!-- Source: https://hl7.org/fhir/R4/parameters.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 Parameters Resource

## Resource Overview

The Parameters resource is a non-persisted resource used to pass information into and back from an operation. It has no other use, and there is no RESTful endpoint associated with it.

- **Status**: Normative (from v4.0.0)
- **Maturity Level**: N (Normative)
- **ANSI Approved**: Yes
- **Compartments**: Not linked to any defined compartments

## Scope and Usage

Parameters exclusively serve operation parameter exchange. There is no RESTful end-point associated with it, and it is never persisted.

## Relationship to OperationDefinition

The Parameters resource relates directly to OperationDefinition, which defines constraints on the Parameters resource instances that are used to convey the inputs and outputs of the operation.

## Resource Structure and Elements

### Root Element: Parameters

Inherits from Resource (not DomainResource).

### parameter (0..*, BackboneElement)

A parameter passed to or received from the operation.

| Element | Cardinality | Type | Description |
|---------|-------------|------|-------------|
| **name** | 1..1 | string | The name of the parameter (reference to operation definition) |
| **value[x]** | 0..1 | (see below) | If the parameter is a data type |
| **resource** | 0..1 | Resource | If the parameter is a whole resource |
| **part** | 0..* | (same as parameter) | A named part of a multi-part parameter (recursive) |

### value[x] Supported Types

The value[x] element supports 50+ data types including:

**Primitive types**: base64Binary, boolean, canonical, code, date, dateTime, decimal, id, instant, integer, markdown, oid, positiveInt, string, time, unsignedInt, uri, url, uuid

**Complex types**: Address, Age, Annotation, Attachment, CodeableConcept, Coding, ContactPoint, Count, Distance, Duration, HumanName, Identifier, Money, Period, Quantity, Range, Ratio, Reference, SampledData, Signature, Timing, ContactDetail, Contributor, DataRequirement, Expression, ParameterDefinition, RelatedArtifact, TriggerDefinition, UsageContext, Dosage, Meta

## Constraints and Invariants

### inv-1 (Rule level)

**Location**: Parameters.parameter

A parameter must have one and only one of (value, resource, part).

**FHIRPath Expression**:
```
(part.exists() and value.empty() and resource.empty()) or
(part.empty() and (value.exists() xor resource.exists()))
```

This ensures each parameter contains exactly one content type: either parts (multi-part), a single value, or a whole resource -- never combinations.

## Important Behavioral Notes

### Parameter Naming

Parameter names can be repeated at any level. The meaning of duplicate parameter names -- and whether it is valid to repeat any given parameter name -- depends on the context (defined by the OperationDefinition). The order of parameters with different names is not considered significant.

### Resource Uniqueness

Resources in `parameter.resource` do not need to be unique. Non-unique or versioned duplicate resources may create ambiguity unless parameter names clearly differentiate purposes.

### Internal Reference Resolution

When internal references are resolved in a resource in a `parameter.resource`, the resolution stops at `parameter.resource`. This permits resource repetition and prevents cross-parameter internal references except via contained resources.

### External Reference Resolution

When resolving references in resources, the applicable OperationDefinition may specify how references may be resolved between parameters. If a reference cannot be resolved between the parameters, the application should fall back to its general resource resolution methods.

### Technical Status

For technical compatibility reasons, the Parameters resource inherits from Resource, but since the parameter exchange format has no end-point and/or persistence, it never has an id, a versionId, or a lastUpdated. Other Resource features (tags, profiles, security labels, language) may apply in operational contexts.

## Search Parameters

None defined -- the Parameters resource has no persistence or RESTful endpoint.
