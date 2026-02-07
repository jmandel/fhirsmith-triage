# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: dev-crash-on-error
**Status**: prod=422 dev=500
**Bug**: 9376cf0
**Tolerance**: expand-dev-crash-on-error

## What differs

When a $expand request fails because a CodeSystem's content mode prevents expansion, prod returns HTTP 422 with a clear OperationOutcome error. Dev returns HTTP 500 with corrupted or internal error messages.

This record specifically: prod says "The code system definition for http://hl7.org/fhir/sid/icd-9-cm is a **fragment**, so this expansion is not permitted unless the expansion parameter 'incomplete-ok' has a value of 'true'". Dev says the same thing but with `contentMode() {\r\n    return this.codeSystem.content;\r\n  }` where the word "fragment" should be — a JavaScript function body leaked into the error message.

Additional differences:
- Issue code: prod=`invalid`, dev=`business-rule`
- Dev includes `location: [null]` and `expression: [null]` (arrays containing null — invalid FHIR)
- Dev omits the `text` narrative div

Across all 186 affected records, three sub-patterns:
1. **contentMode() source code leak** (178 records): `.contentMode` property accessor `.toString()`'d instead of invoked. Code systems: icd-9-cm (154), progyny identifier-type-cs (24).
2. **exp.addParamUri is not a function** (4 records): JS TypeError for x12.org/005010/1365 CodeSystem.
3. **TerminologyError is not a constructor** (4 records): JS TypeError for v2-0360|2.7 CodeSystem.

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev crashes (500) when it should return a graceful error (422). The source code leak in error messages is a bug. Filed as git-bug 9376cf0.

## Tolerance

Tolerance `expand-dev-crash-on-error` skips all records matching POST /r4/ValueSet/$expand with prod.status=422 and dev.status=500. Eliminates 186 records (1096 → 910 deltas). Validated by sampling 10 random eliminated records — all confirmed to be legitimate dev-crash-on-error expand records with no false positives.
