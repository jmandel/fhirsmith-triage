# Analysis: `temp-tolerance`

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd89513
**Tolerance**: dev-extra-display-lang-not-found-message

## What differs

After normalization (diagnostics stripped, parameters sorted, message-id extensions removed), the only difference is that dev returns two extra parameters that prod omits entirely:

1. **`message`**: `"There are no valid display names found for the code urn:iso:std:iso:3166#FR for language(s) 'fr'. The display is 'France' which is the default language display"`
2. **`issues`**: An OperationOutcome with one informational issue (severity=information, code=invalid, tx-issue-type=invalid-display) containing the same text, with expression `CodeableConcept.coding[0].display`.

Both sides agree on all substantive parameters: result=true, system=urn:iso:std:iso:3166, code=FR, version=2018, display=France, and identical codeableConcept.

The request includes `displayLanguage=fr` and validates code FR ("France") against the jurisdiction ValueSet. Dev generates informational feedback about display language resolution (the code system lacks a French-language display, so it falls back to the default "France"), while prod silently succeeds.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The `message` and `issues` parameters carry structured validation feedback (OperationOutcome with tx-issue-type coding). Dev is providing additional informational output that prod doesn't generate. While both agree on the validation result, the extra feedback changes the response shape and could affect clients that inspect message/issues parameters.

## Tolerance

Tolerance `dev-extra-display-lang-not-found-message` matches validate-code Parameters responses where:
- result=true
- prod has no `message` parameter
- dev has a `message` containing "There are no valid display names found"

It normalizes by stripping the extra `message` and `issues` parameters from dev.

**Impact**: Eliminates 19 records (3942 → 3923 deltas). All 19 validated — in each case the only difference was the extra message+issues in dev, with all other parameters identical between prod and dev.

The 19 records are predominantly urn:iso:std:iso:3166 codes (FR, FRA) with displayLanguage=fr or fr-FR. Two additional records with "no valid display names" text exist in deltas (SNOMED codes, IDs c9f3b468/ec012860) but have different structure (prod also has issues, different coding types) and are not covered by this tolerance.
