# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: c7004d3 (existing, updated)
**Tolerance**: expand-toocostly-extension-and-used-codesystem

## What differs

This is a `$expand` of `http://hl7.org/fhir/ValueSet/mimetypes` (BCP-13 MIME types, system `urn:ietf:bcp:13`). Both servers return 200 with an empty expansion (total=0, no `contains`). After existing tolerances normalize away identifier/timestamp, contact metadata, and limitedExpansion parameter, two differences remain:

1. **Prod has `expansion.extension` with `valueset-toocostly: true`** — dev omits this entirely. This extension signals that the expansion was too costly to perform because the code system is grammar-based and cannot be enumerated.

2. **Dev has `expansion.parameter` with `used-codesystem: urn:ietf:bcp:13`** — prod omits this. Dev reports which code system was consulted even though no codes were returned.

## Category: `temp-tolerance`

This is a real, meaningful difference. The `valueset-toocostly` extension communicates important information to clients: the expansion was incomplete not because it was paginated, but because the code system cannot be enumerated. Dev omitting this extension means clients cannot distinguish between "no codes found" and "too costly to enumerate." The extra `used-codesystem` on dev is a minor difference but is part of the same behavioral divergence.

Bug `c7004d3` from round-2 already covers this exact pattern. Updated the existing bug with round-3 data.

## Tolerance

Tolerance `expand-toocostly-extension-and-used-codesystem` matches $expand where both sides return 200, prod has the `valueset-toocostly` extension but dev doesn't. Normalizes by:
- Stripping the `valueset-toocostly` extension from prod's expansion
- Stripping dev-only `used-codesystem` parameters from dev's expansion

Eliminates 9 records from the round-3 delta file (2109 -> 2100). All 9 validated: every one is `http://hl7.org/fhir/ValueSet/mimetypes` with total=0 on both sides, confirming the grammar-based code system pattern.
