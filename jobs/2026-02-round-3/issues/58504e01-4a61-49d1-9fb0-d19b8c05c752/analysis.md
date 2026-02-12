# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b3c97a1
**Tolerance**: duplicate-draft-codesystem-status-check

## What differs

After normalization, the only remaining difference is in the OperationOutcome issues parameter. Dev has a **duplicate** `status-check`/MSG_DRAFT informational issue for the draft CodeSystem `urn:iso:std:iso:11073:10101|2024-12-05`, while prod correctly emits just one.

The request validates a CodeableConcept with 5 codings, including 2 from `urn:iso:std:iso:11073:10101` (codes 150364 and 150368). Dev emits one MSG_DRAFT issue per coding from that system instead of deduplicating by CodeSystem.

Prod normalized issues (4 after earlier tolerances):
1. `invalid-display` warning: loinc#8310-5 wrong display for 'de'
2. `status-check` info: draft CodeSystem ISO 11073 (one instance)
3. `invalid-display` warning: ISO 11073#150368 wrong display
4. `invalid-display` info: loinc#8329-5 no valid display for 'de'

Dev normalized issues (4, but with duplicate replacing the first):
1. `status-check` info: draft CodeSystem ISO 11073 (FIRST)
2. `status-check` info: draft CodeSystem ISO 11073 (DUPLICATE)
3. `invalid-display` warning: ISO 11073#150368 wrong display
4. `invalid-display` info: loinc#8329-5 no valid display for 'de'

## Category: `temp-tolerance`

This is a real difference in dev's behavior. Dev incorrectly emits one MSG_DRAFT status-check issue per coding from a draft CodeSystem rather than deduplicating per unique CodeSystem reference. This is a bug — duplicate informational issues inflate the OperationOutcome and could affect downstream processing. Filed as git-bug b3c97a1.

## Tolerance

Tolerance `duplicate-draft-codesystem-status-check` deduplicates status-check issues in dev's OperationOutcome where the same `details.text` appears more than once, keeping only the first occurrence. Placed before `display-comment-vs-invalid-display-issues` to ensure correct issue counts for that tolerance's logic.

12 records in the dataset have this duplicate pattern (all involving CodeableConcepts with 2 codings from `urn:iso:std:iso:11073:10101`). 6 are fully resolved by this tolerance alone. The other 6 have additional unrelated differences. Delta count: 1103 -> 1097 (6 eliminated). All 6 eliminations validated as correct.
