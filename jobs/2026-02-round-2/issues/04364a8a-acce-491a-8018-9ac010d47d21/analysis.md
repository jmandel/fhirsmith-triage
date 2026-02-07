# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=idscl&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fconsentcategorycodes`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c
**Tolerance**: hl7-terminology-cs-version-skew

## What differs

Both servers agree `result=false` — code `idscl` is not valid in the `consent-category` ValueSet. Both return the same parameters (result, system, code, message, issues) with the same structure.

The only difference after normalization is the CodeSystem version string embedded in text:
- **Prod**: `version '4.0.1'` (in message and OperationOutcome issue details.text)
- **Dev**: `version '1.0.1'` (in message and OperationOutcome issue details.text)

Specifically:
- `message`: "Unknown code 'idscl' in the CodeSystem '...consentcategorycodes' version '**4.0.1**'" (prod) vs "version '**1.0.1**'" (dev)
- `issues.issue[0].details.text`: same version difference

## Category: `temp-tolerance`

This is a real, meaningful difference — dev has a different version of the `consentcategorycodes` CodeSystem loaded than prod. The version `4.0.1` (prod) vs `1.0.1` (dev) indicates different editions of the HL7 terminology package. While both agree on the validation result for this particular code, having different CodeSystem versions loaded could lead to substantive differences for other codes. This warrants a bug report.

The same pattern affects 4 CodeSystems under `terminology.hl7.org`:
- `consentcategorycodes`: prod=4.0.1, dev=1.0.1 (7 records)
- `goal-achievement`: prod=4.0.1, dev=1.0.1 (11 records)
- `consentpolicycodes`: prod=4.0.1, dev=3.0.1 (8 records)
- `v2-0116`: prod=2.9, dev=3.0.0 (6 records)

## Tolerance

Tolerance `hl7-terminology-cs-version-skew` matches validate-code records where:
1. System is `http://terminology.hl7.org/CodeSystem/*`
2. Message text differs only in `version '...'` strings

It normalizes dev's version strings in both `message` and `issues` OperationOutcome `details.text` to prod's values (positional replacement).

**Impact**: Eliminated 32 records from deltas (4485 -> 4453).

**Validation**: Sampled all 12 of 32 eliminated records. All confirmed:
- Same parameters on both sides
- Results agree (all `false`)
- Messages identical after version string normalization
- No hidden differences
