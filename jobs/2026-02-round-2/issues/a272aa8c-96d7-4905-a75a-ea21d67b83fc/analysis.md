# Analysis: `temp-tolerance`

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: c7004d3
**Tolerance**: expand-toocostly-extension-and-used-codesystem

## What differs

After normalization, two differences remain between prod and dev:

1. **`valueset-toocostly` extension**: Prod includes `expansion.extension` with `valueset-toocostly: true`; dev omits it entirely. This extension signals that the expansion could not be performed because the code system (BCP-13 MIME types, `urn:ietf:bcp:13`) is grammar-based and too costly to enumerate. Both sides return an empty expansion (total=0, no `contains`) with `limitedExpansion: true`, but only prod signals the "too costly" condition.

2. **`used-codesystem` parameter**: Dev includes `expansion.parameter` with `used-codesystem: urn:ietf:bcp:13`; prod omits it. Dev reports which code system it consulted even though the expansion returned no results. Prod does not report a used-codesystem on these too-costly expansions.

Both differences always co-occur in the same records.

## Category: `temp-tolerance`

These are real, meaningful differences — not cosmetic. The `valueset-toocostly` extension is defined by the FHIR spec to inform clients that the expansion was too costly to enumerate. Prod correctly emits this signal for grammar-based code systems; dev does not. Similarly, dev's inclusion of `used-codesystem` when prod omits it reflects a behavioral difference in how the expansion was processed.

## Tolerance

Tolerance `expand-toocostly-extension-and-used-codesystem` (bug `c7004d3`) matches $expand records where:
- Both return 200
- Prod has the `valueset-toocostly` extension but dev doesn't

Normalizes by:
- Removing the `valueset-toocostly` extension from prod's `expansion.extension`
- Removing any dev-only `used-codesystem` parameters from dev's `expansion.parameter`

Eliminated 12 records from the delta file (from 3885 to 3873). One additional record (227d1960) matched the tolerance but remained in deltas due to other differences (different contains counts, extra parameters). All 12 eliminated records were validated: all are mimetypes ValueSet expansions with identical empty expansion results on both sides except for these two metadata differences.
