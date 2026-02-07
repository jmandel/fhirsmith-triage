# tx-compare Bug Report

_40 bugs (37 open, 3 closed)_

| Priority | Count | Description |
|----------|-------|-------------|
| P3 | 1 | Missing resources |
| P4 | 1 | Status code mismatch |
| P6 | 5 | Content differences |
| TEMP | 1 | Temporary tolerances (real bugs, suppressed for triage) |

---

## P3 -- Missing resources

### [ ] `51f23f5` DICOM CID 29 AcquisitionModality ValueSet missing from dev

Records-Impacted: 10
Tolerance-ID: dicom-cid29-missing
Record-ID: 3e3359d1-7391-4620-8b72-552f197f21cf

#####Repro

**Test 1: Direct read by ID** (prod=200, dev=404)

```bash
####Prod (expect 200 with full ValueSet, 51 DICOM modality codes)
curl -s -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r4/ValueSet/dicom-cid-29-AcquisitionModality" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Status: 200, resourceType: {d[\"resourceType\"]}, id: {d[\"id\"]}')"

####Dev (expect 404 with OperationOutcome "not found")
curl -s -o /dev/null -w "%{http_code}" -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r4/ValueSet/dicom-cid-29-AcquisitionModality"
####Returns: 404
```

**Test 2: URL search** (prod total=1, dev total=0)

```bash
####Prod (expect total: 1, one entry)
curl -s -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r4/ValueSet?url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'total: {d[\"total\"]}, entries: {len(d.get(\"entry\",[]))}')"
####Returns: total: 1, entries: 1

####Dev (expect total: 0, no entries)
curl -s -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r4/ValueSet?url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'total: {d[\"total\"]}, entries: {len(d.get(\"entry\",[]))}')"
####Returns: total: 0, entries: 0
```

Verified 2026-02-07: both tests confirm the DICOM CID 29 AcquisitionModality ValueSet exists on prod but is entirely missing from dev.

#####What differs

When searching for the DICOM CID 29 AcquisitionModality ValueSet by URL (`/r4/ValueSet?url=http://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_29.html`), prod returns a Bundle with `total: 1` containing the full ValueSet resource (id: `dicom-cid-29-AcquisitionModality`, 51 DICOM modality codes). Dev returns an empty Bundle with `total: 0`.

Direct reads by ID (`/r4/ValueSet/dicom-cid-29-AcquisitionModality`) return 200 on prod with the full ValueSet, and 404 on dev with "ValueSet/dicom-cid-29-AcquisitionModality not found".

The ValueSet has URL `http://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_29.html`, version `2025.3.20250714`, and uses system `http://dicom.nema.org/resources/ontology/DCM`.

#####How widespread

10 records in the delta file:
- 5x P3 (prod=200, dev=404): direct read `/r4/ValueSet/dicom-cid-29-AcquisitionModality`
- 5x P6 (both 200, content differs): URL search returning empty Bundle vs populated Bundle

Search: `grep 'dicom-cid-29\|sect_CID_29' deltas.ndjson` finds all 10.

#####Representative record IDs

- `3e3359d1-7391-4620-8b72-552f197f21cf` (P6 URL search)
- `ab5f8ed0-5149-4967-af3a-3c649cbb10c5` (P3 direct read)

---

## P4 -- Status code mismatch

### [ ] `1c145d2` Dev returns 404 instead of 422 for  when referenced CodeSystem is not found

Records-Impacted: 296
Tolerance-ID: expand-422-vs-404-codesystem-not-found
Record-ID: eee2c985-52e0-4520-b4e4-01766ede5a7d

#####Repro

```bash
####Prod (returns 422)
curl -s -w '\nHTTP Status: %{http_code}\n' 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://ontariohealth.ca/fhir/questionnaire/CodeSystem/breastSiteCodes"}]}}}]}'

####Dev (returns 404)
curl -s -w '\nHTTP Status: %{http_code}\n' 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://ontariohealth.ca/fhir/questionnaire/CodeSystem/breastSiteCodes"}]}}}]}'
```

Prod returns HTTP 422, dev returns HTTP 404. Both return the same OperationOutcome error: "A definition for CodeSystem '...' could not be found, so the value set cannot be expanded".

#####What differs

When a ValueSet $expand fails because a referenced CodeSystem definition cannot be found, prod returns HTTP 422 (Unprocessable Entity) while dev returns HTTP 404 (Not Found). The OperationOutcome error message is identical on both sides: "A definition for CodeSystem '...' could not be found, so the value set cannot be expanded". The issue code is `not-found` in both cases.

Additionally, dev includes `location: [null]` and `expression: [null]` arrays in the OperationOutcome issue (prod omits these), and dev omits the `text` narrative element that prod includes. These are secondary cosmetic differences; the primary issue is the status code mismatch.

#####How widespread

296 records in this comparison batch. All are POST /r4/ValueSet/$expand operations where the error message contains "could not be found, so the value set cannot be expanded".

Search: `grep '"prodStatus":422,"devStatus":404' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 296

All 296 have:
- Operation: POST /r4/ValueSet/$expand
- Prod status: 422
- Dev status: 404
- OperationOutcome issue code: not-found
- Identical error message text

#####What the tolerance covers

Tolerance ID: `expand-422-vs-404-codesystem-not-found`
Matches: POST /r4/ValueSet/$expand where prodStatus=422 and devStatus=404, and the OperationOutcome contains "could not be found, so the value set cannot be expanded".
Normalizes: status code difference, strips null location/expression arrays from dev, strips text narrative from prod. Compares remaining OperationOutcome content.
Affects: 296 records.

#####Representative record

ID: eee2c985-52e0-4520-b4e4-01766ede5a7d

---

## P6 -- Content differences

### [ ] `d3b49ff` v2-0360 $lookup returns version 3.0.0 vs prod 2.0.0 with extra definition/designation

Records-Impacted: 157
Tolerance-ID: v2-0360-lookup-version-skew
Record-ID: 80a780e6-8842-43a9-a260-889ce87f76ac

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN' \
-H 'Accept: application/fhir+json'
```

Prod returns `version: "2.0.0"` with no top-level `definition` or `designation` parameters. Dev returns `version: "3.0.0"` with an extra `definition` parameter ("Registered Nurse") and an extra `designation` parameter (use=preferredForLanguage).

#####What differs

$lookup on CodeSystem v2-0360 (DegreeLicenseCertificate) returns different version and content between prod and dev:

1. **Version**: prod returns `version: "2.0.0"`, dev returns `version: "3.0.0"`
2. **Definition parameter**: dev returns a top-level `definition` parameter (`"Registered Nurse"`); prod returns the definition only as a property (code=definition)
3. **Designation parameter**: dev returns a `designation` parameter with `preferredForLanguage` use coding; prod does not include designation

These differences reflect that dev has loaded a newer edition (3.0.0) of the v2-0360 CodeSystem than prod (2.0.0). The structural differences (definition as top-level param, extra designation) are consistent with the newer version having richer content.

#####How widespread

All 157 $lookup deltas are for this same system and show the identical pattern. All use code=RN.

```
grep '"op":"lookup"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l
####157

grep '"op":"lookup"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | grep -c 'v2-0360'
####157
```

Request properties that predict this difference:
- Operation: $lookup
- System: http://terminology.hl7.org/CodeSystem/v2-0360
- FHIR version: /r4/

#####Tolerance

Tolerance ID: `v2-0360-lookup-version-skew`
Matches: $lookup requests on v2-0360 system
Normalizes: strips version, definition, and designation parameters from both sides; removes property with code=definition from both sides
Affects: 157 records

#####Representative record

ID: `80a780e6-8842-43a9-a260-889ce87f76ac`
URL: GET /r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN

---

### [x] `e9c7e58` Dev returns empty-string expression/location in OperationOutcome issues

Records-Impacted: 318
Tolerance-ID: dev-empty-string-expression-location
Record-ID: 7de52d92-3166-495e-ac5e-af262b1019e4

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"109691-6","display":"Influenza virus A Ag [Measurement] in Nasopharynx"}]}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"109691-6","display":"Influenza virus A Ag [Measurement] in Nasopharynx"}]}}]}'
```

At data collection time, prod omitted `expression` and `location` on the TX_GENERAL_CC_ERROR_MESSAGE issue (correct), while dev returned `"expression": [""]` and `"location": [""]` (invalid FHIR). As of 2026-02-07, dev no longer returns the empty-string fields — the bug appears fixed on the current dev server.

Dev returns `"expression": [""]` and `"location": [""]` on certain OperationOutcome issue entries in $validate-code responses, where prod correctly omits these fields entirely.

#####What differs

In $validate-code responses (both ValueSet and CodeSystem), dev includes `"expression": [""]` and `"location": [""]` on OperationOutcome issue entries that have no specific FHIRPath location. Prod omits these fields entirely, which is correct — FHIR requires strings to be non-empty if present. The empty string `""` is invalid FHIR.

This occurs on issues with these message IDs:
- TX_GENERAL_CC_ERROR_MESSAGE (311 records)
- MSG_DRAFT (4 records)
- MSG_DEPRECATED (3 records)

#####How widespread

318 delta records show this pattern. All are $validate-code operations (both ValueSet/$validate-code and CodeSystem/$validate-code), all P6 priority.

Search: examined all records in deltas.ndjson where dev OperationOutcome issues contain empty-string expression or location arrays.

#####What the tolerance covers

Tolerance ID: `dev-empty-string-expression-location`. Normalizes by removing `expression: [""]` and `location: [""]` from OperationOutcome issues in dev responses, matching what prod does (omit the fields). This is a normalize tolerance (not skip) so other differences in these records still surface.

#####Representative record IDs

- `7de52d92-3166-495e-ac5e-af262b1019e4` (ValueSet/$validate-code, TX_GENERAL_CC_ERROR_MESSAGE)
- `dcdd2b94-db9...` (CodeSystem/$validate-code, TX_GENERAL_CC_ERROR_MESSAGE)

---

### [ ] `cf90495` Wrong Display Name message format differs: different display option count, formatting, and language tags

Records-Impacted: 44
Tolerance-ID: invalid-display-message-format
Record-ID: beb4276b-f937-46c3-81ab-7f63cb7798b7

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-US"},{"name":"display","valueString":"English"},{"name":"displayLanguage","valueCode":"en-US"}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-US"},{"name":"display","valueString":"English"},{"name":"displayLanguage","valueCode":"en-US"}]}'
```

Prod returns "one of 6 choices" with duplicate display options and no language tags; dev returns "one of 3 choices" with de-duplicated options and `(en)` language tags appended to each.

#####What differs

When $validate-code detects a wrong display name, prod and dev return different error message text in both the `message` parameter and `issues` OperationOutcome `details.text`.

Specific differences:
- **Display option count**: Prod may list duplicate display options (e.g., "6 choices" with repeats), while dev de-duplicates (e.g., "3 choices" with unique entries)
- **Language tags**: Dev appends language tags like `(en)` after each display option; prod does not
- **Example**: For `urn:ietf:bcp:47#en-US`:
- Prod: "Valid display is one of 6 choices: 'English (Region=United States)', 'English (United States)', 'English (Region=United States)', ..."
- Dev: "Valid display is one of 3 choices: 'English (Region=United States)' (en), 'English (United States)' (en) or 'English (Region=United States)' (en) ..."

The core validation result (`result: false`) agrees in all but 1 of 41 records. The difference is confined to the human-readable error message text.

#####How widespread

44 delta records have `invalid-display` issue type with only `message` and `issues` diffs. 41 records contain "Wrong Display Name" in the delta text.

Search: `grep -c 'Wrong Display Name' jobs/2026-02-round-1/results/deltas/deltas.ndjson` → 41
Search: `grep -c 'invalid-display' jobs/2026-02-round-1/results/deltas/deltas.ndjson` → 53 (44 with only message/issues diffs)

Affected operations: $validate-code on both CodeSystem and ValueSet
Affected systems: urn:ietf:bcp:47, http://snomed.info/sct, and others

#####What the tolerance covers

Tolerance ID: `invalid-display-message-format`
Matches: validate-code records where both prod and dev have `invalid-display` issue type and only the message/issues text differs. Normalizes the message and issues text to prod's version.
Expected elimination: ~44 records.

#####Representative record ID

`beb4276b-f937-46c3-81ab-7f63cb7798b7` — grep -n 'beb4276b-f937-46c3-81ab-7f63cb7798b7' jobs/2026-02-round-1/comparison.ndjson

---

### [x] `e09cff6` BCP-47 display text format: dev returns 'Region=...' instead of standard format

Records-Impacted: 7
Tolerance-ID: bcp47-display-format
Record-ID: da702ab4-7ced-4b69-945c-0b5bbbc088c0

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=urn:ietf:bcp:47&code=en-US' -H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=urn:ietf:bcp:47&code=en-US' -H 'Accept: application/fhir+json'
```

As of 2026-02-07, both servers return `"display": "English (Region=United States)"` — the original difference (prod had "English (United States)") is no longer present. Prod appears to have been updated to match dev's format.

#####What differs

For BCP-47 language codes (system urn:ietf:bcp:47), dev returns display text with explicit subtag labels like "English (Region=United States)" while prod returns the standard format "English (United States)".

Specific example for code en-US:
- prod: "English (United States)"
- dev: "English (Region=United States)"

The "Region=" prefix in dev's display text is non-standard. The IANA/BCP-47 convention is to show the region name without a label prefix.

#####How widespread

7 P6 $validate-code records in the current delta set match this pattern — all are urn:ietf:bcp:47 validate-code operations for code en-US where the only difference (after diagnostics stripping and parameter sorting) is the display parameter value.

Search: grep -c 'Region=' deltas.ndjson → 10 total hits (7 are this display-only P6 pattern; 2 are P1 case-sensitivity issues for en-us; 1 is an $expand with transient metadata diffs where "Region=" appears only in diagnostics).

#####What the tolerance covers

Tolerance: bcp47-display-format. Matches $validate-code records where system=urn:ietf:bcp:47, both prod and dev return display parameters, and the values differ. Canonicalizes dev display to match prod. Expected to eliminate 7 records.

#####Representative record

da702ab4-7ced-4b69-945c-0b5bbbc088c0 — POST /r4/ValueSet/$validate-code? for en-US in urn:ietf:bcp:47


e0019ec #1 Claude (AI Assistant) <claude@anthropic.com>

Closing: no longer reproducible as of 2026-02-07. Both prod and dev now return the same 'Region=...' format for BCP-47 display text. Servers have converged.

---

### [ ] `4233647` Searchset Bundle formatting: empty entry array, extra pagination links, absolute URLs

Records-Impacted: 491
Tolerance-ID: searchset-bundle-format
Record-ID: c97f36a4-973b-42c5-8b6d-58464195cfd5

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fwww.rsna.org%2FRadLex_Playbook.aspx' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fwww.rsna.org%2FRadLex_Playbook.aspx' \
-H 'Accept: application/fhir+json'
```

Prod returns a searchset Bundle with `total: 0`, no `entry` field, a single `self` link with a relative URL, and server-generated `id`/`meta.lastUpdated`. Dev returns a searchset Bundle with `total: 0`, an empty `entry: []` array, three links (`self`/`first`/`last`) with absolute URLs and `_offset=0`, and no `id` or `meta`.

#####What differs

Dev's searchset Bundle responses differ from prod in several ways:

1. **`entry: []` on empty results**: When a search returns no results (total: 0), dev includes `entry: []` (an empty array). Prod omits the entry field entirely. Empty arrays violate FHIR's general rule that arrays, if present, must be non-empty.

2. **Extra pagination link relations**: Dev returns `self`, `first`, and `last` link relations. Prod returns only `self`. This applies to both empty and non-empty search results.

3. **Absolute vs relative link URLs**: Dev uses absolute URLs with full host prefix (e.g., `http://tx.fhir.org/r4/ValueSet?...&_offset=0`). Prod uses relative URLs (e.g., `ValueSet?&url=...`). Dev also appends `_offset=0` to search links.

4. **Server-generated metadata**: Prod includes `id` and `meta.lastUpdated` on searchset Bundles. Dev omits these. (This is server-generated transient metadata and is the least significant difference.)

#####How widespread

Affects all searchset Bundle responses for ValueSet and CodeSystem searches:
- 337 empty ValueSet search Bundles
- 154 empty CodeSystem search Bundles
- 7 non-empty searchset Bundles (these also have the extra links, and may have other substantive differences like total count disagreements)

Total: **498 records** in the deltas file.

Search used: Parsed all records with `ValueSet?` or `CodeSystem?` in the URL where prodBody contains a Bundle with type "searchset".

#####Representative record IDs

- `c97f36a4-973b-42c5-8b6d-58464195cfd5` (empty ValueSet search, RadLex Playbook)
- `4ab7655f-015d-4f44-b184-5ba0fd256926` (empty ValueSet search, DICOM)
- `640875e4-3839-40d1-aaa1-0bf79bef77f2` (non-empty CodeSystem search, USPS)

---

## Temporary tolerances (real bugs, suppressed for triage)

### [ ] `933fdcc` Dev fails to process VSAC ValueSets with vsacOpModifier extension

Dev returns a generic error "Cannot process resource at \"exclude[0].filter\" due to the presence of the modifier extension vsacOpModifier" instead of processing VSAC ValueSets that use the vsacOpModifier extension in their exclude filters.

#####Repro

```bash
####Prod — returns detailed validation (unknown codesystem version + not-in-valueset):
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1|20250419&system=urn:oid:2.16.840.1.113883.6.238&code=2184-0&display=Dominican' -H 'Accept: application/fhir+json'

####Dev — returns generic "vsacOpModifier" business-rule error:
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1|20250419&system=urn:oid:2.16.840.1.113883.6.238&code=2184-0&display=Dominican' -H 'Accept: application/fhir+json'
```

**Expected (prod)**: `result: false` with specific errors — "CodeSystem version '1.3' could not be found" and "code not found in value set".
**Actual (dev)**: `result: false` with generic error — "Cannot process resource at \"exclude[0].filter\" due to the presence of the modifier extension vsacOpModifier".

Also reproducible with codes `2148-5` (Mexican) and `2151-9` (Chicano) against the same ValueSet.

**What differs**: When validating codes against VSAC ValueSets that use vsacOpModifier, prod processes the ValueSet and returns proper validation results (e.g., unknown codesystem version, not-in-valueset issues), while dev bails out at ValueSet processing with a business-rule error about the modifier extension. Both return result=false, but for completely different reasons — prod gives specific, correct error details while dev gives a generic "cannot process" error.

**How widespread**: 3 records in the delta file, all POST /r4/ValueSet/$validate-code, all involving the same VSAC ValueSet (http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1|20250419) with system urn:oid:2.16.840.1.113883.6.238.

Search: grep -c 'vsacOpModifier' results/deltas/deltas.ndjson → 3

**Tolerance**: `vsac-modifier-extension-error` (temp-tolerance) matches validate-code records where dev's message contains "vsacOpModifier". Eliminates 3 records.

**Representative record**: 64ff24e8-e8ff-456c-a0ed-0f222b9454fb

---

## Other

### [ ] `17ad254` UCUM -code: dev returns human-readable display instead of code-as-display

Records-Impacted: 220
Tolerance-ID: ucum-display-code-as-display
Record-ID: 6ae99904-538b-4241-89db-b15eab6e637e

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=%5Bin_i%5D' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=%5Bin_i%5D' \
-H 'Accept: application/fhir+json'
```

Prod returns `display: "[in_i]"` (the UCUM code itself), dev returns `display: "(inch)"` (human-readable name).

#####What differs

For UCUM ($validate-code) operations, prod returns the UCUM code itself as the `display` parameter (e.g., `[in_i]`, `[lb_av]`, `mg`, `%`), while dev returns a human-readable name (e.g., `(inch)`, `(pound)`, `(milligram)`, `(percent)`).

Per the FHIR UCUM guidance (https://terminology.hl7.org/UCUM.html): "No standardized display value is defined. The UCUM code itself is used directly as the display." Prod follows this convention; dev does not.

All other parameters (result, system, code, version) agree between prod and dev. Display is the only difference.

Examples:
- code=[in_i]: prod display="[in_i]", dev display="(inch)"
- code=[lb_av]: prod display="[lb_av]", dev display="(pound)"
- code=[degF]: prod display="[degF]", dev display="(degree Fahrenheit)"
- code=mg: prod display="mg", dev display="(milligram)"
- code=%: prod display="%", dev display="(percent)"
- code=mm[Hg]: prod display="mm[Hg]", dev display="(millimeter of mercury column)"
- code=kg/m2: prod display="kg/m2", dev display="(kilogram) / (meter ^ 2)"

#####How widespread

220 records in deltas.ndjson match this pattern. All are validate-code operations on system http://unitsofmeasure.org where display is the only diff. Found with:

grep '"param":"display"' deltas.ndjson | grep 'unitsofmeasure.org' | wc -l

In all 220 cases, prod's display equals the UCUM code exactly.

#####Tolerance

Tolerance ID: ucum-display-code-as-display
Matches: validate-code operations on http://unitsofmeasure.org where display values differ
Normalizes both sides to prod's display value (the code itself, per FHIR convention)

#####Representative record

6ae99904-538b-4241-89db-b15eab6e637e (POST /r4/ValueSet/$validate-code, code=[in_i])

---

### [ ] `da50d17` SNOMED CT edition version skew: dev loads older editions than prod

Records-Impacted: 181
Tolerance-ID: snomed-version-skew
Record-ID: e5716810-0ced-4937-85a5-5651fb884719

#####Repro

The version skew is visible in both the metadata endpoint and $validate-code responses.
The International edition has been partially fixed (both servers now resolve to 20250201),
but the US edition (731000124108) still shows the bug: dev defaults to 20230301 instead
of 20250901. Both servers have the 20250901 edition loaded, but dev picks the wrong default.

######1. Metadata: compare loaded SNOMED US editions

```bash
####PROD - lists US edition 20250901 only
curl -s "https://tx.fhir.org/r4/metadata?mode=terminology" \
-H "Accept: application/fhir+json" | \
jq '.codeSystem[] | select(.uri=="http://snomed.info/sct") | .version[].code | select(contains("731000124108"))'

####DEV - lists BOTH 20250901 AND 20230301 (extra stale edition)
curl -s "https://tx-dev.fhir.org/r4/metadata?mode=terminology" \
-H "Accept: application/fhir+json" | \
jq '.codeSystem[] | select(.uri=="http://snomed.info/sct") | .version[].code | select(contains("731000124108"))'
```

Expected: both list only `http://snomed.info/sct/731000124108/version/20250901`
Actual: dev also has `http://snomed.info/sct/731000124108/version/20230301`

######2. $validate-code: US edition resolves to wrong default version

```bash
####PROD - returns version 20250901
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
--data-raw '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"243796009"},{"name":"version","valueString":"http://snomed.info/sct/731000124108"}]}'

####DEV - returns version 20230301 (should be 20250901)
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
--data-raw '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"243796009"},{"name":"version","valueString":"http://snomed.info/sct/731000124108"}]}'
```

Expected: both return `"version": "http://snomed.info/sct/731000124108/version/20250901"`
Actual: dev returns `"version": "http://snomed.info/sct/731000124108/version/20230301"`

######Additional affected records

- 36822cee-7132-4003-bf9e-a5602f839466 (US edition, code 243796009)
- 1796976f-3807-40ec-aa48-f8758b0fee62 (US edition, code 272379006)
- 03fec18b-e871-4041-b9b8-5c770b2b17c7 (International edition, code 106292003)

Tested: 2026-02-07

Dev returns different (generally older) SNOMED CT edition versions than prod across multiple modules.

#####What differs

The `version` parameter in $validate-code responses contains different SNOMED CT edition URIs:

- International edition (900000000000207008): prod=20250201, dev=20240201 (256 records)
- US edition (731000124108): prod=20250901, dev=20230301 (46 records, some with reversed newer dev versions)
- Swedish edition (45991000052106): prod=20220531, dev=20231130 (13 records)
- Plus other national editions with smaller counts

#####How widespread

279 total records in the current comparison dataset show SNOMED version parameter differences:
- 265 categorized as content-differs (version string is the only or primary diff)
- 14 categorized as result-disagrees (validation result boolean differs — codes valid in one edition but not the other)

All are $validate-code operations. The version difference also correlates with display text differences in ~80 records (display names changed between editions).

Matched by: system=http://snomed.info/sct AND version parameter contains snomed.info/sct AND prod version != dev version.

#####What the tolerance covers

Tolerance ID: snomed-version-skew
Normalizes the `version` parameter to prod's value on both sides when both contain snomed.info/sct URIs with different version dates. This eliminates records where version is the only diff (~190 records). Records with additional diffs (display, message, result) still surface for separate triage.

#####Representative record IDs

- e5716810-0ced-4937-85a5-5651fb884719 (International edition, version-only diff)
- e85ce5f3-b23f-41c0-892e-5f7b2aa672ef (result-disagrees, code 116154003)

---

### [x] `2abe02d` Dev $expand returns empty string id on ValueSet response

Records-Impacted: 690
Tolerance-ID: expand-dev-empty-id
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7

#####Repro

Attempted to reproduce on 2026-02-07 but the bug appears to have been **fixed** on tx-dev.fhir.org since the data was collected (2026-02-06).

Tried 4 different $expand POST requests — none returned `"id":""` from dev:

```bash
####Test 1: Inline ValueSet with SNOMED concept
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}}]}'

####Test 2: Registered ValueSet by URL
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medicationrequest-category"}]}'

####Test 3: Inline ValueSet with LOINC
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"8480-6"}]}]}}}]}'
```

All three return a ValueSet without `"id":""`. Both inline and registered ValueSet expansions now omit `id` entirely, matching prod behavior.

**Status**: No longer reproducible — likely fixed between 2026-02-06 and 2026-02-07.

Dev $expand responses include `"id": ""` at the top level of the returned ValueSet resource. Prod does not include an `id` field at all.

#####What differs

In all 690 $expand delta records where dev returns a successful ValueSet expansion, the dev response includes `"id": ""` (an empty string). Prod omits the `id` field entirely, which is the correct behavior — per FHIR, string values must be non-empty if present. An empty string `""` is invalid FHIR.

This affects all POST /r4/ValueSet/$expand records across all code systems (SNOMED, LOINC, ICD, etc.) — it's not specific to any particular ValueSet or code system.

#####How to reproduce

```bash
grep '"op":"expand"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | python3 -c "
import json, sys
for line in sys.stdin:
  rec = json.loads(line)
  dev = json.loads(rec.get('devBody','{}'))
  if dev.get('id') == '': print(rec['id'])
" | wc -l
####Returns 690
```

#####Example

**Dev** (incorrect):
```json
{"resourceType":"ValueSet","status":"active","id":"","expansion":{...}}
```

**Prod** (correct):
```json
{"resourceType":"ValueSet","status":"active","expansion":{...}}
```

---

### [ ] `d1b7d3b` Dev $expand echoes includeDefinition=false parameter in expansion

Records-Impacted: 677
Tolerance-ID: expand-dev-includeDefinition-param
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7

#####Repro

```bash
####Prod — does NOT echo includeDefinition=false (omits default-value parameter)
curl -s "https://tx.fhir.org/r4/ValueSet/\$expand" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-status"},{"name":"excludeNested","valueBoolean":true},{"name":"includeDefinition","valueBoolean":false}]}'

####Dev — echoes includeDefinition=false in expansion.parameter
curl -s "https://tx-dev.fhir.org/r4/ValueSet/\$expand" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-status"},{"name":"excludeNested","valueBoolean":true},{"name":"includeDefinition","valueBoolean":false}]}'
```

Prod expansion.parameter: `[excludeNested, used-codesystem]` — no includeDefinition.
Dev expansion.parameter: `[excludeNested, includeDefinition, used-codesystem]` — echoes `{"name":"includeDefinition","valueBoolean":false}`.

Dev $expand responses include an extra `includeDefinition` parameter (value: false) in the expansion.parameter array. Prod does not include this parameter.

#####What differs

In 677 of the 893 $expand delta records, dev includes `{"name":"includeDefinition","valueBoolean":false}` in the `expansion.parameter` array. Prod omits this parameter entirely.

The `includeDefinition` parameter is an input parameter to the $expand operation. While it's valid to echo input parameters in the expansion.parameter array, prod doesn't do it for this parameter (presumably because false is the default). This is a behavioral difference — not a conformance violation per se, but a real difference in what the servers return.

#####How to reproduce

```bash
grep '"op":"expand"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | python3 -c "
import json, sys
for line in sys.stdin:
  rec = json.loads(line)
  dev = json.loads(rec.get('devBody','{}'))
  params = dev.get('expansion',{}).get('parameter',[])
  if any(p.get('name')=='includeDefinition' for p in params): print(rec['id'])
" | wc -l
####Returns 677
```

#####Example

**Dev** includes extra parameter:
```json
"parameter": [
{"name":"excludeNested","valueBoolean":true},
{"name":"includeDefinition","valueBoolean":false},
{"name":"offset","valueInteger":0},
...
]
```

**Prod** omits it:
```json
"parameter": [
{"name":"excludeNested","valueBoolean":true},
{"name":"offset","valueInteger":0},
...
]
```

---

### [ ] `515117b` Dev $expand reports different used-codesystem versions than prod

Records-Impacted: 37
Tolerance-ID: expand-used-codesystem-version-skew
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/731000124108"}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/731000124108"}]}'
```

Prod returns `used-codesystem` version `20250901`, dev returns `20230301` for SNOMED US edition.

Dev $expand responses report different code system versions in the `used-codesystem` expansion parameter compared to prod. This is the $expand counterpart of the existing SNOMED version skew bug (da50d17), but affects multiple code systems and is specific to expansion metadata rather than validate-code Parameters.

#####What differs

In 37 $expand delta records, the `used-codesystem` expansion parameter reports a different version in dev than prod. This affects multiple code systems:

- (empty/missing): 14 records
- http://hl7.org/fhir/sid/icd-9-cm: 11 records
- http://snomed.info/sct: 6 records
- http://terminology.hl7.org/CodeSystem/medicationrequest-category: 2 records
- http://loinc.org: 2 records
- http://terminology.hl7.org/CodeSystem/v3-NullFlavor: 1 record
- http://hl7.org/fhir/sid/icd-10-cm: 1 record

Examples:
- SNOMED US: prod `20250901`, dev `20230301`
- medicationrequest-category: prod `4.0.1`, dev `1.0.0`

This indicates dev loads different (generally older) editions of these code systems.

#####How to reproduce

```bash
grep '"op":"expand"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | python3 -c "
import json, sys
for line in sys.stdin:
  rec = json.loads(line)
  dev = json.loads(rec.get('devBody','{}'))
  prod = json.loads(rec.get('prodBody','{}'))
  d = {p.get('name'):p for p in dev.get('expansion',{}).get('parameter',[])}
  p = {p.get('name'):p for p in prod.get('expansion',{}).get('parameter',[])}
  du = d.get('used-codesystem',{}).get('valueUri','')
  pu = p.get('used-codesystem',{}).get('valueUri','')
  if du != pu: print(f'{rec[\"id\"]}: prod={pu} dev={du}')
" | wc -l
####Returns 37
```

---

### [ ] `9376cf0` Dev crashes (500) on $expand when CodeSystem content mode prevents expansion

Records-Impacted: 186
Tolerance-ID: expand-dev-crash-on-error
Record-ID: f39ee3d3-8249-4e0c-a8a6-c2d5d1ffdcbd

#####Repro

```bash
####Prod (returns 422 with clear error: "is a fragment")
curl -s -w '\nHTTP_STATUS:%{http_code}\n' 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/sid/icd-9-cm"}]}}}]}'

####Dev (returns 500 with JS source code leak: "is a contentMode() { return this.codeSystem.content; }")
curl -s -w '\nHTTP_STATUS:%{http_code}\n' 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/sid/icd-9-cm"}]}}}]}'
```

Prod returns HTTP 422 with `"is a fragment, so this expansion is not permitted"`. Dev returns HTTP 500 with `"is a contentMode() {\r\n    return this.codeSystem.content;\r\n  }, so this expansion is not permitted"` — a JavaScript function body leaked into the error message.

#####What differs

When a $expand request fails because a CodeSystem's content mode (fragment, not-present) prevents expansion, prod returns HTTP 422 with a clear OperationOutcome. Dev returns HTTP 500 with an error message that leaks internal implementation details.

Three distinct error sub-patterns in dev:

1. **Source code leak in error text** (178 records): Dev interpolates a JavaScript function body into the error message. Instead of "is a fragment, so this expansion is not permitted", dev returns "is a contentMode() {\r\n    return this.codeSystem.content;\r\n  }, so this expansion is not permitted". The `.contentMode` property accessor is being `.toString()`'d instead of invoked.

2. **exp.addParamUri is not a function** (4 records): Dev crashes with a JS TypeError when attempting to expand ValueSets referencing CodeSystem `https://codesystem.x12.org/005010/1365`.

3. **TerminologyError is not a constructor** (4 records): Dev crashes with a JS TypeError when attempting to expand ValueSets referencing `http://terminology.hl7.org/CodeSystem/v2-0360|2.7`.

Additional differences in all 186 records:
- HTTP status: prod=422, dev=500
- Issue code: prod uses `invalid`, dev uses `business-rule`
- Dev includes `location: [null]` and `expression: [null]` (arrays containing null — invalid FHIR)
- Dev omits the `text` narrative that prod includes

#####How widespread

All 186 records are POST /r4/ValueSet/$expand with prod=422, dev=500. This accounts for all `dev-crash-on-error` records in the current delta set.

Code systems involved in sub-pattern 1:
- http://hl7.org/fhir/sid/icd-9-cm (154 records)
- https://fhir.progyny.com/CodeSystem/identifier-type-cs (24 records)

Search: `grep -c 'contentMode()' results/deltas/deltas.ndjson` → 178
Search: `grep '"dev-crash-on-error"' results/deltas/deltas.ndjson | wc -l` → 186

#####What the tolerance covers

Tolerance `expand-dev-crash-on-error` skips all records matching POST /r4/ValueSet/$expand with prod.status=422 and dev.status=500. Eliminates all 186 records.

---

### [ ] `241f1d8` Draft CodeSystem message missing provenance suffix in dev

Records-Impacted: 4
Tolerance-ID: draft-codesystem-message-provenance-suffix
Record-ID: dcdd2b94-db92-4e95-973c-5ced19783bef

#####Repro

Validate a code against a draft CodeSystem (e.g. `event-status`) on both servers and compare the `details.text` in the OperationOutcome issue:

```bash
####Prod (includes provenance suffix "from hl7.fhir.r4.core#4.0.1"):
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/event-status"},{"name":"code","valueCode":"completed"}]}'

####Dev (missing provenance suffix):
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/event-status"},{"name":"code","valueCode":"completed"}]}'
```

**Expected** (prod): `details.text` = `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1`
**Actual** (dev): `details.text` = `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1`

Also reproduces with other draft CodeSystems: `narrative-status`, `medicationrequest-status`, `medicationrequest-intent`.

#####What differs

When validating codes against draft CodeSystems, both prod and dev return an informational OperationOutcome issue with code "status-check" and message ID "MSG_DRAFT". The details.text differs:

- **Prod**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1`
- **Dev**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1`

Dev omits the ` from <package>#<version>` provenance suffix that identifies which FHIR package the CodeSystem was loaded from.

#####How widespread

4 records in the comparison dataset, all POST /r4/CodeSystem/$validate-code against draft CodeSystems from hl7.fhir.r4.core#4.0.1:
- http://hl7.org/fhir/event-status
- http://hl7.org/fhir/narrative-status
- http://hl7.org/fhir/CodeSystem/medicationrequest-status
- http://hl7.org/fhir/CodeSystem/medicationrequest-intent

Found via: `grep -c 'from hl7.fhir' results/deltas/deltas.ndjson` (4 matches out of 910 deltas).

All 4 records agree on result (true), system, code, version, and display. The only remaining difference after normalization is the details.text provenance suffix.

#####What the tolerance covers

Tolerance ID: `draft-codesystem-message-provenance-suffix`. Matches validate-code Parameters responses where OperationOutcome issue text in prod ends with ` from <package>#<version>` and dev has the same text without that suffix. Normalizes both sides to the prod text (which includes provenance). Eliminates 4 records.

---

### [ ] `7258b41` NDC validate-code: dev returns inactive/version/message/issues params that prod omits

Records-Impacted: 16
Tolerance-ID: ndc-validate-code-extra-inactive-params
Record-ID: ac23726f-6ff2-4b72-b2c8-584922d04c92
#####Repro

Validate NDC code 0777-3105-02 against both servers:

```bash
####Prod (tx.fhir.org) -- returns result, system, code, display only
curl -s -X POST "https://tx.fhir.org/r4/CodeSystem/\$validate-code?" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/ndc"},{"name":"code","valueCode":"0777-3105-02"}]}'

####Dev (tx-dev.fhir.org) -- returns those plus version, inactive, message, issues
curl -s -X POST "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code?" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/ndc"},{"name":"code","valueCode":"0777-3105-02"}]}'
```

**Prod response** (4 parameters):
- `result: true`, `system`, `code: "0777-3105-02"`, `display: "Prozac, 100 CAPSULE in 1 BOTTLE (0777-3105-02) (package)"`

**Dev response** (8 parameters) -- same 4 plus:
- `version: "2021-11-01"`
- `inactive: true`
- `message: "The concept '0777-3105-02' has a status of null and its use should be reviewed"`
- `issues`: OperationOutcome with INACTIVE_CONCEPT_FOUND warning

Also reproducible with NDC codes `0002-8215-01` and `0169-4132-12`.

#####What differs

For NDC ($validate-code on http://hl7.org/fhir/sid/ndc), both servers agree result=true and return matching system, code, and display. However, dev returns four additional parameters that prod omits entirely:

- `version: "2021-11-01"` — the NDC code system version
- `inactive: true` — flags the concept as inactive
- `message: "The concept '<code>' has a status of null and its use should be reviewed"` — a warning about the concept status
- `issues` — an OperationOutcome with a warning (severity=warning, code=business-rule, tx-issue-type=code-comment, message-id=INACTIVE_CONCEPT_FOUND)

Prod's diagnostics show it uses NDC with no version: `Using CodeSystem "http://hl7.org/fhir/sid/ndc|" (content = complete)` (empty string after the pipe). Dev uses NDC version 2021-11-01.

#####How widespread

16 records in deltas.ndjson match this exact pattern. All are POST /r4/CodeSystem/$validate-code? for http://hl7.org/fhir/sid/ndc. Three distinct NDC codes are affected: 0777-3105-02, 0002-8215-01, and 0169-4132-12.

Search: `grep '"param":"inactive"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 16

All 16 have the same diff signature: extra-in-dev for inactive, issues, message, and version.

#####What the tolerance covers

Tolerance `ndc-validate-code-extra-inactive-params` matches validate-code responses where system is http://hl7.org/fhir/sid/ndc and dev has inactive/version/message/issues parameters that prod lacks. It strips the four extra parameters from dev to eliminate the diff. Eliminates 16 records.

#####Representative record

ac23726f-6ff2-4b72-b2c8-584922d04c92 — NDC code 0777-3105-02 (Prozac 100 capsule)

---

### [ ] `3967e97` Dev $expand includes extra ValueSet metadata (contact) that prod omits

Records-Impacted: 12
Tolerance-ID: expand-dev-extra-contact-metadata
Record-ID: 80d06a63-cebf-4a33-af1b-583b4f6a1c10

#####Repro

Dev includes the `contact` field in `$expand` responses; prod omits it. Reproduce with any of these ValueSets:

**medicationrequest-category** (contact has URL only):
```bash
####Prod — no contact field in response
curl -s -H 'Accept: application/fhir+json' \
'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/medicationrequest-category&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d)"
####=> False

####Dev — contact field present
curl -s -H 'Accept: application/fhir+json' \
'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/medicationrequest-category&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d, d.get('contact'))"
####=> True [{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}]}]
```

**administrative-gender** (contact has URL + email):
```bash
curl -s -H 'Accept: application/fhir+json' \
'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d, d.get('contact'))"
####=> True [{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}, {"system": "email", "value": "fhir@lists.hl7.org"}]}]
```

Other affected ValueSets include: `address-type`, `address-use`, `identifier-use`, `gender-identity`, `iso3166-1-2`, `languages`, `mimetypes`, `name-use`.

#####What differs

Dev $expand responses include the ValueSet `contact` field (publisher contact information) that prod omits from expansion results. The contact data comes from the source ValueSet definition and contains HL7 FHIR contact info such as:

- `{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}]}`
- `{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}, {"system": "email", "value": "fhir@lists.hl7.org"}]}`

Prod strips this metadata from the expansion response; dev passes it through.

#####How widespread

12 records in deltas, 59 in the full comparison dataset (others already eliminated by existing tolerances). All are $expand operations on /r4/ValueSet/$expand. Matched with:

```
grep '"contact":[' deltas.ndjson  # in devBody
```

Filtered to cases where dev has contact but prod does not.

#####What the tolerance covers

Tolerance `expand-dev-extra-contact-metadata` matches ValueSet $expand responses where dev has a `contact` field and prod does not. It strips the `contact` field from dev to normalize both sides. Eliminates 12 delta records (9 where contact was the sole remaining difference, 3 where other differences also exist — those 3 will remain in deltas due to the other differences).

#####Representative record

`80d06a63-cebf-4a33-af1b-583b4f6a1c10` — POST /r4/ValueSet/$expand for medicationrequest-category ValueSet. Dev includes `contact: [{telecom: [{system: "url", value: "http://hl7.org/fhir"}]}]`, prod omits it.

---

### [ ] `9390fe4` Dev echoes display param on failed validate-code when CodeSystem unknown

Records-Impacted: 74
Tolerance-ID: validate-code-display-echo-on-unknown-system
Record-ID: d9457f4d-39c0-445a-96d4-0721961e169d

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"https://codesystem.x12.org/005010/1338"},{"name":"code","valueCode":"U"},{"name":"display","valueString":"Urgent"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"https://codesystem.x12.org/005010/1338"},{"name":"code","valueCode":"U"},{"name":"display","valueString":"Urgent"}]}'
```

Prod returns `result=false` with parameters: result, system, x-caused-by-unknown-system, code, message, issues -- no `display`. Dev returns all the same plus `display: "Urgent"` echoed from the request input.

#####What differs

When $validate-code returns result=false because the CodeSystem is unknown (x-caused-by-unknown-system), dev echoes back the input `display` parameter in the response while prod omits it.

For example, validating code "U" against unknown system `https://codesystem.x12.org/005010/1338`:
- Prod: returns result=false, system, code, message, x-caused-by-unknown-system, issues — no display parameter
- Dev: returns all of the above PLUS `display: "Urgent"` (echoed from the request input)

Per the FHIR spec, the output `display` parameter is "a valid display for the concept if the system wishes to present it to users." When the CodeSystem is unknown, the server has no basis to return a valid display — it is simply echoing back the unvalidated input.

#####How widespread

74 records in deltas.ndjson match this pattern. 73 have `x-caused-by-unknown-system` in prod response; 1 has no system at all. All are $validate-code with result=false. Across 38+ distinct code systems including x12.org, various OID-based systems, and others.

Search: parsed all deltas.ndjson records where comparison.diffs includes {type: "extra-in-dev", param: "display"} and result=false.

#####What the tolerance covers

Tolerance ID: `validate-code-display-echo-on-unknown-system`
Matches: $validate-code Parameters responses where result=false, prod has no display parameter, and dev has a display parameter.
Normalizes: strips the display parameter from dev to match prod.
Eliminates: 74 records (73 with only the display diff, 1 with additional message/issues diffs that will remain after normalization).

#####Representative record

d9457f4d-39c0-445a-96d4-0721961e169d — POST /r4/CodeSystem/$validate-code, code U in system https://codesystem.x12.org/005010/1338

---

### [ ] `ac95424` HCPCS CodeSystem loaded in dev but unknown in prod — 110 result-disagrees

Records-Impacted: 123
Tolerance-ID: hcpcs-codesystem-availability
Record-ID: 238a26b7-46b6-4095-a3ba-364b1973da4d

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?system=http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets&code=G0154' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?system=http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets&code=G0154' \
-H 'Accept: application/fhir+json'
```

Prod returns `result: false` with `x-caused-by-unknown-system` ("A definition for CodeSystem 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets' could not be found"). Dev returns `result: true` with `version: "2025-01"` and `display: "health or hospice setting, each 15 minutes"`.

#####What differs

For $validate-code requests involving system http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets, prod returns result=false with the error "A definition for CodeSystem 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets' could not be found, so the code cannot be validated" and x-caused-by-unknown-system. Dev returns result=true with version 2025-01, display text, system, and code parameters — successfully finding and validating the codes.

The diagnostics confirm: prod says "CodeSystem not found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" while dev says "CodeSystem found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets|2025-01".

#####How widespread

123 delta records mention HCPCS (all validate-code operations):
- 110 result-disagrees: prod=false dev=true (prod doesn't have HCPCS, dev does)
- 4 result-disagrees: prod=true dev=false (code 33206, likely a different sub-issue)
- 9 content-differs: same result but differences in surrounding content

Searched with: grep -c 'HCPCSReleaseCodeSets' jobs/2026-02-round-1/results/deltas/deltas.ndjson
All 110 prod=false/dev=true records have x-caused-by-unknown-system pointing to HCPCSReleaseCodeSets.

#####What the tolerance covers

Tolerance ID: hcpcs-codesystem-availability. Matches validate-code records where prod has x-caused-by-unknown-system for HCPCSReleaseCodeSets and dev returns result=true. Skips these records since the root cause is code system availability, not a logic bug.

---

### [ ] `52ecb75` CodeSystem/$validate-code without system: different error message and severity

Records-Impacted: 1
Tolerance-ID: cs-validate-code-no-system-error-format
Record-ID: 9afb9fcf-df5f-4766-a56a-33379c66b90a

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"code":"OBG"}}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"code":"OBG"}}]}'
```

Prod returns severity=`warning` with message "Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided" and includes `details.coding` with code `invalid-data` from the `tx-issue-type` system. Dev returns severity=`error` with message "No CodeSystem specified - provide url parameter or codeSystem resource" and no `details.coding`.

#####What differs

POST /r4/CodeSystem/$validate-code with code "OBG" and no system parameter.

Both servers return result=false, but they differ in how they report the error:

- **Prod**: severity=warning, message="Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided", includes details.coding with code "invalid-data" from tx-issue-type system
- **Dev**: severity=error, message="No CodeSystem specified - provide url parameter or codeSystem resource", no details.coding at all

Three distinct differences:
1. Severity: warning (prod) vs error (dev)
2. Message text: completely different wording
3. Issue detail coding: prod includes structured tx-issue-type coding, dev omits it

#####How widespread

This is the only record in the dataset with this specific pattern. Searched for "No CodeSystem specified" across both comparison.ndjson and deltas.ndjson — found exactly 1 match. The request shape (POST to /r4/CodeSystem/$validate-code without trailing ?) is also unique.

#####What the tolerance covers

Tolerance ID: cs-validate-code-no-system-error-format
Matches: POST /r4/CodeSystem/$validate-code (without trailing ?), where dev message contains "No CodeSystem specified". Normalizes message and issues to prod's values to suppress this single record.

#####Representative record

9afb9fcf-df5f-4766-a56a-33379c66b90a

---

### [ ] `f559b53` CPT -code: dev fails to recognize valid CPT codes (result=false)

Records-Impacted: 45
Tolerance-ID: cpt-validate-code-result-disagrees
Record-ID: d05e7906-16ee-4915-8c8a-92137b4e62c7

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99214"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99214"}]}'
```

Prod returns `result: true` with display "Office or other outpatient visit for the evaluation and management of an established patient..." and version "2023". Dev returns `result: false` with "Unknown code '99214' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'".

#####What differs

Dev returns `result: false` with "Unknown code '<code>' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'" for CPT codes that prod successfully validates as `result: true`. Prod returns the code's display text and version; dev returns an error OperationOutcome with `code-invalid`.

Example: CPT code 99214 (a standard E&M visit code). Prod validates it successfully with display text. Dev says it's unknown.

This affects 17 distinct CPT codes: 33206, 44211, 44401, 45346, 58545, 70551, 73722, 74263, 77061, 77081, 81528, 82274, 83036, 87624, 88175, 93978, 99214.

Both servers reference the same CodeSystem version (2023), suggesting dev has the CPT CodeSystem loaded but its concept list is incomplete or not being searched correctly.

#####How widespread

45 result-disagrees records total:
- 41 on POST /r4/CodeSystem/$validate-code
- 4 on POST /r4/ValueSet/$validate-code

All are prod=true/dev=false (dev never finds these codes). Searched with:
grep 'ama-assn.org/go/cpt' results/deltas/deltas.ndjson | grep result-disagrees

There are also 71 content-differs and 8 status-mismatch records for CPT (124 total CPT delta records), likely related to the same underlying data issue, but those are separate patterns.

#####What the tolerance covers

Tolerance `cpt-validate-code-result-disagrees` skips all validate-code records where system is http://www.ama-assn.org/go/cpt and prod=true/dev=false (result-disagrees). Eliminates 45 records.

---

### [ ] `de8b2f7` Dev appends 'and undefined' to valid version list in UNKNOWN_CODESYSTEM_VERSION messages

Records-Impacted: 26
Tolerance-ID: unknown-version-valid-versions-message
Record-ID: a3cf69a7-48f3-47b8-a29d-cd6453647621

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"116101001"},{"name":"version","valueString":"2017-09"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"116101001"},{"name":"version","valueString":"2017-09"}]}'
```

Prod message ends cleanly: `...http://snomed.info/xsct/900000000000207008/version/20250814`. Dev message ends with: `...http://snomed.info/xsct/900000000000207008/version/20250814 and undefined`.

#####What differs

When a requested CodeSystem version is not found, both prod and dev return an UNKNOWN_CODESYSTEM_VERSION error listing available versions. Dev appends " and undefined" at the end of this version list in 26 of 40 such records.

Example from dev message:
"...http://snomed.info/xsct/900000000000207008/version/20250814 and undefined"

Prod message ends cleanly:
"...http://snomed.info/xsct/900000000000207008/version/20250814"

This appears to be a JS undefined value being concatenated into the version list string, likely from an off-by-one or array join issue.

#####How widespread

26 records in deltas.ndjson contain "and undefined" in the devBody. All are validate-code operations. The pattern appears across SNOMED and other code systems when the requested version is not found.

Search: grep -c 'and undefined' deltas.ndjson => 26

#####What the tolerance covers

Tolerance `unknown-version-valid-versions-message` normalizes the message and issues text in UNKNOWN_CODESYSTEM_VERSION responses by stripping "Valid versions:" lists from both sides. This covers both the "and undefined" bug and the version list differences caused by different editions being loaded.

#####Representative record

a3cf69a7-48f3-47b8-a29d-cd6453647621 — POST /r4/CodeSystem/$validate-code for SNOMED 2017-09, both return result=false

---

### [ ] `b9e3cfd` Expand display text differs between prod and dev for same codes

Records-Impacted: 157
Tolerance-ID: expand-display-text-differs
Record-ID: 6d25c912-25f4-45cf-8dea-3dd07d9d7e1e

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"116101001"}]}]}}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"116101001"}]}]}}}]}'
```

Prod returns display `"Product containing gonadotropin releasing hormone receptor antagonist (product)"` (FSN), dev returns `"Gonadotropin releasing hormone antagonist"` (inactive synonym). Same SNOMED version on both servers (20250201).

#####What differs

In $expand responses, display text for the same code differs between prod and dev in
expansion.contains[].display. Both servers return the same codes in the same order, but
with different human-readable display strings.

Examples:
- SNOMED 116101001: prod="Product containing gonadotropin releasing hormone receptor
antagonist (product)", dev="Gonadotropin releasing hormone antagonist"
- SNOMED 425901007: prod="IVF - In vitro fertilisation with intracytoplasmic sperm
injection (ICSI)", dev="In vitro fertilization with intracytoplasmic sperm injection
(procedure)"
- SNOMED 60001007: prod="Not pregnant", dev="Non pregnant state"
- ISO 3166 CUW: prod="Curagao", dev="Curaçao" (character encoding/data edition)
- ISO 3166 ALA: prod="Eland Islands", dev="Åland Islands"

#####How widespread

157 expand delta records have display text diffs in expansion.contains.

By code system:
- http://snomed.info/sct: 134 records
- urn:iso:std:iso:3166: 22 records
- http://unitsofmeasure.org: 1 record

Search: Compared expansion.contains display values between prodBody and devBody for
all expand deltas in results/deltas/deltas.ndjson.

#####What the tolerance covers

Tolerance ID: expand-display-text-differs
Matches: $expand responses (resourceType=ValueSet with expansion) where any
contains[].display differs between prod and dev for the same code.
Normalizes: Sets both sides' display to prod's value (canonical), preserving other
field differences.

#####Representative records

- 6d25c912-25f4-45cf-8dea-3dd07d9d7e1e (SNOMED 116101001)
- 44f0851b-80e8-4a27-b05e-551c0522e39b (SNOMED 425901007, 161744009)
- 2ff10aef-7210-489d-bb28-6c7739c27027 (ISO 3166 CUW, ALA, CIV)

---

### [ ] `e5a78af` ISO 3166 : prod includes 42 reserved/user-assigned codes that dev omits

Records-Impacted: 7
Tolerance-ID: expand-iso3166-extra-reserved-codes
Record-ID: 70faaf64-3ca5-4ee1-94f1-7f89ad1cf7ed

#####Repro

```bash
####Prod (returns result: true — code AA is valid)
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA' \
-H 'Accept: application/fhir+json'

####Dev (returns result: false — code AA is unknown)
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA' \
-H 'Accept: application/fhir+json'
```

Prod validates code `AA` (a reserved/user-assigned code) as valid in `urn:iso:std:iso:3166`, dev rejects it as unknown. This confirms prod's code system includes 42 reserved/user-assigned ISO 3166-1 codes that dev omits. The original bug was observed via `$expand` (291 vs 249 codes); the expand for the canonical `iso3166-1-2` ValueSet now returns 249 on both servers (the ValueSet compose filters to assigned codes only), but the underlying code system data still differs as shown by `$validate-code`.

#####What differs

POST /r4/ValueSet/$expand for ValueSets containing urn:iso:std:iso:3166: prod returns 291 codes (total=291), dev returns 249 codes (total=249). The 42 extra codes in prod are all ISO 3166-1 reserved/user-assigned codes:

- AA (User-assigned)
- QM through QZ (15 User-assigned codes)
- XA through XJ, XL through XZ (24 codes: mostly User-assigned, plus XK=Kosovo, XX=Unknown, XZ=International Waters)
- ZZ (Unknown or Invalid Territory)

Dev returns only the 249 standard assigned country codes.

#####How widespread

7 $expand records in deltas show this exact pattern (prod_total=291, dev_total=249):
- `grep 'iso:3166' jobs/2026-02-round-1/results/deltas/deltas.ndjson` finds 14 records total (including reads and a dev-crash)
- All 7 content-differs expand records share the same 291 vs 249 pattern

Search used:
```
python3 -c "
import json
with open('jobs/2026-02-round-1/results/deltas/deltas.ndjson') as f:
  for line in f:
      r = json.loads(line)
      if 'iso:3166' in r.get('prodBody',''):
          prod = json.loads(r['prodBody'])
          dev = json.loads(r['devBody'])
          if prod.get('expansion',{}).get('total') == 291:
              print(r['id'][:12])
"
```

#####What the tolerance covers

Tolerance `expand-iso3166-extra-reserved-codes` matches expand records where both prod and dev use urn:iso:std:iso:3166 and prod.expansion.total > dev.expansion.total. It normalizes by filtering prod's contains array to only include codes present in dev, and sets both totals to dev's count. This eliminates 7 records while preserving any other differences (display text, etc.) for detection.

---

### [ ] `2ae971e` Dev crashes (500) on valid $expand requests with JavaScript TypeErrors

Records-Impacted: 15
Tolerance-ID: expand-dev-crash-on-valid
Record-ID: 7598431b-1c90-409c-b8f2-2be8358e8be3

#####What differs

Prod returns 200 with valid ValueSet expansion; dev returns 500 with OperationOutcome containing JavaScript TypeErrors. Two distinct error messages observed:

1. `vs.expansion.parameter is not iterable` (1 record) — triggered when expanding `http://hl7.org/fhir/us/core/ValueSet/us-core-pregnancy-status`
2. `exp.addParamUri is not a function` (14 records) — triggered when expanding Verily phenotype ValueSets (e.g., `http://fhir.verily.com/ValueSet/verily-phenotype-*`)

Both are unhandled JS TypeErrors during the expand code path, causing 500 instead of a valid expansion.

#####How widespread

15 records in deltas, all `POST /r4/ValueSet/$expand` with prod=200, dev=500:

```
grep '"dev-crash-on-valid"' results/deltas/deltas.ndjson | grep expand | wc -l
####15
```

The `addParamUri` errors are all Verily phenotype ValueSets (14 records). The `parameter is not iterable` error affects 1 US Core ValueSet.

#####What the tolerance covers

Tolerance `expand-dev-crash-on-valid` matches POST /r4/ValueSet/$expand where prod=200 and dev=500. Eliminates all 15 records.

#####Representative record IDs

- `7598431b-1c90-409c-b8f2-2be8358e8be3` (parameter is not iterable)
- `9ec233b5-f523-4ec4-b4f9-fcdf8b63d17f` (addParamUri)

---

### [ ] `4cdcd85` Dev crashes (500) on POST /r4/ValueSet/$validate-code with 'No Match for undefined|undefined'

Records-Impacted: 1
Tolerance-ID: validate-code-crash-undefined-system-code
Record-ID: 6b937ddc-13c0-49e1-bd96-24ef10f06543

#####Repro

```bash
####Prod (returns 200 with Parameters response)
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","code":"2108-9","display":"EUROPEAN"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/us/core/ValueSet/detailed-race","version":"6.1.0","status":"active","compose":{"include":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.1.11.14914"]},{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103"]}],"exclude":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.2074.1.1.3"]}]}}}]}'

####Dev (returns 500 with "No Match for undefined|undefined")
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","code":"2108-9","display":"EUROPEAN"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/us/core/ValueSet/detailed-race","version":"6.1.0","status":"active","compose":{"include":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.1.11.14914"]},{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103"]}],"exclude":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.2074.1.1.3"]}]}}}]}'
```

Prod returns 200 with a Parameters response (result=false, with code system version details). Dev returns 500 with OperationOutcome `"No Match for undefined|undefined"`. The bug triggers when a ValueSet has `compose.exclude` entries with only a `valueSet` reference (no `system`); dev's exclude-processing code path reads `cc.system` and `cc.version` as `undefined` from the exclude entry.

#####What differs

Prod returns 200 with a successful $validate-code Parameters response (result=true, system=urn:oid:2.16.840.1.113883.6.238, code=2108-9, display="European", version="1.2"). Dev returns 500 with an OperationOutcome error: "No Match for undefined|undefined".

The error message "undefined|undefined" indicates that dev failed to extract the system and code parameters from the POST request body, receiving them as JavaScript `undefined` values instead.

The request is POST /r4/ValueSet/$validate-code against the http://hl7.org/fhir/us/core/ValueSet/detailed-race ValueSet (US Core detailed race codes). The request body was not captured in the comparison data, but two other POST $validate-code requests involving the same ValueSet (detailed-race) succeeded on both sides, suggesting this may be related to a specific combination of request parameters rather than the ValueSet itself.

#####How widespread

Only 1 record in the comparison dataset exhibits this exact pattern. Searched:
- `grep -c 'undefined|undefined' comparison.ndjson` → 1
- All dev=500/prod=200 validate-code records → only this one
- All detailed-race records → 3 total, 2 succeed on both sides

#####What the tolerance covers

Tolerance `validate-code-crash-undefined-system-code` matches POST /r4/ValueSet/$validate-code where prod=200, dev=500, and dev error contains "undefined|undefined". Skips the record. Eliminates 1 record.

#####Representative record

6b937ddc-13c0-49e1-bd96-24ef10f06543

---

### [ ] `85d0977` BCP-47 case-sensitive validation: dev accepts 'en-us' (lowercase), prod correctly rejects it

Records-Impacted: 2
Tolerance-ID: bcp47-case-sensitive-validation
Record-ID: ba44d44e-929e-4b34-8d18-39ead53a68b6

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-us"},{"name":"display","valueString":"English (Region=United States)"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-us"},{"name":"display","valueString":"English (Region=United States)"}]}'
```

Prod returns `result: false` with error "Unknown code 'en-us' in the CodeSystem 'urn:ietf:bcp:47'", dev returns `result: true` with display "English (Region=United States)".

#####What differs

Dev returns result=true for BCP-47 code "en-us" with display "English (Region=United States)". Prod returns result=false with error "Unknown code 'en-us' in the CodeSystem 'urn:ietf:bcp:47'" and informational issue "Unable to recognise part 2 (\"us\") as a valid language part".

The correct BCP-47 regional variant format is "en-US" (uppercase region code). BCP-47 is case-sensitive in FHIR (the code system has caseSensitive=true by default per the 2022 FHIR update). Prod correctly rejects the lowercase variant; dev incorrectly accepts it.

#####How widespread

2 records in deltas, both for code "en-us" in system urn:ietf:bcp:47:
- ba44d44e-929e-4b34-8d18-39ead53a68b6: POST /r4/CodeSystem/$validate-code
- 175c5449-c70c-4c69-9e2e-4f728d035c1f: POST /r4/ValueSet/$validate-code

Search: grep 'en-us' jobs/2026-02-round-1/results/deltas/deltas.ndjson (2 matches, both result-disagrees with prodResult=false, devResult=true)

Both records show the same root cause: dev's BCP-47 code lookup is case-insensitive when it should be case-sensitive.

#####What the tolerance covers

Tolerance ID: bcp47-case-sensitive-validation
Matches: result-disagrees records where system is urn:ietf:bcp:47 and prodResult=false, devResult=true.
Eliminates 2 records.

---

### [ ] `e3fb3f6` Dev  succeeds (200) where prod refuses with too-costly (422) for grammar/large code systems

Records-Impacted: 12
Tolerance-ID: expand-too-costly-succeeds
Record-ID: 4fe6282f-ccf2-4340-9758-cbc70b7d2b79

#####Repro

```bash
####Prod (returns 422 too-costly)
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt"}]}}}]}'

####Dev (returns 200 with 7 codes)
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt"}]}}}]}'
```

Prod returns HTTP 422 with OperationOutcome code `too-costly`: "The code System has a grammar, and cannot be enumerated directly". Dev returns HTTP 200 with a ValueSet expansion containing 7 CPT codes (99202, 99203, 0001A, 25, P1, 1P, F1).

#####What differs

Prod returns HTTP 422 with an OperationOutcome containing issue code `too-costly` for certain $expand requests. Dev returns HTTP 200 with a successful ValueSet expansion containing codes.

Prod's error messages fall into two patterns:
- "The code System \"X\" has a grammar, and cannot be enumerated directly" (10 records: 8 CPT, 2 BCP-13/MIME types)
- "The value set '' expansion has too many codes to display (>10000)" (2 records: NDC)

Dev expands these successfully, returning actual codes. For example, for CPT, dev returns 7 codes with full display text; for NDC, dev returns total=0 (empty expansion).

#####How widespread

12 records, all POST /r4/ValueSet/$expand, all with prodStatus=422 and devStatus=200.

Breakdown by code system:
- 8 records: http://www.ama-assn.org/go/cpt (CPT)
- 2 records: urn:ietf:bcp:13 (MIME types)
- 2 records: http://hl7.org/fhir/sid/ndc (NDC — "too many codes" variant)

Search: `grep '"prodStatus":422,"devStatus":200' results/deltas/deltas.ndjson | wc -l` → 12

#####What the tolerance covers

Tolerance ID: `expand-too-costly-succeeds`. Matches POST /r4/ValueSet/$expand where prod.status=422 and dev.status=200, and prod body contains issue code `too-costly`. Skips the record. Eliminates all 12 records.

#####Representative record IDs

- 4fe6282f-ccf2-4340-9758-cbc70b7d2b79 (CPT grammar)
- d1360bdd-814e-4da9-af67-e4c9e145f3f1 (BCP-13 grammar)
- 3a9f2a04-94d7-431a-95dd-af16ff2ee3f7 (NDC too many codes)

---

### [ ] `8f739e9` SNOMED display text differs for same edition version

Records-Impacted: 59
Tolerance-ID: snomed-same-version-display-differs
Record-ID: 9e9e9c20-cc34-43f8-a0fa-54e8cac48e55

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=48546005' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=48546005' \
-H 'Accept: application/fhir+json'
```

Prod returns `display: "Product containing diazepam (medicinal product)"`, dev returns `display: "Diazepam"`. Both report version `http://snomed.info/sct/900000000000207008/version/20250201`. Also confirmed with code 409063005: prod returns `"Counselling"`, dev returns `"Counseling (regime/therapy)"`.

#####What differs

For SNOMED $validate-code requests where both prod and dev report the same SNOMED CT edition version (e.g., 20250201), the display text returned for certain codes differs between the two servers. Examples:

- Code 10019 (Diazepam product): prod="Product containing diazepam (medicinal product)", dev="Diazepam"
- Code 385049006 (Capsule): prod="Capsule", dev="Capsule (product)"
- Code 44808001 (Counselling): prod="Counselling", dev="Counseling (regime/therapy)"
- Code 15188001 (Hearing loss): prod="Hearing loss", dev="Deafness"
- Code 46635009 (Diabetes type I): prod="Diabetes mellitus type I", dev="Insulin dependent diabetes mellitus"

Both servers agree on result=true, system, code, and version. Only the display (preferred term) differs.

#####How widespread

59 validate-code records show this pattern. All involve http://snomed.info/sct with matching version strings (primarily 20250201). Found via:

grep '"param":"display"' results/deltas/deltas.ndjson | grep 'snomed'

then filtering to records where prod and dev version parameters are identical.

#####What the tolerance covers

Tolerance ID: snomed-same-version-display-differs. Matches SNOMED validate-code Parameters responses where versions are identical but display text differs. Normalizes both sides to prod's display value.

---

### [ ] `eaeccdd` Dev returns extra 'message' parameter with filter-miss warnings on successful validate-code

Records-Impacted: 12
Tolerance-ID: validate-code-extra-filter-miss-message
Record-ID: 7c3bf322-7db7-42f5-82d6-dd1ef9bd9588

#####Repro

**Status: Inconclusive** -- the IPS ValueSets (e.g. `allergies-intolerances-uv-ips|2.0.0`) used in all 12 affected records are not loaded on the public tx.fhir.org / tx-dev.fhir.org servers, so the original requests cannot be replayed. The request bodies were not stored in the comparison records.

Attempted:
1. Reconstructed POST to `/r4/ValueSet/$validate-code` for SNOMED 716186003 against `http://hl7.org/fhir/uv/ips/ValueSet/allergies-intolerances-uv-ips` (with and without version) -- both servers return "value Set could not be found"
2. Checked 33 related delta records -- only IPS ValueSet records (not publicly available) match the exact bug pattern (result=true on both, dev extra message, prod no message)
3. Non-IPS records (medication-form-codes, us-core-encounter-type) show a different pattern (result=false on both sides, different message content)

#####What differs

On $validate-code requests against ValueSets with multiple include filters (e.g. IPS allergies-intolerances, medical-devices), when the code is valid (result=true, found in at least one filter), dev returns an extra `message` parameter containing "Code X is not in the specified filter" for each filter the code did NOT match. Prod omits the `message` parameter entirely when the overall result is true.

Example (record 7c3bf322):
- Prod: result=true, no message parameter
- Dev: result=true, message="Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter"

The code 716186003 (No known allergy) is valid in the IPS allergies ValueSet but only matches the 4th include filter (concept<<716186003). Dev reports failure messages for the 3 filters it didn't match.

#####How widespread

12 records in deltas.ndjson, all POST /r4/ValueSet/$validate-code with result=true. All involve SNOMED codes against IPS ValueSets with multiple include filters. Found via:
```
grep 'extra-in-dev' results/deltas/deltas.ndjson | grep '"message"' → 23 hits
```
Of those, 12 have this pattern (single diff: extra-in-dev:message, result=true on both sides, dev message contains "is not in the specified filter", prod has no message param).

The remaining 11 are different patterns (multiple diffs, result=false, or different message content).

#####What the tolerance covers

Tolerance ID: validate-code-extra-filter-miss-message
Matches: validate-code where result=true on both sides, dev has a `message` parameter that prod lacks, and the dev message matches the pattern "is not in the specified filter".
Normalizes: strips the extra `message` parameter from dev.

---

### [ ] `19283df` POST -code: dev returns result=false due to undefined system in request body extraction

Records-Impacted: 89
Tolerance-ID: validate-code-undefined-system-result-disagrees
Record-ID: a27be88a-8e1e-4ce8-8167-af0515f294d3

#####Repro

**Attempt 1** — CodeSystem/$validate-code with SNOMED 26643006:
```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Both servers now return `result: true`. Bug no longer reproduces on this endpoint.

**Attempt 2** — ValueSet/$validate-code with LOINC 8302-2 against vital signs ValueSet:
```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"8302-2"},{"name":"display","valueString":"Body height"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"8302-2"},{"name":"display","valueString":"Body height"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Both servers now return `result: true`. Bug no longer reproduces on this endpoint.

**Attempt 3** — ValueSet/$validate-code with SNOMED 116154003 against CTS ValueSet:
```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1099.30"},{"name":"valueSetVersion","valueString":"20190418"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"116154003","display":"Patient (person)"}],"text":"Patient"}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1099.30"},{"name":"valueSetVersion","valueString":"20190418"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"116154003","display":"Patient (person)"}],"text":"Patient"}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Prod returns `result: true`, dev returns `result: false`. Dev's error message ends with "and undefined" in the valid SNOMED versions list, confirming the "undefined" leak persists in dev's internal data. However, the primary failure is a SNOMED US Edition version mismatch (dev looks for version `20250301` which it doesn't have), so this is not a clean repro of the POST body extraction bug specifically.

**Conclusion**: The original bug (system=undefined in POST body extraction causing result=false) no longer reproduces on simple CodeSystem and ValueSet endpoints. Dev may have partially fixed the POST body parameter extraction. However, "undefined" still appears in dev's valid-versions list, suggesting residual issues. The original IPS ValueSets (medication-uv-ips, results-laboratory-pathology-observations-uv-ips) used by the 89 affected records are no longer available on either server.

#####What differs

Dev returns `result: false` on POST $validate-code requests where prod returns `result: true`. Dev's diagnostics reveal the system URI is "undefined" during validation:

- Validate trace shows: `Validate "[undefined#CODE (...)]"` instead of `[http://snomed.info/sct#CODE (...)]`
- ValueSet include filters show as empty `()` instead of actual SNOMED/LOINC filter expressions (e.g. `(http://snomed.info/sct)(concept<763158003)`)
- CodeSystem/$validate-code returns "Unknown code 'undefined' in the CodeSystem ..." for 14 LOINC records

Both servers use the same SNOMED/LOINC editions (version strings match). Prod correctly validates the codes; dev fails to extract the system parameter from the POST request body and receives it as JavaScript `undefined`.

#####How widespread

89 result-disagrees records, ALL with prodResult=true and devResult=false:

- 74 POST /r4/ValueSet/$validate-code (42 IPS lab results, 15 @all, 9 VSAC, 7 CTS medication, 6 IPS procedures, 3 IPS medication, 2 CTS medication v2)
- 15 POST /r4/CodeSystem/$validate-code (14 LOINC property components, 1 SNOMED with display validation)

Code systems affected: LOINC (56), SNOMED (24), RxNorm (9).

Search used: `grep 'result-disagrees' results/deltas/deltas.ndjson > /tmp/result-disagrees.ndjson` then analyzed by URL, system, and ValueSet.

All 89 records show "undefined" in dev diagnostics trace.

Related to bug 4cdcd85 which covers the crash (500) variant of the same root cause — dev fails to extract system/code from POST body. These 89 records are the non-crash variant where dev returns 200 but with wrong result.

#####What the tolerance covers

Tolerance `validate-code-undefined-system-result-disagrees` matches POST $validate-code records where prod result=true, dev result=false, and dev diagnostics contain the literal string "undefined". This covers all 89 records.

#####Representative record

`a27be88a-8e1e-4ce8-8167-af0515f294d3` — POST /r4/ValueSet/$validate-code, SNOMED 48546005 in IPS medication ValueSet. Prod: result=true, display="Product containing diazepam (medicinal product)". Dev: result=false, "No valid coding was found for the value set".

---

### [ ] `40c3ecc` Dev prepends filter-miss details to validate-code message when result=false

Records-Impacted: 32
Tolerance-ID: validate-code-filter-miss-message-prefix
Record-ID: 6d44fc66-34dd-4ebe-889e-02cf345990f3

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-form-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"385049006","display":"Capsule"}]}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-form-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"385049006","display":"Capsule"}]}}]}'
```

Prod message: `"No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`, dev message: `"Code 385049006 is not in the specified filter; No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`. Dev prepends the filter-miss detail exactly as described.

#####What differs

On $validate-code requests against ValueSets with include filters, when the code is not found (result=false on both sides), dev prepends "Code X is not in the specified filter; " to its `message` parameter. Prod returns only the standard error message (e.g. "No valid coding was found for the value set '...'").

Example (record 6d44fc66):
- Prod message: "No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"
- Dev message: "Code 385049006 is not in the specified filter; No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"

Dev repeats the filter-miss prefix once per include filter in the ValueSet. Some records have 17+ repetitions (e.g. IPS results-coded-values-laboratory-pathology with 17 include filters).

Both sides agree on result=false. The only difference is dev's message has extraneous filter-checking details prepended. This is the result=false variant of bug eaeccdd (which covers result=true, where prod omits message entirely).

#####How widespread

32 records in deltas.ndjson, all POST /r4/ValueSet/$validate-code with result=false on both sides. Found via:
```
grep 'is not in the specified filter' results/deltas/deltas.ndjson | wc -l  → 32
```

All are validate-code / content-differs. 30 have message as the only diff; 2 also have a version diff (SNOMED version skew, separate issue).

ValueSets affected include medication-form-codes, problems-uv-ips, vaccines-uv-ips, results-coded-values-laboratory-pathology-uv-ips, and others with SNOMED include filters.

#####What the tolerance covers

Tolerance ID: validate-code-filter-miss-message-prefix
Matches: validate-code where result=false on both sides, dev's message ends with prod's message, and the extra prefix contains "is not in the specified filter".
Normalizes: sets dev's message to prod's message value.

---

### [ ] `645fdcf` SNOMED inactive display message lists extra synonyms vs prod

Records-Impacted: 3
Tolerance-ID: inactive-display-message-extra-synonyms
Record-ID: 292172fe-c9f1-4ca4-b1a7-1f353187c9ba

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/condition-severity"},{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"6736007","display":"Moderate"}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/condition-severity"},{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"6736007","display":"Moderate"}}]}'
```

Prod returns `"The correct display is one of Midgrade"`, dev returns `"The correct display is one of Midgrade,Moderate (severity modifier) (qualifier value),Moderate (severity modifier),Moderate severity"`.

#####What differs

When validating a code with an inactive display (INACTIVE_DISPLAY_FOUND), the OperationOutcome issue details.text "correct display" list differs between prod and dev:

- Prod: "'Moderate' is no longer considered a correct display for code '6736007' (status = inactive). The correct display is one of Midgrade"
- Dev: "'Moderate' is no longer considered a correct display for code '6736007' (status = inactive). The correct display is one of Midgrade,Moderate (severity modifier) (qualifier value),Moderate (severity modifier),Moderate severity"

Prod lists only the preferred display term. Dev lists multiple synonyms/designations in addition to the preferred term.

Same pattern for code 78421000 (Intramuscular): prod lists only "Intramuscular route" (quoted), dev lists "Intramuscular route,Intramuscular route (qualifier value),Intramuscular use,IM route,IM use".

#####How widespread

3 records in the comparison dataset, all in deltas:
- 292172fe: POST /r4/ValueSet/$validate-code (SNOMED 6736007)
- 01902b33: POST /r4/CodeSystem/$validate-code (SNOMED 78421000)
- a0e9c508: POST /r4/CodeSystem/$validate-code (SNOMED 78421000)

All are SNOMED validate-code with display-comment issue type and INACTIVE_DISPLAY_FOUND message ID.

Search: grep 'INACTIVE_DISPLAY_FOUND' deltas.ndjson | wc -l → 3

#####What the tolerance covers

Tolerance ID: inactive-display-message-extra-synonyms
Matches validate-code records where OperationOutcome has display-comment issues with differing details.text that share the same prefix up to "The correct display is one of". Normalizes both sides to prod's text. Eliminates 3 records.

---

### [ ] `530eeb3` POST -code: dev missing code/system/display params and extra issues due to undefined system extraction

Records-Impacted: 3
Tolerance-ID: validate-code-undefined-system-missing-params
Record-ID: 243e44e8-cafb-44ba-a521-de4aab9d6985

#####Repro

Could not reproduce live. The original request was a POST to `/r4/ValueSet/$validate-code` with a `codeableConcept` parameter (SNOMED code 785126002) validated against the IPS medication ValueSet (`http://hl7.org/fhir/uv/ips/ValueSet/medication-uv-ips|2.0.0`). The ValueSet is not natively available on either server — it was provided inline via the test framework (likely as a `tx-resource` parameter). The request body was not stored in the comparison data, and the inline ValueSet definition is not available, so the exact request cannot be reconstructed.

Attempted with a server-resident ValueSet (`http://hl7.org/fhir/ValueSet/medication-codes`), but both servers correctly return `system`, `code`, and `display` for that case — the undefined system extraction bug only manifests when the ValueSet is provided inline via the test framework's request format.

```bash
####These commands work but do NOT reproduce the bug (different code path):
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"785126002","display":"Product containing precisely methylphenidate hydrochloride 5 milligram/1 each conventional release chewable tablet"}]}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"785126002","display":"Product containing precisely methylphenidate hydrochloride 5 milligram/1 each conventional release chewable tablet"}]}}]}'
```

Both servers return matching `system`, `code`, and `display` parameters with server-resident ValueSets. The bug requires the inline ValueSet provision path used by the Java validator test framework.

#####What differs

On POST /r4/ValueSet/$validate-code with codeableConcept input, dev fails to return `code`, `system`, and `display` output parameters that prod returns. Dev also returns extra OperationOutcome issues (`this-code-not-in-vs`, `not-in-vs`) that prod does not include. Both servers agree result=false (because the submitted display text is wrong).

Specific differences in the normalized output:
- **Prod returns**: code=785126002, system=http://snomed.info/sct, display="Methylphenidate hydrochloride 5 mg chewable tablet"
- **Dev returns**: none of these three parameters
- **Prod issues**: 1 issue (invalid-display error)
- **Dev issues**: 3 issues (this-code-not-in-vs information, invalid-display error, not-in-vs error)
- **Message**: Dev prepends "No valid coding was found for the value set..." to the message; prod has only the invalid-display message (already handled by invalid-display-message-format tolerance)

Dev diagnostics show `Validate "[undefined#785126002 ...]"` — the system is JavaScript "undefined", confirming the same POST body extraction failure as bugs 19283df and 4cdcd85.

#####How widespread

3 records, all POST /r4/ValueSet/$validate-code with the same SNOMED code 785126002 validating against medication-uv-ips ValueSet:
- 243e44e8-cafb-44ba-a521-de4aab9d6985
- 683c85d6-b337-4460-a005-df239084339a
- 1e7a78b8-c2ec-4819-b871-31cd30f5af28

All 3 have result=false on both sides (display text is wrong), same SNOMED version. Pattern identified by searching for validate-code records where dev is missing both code and system parameters.

#####What the tolerance covers

Tolerance `validate-code-undefined-system-missing-params` matches POST $validate-code with result=false where prod has code/system params but dev lacks them, and dev diagnostics contain "undefined". Eliminates all 3 records.

#####Related bugs

Same root cause as bug 19283df (result-disagrees variant, 89 records) and bug 4cdcd85 (crash variant, 1 record). All three stem from dev failing to extract system/code from POST request body.

---

### [ ] `67df517` Dev  includes warning-experimental expansion parameter that prod omits

Records-Impacted: 1
Tolerance-ID: expand-dev-warning-experimental-param
Record-ID: 5d1cbf41-db75-4663-8f3a-c492eb8a33aa

#####Repro

```bash
####Prod
curl -sL 'https://tx.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50' \
-H 'Accept: application/fhir+json'

####Dev
curl -sL 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50' \
-H 'Accept: application/fhir+json'
```

Prod expansion parameters: `["count", "used-codesystem"]`. Dev expansion parameters: `["warning-experimental", "count", "used-codesystem"]`. Dev includes `{"name":"warning-experimental","valueUri":"http://hl7.org/fhir/ValueSet/languages|4.0.1"}` that prod omits entirely.

#####What differs

Dev $expand for http://hl7.org/fhir/ValueSet/languages includes an extra expansion.parameter `{"name":"warning-experimental","valueUri":"http://hl7.org/fhir/ValueSet/languages|4.0.1"}` that prod omits entirely.

The ValueSet has `experimental: true` in its metadata (both sides agree). Dev adds a `warning-experimental` parameter to the expansion to flag this fact; prod does not emit this warning parameter.

#####How widespread

Only 1 record in the dataset contains this difference. Searched for:
- `grep -c 'warning-experimental' comparison.ndjson` → 1
- All expand records checked for dev-only `warning-*` parameters → only this one record
- Prod never emits any `warning-*` expansion parameters in any record

The pattern is specific to this ValueSet, though the behavior could in principle affect any experimental ValueSet expansion.

#####What the tolerance covers

Tolerance `expand-dev-warning-experimental-param` matches $expand responses (ValueSet resourceType) where dev has `warning-experimental` parameter and prod does not. Strips the extra parameter from dev. Eliminates 1 record.

#####Representative record

`5d1cbf41-db75-4663-8f3a-c492eb8a33aa` — GET /r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50

---

### [ ] `36675d4` SNOMED expression parse error message differs: wording and character offset

Records-Impacted: 2
Tolerance-ID: snomed-expression-parse-message-diff
Record-ID: 2a323fee-2b5e-4c5f-ad4d-d623797b7f6f

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"freetext"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"freetext"}]}'
```

Prod returns `"...and neither could it be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 1)"`, dev returns `"...and could not be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 0)"`.

#####What differs

When validating an invalid SNOMED CT code (e.g. "freetext"), both prod and dev return an informational issue with a SNOMED expression parse error. The message text differs in two ways:

- **Wording**: prod says "and neither could it be parsed as an expression", dev says "and could not be parsed as an expression"
- **Character offset**: prod reports "at character 1", dev reports "at character 0"

Prod: `Code freetext is not a valid SNOMED CT Term, and neither could it be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 1)`
Dev:  `Code freetext is not a valid SNOMED CT Term, and could not be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 0)`

All other aspects of the response match (result=false, system, code, error issues, etc.).

#####How widespread

2 records in the delta file, both for SNOMED code "freetext":
- 2a323fee: POST /r4/ValueSet/$batch-validate-code (batch-validate-code op)
- 1160ac1d: POST /r4/CodeSystem/$validate-code (validate-code op)

Search: `grep -c 'neither could it be parsed' deltas.ndjson` → 2

The pattern is specific to invalid SNOMED codes that trigger the expression parser fallback. Only "freetext" triggers it in this dataset.

#####What the tolerance covers

Tolerance ID: snomed-expression-parse-message-diff
Matches: OperationOutcome issues where prod text contains "neither could it be parsed as an expression" and dev text contains "could not be parsed as an expression" for the same issue. Normalizes dev text to prod text.
Eliminates: 2 records.

---

### [ ] `43d6cfa` CodeSystem/-code with multi-coding CodeableConcept: prod and dev report different coding in system/code/version output params

Records-Impacted: 3
Tolerance-ID: multi-coding-cc-system-code-version-disagree
Record-ID: 65fabdc4-930b-49e8-9ff1-60c176cbbfee

#####Repro

The custom CodeSystem `http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs` is no longer loaded on either server, so the original request conditions cannot be recreated. Both servers now return `result=false` with "A definition for CodeSystem could not be found".

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs","code":"physical.evaluation.alertnessAndOrientation.disorientatedtime","display":"Patient is not alert & oriented to time"},{"system":"http://snomed.info/sct","code":"19657006","display":"Disorientated in time (finding)"}]}}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs","code":"physical.evaluation.alertnessAndOrientation.disorientatedtime","display":"Patient is not alert & oriented to time"},{"system":"http://snomed.info/sct","code":"19657006","display":"Disorientated in time (finding)"}]}}]}'
```

Both servers now return `result=false` with unknown CodeSystem error. The bug cannot be reproduced live because the custom CodeSystem package is no longer loaded.

#####What differs

When POST /r4/CodeSystem/$validate-code is called with a CodeableConcept containing two codings (one from a custom CodeSystem `http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs` and one from SNOMED CT), both servers return result=true and return identical codeableConcept parameters. However, the scalar output parameters (system, code, version) disagree on which coding to report:

- **Prod** reports the SNOMED coding: system=http://snomed.info/sct, code=19657006, version=http://snomed.info/sct/900000000000207008/version/20250201
- **Dev** reports the custom CodeSystem coding: system=http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs, code=physical.evaluation.alertnessAndOrientation.disorientatedtime, version=1.0.0

#####How widespread

3 records, all POST /r4/CodeSystem/$validate-code? with CodeableConcept containing one el-observation-code-cs coding and one SNOMED coding. Found by searching for validate-code records where prod and dev return different system parameter values:

```
grep 'el-observation-code-cs' comparison.ndjson | wc -l  # 3
```

All 3 are currently in deltas. All involve the same custom CodeSystem paired with SNOMED.

#####What the tolerance covers

Tolerance ID: multi-coding-cc-system-code-version-disagree
Matches: POST $validate-code where result=true, both sides have codeableConcept with >1 coding, and system param differs between prod and dev.
Normalizes system, code, and version params to prod values on both sides.
Eliminates 3 records.

#####Representative record IDs

- 65fabdc4-930b-49e8-9ff1-60c176cbbfee (SNOMED 19657006 / el-observation-code-cs disorientatedtime)
- db568fd1-e0b1-4188-b29f-4fe9f7b2529b (SNOMED 85828009 / el-observation-code-cs autoimmune)
- 2e0dea57-4d5f-4442-99b8-881d1177f561 (SNOMED 26329005 / el-observation-code-cs cognitiveStatusNotNormal)

---

### [ ] `bd0f7f4` Resource read: prod omits text.div when text.status=generated, dev includes it

Records-Impacted: 4
Tolerance-ID: read-resource-text-div-diff
Record-ID: 31a631b5-8579-48d8-a95c-e40eadfd4714

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/us-core-laboratory-test-codes' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/us-core-laboratory-test-codes' \
-H 'Accept: application/fhir+json'
```

Prod returns `"text": {"status": "generated"}` with no `div` element. Dev returns `"text": {"status": "generated", "div": "<div>...Generated Narrative...</div>"}` with a full generated narrative. Same behavior on both the direct read (`/r4/ValueSet/us-core-laboratory-test-codes`) and search (`/r4/ValueSet?url=...`) paths.

#####What differs

When reading ValueSet resources (both direct reads like `/r4/ValueSet/us-core-laboratory-test-codes` and search reads like `/r4/ValueSet?url=...`), prod returns `text: {"status": "generated"}` without the `div` element, while dev returns `text: {"status": "generated", "div": "<div>...</div>"}` with a full generated narrative.

In FHIR R4, when `text.status` is present, the `div` element is required. Prod's omission of `div` with `status=generated` is technically non-conformant. Dev includes the correct generated narrative HTML.

The narrative content itself is auto-generated from the resource structure (e.g., listing included code systems and filters) and has no direct terminology significance.

#####How widespread

4 delta records are affected, all for the same ValueSet (`us-core-laboratory-test-codes`) accessed via 2 URL patterns (direct read and search), each appearing twice in the test data:

- 31a631b5: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 296cf150: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)
- 9a2a81a0: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 6e354570: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)

Search used: `grep '"op":"read"' deltas.ndjson` then checked all 8 results for text.div presence. Only these 4 had the pattern (the other 4 had different issues: entry count mismatch or other diffs).

#####What the tolerance covers

Tolerance ID: `read-resource-text-div-diff`. Matches read operations (resource reads returning ValueSet, CodeSystem, or Bundle with entries) where both sides have `text.status=generated` but differ on `div` presence. Normalizes by stripping `text.div` from both sides and comparing the rest. Eliminates 4 records.

#####Representative record

`grep -n '31a631b5-8579-48d8-a95c-e40eadfd4714' comparison.ndjson`

---

### [ ] `1176a4a` CPT $expand: dev returns empty expansion (total=0) for ValueSets containing CPT codes

Records-Impacted: 45
Tolerance-ID: cpt-expand-empty-results
Record-ID: d03ce6c0-d498-4c96-9165-261fdecc484c

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt","concept":[{"code":"83036"}]}]}}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt","concept":[{"code":"83036"}]}]}}'
```

Prod returns `total: 1` with CPT code 83036 ("Hemoglobin; glycosylated (A1C)") in `expansion.contains`. Dev returns `total: 0` with no `contains` array. Both report `used-codesystem: http://www.ama-assn.org/go/cpt|2023`.

#####What differs

Dev returns `total: 0` with no `expansion.contains` array for $expand requests involving CPT codes (`http://www.ama-assn.org/go/cpt|2023`). Prod returns `total: 1` (or more) with the expected CPT codes in `expansion.contains`.

Example (record d03ce6c0): POST /r4/ValueSet/$expand for a ValueSet containing CPT code 83036 ("Hemoglobin; glycosylated (A1C)"). Prod returns the code in the expansion; dev returns an empty expansion with total=0.

Both servers use the same `used-codesystem` version (`http://www.ama-assn.org/go/cpt|2023`), indicating dev believes it has CPT loaded but fails to resolve any codes from it.

#####How widespread

45 out of 50 $expand delta records with CPT codes show this pattern. Found via:
```bash
####Count CPT expand records where dev returns total=0 and prod returns total>0
python3 -c "..." # -> 45 of 46 CPT expand deltas
```

All 45 records are POST /r4/ValueSet/$expand with `used-codesystem` of `http://www.ama-assn.org/go/cpt|2023`.

#####Related

Same root cause as bug f559b53 (CPT validate-code returns "Unknown code"). Dev's CPT data appears non-functional — codes are unknown for validation and absent from expansions.

#####What the tolerance covers

Tolerance `cpt-expand-empty-results` matches POST /r4/ValueSet/$expand where dev returns total=0 and prod returns total>0, and the expansion uses CPT as a code system. Skips these records entirely since comparison is meaningless when dev has no CPT data.

---

### [ ] `8f148da` validate-code: dev omits message parameter when result=true

Records-Impacted: 150
Tolerance-ID: validate-code-missing-message-on-true
Record-ID: e934228b-f819-4119-bdd2-dcf4a72988bc

#####What differs

Dev omits the `message` output parameter on $validate-code responses when `result=true`. Prod includes it. The FHIR spec explicitly states that when result is true, the message parameter "carries hints and warnings."

In this dataset, all 150 affected records have `result=true` and prod returns a `message` containing warnings like "Unknown Code '441' in the CodeSystem 'http://hl7.org/fhir/sid/icd-9-cm' version '2015' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment."

When `result=false`, dev correctly includes the `message` parameter.

#####How widespread

150 records in comparison.ndjson (38 in current deltas after other tolerances):
- 111 POST /r4/ValueSet/$validate-code
- 39 POST /r4/CodeSystem/$validate-code

All 150 have `result=true` in both prod and dev. The pattern is: validate-code + result=true + prod has message + dev omits message.

Search: `grep 'missing-in-dev.*message' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 48 lines (38 with actual message param diff after filtering false positives from grep matching "message" elsewhere in the line).

Verified in full comparison.ndjson: all 150 records where prod has a message param and dev doesn't have dev result=true (0 with result=false, 0 with no result).

#####What the tolerance covers

Tolerance ID: validate-code-missing-message-on-true. Matches validate-code Parameters responses where result=true, prod has a message parameter, and dev does not. Normalizes by stripping the message parameter from prod (since dev doesn't have it and we can't fabricate it). This is a lossy normalization — it hides the missing warning, but the warning content is already present in the issues OperationOutcome.

#####Representative record

e934228b-f819-4119-bdd2-dcf4a72988bc — POST /r4/CodeSystem/$validate-code for ICD-9-CM code 441.

---

