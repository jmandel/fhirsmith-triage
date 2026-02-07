# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$batch-validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: cf90495 (existing — same root cause as invalid-display-message-format)
**Tolerance**: batch-invalid-display-message-format

## What differs

In `$batch-validate-code` responses containing `invalid-display` issues, dev appends a language tag like `(en)` to the valid display value in message and issues text that prod omits.

**Prod message**: `Valid display is 'application/dicom' (for the language(s) 'en, en-US')`
**Dev message**: `Valid display is 'application/dicom' (en) (for the language(s) 'en, en-US')`

This pattern repeats across all validation entries with invalid-display issues. In this record, all 5 validations (for urn:ietf:bcp:13 MIME types) show this difference. Both sides agree on `result=true`, `system`, `code`, and `display` values.

## Category: `temp-tolerance`

This is the same real difference already tracked in bug cf90495 (invalid-display-message-format). Dev includes an extra language identifier in the "Valid display is" message that prod omits. The existing tolerance only handled top-level Parameters responses (non-batch validate-code), not the nested structure of `$batch-validate-code` responses where each validation is wrapped in a `validation` parameter resource.

## Tolerance

Added `batch-invalid-display-message-format` tolerance that extends the existing `invalid-display-message-format` pattern to handle `$batch-validate-code` nested Parameters structure. References the same bug ID `cf90495`.

The tolerance iterates through each `validation` parameter, checks for `invalid-display` coded issues, and normalizes dev's `message` and `issues.details.text` to match prod's values within each nested validation resource.

**Impact**: Eliminates 12 batch-validate-code delta records (3675 → 3663 deltas). Of the 12:
- 6 records had only message format diffs (fully resolved by this tolerance)
- 6 records had message format diffs + SNOMED display text diffs (message diffs resolved by this tolerance; display diffs already handled by existing `batch-validate-snomed-display-differs` tolerance / bug 8f739e9)

**Validation**: All 12 eliminated records verified — every diff is either a message format diff (this tolerance) or a display text diff (existing tolerance). No unexpected diffs hidden.
