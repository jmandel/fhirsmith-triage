# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 40c3ecc
**Tolerance**: validate-code-filter-miss-message-prefix

## What differs

The `message` parameter differs between prod and dev. Both agree on result=false, version, codeableConcept, and issues. The only difference after normalization is that dev prepends "Code 385049006 is not in the specified filter; " before the standard error message that prod returns.

- **Prod message**: `"No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`
- **Dev message**: `"Code 385049006 is not in the specified filter; No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`

Dev is leaking internal filter-checking details into the user-facing message parameter. For ValueSets with multiple include filters, the prefix is repeated once per filter (some records have 17+ repetitions).

## Category: `temp-tolerance`

This is a real, meaningful difference in the message parameter content. Dev produces a different message than prod by including internal filter-miss details. Both servers agree on the validation result (false) and the error type, but the message text differs in a way that affects clients parsing the message. This is the result=false variant of bug eaeccdd (which covers the result=true case where prod omits message entirely).

## Tolerance

Tolerance ID: `validate-code-filter-miss-message-prefix` (bug 40c3ecc)

Matches validate-code records where result=false on both sides, dev's message ends with prod's message, and the extra prefix contains "is not in the specified filter". Normalizes dev's message to prod's value.

- 32 records matched the pattern in the full dataset
- 30 records eliminated from deltas (183 → 153)
- 2 records remain because they also have a SNOMED version diff (separate issue, correctly preserved)
- Validated 10 randomly sampled eliminations: all legitimate (result=false, message-only diff, filter prefix pattern confirmed)
