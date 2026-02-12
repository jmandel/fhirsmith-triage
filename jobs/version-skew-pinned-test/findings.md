# Version-Pinned Followup: Findings

**Date**: 2026-02-09
**Method**: Replayed version-skewed requests with explicit `system-version` or `valuesetversion` pinning so both servers use the same edition, then ran comparison with version-skew tolerance removed.
**Input**: 600 records (132 original queries, multiple pin variants each)
**Usable**: 178 (422 skipped due to prod 503 during collection)

## Summary

| Category | Count |
|----------|-------|
| OK (match after other tolerances) | 79 |
| Content-differs (both 200) | 23 |
| Status-mismatch (version not available) | 74 |
| Dev crash | 2 |

## Genuine Bugs Found (2 patterns)

### Bug 1: v3 hierarchical CodeSystems missing child codes in $expand (10 records)

**Existing bug**: 4336772
**Severity**: High -- dev returns 85% fewer codes

**Repro**:
```bash
# Both servers have the SAME versions of all 5 used CodeSystems:
#   v3-Confidentiality|3.0.0, v3-ActCode|9.0.0, v3-ObservationValue|4.0.0,
#   v3-ActReason|3.1.0, v3-ActUSPrivacyLaw|3.0.0

# Prod: 495 codes
curl -s -H "Accept: application/fhir+json" \
  'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/security-labels&valuesetversion=3.0.0' \
  | jq '.expansion.total'

# Dev: 71 codes
curl -s -H "Accept: application/fhir+json" \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/security-labels&valuesetversion=3.0.0' \
  | jq '.expansion.total'
```

**Analysis**: Both servers confirm identical `used-codesystem` versions. Dev returns only root-level concepts; prod traverses the `subsumedBy` hierarchy to include child codes. Breakdown:

| CodeSystem | Prod codes | Dev codes | Missing |
|------------|-----------|-----------|---------|
| v3-ActCode | 136 | 5 | 131 |
| v3-ObservationValue | 282 | 42 | 240 |
| v3-ActReason | 63 | 10 | 53 |
| v3-Confidentiality | 6 | 6 | 0 |
| v3-ActUSPrivacyLaw | 8 | 8 | 0 |

The non-hierarchical CodeSystems (Confidentiality, ActUSPrivacyLaw) match perfectly. The hierarchical ones (ActCode, ObservationValue, ActReason) are missing child codes -- exactly bug 4336772.

**Key insight**: This bug was previously masked by the version-skew tolerance's code-intersection normalization. With pinned versions proving the servers use the same edition, the membership difference is unambiguously a dev bug, not version skew.

### Bug 2: patient-contactrelationship missing 1 code in $expand (1 record)

**Existing bug**: 7716e08 (noted in re-verification: "dev returns 11 codes vs prod's 12")

**Repro**:
```bash
# Pinned to same version
# Prod: 12 codes
curl -s -H "Accept: application/fhir+json" \
  'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/patient-contactrelationship&system-version=http://terminology.hl7.org/CodeSystem/v2-0131|2.9.0' \
  | jq '.expansion.total'

# Dev: 11 codes (missing code "O" = "Other")
curl -s -H "Accept: application/fhir+json" \
  'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/patient-contactrelationship&system-version=http://terminology.hl7.org/CodeSystem/v2-0131|2.9.0' \
  | jq '.expansion.total'
```

**Analysis**: Dev is missing code `O` ("Other") from v2-0131. Same pinned version, so this is a real content bug. Likely related to the v3 hierarchy issue (v2-0131 also uses hierarchical concepts).

## Not Bugs (2 patterns)

### Residual version skew: VSAC 1267.23 $expand (5 records)

Request pins SNOMED US to `20250901`, but dev doesn't have that edition (falls back to `20250301`). CPT is also in this ValueSet but wasn't pinned (prod has 2026, dev has 2025). Same 280 codes, different `contains[].version` on all 280.

**Verdict**: Not a bug. Incomplete version pinning -- the followup generator only pinned one system, but the ValueSet includes multiple systems. Would need to pin all systems simultaneously.

### Duplicate informational issue: us-core-problem-or-health-concern validate-code (7 records)

Both servers return `result=false` with version `4.0.1` (pinned). Same error message. But dev returns 3 issues where prod returns 2 -- dev emits the "Reference to draft CodeSystem" informational issue **twice**.

**Verdict**: Minor dev bug (duplicate issue). Same result, same message, just a duplicated informational OperationOutcome issue. Low severity.

## Version-Not-Available Cases (74 records)

All status-mismatches are servers rejecting versions they don't have:

| System | Version | Prod | Dev | Records |
|--------|---------|------|-----|---------|
| v2-0360 | 2.0.0 | 200 OK | 422 rejects | 31 |
| v2-0360 | 3.0.0 | 400 rejects | 200 OK | 35 |
| v2-0074 | 2.0.0 | 200 OK | 422 rejects | 3 |
| v2-0074 | 3.0.0 | 422 rejects | 200 OK | 3 |
| v2-0131 | 3.0.0 | 422 rejects | 200 OK | 2 |

**Verdict**: Expected. Each server only loads one version of these CodeSystems. Confirms version skew is real but doesn't reveal bugs -- just that the servers have disjoint version sets for v2 tables.

## Implications for Version-Skew Tolerance

1. **Code-intersection normalization (Strategy C) masked a real bug.** The security-labels expand was being intersected to 71 common codes, hiding the fact that dev was missing 424 codes due to the v3 hierarchy bug -- not version skew.

2. **Cosmetic normalization (Strategies A, B, D) is safe.** The 79 OK records and the VSAC/validate-code patterns confirm that version-string replacement doesn't hide real bugs.

3. **Recommendation**: Either (a) remove code-intersection from the version-skew tolerance entirely, or (b) only intersect when the specific missing codes can be confirmed as version-dependent (e.g., the code exists in one edition but not the other).
