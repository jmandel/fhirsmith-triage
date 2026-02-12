# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: f2b2cef (existing — "Dev: missing valueset-unclosed extension and spurious expansion.total on incomplete expansions")
**Tolerance**: expand-unclosed-extension-and-total

## What differs

After normalization, the only remaining difference between prod and dev is that prod's `expansion` object includes a `valueset-unclosed` extension:

```json
"extension": [
  {
    "url": "http://hl7.org/fhir/StructureDefinition/valueset-unclosed",
    "valueBoolean": true
  }
]
```

Dev's expansion omits this extension entirely. Both sides return 1000 SNOMED CT codes (is-a descendants of 404684003 "Clinical finding") with `total: null` and `offset: 0`.

The `valueset-unclosed` extension signals that the expansion is incomplete because the underlying value set includes post-coordinated or unbounded content. Prod correctly marks SNOMED CT filter expansions as unclosed; dev does not because the SNOMED provider does not override the `filtersNotClosed()` method.

In other records matching the same pattern, dev also spuriously includes `expansion.total` (the full count) while prod omits it on unclosed expansions. In this specific record, both sides have `total: null`, so only the extension difference appears.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The `valueset-unclosed` extension is a FHIR-specified signal to clients that the expansion is incomplete. Without it, clients may incorrectly assume the expansion is complete. This is a code-level defect in dev (SNOMED provider missing `filtersNotClosed()` override). Bug f2b2cef was already filed in round 2 with root cause analysis and a suggested fix.

## Tolerance

Tolerance `expand-unclosed-extension-and-total` matches $expand records where prod has the `valueset-unclosed` extension but dev doesn't. It normalizes by:
1. Stripping the `valueset-unclosed` extension from prod's expansion
2. Stripping `expansion.total` from dev when prod doesn't have it (since unclosed expansions should not report total)

The tolerance eliminates 60 records from the round-3 delta file (2602 -> 2542). Validation of 15 randomly sampled eliminated records confirmed all correctly had `prod:unclosed=true, dev:unclosed=false` and the remaining post-tolerance diffs (display text, metadata) are handled by other existing tolerances.
