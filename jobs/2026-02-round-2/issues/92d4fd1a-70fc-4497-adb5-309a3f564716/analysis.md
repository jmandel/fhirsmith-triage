# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=INFA&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fv3-ActCode`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: 167be81
**Tolerance**: v3-valueset-validate-code-result-disagrees

## What differs

Prod returns `result: true` — code INFA from v3-ActCode is valid in the consent-category ValueSet. Dev returns `result: false` with message "The provided code 'http://terminology.hl7.org/CodeSystem/v3-ActCode#INFA' was not found in the value set 'http://hl7.org/fhir/ValueSet/consent-category|4.0.1'".

Both servers agree on the CodeSystem version (9.0.0), code (INFA), and display text ("information access"). Dev can look up the code in the CodeSystem successfully but fails to resolve ValueSet membership.

This is a core `result` boolean disagreement — the most critical type of difference in a terminology server.

## Pattern scope

This is not a one-off. 187 records show the identical pattern across 5 ValueSets, all GET requests, all r4:

| ValueSet | Records | System | Codes |
|----------|---------|--------|-------|
| v3-ActEncounterCode | 103 | v3-ActCode | AMB, IMP, HH, EMER |
| encounter-participant-type | 69 | v3-ParticipationType | CON, ADM, ATND |
| consent-category | 9 | v3-ActCode | INFA |
| v3-ServiceDeliveryLocationRoleType | 4 | v3-RoleCode | ER, CARD, SLEEP |
| v3-PurposeOfUse | 2 | v3-ActReason | HMARKT |

All share: system is `http://terminology.hl7.org/CodeSystem/v3-*`, prod=true, dev=false, same CodeSystem version on both sides.

## Category: `temp-tolerance`

This is a real, meaningful bug — dev incorrectly rejects valid codes from HL7 v3 CodeSystems when validating against ValueSets that include them. The codes exist in the CodeSystem (dev returns version and display), but dev fails to find them in the ValueSet. Filed as bug 167be81.

## Tolerance

Tolerance `v3-valueset-validate-code-result-disagrees` skips records matching:
- URL contains `/ValueSet/$validate-code`
- Prod result=true, dev result=false
- System starts with `http://terminology.hl7.org/CodeSystem/v3-`

Eliminated 187 records (deltas went from 4672 to 4485). Validated 12 random samples — all legitimate eliminations with the same pattern (matching system, same version on both sides, prod=true/dev=false).
