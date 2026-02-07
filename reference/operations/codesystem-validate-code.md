<!-- Source: https://hl7.org/fhir/R4/codesystem-operation-validate-code.html -->
<!-- FHIR R4 (v4.0.1) Specification Content -->

# CodeSystem $validate-code

**Operation Definition URL:** `http://hl7.org/fhir/OperationDefinition/CodeSystem-validate-code`

**Endpoints:**
- `[base]/CodeSystem/$validate-code`
- `[base]/CodeSystem/[id]/$validate-code`

**Type:** Idempotent Operation

**Standards Status:** Normative (from v4.0.1)

## Description

Validates that a coded value exists within a code system. When not called at the instance level, either the `url` or `codeSystem` parameter must be provided. The operation returns a boolean result, an optional error message, and a recommended display for the code.

**Key Constraint:** A client SHALL provide exactly one of: (code + system), coding, or codeableConcept. Other parameters including version and display are optional.

## Input Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **url** | 0..1 | uri | CodeSystem URL. The server must know the code system (defined explicitly or implicitly). |
| **codeSystem** | 0..1 | CodeSystem | The code system provided directly in the request. Servers may decline this approach. Used when validating against non-stored systems. |
| **code** | 0..1 | code | The code to be validated. |
| **version** | 0..1 | string | The version of the code system, if provided in source data. |
| **display** | 0..1 | string | Associated display value. Requires a code if provided. The server cannot validate the display without a code, but may return a recommended display via the output `display` parameter. Case sensitivity depends on the code system. |
| **coding** | 0..1 | Coding | A coding to validate. The system must match the specified code system. |
| **codeableConcept** | 0..1 | CodeableConcept | Full CodeableConcept to validate. The server returns true if any coding exists in the system and may validate that multiple codings are not in conflict with each other. |
| **date** | 0..1 | dateTime | Validation date. Defaults to current conditions but allows historical validation for past applicability. A typical example would be where code selection is constrained to the set of codes that were available when the patient was treated, not when the record is being edited. |
| **abstract** | 0..1 | boolean | If true, abstract concepts are considered valid. If false, abstract codes are invalid. Abstract concepts are logical groupings unsuitable for concrete records but appropriate in other contexts (e.g., decision making criteria, editing value sets). |
| **displayLanguage** | 0..1 | code | Language for description display during validation. |

## Output Parameters

| Name | Cardinality | Type | Description |
|------|-------------|------|-------------|
| **result** | 1..1 | boolean | True if the supplied concept details are valid. |
| **message** | 0..1 | string | Error details if result is false. May contain hints and warnings when result is true. |
| **display** | 0..1 | string | A valid display for the concept if the system wishes to present it to users. |

## Usage Notes

- The operation is idempotent.
- When not invoked at the instance level, one of `url` or `codeSystem` must be provided so the server can identify which code system to validate against.
- The `abstract` parameter allows clients to indicate whether they are working in a context where abstract/logical grouping codes are appropriate (e.g., value set editing, decision support) versus a clinical recording context where only concrete codes should be used.
- The `date` parameter supports historical validation scenarios where the set of valid codes may have changed over time.
