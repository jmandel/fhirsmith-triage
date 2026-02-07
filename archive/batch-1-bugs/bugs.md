# tx-compare Bug Report

_11 bugs (11 open, 0 closed)_

| Priority | Count | Description |
|----------|-------|-------------|
| P6 | 11 | Content differences |

---

## P6 -- Content differences

### [ ] `52e1690` v2-0360 CodeSystem version mismatch: prod 2.0.0 vs dev 3.0.0 in $lookup

Dev loads v2-0360 CodeSystem version 3.0.0 while prod loads version 2.0.0.

This causes 157 P6 lookup records to differ:
1. version parameter: "2.0.0" (prod) vs "3.0.0" (dev)
2. definition parameter: absent in prod, present in dev
3. designation parameter: absent in prod, present in dev

The extra definition and designation parameters in dev are likely due to richer content in the 3.0.0 edition.

All 157 affected records are $lookup operations on system=http://terminology.hl7.org/CodeSystem/v2-0360.

Record ID: 80a780e6-8842-43a9-a260-889ce87f76ac
Lookup: grep -n '80a780e6-8842-43a9-a260-889ce87f76ac' comparison.ndjson

Tolerance ID: temp-v2-0360-version-mismatch

---

### [ ] `92514c0` Dev emits empty-string location/expression on OperationOutcome issues

Dev (FHIRsmith) adds location: [""] and expression: [""] to OperationOutcome issues where prod (tx.fhir.org) has these fields absent. Empty strings are invalid FHIR (strings must be non-empty if present), making this a conformance bug.

Affects 260 P6 records (214 of which have this as the only remaining difference after tolerances).

Operations: $validate-code (both ValueSet and CodeSystem)

Example Record ID: 7de52d92-3166-495e-ac5e-af262b1019e4
grep -n '7de52d92-3166-495e-ac5e-af262b1019e4' comparison.ndjson

Prod issue (error-level, TX_GENERAL_CC_ERROR_MESSAGE):
No location or expression fields

Dev issue (same):
location: [""]
expression: [""]

This is a bug in issue construction: when no specific location applies, the fields should be omitted rather than populated with empty strings.

---

### [ ] `e0f466b` BCP-47 validate-code: display choices differ (6 vs 3) with different formatting

When validating display names for BCP-47 language codes (e.g., en-US), prod and dev report different numbers of valid display choices and use different formatting.

**Prod**: Lists 6 choices (with duplicates): 'English (Region=United States)', 'English (United States)', 'English (Region=United States)', 'English (Region=United States)', 'English (United States)' or 'English (Region=United States)'

**Dev**: Lists 3 choices (deduplicated, with language tags): 'English (Region=United States)' (en), 'English (United States)' (en) or 'English (Region=United States)' (en)

The unique display values are the same in both, but:
1. Prod includes duplicate designations (6 items, only 2 unique)
2. Dev deduplicates somewhat (3 items, 2 unique)
3. Dev adds language qualifier '(en)' after each display option

The validation result (false) and correct display are identical. This affects ~10 P6 records.

Record ID: beb4276b-f937-46c3-81ab-7f63cb7798b7
Operation: POST /r4/CodeSystem/$validate-code?
grep -n 'beb4276b-f937-46c3-81ab-7f63cb7798b7' comparison.ndjson

---

### [ ] `3c10c6e` BCP-47 display text includes 'Region=' prefix in dev

Dev returns 'English (Region=United States)' for BCP-47 code en-US, while prod returns 'English (United States)'. The dev format incorrectly includes the subtag type prefix 'Region=' in the display text.

Affects 7 records, all for code en-US.

Record IDs:
- da702ab4-7ced-4b69-945c-0b5bbbc088c0
- 74979a19-f57b-4872-80c3-e741c1b54204
- 4a8b13c7-17b6-4cad-be74-dff1ec76bbf6
- 9020d19f-293d-4849-9c06-d952e2395245
- 4a04821e-654f-47de-94d1-5ac63935f4f8
- 4768974a-32eb-41ca-a8fe-29d989047863
- 385e424e-de83-4be4-bd8d-7f26d63002f8

Operation: POST /r4/ValueSet/$validate-code
System: urn:ietf:bcp:47

Example:
prod display: "English (United States)"
dev display:  "English (Region=United States)"

This is a real bug in the BCP-47 display text generation logic.

---

### [ ] `f4145f1` Dev missing DICOM CID 29 AcquisitionModality ValueSet

#####Summary

Searching for ValueSet with URL `http://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_29.html` returns total=0 in dev but total=1 in prod. The DICOM CID 29 AcquisitionModality ValueSet is loaded in prod but completely missing from dev.

#####Details

- **Operation**: GET /r4/ValueSet?url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html
- **Prod**: Returns Bundle with total=1 containing the AcquisitionModality ValueSet (id: dicom-cid-29-AcquisitionModality, version 2025.3.20250714, 51 concepts)
- **Dev**: Returns Bundle with total=0 and empty entry array
- **Affected records**: 5 records, all same ValueSet URL
- **Record ID**: 3e3359d1-7391-4620-8b72-552f197f21cf (grep -n '3e3359d1-7391-4620-8b72-552f197f21cf' comparison.ndjson)

#####Why this is a real bug

The dev server is missing a terminology resource that exists in prod. This is a data/configuration gap — the DICOM ValueSets need to be loaded into the dev server.

Additionally, the dev response includes `"entry":[]` which is invalid FHIR (empty arrays must be omitted).

---

### [ ] `dc6c82a` Response body truncation at 50k chars makes 277 P6 records uncomparable

The response recording system truncates response bodies at exactly 50,000 characters, producing invalid JSON that cannot be parsed or compared. This affects 739 records total (277 in P6 as parse-errors, others across other priority buckets).

Affected operations: ValueSet search (67), ValueSet $expand (64), ValueSet search /r3 and /r5 (118), individual ValueSet reads (8), $validate-code (6), $batch-validate-code (6), CodeSystem search (3).

Record ID: cdeaf9dc-7d27-46ab-a3f0-8351334cd17b
Tolerance ID: skip-truncated-body

These records should be excluded from comparison since the data capture is incomplete.

---

### [ ] `5c34436` validate-code display parameter differs between prod and dev

In $validate-code responses, the display parameter value differs between prod and dev for multiple code systems.

**UCUM (220 records)**: Prod echoes the code as display (e.g., display='[in_i]') while dev returns the human-readable name (e.g., display='(inch)'). Affected codes include %, mm[Hg], mm, cm, kg, Cel, /min, kg/m2, [lb_av], mg/dL, [in_i], mL, d, mg, {count}, [degF], /d, s, mo, mmol/L, dB, {Snellen}.

**SNOMED (59 records)**: Both return display text but different preferred terms/synonyms. E.g., code=60001007: prod='Not pregnant' vs dev='Non pregnant state'; code=370221004: prod='Severe asthma' vs dev='Severe asthma (finding)'.

**BCP47 (7 records)**: Format differs. E.g., code=en-US: prod='English (United States)' vs dev='English (Region=United States)'.

Total affected: 286 display-only P6 records.

Record ID: 6ae99904-538b-4241-89db-b15eab6e637e
Tolerance ID: temp-validate-code-display-differs

---

### [ ] `4abd03a` SNOMED CT version mismatch: dev loads older editions than prod

Dev is loading older SNOMED CT editions than prod across multiple edition modules:

- International (900000000000207008): prod has 20250201, dev has 20240201 (239 records)
- US edition (731000124108): prod has 20250901, dev has 20230301 (39 records)

This affects 281 validate-code P6 records where the version parameter differs. In 260 of these, the version is the only meaningful difference (after existing tolerances strip diagnostics and display). In 21 records, there are additional differences.

Record ID: e5716810-0ced-4937-85a5-5651fb884719

The version parameter returns which SNOMED edition was used for validation. This is a data/configuration issue — dev needs to load the same SNOMED editions as prod.

Tolerance ID: temp-snomed-version-mismatch


49a6bdd #1 Claude (AI Assistant) <claude@anthropic.com>

Updated tolerance to also cover 4 $expand records where used-codesystem parameter shows SNOMED US edition version mismatch (20250901 vs 20230301). Same root cause as validate-code records. Record ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7

---

### [ ] `bb9bee9` Dev fails on ValueSets with vsacOpModifier extension

Dev cannot process ValueSets that contain VSAC modifier extensions (vsacOpModifier) in exclude[0].filter. Instead of properly validating the code against the ValueSet, dev returns a business-rule error: "Cannot process resource at exclude[0].filter due to the presence of the modifier extension vsacOpModifier".

Prod successfully processes these ValueSets and returns detailed validation results (unknown CodeSystem version, code not in VS, etc).

Both return result=false, but for completely different reasons — dev never attempts actual code validation.

Affects 3 P6 records:
- 64ff24e8-e8ff-456c-a0ed-0f222b9454fb
- 9350ad8a-c2bb-4b2d-bcd0-faacfb33353f
- 648b49a6-c9ab-4534-812f-c3fbd352426d

All are POST /r4/ValueSet/$validate-code against ValueSet http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1

Tolerance ID: temp-vsac-op-modifier

---

### [ ] `1e3f335` Dev omits package provenance in OperationOutcome issue text

In $validate-code responses for draft CodeSystems, prod includes package provenance (e.g. 'from hl7.fhir.r4.core#4.0.1') in the informational message text while dev omits it.

Prod: "Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1"
Dev:  "Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1"

This affects informational messages (severity=information, code=business-rule) with coding status-check. The provenance suffix follows the pattern ' from <package>#<version>'.

Affected records (4 total):
- dcdd2b94-db92-4e95-973c-5ced19783bef
- 43fffcb3-2e22-4f94-a84c-dd9515864a0b
- 2d19785a-6906-4615-9572-62cdb76d5694
- 955ee0d7-5ec0-4016-b807-c7767a0b7552

All are /r4/CodeSystem/$validate-code POST requests. grep -n 'dcdd2b94-db92-4e95-973c-5ced19783bef' comparison.ndjson

---

### [ ] `8ca2509` NDC validate-code: dev returns extra inactive/version/message/issues parameters

Dev returns extra parameters (version, inactive, message, issues) for NDC CodeSystem validate-code that prod does not return.

Pattern: For all NDC validate-code requests, dev returns:
- version: "2021-11-01" (NDC edition version)
- inactive: true (concept has null status)
- message: "The concept '<code>' has a status of null and its use should be reviewed"
- issues: OperationOutcome with INACTIVE_CONCEPT_FOUND warning

Prod returns none of these extra parameters. The core result (true), system, code, and display all match.

This suggests dev is loading NDC data with concept status metadata that triggers inactive-concept handling, while prod either lacks this metadata or doesn't report it.

Affected: 16 P6 validate-code records, all for http://hl7.org/fhir/sid/ndc.

Record IDs (sample): ac23726f-6ff2-4b72-b2c8-584922d04c92, 8877db64-c49f-4ea0-a78f-d83190b345ea, c2a82ab9-de4f-45f9-9f27-5de9ac11e809

Tolerance ID: temp-ndc-validate-code-inactive

---

