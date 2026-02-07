# Analysis: equiv-autofix

**Operation**: `GET /r4/CodeSystem?_format=json&url=https%3A%2F%2Fwww.usps.com%2F`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: searchset-bundle-wrapper (enhanced)

## What differs

After the existing `searchset-bundle-wrapper` tolerance strips Bundle-level metadata (id, meta, link), the only remaining difference is:

- **Dev** includes `"search": {"mode": "match"}` on each Bundle entry
- **Prod** omits the `search` element entirely from entries

The actual resource content (CodeSystem "usps" with all 59 US state/territory codes) is identical between prod and dev.

## Category: `equiv-autofix`

The `search.mode` element on searchset Bundle entries is a standard FHIR feature (Bundle.entry.search.mode) indicating how the entry was found. The value "match" means the entry matched the search criteria directly. This element is:

- **Optional** per FHIR R4 spec — both including and omitting it are valid
- **Structural Bundle metadata**, not terminology content
- **Has no impact on the semantic meaning** of the response — both responses return the same CodeSystem with the same codes

Dev's behavior (including `search.mode: "match"`) is arguably more complete per FHIR best practice, but prod's omission is not incorrect. The difference is purely structural and detectable by automation.

## Tolerance

Enhanced the existing `searchset-bundle-wrapper` tolerance to also strip `search` elements from Bundle entries on both sides. This is the natural home for this normalization since it already handles other searchset Bundle wrapper differences.

- **Records eliminated**: 2 (the two USPS CodeSystem search records where `search.mode` was the only remaining difference)
- **Records still in deltas with `search.mode`**: 5 (these have other substantive content differences beyond `search.mode`)
- **Full comparison records with `search.mode`**: ~690 (most already resolved by other normalizations in the pipeline)
- **Validation**: Both eliminated records confirmed — resource content is identical, only difference was `search` element presence on entries
