# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: status-mismatch
**Status**: prod=422 dev=200
**Bug**: e3fb3f6
**Tolerance**: expand-too-costly-succeeds

## What differs

Prod returns HTTP 422 with an OperationOutcome containing issue code `too-costly` for $expand requests involving grammar-based or very large code systems. Dev returns HTTP 200 with a successful ValueSet expansion.

Prod's error messages fall into two patterns:
- "The code System \"X\" has a grammar, and cannot be enumerated directly" — for CPT (8 records) and BCP-13 MIME types (2 records)
- "The value set '' expansion has too many codes to display (>10000)" — for NDC (2 records)

For this specific record (CPT), dev returns 7 codes with full display text. For the NDC records, dev returns an empty expansion (total=0), which is additionally inconsistent with prod's "too many codes" message.

No tolerances were previously applied to this record (`applied-tolerances.txt` shows `(none)`).

## Category: `temp-tolerance`

This is a real, meaningful behavioral difference. Prod implements a guard against expanding grammar-based code systems (where the full enumeration isn't possible or practical) and very large code systems (>10000 codes). Dev does not have this guard and attempts the expansion anyway. This could lead to:
- Incomplete expansions that give a false impression of completeness
- Performance issues on very large code systems
- Different behavior expectations for clients

This is not cosmetic — it's a genuine difference in expansion policy.

## Tolerance

Tolerance `expand-too-costly-succeeds` skips records matching: POST `/r4/ValueSet/$expand`, prod.status=422, dev.status=200, and prod body contains OperationOutcome with `too-costly` issue code.

Eliminated 12 records (434 → 422 deltas). All 12 validated: every eliminated record has prod=422 with too-costly, dev=200 with successful expansion, category=status-mismatch. No false positives. Breakdown:
- 8 CPT (http://www.ama-assn.org/go/cpt)
- 2 BCP-13 (urn:ietf:bcp:13, MIME types)
- 2 NDC (http://hl7.org/fhir/sid/ndc)
