# Analysis: `temp-tolerance`

**Operation**: `GET /r4/ValueSet?_format=json&url=http%3A%2F%2Fwww.rsna.org%2FRadLex_Playbook.aspx`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: 4233647
**Tolerance**: searchset-bundle-wrapper

## What differs

Both servers return an empty searchset Bundle (total: 0) for this ValueSet URL search. The differences are all in the Bundle wrapper, not in terminology content:

1. **`entry: []`**: Dev includes an empty `entry` array. Prod omits the field entirely. Empty arrays violate FHIR's general rule that arrays, if present, must be non-empty.

2. **Extra pagination links**: Dev returns `self`, `first`, and `last` link relations. Prod returns only `self`.

3. **Link URL format**: Dev uses absolute URLs with host prefix (`http://tx.fhir.org/r4/ValueSet?...&_offset=0`). Prod uses relative URLs without host (`ValueSet?&url=...`). Dev also URL-encodes query parameter values while prod does not.

4. **Server-generated metadata**: Prod includes `id` and `meta.lastUpdated` on the Bundle. Dev omits these.

## Category: `temp-tolerance`

These are real differences, not truly equivalent output:
- The empty `entry: []` array is invalid FHIR
- Extra link relations represent different server behavior
- The URL format differences are systematic

However, none of these affect terminology content — they're all Bundle wrapper formatting for search results. This is a recognizable pattern affecting a large number of records, appropriate for a temp-tolerance linked to a bug.

## Tolerance

Wrote `searchset-bundle-wrapper` tolerance that normalizes both sides of searchset Bundles by:
- Stripping `id` and `meta` (server-generated transient metadata)
- Removing empty `entry: []` arrays
- Stripping all `link` elements (self/first/last links echo back the search URL in different formats with no semantic content)

The tolerance only applies to records where both sides are Bundle/searchset. It does NOT hide entry content differences — non-empty Bundles with different entries or totals remain in the deltas.

**Impact**: Eliminated 491 records (337 empty ValueSet searches + 154 empty CodeSystem searches). Validated 15 randomly sampled eliminations — all were empty searchset Bundles (total=0) with no content differences beyond wrapper formatting.

7 non-empty searchset Bundles remain in the deltas because they have other substantive differences (e.g., different total counts, different entry content).
