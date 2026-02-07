# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 9d6a37e
**Tolerance**: cpt-validate-code-missing-info-issue

## What differs

When validating an unknown CPT code (result=false), prod returns two OperationOutcome issues:
1. severity=error: "Unknown code '19304' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'"
2. severity=information: "Code '19304' not found in CPT"

Dev returns only the first (error) issue and omits the second (informational) issue.

Both sides agree on result=false, system (http://www.ama-assn.org/go/cpt), code (19304), and message text. The only difference after normalization is the missing informational issue in dev's OperationOutcome.

For the 2 ValueSet/$validate-code variants, prod also prefixes the message parameter with "Code 'X' not found in CPT; " which dev omits.

## Category: `temp-tolerance`

This is a real difference. The informational issue is meaningful validation feedback — it provides a human-friendly summary ("Code X not found in CPT") alongside the formal error. Dev should include this issue to match prod's behavior. Filed as bug 9d6a37e.

Not `equiv-autofix` because the informational issue carries terminology-relevant content.
Not `equiv-manual` because the difference is clearly meaningful (missing validation feedback).

## Tolerance

Tolerance ID: `cpt-validate-code-missing-info-issue`. Matches CPT validate-code records where result=false and prod has an extra informational "Code X not found in CPT" issue that dev lacks. Normalizes by stripping the extra informational issue from prod's OperationOutcome and removing the corresponding "Code X not found in CPT; " prefix from prod's message parameter.

Eliminates 10 records (8 CodeSystem/$validate-code, 2 ValueSet/$validate-code). All involve CPT codes 19304, 98000, or 99201 not found in version 2023. Validated all 10 eliminated records — each matches the expected pattern exactly, with no other differences being hidden.
