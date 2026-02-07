# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 3103b01
**Tolerance**: hgvs-extra-syntax-issue

## What differs

Both prod and dev correctly return `result=false` when validating invalid HGVS codes against `http://varnomen.hgvs.org`. They agree on system, code, message, and the error-level OperationOutcome issue ("Unknown code 'NC_000003.11' in the CodeSystem 'http://varnomen.hgvs.org' version '2.0'").

The sole difference: dev returns an additional informational-level OperationOutcome issue that prod does not:

```json
{
  "severity": "information",
  "code": "code-invalid",
  "details": {
    "text": "Error while processing 'NC_000003.11': Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'.",
    "coding": [{"system": "http://hl7.org/fhir/tools/CodeSystem/tx-issue-type", "code": "invalid-code"}]
  },
  "expression": ["Coding.code"]
}
```

This is HGVS-specific syntax validation feedback — dev validates the HGVS nomenclature format and reports the specific syntax error, while prod only reports the code as unknown.

## Category: `temp-tolerance`

This is a real, meaningful difference in validation messages — not equivalent. Dev provides additional syntax validation detail that prod does not. Per AGENTS.md, validation messages are meaningful terminology content. This is a consistent pattern across all 62 HGVS content-differs records (same message text: "Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'"), so it represents a single behavioral difference rather than a one-off.

## Tolerance

**ID**: `hgvs-extra-syntax-issue`
**Bug**: 3103b01
**Records eliminated**: 62

The tolerance matches `$validate-code` responses for system `http://varnomen.hgvs.org` where dev has more OperationOutcome issues than prod, and the extra dev issues are informational-level with text starting "Error while processing". It normalizes by filtering out those extra informational issues from dev's response.

Validation: sampled 10/62 eliminated records — all confirmed as HGVS records with the same pattern (result=false on both sides, single extra informational issue from dev, matching issue counts after filtering).
