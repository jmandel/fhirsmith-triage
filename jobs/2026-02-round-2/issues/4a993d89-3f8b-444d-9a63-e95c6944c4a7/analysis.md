# Analysis: `temp-tolerance`

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: status-mismatch
**Status**: prod=200 dev=400
**Bug**: f33161f
**Tolerance**: expand-toocostly-grammar-400

## What differs

Prod returns HTTP 200 with a ValueSet containing an empty expansion marked with the `valueset-toocostly` extension and `limitedExpansion` parameter. This is the standard FHIR way to signal that the expansion is too large to enumerate (the code system has a grammar).

Dev returns HTTP 400 with an OperationOutcome error:
```json
{
  "resourceType": "OperationOutcome",
  "issue": [{
    "severity": "error",
    "code": "too-costly",
    "details": {"text": "The code System \"urn:ietf:bcp:47\" has a grammar, and cannot be enumerated directly"}
  }]
}
```

Both servers recognize the expansion is too costly, but they disagree on how to communicate that — prod uses the FHIR-standard approach (200 + toocostly extension), while dev treats it as an error (400).

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. The HTTP status code difference (200 vs 400) changes client behavior: a 400 response signals a client error, while a 200 with the toocostly extension is a successful (if limited) response. Prod's behavior aligns with FHIR's expected pattern for too-costly expansions.

12 records show this exact pattern across two grammar-based code systems:
- 8 records: BCP-47 (`urn:ietf:bcp:47`) — the `all-languages` ValueSet and ad-hoc ValueSets
- 4 records: SNOMED CT (`http://snomed.info/sct`) — ad-hoc ValueSets with full SNOMED include
- Affects both /r4/ and /r5/ endpoints

## Tolerance

Tolerance `expand-toocostly-grammar-400` skips records where:
- The request is a `$expand` operation
- Prod returns 200 with the `valueset-toocostly` extension in the expansion
- Dev returns 400 with an OperationOutcome containing a `too-costly` issue code

The tolerance eliminates exactly 12 records (3563 → 3551 deltas). All 12 were validated — every eliminated record matches the pattern precisely, with prod returning a toocostly expansion and dev returning a too-costly error for grammar-based code systems.
