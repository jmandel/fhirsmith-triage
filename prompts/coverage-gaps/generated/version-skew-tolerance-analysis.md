# Unified "Version Skew" Tolerance: Feasibility Analysis

## Executive Summary

This analysis explores whether ~9 per-system version-skew tolerances in the round-2 tolerances file can be replaced with a single general tolerance. The short answer is: **partially feasible, but with significant caveats**.

A general version-difference detector can reliably identify 982 of the 1024 records (96%) matched by the 9 target tolerances. The remaining 42 are false-positive tolerance matches (ISO country code records where `warning-draft` triggers the tolerance despite no actual version skew). However, **normalization cannot be unified** because the 9 tolerances handle fundamentally different response structures -- Parameters vs ValueSet expansions, version params vs message text vs code membership differences.

The real opportunity is not a single replacement tolerance but rather a **shared detection layer** that feeds into operation-specific normalizers.

---

## Background: Version Skew in This Dataset

Prod (tx.fhir.org Java) and dev (FHIRsmith Node.js) load different editions of terminology code systems:

| Code System | Prod Version | Dev Version | Direction |
|---|---|---|---|
| SNOMED CT International | 20250201 | 20240201 | Prod newer |
| SNOMED CT US | 20250901 | 20250301 / 20230301 | Prod newer |
| HL7 Terminology (THO) CodeSystems | Reports 4.0.1 (FHIR R4 version) | Reports actual THO version (2.0.0, 3.0.0, etc.) | **Versions not directly comparable** -- dev has newer content |
| v2-0360 | 2.0.0 | 3.0.0 | Dev newer |
| NDC | (empty version) | 2021-11-01 | Dev newer |
| CPT | 2026 | 2025 | Prod newer |
| v2-0074 | 2.0.0 | 3.0.0 | Dev newer |

**Key insight**: The direction of skew is NOT uniform. SNOMED is prod-newer, HL7 terminology is dev-newer (in content, though version strings are misleading), and v2 tables are dev-newer. A "dev-is-newer" constraint would actually **exclude most SNOMED records** (8038 of the 10K+ version-skew records).

There are 16 total version-skew tolerances in the file (9 target + 7 additional). Together they match 10,160 records. A raw version-difference detector finds 10,138 records with version differences. The 42-record gap consists entirely of `expand-hl7-terminology-version-skew-params` false positives on ISO country code expansions where both sides have the same `warning-draft` parameter.

---

## How Each of the 9 Tolerances Works

### 1. `hl7-terminology-cs-version-skew` (293 records)

**Bug**: 6edc96c
**Operation**: validate-code
**Detection**: Checks if the `version` output parameter differs between prod and dev for `terminology.hl7.org/CodeSystem/*` systems. Also matches when `message` text contains version strings that differ only in version part (e.g., `version '4.0.1'` vs `version '2.0.0'`).
**Normalization**: Sets dev's `version` param to prod's value. Strips draft `status-check` issues from prod (dev omits these for newer editions). Replaces version strings in message and issues text.
**Scope**: Only `terminology.hl7.org/CodeSystem/*` systems.

### 2. `expand-hl7-terminology-version-skew-params` (385 records, but ~42 are false positives)

**Bug**: 6edc96c
**Operation**: ValueSet $expand
**Detection**: Matches when (a) `used-codesystem` parameter URIs for `terminology.hl7.org/CodeSystem/*` differ between prod/dev, OR (b) either side has `warning-draft` parameters.
**Normalization**: Normalizes `used-codesystem` versions to prod values. Strips `warning-draft` parameters from both sides.
**Scope**: HL7 terminology code systems in expand operations.
**Note**: The `warning-draft` check is overly broad -- it matches 42 ISO country code records where both sides have identical `warning-draft` values but a different `includeDefinition` param exists. These are NOT version-skew records.

### 3. `expand-hl7-terminology-version-skew-content` (163 records)

**Bug**: 6edc96c
**Operation**: ValueSet $expand
**Detection**: Matches when HL7 terminology is in `used-codesystem` AND code membership in `expansion.contains[]` differs between prod and dev.
**Normalization**: Intersects the code sets (keeps only codes present in both) and adjusts `total`. This is a destructive normalization that hides real content differences.
**Scope**: Expansions involving HL7 terminology code systems. Affects observation-category (130 records), security-labels (18), consent-policy (7), patient-contactrelationship (5), TribalEntityUS (3).

### 4. `validate-code-hl7-terminology-vs-version-skew` (4 records)

**Bug**: 6edc96c
**Operation**: validate-code
**Detection**: Messages differ only in `terminology.hl7.org/ValueSet/` pipe-delimited version strings.
**Normalization**: Replaces ValueSet version strings in message/issues text.
**Scope**: Very narrow -- only 4 records where ValueSet (not CodeSystem) version strings differ.

### 5. `expand-hl7-terminology-version-skew-vs-metadata` (249 records)

**Bug**: 6edc96c
**Operation**: ValueSet $expand
**Detection**: Top-level ValueSet metadata fields (date, name, title, version, identifier, language, immutable, meta) differ between prod and dev, AND HL7 terminology is in `used-codesystem`.
**Normalization**: Copies prod's metadata field values to dev.
**Scope**: ValueSet wrapper metadata for HL7 terminology expansions. Mostly TribalEntityUS and security-labels variants.

### 6. `hl7-terminology-lookup-definition-designation-skew` (1 record)

**Bug**: 6edc96c
**Operation**: $lookup
**Detection**: Dev has extra top-level `definition` and `designation` parameters that prod lacks, for `terminology.hl7.org/CodeSystem/*` systems.
**Normalization**: Strips `definition`, `designation` params and `definition` property entries from both sides.
**Scope**: Just 1 record (condition-clinical).

### 7. `expand-snomed-version-skew-content` (40 records)

**Bug**: 9fd2328
**Operation**: ValueSet $expand
**Detection**: SNOMED in `used-codesystem`, raw bodies show different SNOMED version URIs, AND code membership differs.
**Normalization**: Intersects code sets (same destructive approach as #3).
**Scope**: SNOMED-based ValueSet expansions. Includes a safety check using raw bodies to confirm SNOMED version actually differs.

### 8. `expand-snomed-version-skew-content-no-used-cs` (7 records)

**Bug**: 9fd2328
**Operation**: ValueSet $expand
**Detection**: No `used-codesystem` parameter, but SNOMED versions in `contains[].version` differ, AND code membership differs.
**Normalization**: Intersects code sets and normalizes SNOMED versions in contains entries to prod values.
**Scope**: VSAC ValueSets without used-codesystem metadata (7 records, all ValueSet 2.16.840.1.113762.1.4.1240.3).

### 9. `snomed-version-skew-message-text` (35 records)

**Bug**: 9fd2328
**Operation**: validate-code
**Detection**: Message text contains SNOMED version URIs (`snomed.info/sct/MODULE/version/DATE`) that differ between prod and dev, and messages are otherwise identical.
**Normalization**: Replaces dev's SNOMED version URIs in message and issues text with prod's.
**Scope**: validate-code messages mentioning SNOMED version URIs. All records have `result=false`.

---

## Additional Version-Skew Tolerances (for context)

These 7 additional tolerances also handle version skew but were not part of the original 9:

| Tolerance | Records | What it handles |
|---|---|---|
| `snomed-version-skew` | 8,018 | validate-code version/display param differences for SNOMED |
| `v2-0360-lookup-version-skew` | 802 | $lookup: strips version/definition/designation for v2-0360 |
| `expand-hl7-terminology-used-valueset-version-skew` | 264 | used-valueset version strings, displayLanguage, warning-retired |
| `expand-contains-version-skew` | 198 | contains[].version differences (same code membership) |
| `expand-used-codesystem-version-skew` | 142 | used-codesystem version differences (broad, cross-system) |
| `snomed-version-skew-validate-code-result-disagrees` | 46 | SNOMED result=true/false disagreements from edition skew |
| `ndc-validate-code-unknown-code-version-diffs` | 16 | NDC version strings in error messages |

---

## Proposed Detection Algorithm

A general version-skew detector would look for **any difference in version-bearing fields** between the raw prod and dev response bodies:

### Detection locations (ranked by coverage)

1. **Version parameter** (Parameters.parameter where name="version"): Catches SNOMED, HL7 terminology, v2-0360 validate-code and lookup.
2. **used-codesystem parameter** (ValueSet.expansion.parameter where name="used-codesystem"): Catches expand version diffs.
3. **used-valueset parameter**: Catches HL7 terminology ValueSet version diffs.
4. **contains[].version**: Catches version-only diffs when code membership is the same.
5. **Message text version strings**: Catches SNOMED URI and semver-like version strings in validate-code messages.
6. **ValueSet metadata** (version, date fields): Catches HL7 terminology VS wrapper diffs.
7. **Extra definition/designation params**: Catches lookup results from newer CS editions.

### Pseudocode

```
function hasVersionSkew(prodBody, devBody):
  for each location in [version-param, used-codesystem, used-valueset,
                         contains-version, message-version, vs-metadata,
                         extra-definition/designation]:
    if prodValue != devValue:
      return true
  return false
```

### Coverage numbers

| Metric | Count |
|---|---|
| Records detected by general algorithm | 10,138 |
| Records matched by 9 target tolerances | 1,024 |
| Intersection (detected AND target-9) | 982 (96% of target-9) |
| Target-9 NOT detected | 42 (false positives in tolerance, not actual version skew) |
| Detected NOT matched by target-9 | 9,156 (mostly covered by other 7 version tolerances) |
| Detected NOT matched by ANY version tolerance | 20 (NHS/England SNOMED supplement version differences) |

---

## What About Directionality ("Dev is Newer")?

The task asked about constraining to "dev's version is newer than prod's." This is problematic for several reasons:

### 1. Version comparison is unreliable for HL7 Terminology

Prod reports version "4.0.1" for HL7 terminology CodeSystems, which is the FHIR R4 specification version, NOT the actual THO (HL7 Terminology) publication version. Dev reports the actual THO version (e.g., "2.0.0", "3.0.0"). Numerically, 4.0.1 > 3.0.0, so prod appears "newer" -- but in reality, dev has newer content because it loads a more recent THO package. These version strings are fundamentally incomparable.

### 2. Direction is mixed across code systems

- SNOMED: Prod is newer (8,038 records)
- HL7 Terminology: Dev is newer (in content, though version string comparison is unreliable)
- v2-0360: Dev is newer (802 records)
- NDC: Dev is newer (16 records)
- CPT: Prod is newer (198 records)

A "dev-is-newer" constraint would exclude the 8,038 SNOMED records and the 198 CPT records, which are the largest groups.

### 3. Most target-9 records are HL7 terminology (incomparable versions)

Of the 9 target tolerances, 6 are HL7 terminology (totaling ~1,095 matches including overlaps), 3 are SNOMED (82 matches). The HL7 ones cannot be reliably classified by direction.

**Recommendation**: Drop the "dev-is-newer" constraint. The version skew is bidirectional and the version comparison is unreliable for the largest affected system (HL7 Terminology).

---

## What About "Request Didn't Pin a Version"?

### Analysis

Of the 1,024 records matched by the 9 target tolerances:
- 931 (91%) have NO version pinning in the request
- 93 (9%) have a `system-version` parameter pinning a version

The 93 pinned records are all SNOMED-related: the request pinned a SNOMED UK edition version (`system-version=http://snomed.info/sct|http://snomed.info/sct/83821000000107`), but the version skew occurs in OTHER code systems (HL7 terminology) that are also part of the ValueSet being expanded. So even pinned requests can experience version skew in unpinned systems.

**Recommendation**: A "request didn't pin a version" check is useful as a signal but should be applied per-system, not per-request. If the request pins SNOMED but not HL7 terminology, the HL7 terminology skew is still uncontrolled.

---

## Normalization Strategy Analysis

The 9 tolerances use 4 distinct normalization strategies:

### Strategy A: Set dev's version to prod's value (version param, message text)
Used by: #1 (hl7-terminology-cs-version-skew), #4, #9 (snomed-version-skew-message-text)

Simple string replacement. Both sides end up with identical version strings.

### Strategy B: Normalize expansion parameters (used-codesystem, used-valueset)
Used by: #2 (expand-hl7-terminology-version-skew-params), #5 (vs-metadata)

Normalizes used-codesystem/used-valueset URIs to prod values. Strips extra parameters like `warning-draft`.

### Strategy C: Intersect code sets (destructive)
Used by: #3 (expand-hl7-terminology-version-skew-content), #7 (expand-snomed-version-skew-content), #8

Reduces both prod and dev to only the codes present in both. This is the most aggressive strategy and can hide real differences.

### Strategy D: Strip extra params (lookup skew)
Used by: #6 (hl7-terminology-lookup-definition-designation-skew)

Removes `definition` and `designation` params from both sides.

**Key observation**: These strategies are mutually independent. A unified tolerance would need to apply all four, which means it is effectively a composition of the existing tolerances sharing a detection check, not a simplification.

---

## Edge Cases and Risks

### 1. HL7 Terminology version string incomparability
Prod reports "4.0.1" (FHIR version), dev reports actual THO versions. Any version comparison logic would misidentify the direction.

### 2. SNOMED module-specific versions
SNOMED has per-module version URIs (International, US, UK, etc.). Different modules can have different skew directions in the same record.

### 3. Code set intersection hides real bugs
Strategies C (intersect code sets) is dangerous because it suppresses any difference in code membership. If dev has a bug that adds/removes a code incorrectly, the intersection would hide it. The current tolerances mitigate this by checking that SNOMED versions actually differ in the raw bodies.

### 4. False positives from warning-draft
The `expand-hl7-terminology-version-skew-params` tolerance matches 42 records purely on `warning-draft` presence, not version skew. A tighter general detector would actually be more accurate.

### 5. Pinned versions don't prevent all skew
A request can pin SNOMED's version but still get HL7 terminology skew in the same expansion. The general tolerance must check per-system, not per-request.

### 6. NHS/England SNOMED supplements
20 records have version differences between prod (reporting a SNOMED UK module version URI) and dev (reporting "0.1.0") for NHS England code systems. These are a different class of issue (supplement version mapping) and would be caught by a general detector but should probably not be suppressed by a version-skew tolerance.

---

## Recommendation

### Feasibility: Partial

A single **detection function** is feasible and would be simpler than the 9 separate `match()` functions. It would check all 7 version-signal locations in one pass and be more accurate than the individual tolerances (avoiding the 42 false positives from `warning-draft`).

However, a single **normalization function** is NOT feasible because the different response structures require different normalization strategies:
- Parameters responses need version param + message text normalization
- ValueSet expansions need used-codesystem + contains intersection + metadata normalization
- Lookup responses need extra param stripping

### Proposed architecture

```
{
  id: 'version-skew-detector',
  description: 'Shared detection for version skew across all operations',
  match(ctx) {
    return detectVersionSkew(ctx.record) ? 'normalize' : null;
  },
  normalize(ctx) {
    // Dispatch to operation-specific normalizers:
    if (isExpand(ctx)) return normalizeExpandVersionSkew(ctx);
    if (isValidateCode(ctx)) return normalizeValidateCodeVersionSkew(ctx);
    if (isLookup(ctx)) return normalizeLookupVersionSkew(ctx);
    return ctx; // no-op for unknown operations
  }
}
```

This would consolidate the 9 match functions into 1, while keeping the normalization logic grouped by operation type. Net reduction: 9 tolerance objects to 1, with 3-4 normalization helpers.

### What to keep separate

- `snomed-version-skew-validate-code-result-disagrees` (skips, not normalizes -- different kind)
- The `expand-contains-version-skew` pattern (same code membership, version-only diffs) is operation-agnostic and could be a separate general tolerance

### Risk level: Medium

The main risk is that a broader tolerance could mask bugs unrelated to version skew. Mitigation: check raw bodies (not normalized) for version differences, and require that the specific version-bearing fields account for the differences observed. The existing `expand-snomed-version-skew-content` already does this by parsing raw bodies for SNOMED version confirmation.
