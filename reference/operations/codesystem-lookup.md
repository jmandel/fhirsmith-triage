<!-- Source: https://hl7.org/fhir/R4/codesystem-operation-lookup.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# CodeSystem $lookup

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/CodeSystem-lookup`

**Endpoints:**
- `[base]/CodeSystem/$lookup`
- `[base]/CodeSystem/[id]/$lookup`

**Type:** Idempotent Operation

## Description

Given a code/system, or a Coding, get additional details about the concept, including definition, status, designations, and properties. More than just a code system search - the server finds the concept, and gathers the return information from the underlying code system definitions.

**Key Requirement:** A client must provide either system + code parameters or a coding parameter when invoking this operation.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **code** | 0..1 | code | The code that is to be located. If a code is provided, a system must be provided. |
| **system** | 0..1 | uri | The system for the code that is to be located. |
| **version** | 0..1 | string | The version of the system, if one was provided in the source data. |
| **coding** | 0..1 | Coding | A coding to look up. |
| **date** | 0..1 | dateTime | The date for which the information should be returned. Normally, this is the current conditions (which is the default value) but under some circumstances, systems need to access this information as it would have been in the past. A typical example of this would be where code selection is constrained to the set of codes that were available when the patient was treated, not when the record is being edited. Note that which date is appropriate is a matter for implementation policy. |
| **displayLanguage** | 0..1 | code | The requested language for display (see `$expand.displayLanguage`). |
| **property** | 0..* | code | A property that the client wishes to be returned in the output. If no properties are specified, the server chooses what to return. The following properties are defined for all code systems: `url`, `name`, `version` (code system info) and code information: `display`, `definition`, `designation`, `parent` and `child`, and for designations, `lang.X` where X is a designation language code. Some of the properties are returned explicitly in named parameters (when the names match), and the rest (except for `lang.X`) in the property parameter group. |

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **name** | 1..1 | string | A display name for the code system. |
| **version** | 0..1 | string | The version that these details are based on. |
| **display** | 1..1 | string | The preferred display for this concept. |
| **designation** | 0..* | (part) | Additional representations for this concept. |
| **designation.language** | 0..1 | code | The language this designation is defined for. |
| **designation.use** | 0..1 | Coding | A code that details how this designation would be used. |
| **designation.value** | 1..1 | string | The text value for this designation. |
| **property** | 0..* | (part) | One or more properties that contain additional information about the code, including status. For complex terminologies (e.g. SNOMED CT, LOINC, medications), these properties serve to decompose the code. |
| **property.code** | 1..1 | code | Identifies the property returned. |
| **property.value** | 0..1 | code, Coding, string, integer, boolean, dateTime, or decimal | The value of the property returned. |
| **property.description** | 0..1 | string | Human Readable representation of the property value (e.g. display for a code). |
| **property.subproperty** | 0..* | (part) | Nested Properties (mainly used for SNOMED CT decomposition, for relationship Groups). |
| **property.subproperty.code** | 1..1 | code | Identifies the sub-property returned. |
| **property.subproperty.value** | 1..1 | code, Coding, string, integer, boolean, dateTime, or decimal | The value of the sub-property returned. |
| **property.subproperty.description** | 0..1 | string | Human Readable representation of the property value (e.g. display for a code). |

## Standard Properties (All Code Systems)

The following properties are defined for all code systems:

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

Additional properties may be defined by specific code systems (e.g. SNOMED CT, LOINC, RxNorm).

## Examples

### GET Request with System and Code

```
GET [base]/CodeSystem/$lookup?system=http://loinc.org&code=1963-8
```

### GET Request with Specific Properties

```
GET [base]/CodeSystem/$lookup?system=http://loinc.org&code=1963-8&property=code&property=display&property=designations
```

### POST Request with Coding Parameter

```xml
POST [base]/CodeSystem/$lookup

<Parameters xmlns="http://hl7.org/fhir">
  <parameter>
    <name value="coding"/>
    <valueCoding>
      <system value="http://loinc.org"/>
      <code value="1963-8"/>
    </valueCoding>
  </parameter>
</Parameters>
```

### Success Response

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "name",
      "valueString": "LOINC"
    },
    {
      "name": "version",
      "valueString": "2.48"
    },
    {
      "name": "display",
      "valueString": "Bicarbonate [Moles/volume] in Serum"
    },
    {
      "name": "abstract",
      "valueString": "false"
    },
    {
      "name": "designation",
      "part": [
        {
          "name": "value",
          "valueString": "Bicarbonate [Moles/volume] in Serum"
        }
      ]
    }
  ]
}
```

### Error Response

```json
{
  "resourceType": "OperationOutcome",
  "id": "exception",
  "text": {
    "status": "additional",
    "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">Code \"ABC-23\" not found</div>"
  },
  "issue": [
    {
      "severity": "error",
      "code": "not-found",
      "details": {
        "text": "Code \"ABC-23\" not found"
      }
    }
  ]
}
```
