# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: eaeccdd
**Tolerance**: validate-code-extra-filter-miss-message

## What differs

Dev returns an extra `message` parameter on $validate-code when the code is valid (result=true) but doesn't match every include filter in the ValueSet. Prod omits the message entirely.

In this record, SNOMED code 716186003 ("No known allergy") is validated against the IPS allergies-intolerances ValueSet, which has 4 include filters:
1. concept<105590001 - code NOT found
2. concept<373873005 - code NOT found
3. concept<420134006 - code NOT found
4. concept<<716186003 - code FOUND

Both servers agree result=true (code is valid in the ValueSet). But dev returns:
```
message: "Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter"
```
Prod returns no message parameter at all.

All other parameters (result, system, code, version, display, codeableConcept) match exactly between prod and dev after normalization.

## Category: `temp-tolerance`

This is a real behavioral difference, not a cosmetic one. The `message` parameter in $validate-code responses carries meaningful information. Dev is surfacing intermediate filter-miss warnings that prod suppresses when the overall validation succeeds. Prod's behavior is arguably more appropriate — when the code IS valid, telling the user which specific include filters it didn't match is noise rather than signal. Filed as bug eaeccdd.

## Tolerance

Tolerance ID: `validate-code-extra-filter-miss-message`

Matches validate-code responses where:
- Both sides return result=true
- Dev has a `message` parameter that prod lacks
- Dev's message contains "is not in the specified filter"

Normalizes by stripping the extra `message` parameter from dev.

Eliminated 12 records (284 -> 272 deltas). All 12 validated: every one has result=true on both sides, a single diff of type extra-in-dev:message, and dev's message contains only "is not in the specified filter" warnings. All involve SNOMED codes against IPS ValueSets with multiple include filters.
