<!-- Source: https://hl7.org/fhir/R4/valueset-operation-validate-code.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# ValueSet $validate-code

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/ValueSet-validate-code`

**Endpoints:**
- `[base]/ValueSet/$validate-code`
- `[base]/ValueSet/[id]/$validate-code`

**Type:** Idempotent Operation

**Standards Status:** Normative (from v4.0.1)

## Description

Validate that a coded value is in the set of codes allowed by a value set.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **url** | 0..1 | uri | Value set canonical URL. The server must know the value set (e.g. it is defined explicitly in the server's value sets, or it is defined implicitly by some code system known to the server). |
| **context** | 0..1 | uri | The context of the value set, so that the server can resolve this to a value set to validate against. The recommended format for this URI is `[Structure Definition URL]#[name or path into structure definition]` e.g. `http://hl7.org/fhir/StructureDefinition/observation-hspc-height-hspcheight#Observation.interpretation`. Other forms may be used but are not defined. This form is only usable if the terminology server also has access to the conformance registry that the server is using, but can be used to delegate the mapping from an application context to a binding at run-time. |
| **valueSet** | 0..1 | ValueSet | The value set is provided directly as part of the request. Servers may choose not to accept value sets in this fashion. This parameter is used when the client wants the server to expand a value set that is not stored on the server. |
| **valueSetVersion** | 0..1 | string | The identifier that is used to identify a specific version of the value set to be used when validating the code. This is an arbitrary value managed by the value set author and is not expected to be globally unique. For example, it might be a timestamp (e.g. yyyymmdd) if a managed version is not available. |
| **code** | 0..1 | code | The code that is to be validated. If a code is provided, a system or a context must be provided (if a context is provided, then the server SHALL ensure that the code is not ambiguous without a system). |
| **system** | 0..1 | uri | The system for the code that is to be validated. |
| **systemVersion** | 0..1 | string | The version of the system, if one was provided in the source data. |
| **display** | 0..1 | string | The display associated with the code, if provided. If a display is provided a code must be provided. If no display is provided, the server cannot validate the display value, but may choose to return a recommended display name using the display parameter in the outcome. Whether displays are case sensitive is code system dependent. |
| **coding** | 0..1 | Coding | A coding to validate. |
| **codeableConcept** | 0..1 | CodeableConcept | A full CodeableConcept to validate. The server returns true if one of the coding values is in the value set, and may also validate that the codings are not in conflict with each other if more than one is present. |
| **date** | 0..1 | dateTime | The date for which the validation should be checked. Normally, this is the current conditions (which is the default value) but under some circumstances, systems need to validate that a correct code was used at some point in the past. A typical example of this would be where code selection is constrained to the set of codes that were available when the patient was treated, not when the record is being edited. Note that which date is appropriate is a matter for implementation policy. |
| **abstract** | 0..1 | boolean | If this parameter has a value of true, the client is stating that the validation is being performed in a context where a concept designated as 'abstract' is appropriate/allowed to be used, and the server should regard abstract codes as valid. If this parameter is false, abstract codes are not considered to be valid. Note that 'abstract' is a property defined by many HL7 code systems that indicates that the concept is a logical grouping concept that is not intended to be used as a 'concrete' concept in an actual patient/care/process record. This language is borrowed from Object Oriented theory where 'abstract' objects are never instantiated. However in the general record and terminology eco-system, there are many contexts where it is appropriate to use these codes e.g. as decision making criterion, or when editing value sets themselves. This parameter allows a client to indicate to the server that it is working in such a context. |
| **displayLanguage** | 0..1 | code | Specifies the language to be used for description when validating the display property. |

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **result** | 1..1 | boolean | True if the concept details supplied are valid. |
| **message** | 0..1 | string | Error details, if result is false. If this is provided when result is true, the message carries hints and warnings. |
| **display** | 0..1 | string | A valid display for the concept if the system wishes to display this to a user. |

## Key Constraints and Behavior

- If the operation is not called at the instance level, one of `url`, `context`, or `valueSet` must be provided.
- One (and only one) of `code`, `coding`, or `codeableConcept` must be provided.
- If a `code` is provided, a `system` or a `context` must also be provided. If a context is provided, the server SHALL ensure that the code is not ambiguous without a system.
- For CodeableConcept input, the server checks if any of the coding values is in the value set and may verify that multiple codings are not in conflict.
- Every code system has an implicit value set representing all concepts defined in the system.
- Whether displays are case sensitive is code system dependent.

## Examples

### Simple GET Validation

```
GET [base]/ValueSet/23/$validate-code?system=http://loinc.org&code=1963-8&display=test
```

### POST with CodeableConcept and Client-Specified ValueSet

**Request:**
```
POST [base]/ValueSet/$validate-code
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "codeableConcept",
      "valueCodeableConcept": {
        "coding": [
          {
            "system": "http://loinc.org",
            "code": "1963-8",
            "display": "test"
          }
        ]
      }
    },
    {
      "name": "valueSet",
      "resource": {
        "resourceType": "ValueSet"
      }
    }
  ]
}
```

**Response:**
```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "result",
      "valueBoolean": false
    },
    {
      "name": "message",
      "valueString": "The display \"test\" is incorrect"
    },
    {
      "name": "display",
      "valueString": "Bicarbonate [Moles/volume] in Serum"
    }
  ]
}
```
