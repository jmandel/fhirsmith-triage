# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 9fd2328
**Tolerance**: snomed-version-skew-message-text

## What differs

Both prod and dev agree on `result: false` — the SNOMED code 467771000124109 ("Assistance with application for food pantry program") is not found in the ValueSet `us-core-procedure-code|8.0.0`. However, the error messages reference different SNOMED CT International Edition versions:

- Prod: `version 'http://snomed.info/sct/900000000000207008/version/20250201'`
- Dev: `version 'http://snomed.info/sct/900000000000207008/version/20240201'`

This version string appears in both the `message` parameter valueString and the `issues` OperationOutcome issue detail text. The message structure, severity levels, issue codes, and all other fields are identical.

## Category: `temp-tolerance`

This is the same root cause as bug 9fd2328 — dev loads an older SNOMED CT edition (20240201) than prod (20250201). The difference is real (they genuinely have different versions loaded), but it's a known configuration issue, not a logic bug. The existing `snomed-version-skew` tolerance already normalizes top-level `version` and `display` parameters, but doesn't reach into message text and OperationOutcome issue text where the version URI is embedded in prose.

## Tolerance

Tolerance `snomed-version-skew-message-text` normalizes SNOMED version URIs embedded in `message` valueString and `issues` OperationOutcome issue text. It matches when the message text is identical after replacing SNOMED version URIs with a placeholder, then replaces dev's version URIs with prod's values.

- 35 records eliminated (from 44 to 9 total deltas)
- All 10 sampled eliminations validated: every record had result=false on both sides, messages matched after version normalization, and no other differences existed outside message/issues text
- All 35 eliminated records are POST /r4/ValueSet/$validate-code with SNOMED codes, SNOMED International Edition 20250201 (prod) vs 20240201 (dev)
