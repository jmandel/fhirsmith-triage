# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 1e5268a
**Tolerance**: inactive-display-empty-status-in-message

## What differs

Both servers agree on `result=true`, system (`http://snomed.info/sct`), code (`26643006`), version, and display (`Oral route`). The only difference is in the `issues` OperationOutcome `details.text` for the `display-comment` / `INACTIVE_DISPLAY_FOUND` issue:

- **Prod**: `'oral' is no longer considered a correct display for code '26643006' (status = inactive). The correct display is one of "Oral route"`
- **Dev**: `'oral' is no longer considered a correct display for code '26643006' (status = ). The correct display is one of Oral route,Per os,Oral route (qualifier value),Oral use,Per oral route,PO - Per os,By mouth`

Two differences:
1. **Status rendering**: Prod says `(status = inactive)`, dev says `(status = )` — dev has an empty status value where the concept is actually inactive
2. **Designation list**: Prod lists only the preferred term `"Oral route"`, dev lists all designations — this is already adjudicated as equiv-autofix (GG adjudicated, dev is more complete)

The designation difference is handled by existing tolerance `inactive-display-message-extra-synonyms`, but that tolerance requires the message prefix (before "The correct display is one of") to match. The empty status prevents the prefix match.

## Category: `temp-tolerance`

The empty status value `(status = )` is a real, meaningful difference. SNOMED code 26643006 is inactive, and the INACTIVE_DISPLAY_FOUND message should reflect that. Dev fails to render the status value. This is related to bug af1ce69 (dev renders "null" for missing status in INACTIVE_CONCEPT_FOUND messages) but uses a different message template and manifests as empty rather than "null".

## Tolerance

Tolerance `inactive-display-empty-status-in-message` (bug 1e5268a) normalizes dev's empty `(status = )` to match prod's `(status = inactive)` in display-comment issue texts. It is placed before `inactive-display-message-extra-synonyms` in the pipeline so that after status normalization, the existing designation-list tolerance can fire on the now-matching prefix.

- Records impacted: 1
- Validation: Old deltas had 1 record, new deltas have 0. The single eliminated record is exactly the target record (f5fcec17-986f-4f27-994d-d49aeca30d13).
