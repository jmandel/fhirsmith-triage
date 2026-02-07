<!-- Source: https://hl7.org/fhir/R4/operationoutcome.html -->
<!-- FHIR R4 (v4.0.1) specification content -->

# FHIR R4 OperationOutcome Resource

## Resource Overview

The OperationOutcome resource represents a collection of error, warning, or information messages that result from a system action. It provides detailed information about the outcome of attempted system operations.

- **Status**: Normative (from v4.0.0)
- **Security Category**: Not specified
- **Maturity Level**: N (Normative)
- **ANSI Approved**: Yes

## Usage Contexts

OperationOutcome resources are used in:

- RESTful interaction or operation failures
- Validation operation responses providing outcome information
- Message response components, typically when processing fails
- Batch/transaction responses when requested
- Search Bundle responses containing search information (as entries with search.mode = "outcome")

## Boundaries and Relationships

This resource is NOT used for reporting clinical or workflow issues -- those are handled via DetectedIssue or other resources. OperationOutcome is not designed for persistence or workflow references. However, both OperationOutcome and DetectedIssue can coexist, where OperationOutcome indicates action rejection and DetectedIssue provides issue details.

Referenced by: GuidanceResponse and MessageHeader.

## Resource Structure and Elements

### Root Element: OperationOutcome

Type: DomainResource

Inherited Elements:
- From Resource: `id`, `meta`, `implicitRules`, `language`
- From DomainResource: `text`, `contained`, `extension`, `modifierExtension`

### issue (1..*, BackboneElement) - REQUIRED

At least one issue must be present in every OperationOutcome instance.

#### severity (1..1, code) - REQUIRED

Indicates whether the issue indicates a variation from successful processing.

Binding: IssueSeverity (Required)

| Value | Description |
|-------|-------------|
| **fatal** | The issue caused the action to fail permanently |
| **error** | The issue caused the action to fail |
| **warning** | The issue is a warning |
| **information** | The issue is purely informational |

#### code (1..1, code) - REQUIRED

Describes the type of the issue. The system creating an OperationOutcome SHALL choose the most applicable code from the IssueType value set and may additionally provide its own code in the details element.

Binding: IssueType (Required)

Common IssueType values include: invalid, structure, required, value, invariant, security, login, unknown, expired, forbidden, suppressed, processing, not-supported, duplicate, multiple-matches, not-found, deleted, too-long, code-invalid, extension, too-costly, business-rule, conflict, transient, lock-error, no-store, exception, timeout, incomplete, throttled, informational.

#### details (0..1, CodeableConcept)

Additional details about the error. May be a text description or a system code that identifies the error.

Binding: OperationOutcomeCodes (Example)

#### diagnostics (0..1, string)

Additional diagnostic information about the issue. Typically technical details for debugging.

#### location (0..*, string) - DEPRECATED

For resource issues: simple XPath limited to element names and repetition indicators.
For HTTP errors: format is "http." + the parameter name.

Replaced by the `expression` element.

#### expression (0..*, string)

A simplified FHIRPath statement limited to element names, repetition indicators, and the default child accessor that identifies one of the elements in the resource that caused this issue.

Constraint: Expressions SHALL NOT contain a `.resolve()` function.

## Expression Element Guidelines

### Resource Element References

```
Patient.identifier
Patient.identifier[2].value
```

### HTTP Header/Parameter Reporting

Errors in HTTP headers or query parameters use format: `http.` + header or parameter name

| Expression | Description |
|------------|-------------|
| `http.code` | Reference to search parameter "code" |
| `http."name:exact"` | Reference to search parameter "name" with modifier ":exact" |
| `http.Authorization` | Reference to Authorization header |

Convention: HTTP headers begin with uppercase; URL parameters with lowercase, preventing name collisions.

## REST Interface Behavior

Operation outcome resources on RESTful interfaces provide computable detail exceeding HTTP response codes:

- More granular location information about issues
- Identification of multiple distinct issues
- Fine-grained error codes connecting to known business failure states

Alignment requirement: Returned operation outcomes SHOULD align with HTTP response codes. If HTTP indicates failure (status 300+), at least one issue should have severity "error" indicating the failure reason.

## Terminology Bindings Summary

| Path | Definition | Binding |
|------|-----------|---------|
| OperationOutcome.issue.severity | How the issue affects success | Required (IssueSeverity) |
| OperationOutcome.issue.code | Type of issue | Required (IssueType) |
| OperationOutcome.issue.details | Exact issue details | Example (OperationOutcomeCodes) |
