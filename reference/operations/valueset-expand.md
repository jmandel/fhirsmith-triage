<!-- Source: https://hl7.org/fhir/R4/valueset-operation-expand.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# ValueSet $expand

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/ValueSet-expand`

**Endpoints:**
- `[base]/ValueSet/$expand`
- `[base]/ValueSet/[id]/$expand`

**Type:** Idempotent Operation

## Description

The definition of a value set is used to create a simple collection of codes suitable for use for data entry or validation. When invoked, the operation returns an expanded value set or an OperationOutcome with an error message.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **url** | 0..1 | uri | A canonical reference to a value set. The server must know the value set (e.g. it is defined explicitly in the server's value sets, or it is defined implicitly by some code system known to the server). |
| **valueSet** | 0..1 | ValueSet | The value set is provided directly as part of the request. Servers may choose not to accept value sets in this fashion. |
| **valueSetVersion** | 0..1 | string | The identifier that is used to identify a specific version of the value set to be used when generating the expansion. This is an arbitrary value managed by the value set author and is not expected to be globally unique. For example, it might be a timestamp (e.g. yyyymmdd) if a managed version is not available. |
| **context** | 0..1 | uri | The context of the value set, so that the server can resolve this to a value set to expand. The recommended format for this URI is `[Structure Definition URL]#[name or path into structure definition]` e.g. `http://hl7.org/fhir/StructureDefinition/observation-hspc-height-hspcheight#Observation.interpretation`. Other forms may be used but are not defined. This form is only usable if the terminology server also has access to the conformance registry that the server is using, but can be used to delegate the mapping from an application context to a binding at run-time. |
| **contextDirection** | 0..1 | code | If a context is provided, a context direction may also be provided. Valid values are: `incoming` (the codes a client can use for PUT/POST operations) and `outgoing` (the codes a client might receive from the server). The purpose is to inform the server whether to use the value set associated with the context for reading or writing purposes (note: for most elements, this is the same value set, but there are a few elements where the reading and writing value sets are different). |
| **filter** | 0..1 | string | A text filter that is applied to restrict the codes that are returned (useful in a UI context). The interpretation of this is delegated to the server in order to allow to determine the most optimal search approach for the context. The server can document the way this parameter works in `TerminologyCapabilities..expansion.textFilter`. Typical usage includes: left matching (e.g. "acut ast"), wild cards (%, &, ?), searching on definition as well as display(s), search conditions (and/or/exclusions). Text search engines such as Lucene or Solr may also be used. The optional text search might also be code system specific, and servers might have different implementations for different code systems. |
| **date** | 0..1 | dateTime | The date for which the expansion should be generated. If a date is provided, it means that the server should use the value set / code system definitions as they were on the given date, or return an error if this is not possible. Normally, the date is the current conditions (which is the default value) but under some circumstances, systems need to generate an expansion as it would have been in the past. |
| **offset** | 0..1 | integer | Paging support - where to start if a subset is desired (default = 0). Offset is number of records (not number of pages). |
| **count** | 0..1 | integer | Paging support - how many codes should be provided in a partial page view. Paging only applies to flat expansions - servers ignore paging if the expansion is not flat. If count = 0, the client is asking how large the expansion is. Servers SHOULD honor this request for hierarchical expansions as well, and simply return the overall count. |
| **includeDesignations** | 0..1 | boolean | Controls whether concept designations are to be included or excluded in value set expansions. |
| **designation** | 0..* | string | A token that specifies a system+code that is either a use or a language. Designations that match by language or use are included in the expansion. If no designation is specified, it is at the server's discretion which designations to return. |
| **includeDefinition** | 0..1 | boolean | Controls whether the value set definition is included or excluded in value set expansions. |
| **activeOnly** | 0..1 | boolean | Controls whether inactive concepts are included or excluded in value set expansions. Note that if the value set explicitly specifies that inactive codes are included, this parameter can still remove them from a specific expansion, but this parameter cannot include them if the value set excludes them. |
| **excludeNested** | 0..1 | boolean | Controls whether or not the value set expansion nests codes or not (i.e. `ValueSet.expansion.contains.contains`). |
| **excludeNotForUI** | 0..1 | boolean | Controls whether or not the value set expansion is assembled for a user interface use or not. Value sets intended for UI might include 'abstract' codes or have nested contains with items with no code or abstract = true, with the sole purpose of helping a user navigate through the list efficiently, whereas a value set not generated for UI use might be flat, and only contain the selectable codes in the value set. The exact implications of 'for UI' depend on the code system and what properties it exposes for a terminology server to use. In the FHIR Specification itself, the value set expansions are generated with excludeNotForUI = false, and the expansions used when generating schema/code etc., or performing validation, are all excludeNotForUI = true. |
| **excludePostCoordinated** | 0..1 | boolean | Controls whether or not the value set expansion includes post coordinated codes. |
| **displayLanguage** | 0..1 | code | Specifies the language to be used for description in the expansions i.e. the language to be used for `ValueSet.expansion.contains.display`. |
| **exclude-system** | 0..* | canonical | Code system, or a particular version of a code system to be excluded from the value set expansion. The format is the same as a canonical URL: `[system]|[version]` - e.g. `http://loinc.org|2.56`. |
| **system-version** | 0..* | canonical | Specifies a version to use for a system, if the value set does not specify which one to use. The format is the same as a canonical URL: `[system]|[version]` - e.g. `http://loinc.org|2.56`. |
| **check-system-version** | 0..* | canonical | Edge Case: Specifies a version to use for a system. If a value set specifies a different version, an error is returned instead of the expansion. The format is the same as a canonical URL: `[system]|[version]` - e.g. `http://loinc.org|2.56`. |
| **force-system-version** | 0..* | canonical | Edge Case: Specifies a version to use for a system. This parameter overrides any specified version in the value set (and any it depends on). The format is the same as a canonical URL: `[system]|[version]` - e.g. `http://loinc.org|2.56`. Note that this has obvious safety issues, in that it may result in a value set expansion giving a different list of codes that is both wrong and unsafe, and implementers should only use this capability reluctantly. It primarily exists to deal with situations where specifications have fallen into decay as time passes. If the value is override, the version used SHALL explicitly be represented in the expansion parameters. |

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **return** | 1..1 | ValueSet | The result of the expansion. Servers generating expansions SHOULD ensure that all the parameters that affect the contents of the expansion are recorded in the `ValueSet.expansion.parameter` list. Note: as this is the only out parameter, it is a resource, and it has the name 'return', the result of this operation is returned directly as a resource. |

## Behavior Notes and Constraints

### Parameter Requirements

If the operation is not called at the instance level, one of the input parameters `url`, `context`, or `valueSet` must be provided.

### Result Transience

The value set expansion returned by this query should be treated as a transient result that will change over time (whether it does or not depends on how the value set is specified), so applications should repeat the operation each time the value set is used.

### Size Limitations

If the expansion is too large (at the discretion of the server), the server MAY return an error (OperationOutcome with code `too-costly`).

### Paging

Clients can navigate large flat expansions using `offset` and `count` parameters. Servers are not obliged to support paging, but if they do, they must support both parameters. Hierarchical expansions are not subject to paging.

If `count` = 0, the client is asking how large the expansion is. Servers SHOULD honor this request for hierarchical expansions as well, and simply return the overall count.

### Server Variations

Different servers may return different results due to:
- Underlying code systems being different (versions, defined behavior)
- Different filter optimization approaches
- Arbitrary grouping introduced to assist navigation

### Error Handling

When a server cannot correctly expand a value set because it does not fully understand the code systems (e.g. it has the wrong version, or incomplete definitions) then it SHALL return an error.

### Unbounded Expansions

If the value set itself is unbounded due to the inclusion of post-coordinated value sets (e.g. SNOMED CT, UCUM), then the extension `http://hl7.org/fhir/StructureDefinition/valueset-unclosed` can be used to indicate that the expansion is incomplete.

## Examples

### Expanding a Registered Value Set with Text Filter

```
GET [base]/ValueSet/23/$expand?filter=abdo
```

### Expanding by Canonical URL with Version

```
GET [base]/ValueSet/$expand?url=http://acme.com/fhir/ValueSet/23&valueSetVersion=1.5
```

### Expanding a Client-Specified Value Set via POST

```
POST [base]/ValueSet/$expand
```

```json
{
  "resourceType": "Parameters",
  "parameter": [
    {
      "name": "valueSet",
      "resource": {
        "resourceType": "ValueSet"
      }
    }
  ]
}
```

### Expanding with Paging

```
GET [base]/ValueSet/23/$expand?filter=abdo&offset=10&count=10
```

### Expanding with System Exclusions and Version Requirements

```
GET [base]/ValueSet/23/$expand?exclude-system=http://loinc.org&system-version=http://snomed.info/sct|http://snomed.info/sct/32506021000036107/version/20160430&force-system-version=http://snomed.info/sct|http://snomed.info/sct/32506021000036107/version/20160430&check-system-version=http://loinc.org|2.56
```

### Example Response

```json
{
  "resourceType": "ValueSet",
  "id": "43770626-f685-4ba8-8d66-fb63e674c467",
  "expansion": {
    "timestamp": "20141203T08:50:00+11:00",
    "contains": [
      {
        "system": "http://snomed.info/sct",
        "code": "263901007",
        "display": "Abdomen"
      }
    ]
  }
}
```
