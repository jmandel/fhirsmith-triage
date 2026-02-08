# Analysis: temp-tolerance

**Operation**: `GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=303071001`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7b445b0
**Tolerance**: snomed-lookup-inactive-designation-use

## What differs

In SNOMED CT `$lookup` responses, prod marks certain designation synonyms with `use.code: "73425007"` (display: "Inactive"), indicating the description is inactive in SNOMED CT. Dev marks those same designations with `use.code: "900000000000013009"` (display: "Synonym (core metadata concept)"), losing the inactive status information.

For this record (code 303071001 "Family member"), the designation "People in the family" has:
- Prod: `use.code: "73425007"` (Inactive)
- Dev: `use.code: "900000000000013009"` (Synonym)

The other 3 designations match between prod and dev.

For code 116101001 (3 other records), 7 of 9 designations differ in the same way — prod marks them as Inactive, dev marks them as Synonym or Fully specified name.

## Category: `temp-tolerance`

This is a real, meaningful terminology difference. SNOMED concept 73425007 specifically identifies inactive descriptions — this is important metadata for consumers who need to know whether a designation is current. Dev's failure to use this use type means it's returning less informative designation metadata than prod.

## Tolerance

Tolerance `snomed-lookup-inactive-designation-use` normalizes dev's designation use types to match prod's by matching on designation value text. It matches SNOMED `$lookup` records where prod has at least one designation with `use.code: "73425007"` (Inactive).

Eliminates 4 records (118 -> 114 deltas). All 4 were validated:
- eebd3d87 — code 303071001, 1 designation use type diff
- fcb6b89e — code 116101001, 7 designation use type diffs
- c9b9e349 — code 116101001, 7 designation use type diffs
- aeacd54f — code 116101001, 7 designation use type diffs

No false positives — after normalization, all designation texts and use types match between prod and dev for all 4 records.
