# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet?_format=json&url=http%3A%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-laboratory-test-codes`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: bd0f7f4
**Tolerance**: read-resource-text-div-diff

## What differs

After the existing `searchset-bundle-wrapper` tolerance normalizes Bundle-level differences (id, meta, link, search.mode), the only remaining difference is in the entry resource's `text` element:

- **Prod**: `"text": {"status": "generated"}` — omits the `div` element
- **Dev**: `"text": {"status": "generated", "div": "<div xmlns=\"http://www.w3.org/1999/xhtml\">...Generated Narrative...</div>"}` — includes the full generated narrative HTML

The narrative div is auto-generated content describing the ValueSet structure (listing the included LOINC code system with CLASSTYPE=1 filter). All other resource fields (url, version, name, title, status, compose, extensions, identifiers, etc.) are identical between prod and dev.

In FHIR R4, when `text.status` is present, the `div` element is required. Prod's omission of `div` while having `status=generated` is technically non-conformant. Dev is more correct here.

## Category: `temp-tolerance`

This is a real behavioral difference — prod strips the generated narrative div while dev includes it. While the narrative content has no direct terminology significance (it's auto-generated from resource structure), it represents a genuine difference in how resources are served. Dev is more FHIR-conformant by including the div.

Not `equiv-autofix` because the responses genuinely differ in content (one has a div element, the other doesn't). Not `real-diff` because the narrative doesn't carry terminology significance.

## Tolerance

Tolerance `read-resource-text-div-diff` normalizes by stripping `text.div` from both sides on resource reads where both have `text.status=generated` but differ on div presence. Works for both direct resource reads and Bundle entries.

**Records eliminated**: 4 (140 -> 136 deltas)
- 31a631b5: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 296cf150: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)
- 9a2a81a0: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 6e354570: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)

All 4 are the same ValueSet accessed via 2 URL patterns, each appearing twice. Validated all 4 eliminated records: only text.div differs, no other content differences are hidden.
