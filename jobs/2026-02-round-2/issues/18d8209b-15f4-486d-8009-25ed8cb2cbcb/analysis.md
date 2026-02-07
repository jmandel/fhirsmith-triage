# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2Fv3-PurposeOfUse&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 4336772
**Tolerance**: expand-v3-hierarchical-incomplete

## What differs

Dev returns only 1 code (the root abstract concept) when expanding v3 hierarchical ValueSets, while prod returns the full code hierarchy.

For this specific record (v3-PurposeOfUse):
- Prod: `expansion.total=63`, 63 codes (PurposeOfUse root + 62 descendants like HMARKT, HOPERAT, TREAT, etc.)
- Dev: `expansion.total=1`, only the root abstract concept `PurposeOfUse`

Additional metadata differences exist (version `3.1.0` vs `2014-03-26`, name/title variations, dev has `meta`/`immutable`/`contact` that prod doesn't) but these are secondary to the critical missing-codes issue.

## Pattern: 246 records across 4 v3 ValueSets

All 4 affected ValueSets use hierarchical concept inclusion from `terminology.hl7.org/CodeSystem/v3-ActReason` or similar v3 CodeSystems:

| ValueSet | Records | Prod total | Dev total |
|----------|---------|-----------|-----------|
| v3-ActEncounterCode | 209 | 12 | 1 |
| v3-ServiceDeliveryLocationRoleType | 24 | 139 | 1 |
| v3-ActPharmacySupplyType | 7 | 35 | 1 |
| v3-PurposeOfUse | 6 | 63 | 1 |

In all cases, dev claims `total=1` but may include 0 or 1 entries in `contains`. The root concept is either included as a single abstract entry (PurposeOfUse) or completely absent (ActEncounterCode, where `contains` is omitted entirely despite `total=1`).

## Category: `temp-tolerance`

This is a real, meaningful difference — dev is failing to expand hierarchical v3 ValueSets, returning only the root concept instead of the full hierarchy. This is clearly a bug: clients relying on the expansion would get an incomplete code list. Filed as git-bug 4336772.

## Tolerance

Tolerance ID: `expand-v3-hierarchical-incomplete`. Matches expand operations where:
- URL contains `/ValueSet/$expand`
- Both sides return 200
- Dev expansion total = 1 and prod expansion total > 1
- Request URL references a `terminology.hl7.org/ValueSet/v3-*` ValueSet

Eliminates 246 records (verified: 4446 → 4200 deltas). Validated by sampling 15 eliminated records — all correctly matched the pattern (dev_total=1, prod_total ranging from 12 to 139, all v3 ValueSets).
