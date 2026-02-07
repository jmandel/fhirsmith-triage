# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: f2b2cef
**Tolerance**: expand-unclosed-extension-and-total

## What differs

After normalization (which already handled display text, identifier/timestamp, includeDefinition param), two differences remain in `expansion`:

1. **Prod has `expansion.extension` with `valueset-unclosed: true`; dev omits it.** This is a FHIR standard extension (`http://hl7.org/fhir/StructureDefinition/valueset-unclosed`) that signals an expansion is incomplete due to unbounded value set inclusion (e.g., SNOMED CT is-a queries). The FHIR R4 spec explicitly recommends this extension for post-coordinated or otherwise unbounded expansions.

2. **Dev has `expansion.total: 124412`; prod omits it.** The `total` field (0..1 integer) indicates the full concept count enabling client-side pagination awareness. Prod omits it on these incomplete expansions; dev provides it.

The request expands SNOMED CT concepts that are descendants of `404684003` (Clinical finding) with `count=1000`, returning 1000 codes from a set of 124,412. Both servers return the same 1000 codes with the same display text (after existing normalizations). The only differences are these two expansion-level metadata fields.

## Category: `temp-tolerance`

These are real, meaningful differences in FHIR conformance behavior:

- The `valueset-unclosed` extension is specified by the FHIR R4 spec for exactly this scenario (unbounded expansions). Dev should include it but doesn't.
- The `total` field's presence/absence is a behavioral difference: dev tells clients the full count but doesn't signal incompleteness, while prod signals incompleteness but doesn't provide the full count.

Neither is cosmetic — they affect client behavior around pagination and completeness detection.

## Tolerance

Tolerance `expand-unclosed-extension-and-total` normalizes both differences:
- Removes the `valueset-unclosed` extension from prod's `expansion.extension` array
- Removes `total` from dev's `expansion` object

**Impact**: 252 records eliminated from deltas (from 4200 to 3948). The 292 records matching the combined pattern include ~40 that have additional differences beyond unclosed/total and remain in deltas for those other reasons.

**Validation**: Sampled 12 eliminated records — all confirmed the exact pattern (prod has unclosed extension, dev doesn't; dev has total, prod doesn't). No other expansion metadata differences were hidden by the normalization.
