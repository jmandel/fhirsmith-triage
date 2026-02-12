# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 2ed80bd (existing, updated)
**Tolerance**: expand-dev-missing-total

## What differs

Prod returns `expansion.total: 5099` in the $expand response; dev omits `expansion.total` entirely. Both return identical `expansion.contains` arrays (1000 entries, same codes, same displays, same ordering). The `total` field tells clients the full concept count for paged expansions — without it, clients cannot determine how many pages exist.

The request expands `urn:iso:std:iso:3166:-2` (ISO 3166-2 country subdivision codes) with `count=1000, offset=0`.

## Category: `temp-tolerance`

This is a real, meaningful difference. The `expansion.total` field is defined in FHIR R4 ValueSet.expansion as "Total number of codes in the expansion" and documented as enabling server pagination. Its absence prevents clients from knowing the full extent of a paged expansion. This is not cosmetic — it affects API consumers' ability to paginate correctly.

An existing bug (2ed80bd) from round-2 already tracks this issue. Updated the bug with round-3 data (7 records in this round, 4 eliminated as sole diff, 51 total across rounds).

## Tolerance

Tolerance ID: `expand-dev-missing-total` added to round-3 tolerances.js. Matches any $expand response where prod has `expansion.total` and dev does not; normalizes by stripping `total` from prod.

Eliminated 4 records from deltas (2784 -> 2780). The remaining 3 of the 7 matching records have additional differences beyond `total` (contains membership diffs, other expansion parameter diffs) so they correctly remain in deltas for separate triage.

Validation: All 4 eliminated records verified — same code sets, same displays, only diff was the missing `total` field. No other differences hidden.
