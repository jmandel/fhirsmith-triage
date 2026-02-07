<!-- Source: https://hl7.org/fhir/R4/codesystem-operation-subsumes.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# CodeSystem $subsumes

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/CodeSystem-subsumes`

**Endpoints:**
- `[base]/CodeSystem/$subsumes`
- `[base]/CodeSystem/[id]/$subsumes`

**Type:** Idempotent Operation

## Description

Tests the subsumption relationship between two codes or Codings based on the code system's hierarchyMeaning semantics. When invoking this operation, clients must provide both codes A and B (either as individual codes or Coding parameters). The system parameter is mandatory unless the operation is invoked on a specific CodeSystem resource instance.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **codeA** | 0..1 | code | The "A" code for subsumption testing. Requires the `system` parameter if provided. |
| **codeB** | 0..1 | code | The "B" code for subsumption testing. Requires the `system` parameter if provided. |
| **system** | 0..1 | uri | The code system in which subsumption testing occurs. Required unless invoked on a CodeSystem instance. |
| **version** | 0..1 | string | The specific version of the code system from the source data. |
| **codingA** | 0..1 | Coding | The "A" Coding for testing. The code system need not match the subsumption system, though relationships must be established. |
| **codingB** | 0..1 | Coding | The "B" Coding for testing. The code system need not match the subsumption system, though relationships must be established. |

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **outcome** | 1..1 | code | The subsumption relationship between codes A and B. Returns an error response with OperationOutcome if the relationship cannot be determined. |

### Possible Outcome Values

| Value | Description |
|-------|-------------|
| `equivalent` | Concepts A and B are equivalent (have the same meaning). |
| `subsumes` | Concept A subsumes Concept B (A is a broader/more general concept that includes B). |
| `subsumed-by` | Concept A is subsumed by Concept B (B is a broader/more general concept that includes A). |
| `not-subsumed` | No subsumption relationship exists between A and B in either direction. |

These values are drawn from the `concept-subsumption-outcome` value set.

## Key Behavioral Notes

- Both codes A and B must be provided by the client.
- The `system` parameter is required except when operating on a CodeSystem instance.
- If Codings from different code systems are provided, the server SHALL return an error unless cross-system relationships are well-defined.
- The subsumption test is based on the CodeSystem definition of subsumption (i.e., the `hierarchyMeaning` property of the code system).
- Server returns HTTP 200 with a Parameters resource on success.
- Server returns an error with OperationOutcome when the subsumption relationship cannot be determined.

## Examples

### GET Request with System and Codes

```
GET [base]/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=235856003&codeB=3738000
```

### POST Request with Codings and Version

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "system",
      "valueUri": "http://snomed.info/sct"
    },
    {
      "name": "version",
      "valueString": "http://snomed.info/sct/731000124108/version/20160301"
    },
    {
      "name": "codingA",
      "valueCoding": {
        "system": "http://snomed.info/sct",
        "code": "235856003"
      }
    },
    {
      "name": "codingB",
      "valueCoding": {
        "system": "http://snomed.info/sct",
        "code": "3738000"
      }
    }
  ]
}
```

### Success Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "outcome",
      "valueCode": "subsumes"
    }
  ]
}
```
