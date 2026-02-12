# tx-compare Bug Report

_105 bugs (73 open, 32 closed)_

| Priority | Count | Description |
|----------|-------|-------------|
| P3 | 1 | Missing resources |
| P4 | 1 | Status code mismatch |
| P6 | 5 | Content differences |
| TEMP | 3 | Temporary tolerances (real bugs, suppressed for triage) |

---

## P3 -- Missing resources

### [ ] `2905420` DICOM CID 29 AcquisitionModality ValueSet missing from dev

Records-Impacted: 10
Tolerance-ID: dicom-cid29-missing
Record-ID: 3e3359d1-7391-4620-8b72-552f197f21cf


**Test 1: Direct read by ID** (prod=200, dev=404)

```bash
curl -s -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r4/ValueSet/dicom-cid-29-AcquisitionModality" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'Status: 200, resourceType: {d[\"resourceType\"]}, id: {d[\"id\"]}')"

curl -s -o /dev/null -w "%{http_code}" -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r4/ValueSet/dicom-cid-29-AcquisitionModality"
```

**Test 2: URL search** (prod total=1, dev total=0)

```bash
curl -s -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r4/ValueSet?url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'total: {d[\"total\"]}, entries: {len(d.get(\"entry\",[]))}')"

curl -s -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r4/ValueSet?url=http%3A%2F%2Fdicom.nema.org%2Fmedical%2Fdicom%2Fcurrent%2Foutput%2Fchtml%2Fpart16%2Fsect_CID_29.html" \
| python3 -c "import sys,json; d=json.load(sys.stdin); print(f'total: {d[\"total\"]}, entries: {len(d.get(\"entry\",[]))}')"
```

Verified 2026-02-07: both tests confirm the DICOM CID 29 AcquisitionModality ValueSet exists on prod but is entirely missing from dev.


When searching for the DICOM CID 29 AcquisitionModality ValueSet by URL (`/r4/ValueSet?url=http://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_29.html`), prod returns a Bundle with `total: 1` containing the full ValueSet resource (id: `dicom-cid-29-AcquisitionModality`, 51 DICOM modality codes). Dev returns an empty Bundle with `total: 0`.

Direct reads by ID (`/r4/ValueSet/dicom-cid-29-AcquisitionModality`) return 200 on prod with the full ValueSet, and 404 on dev with "ValueSet/dicom-cid-29-AcquisitionModality not found".

The ValueSet has URL `http://dicom.nema.org/medical/dicom/current/output/chtml/part16/sect_CID_29.html`, version `2025.3.20250714`, and uses system `http://dicom.nema.org/resources/ontology/DCM`.


10 records in the delta file:
- 5x P3 (prod=200, dev=404): direct read `/r4/ValueSet/dicom-cid-29-AcquisitionModality`
- 5x P6 (both 200, content differs): URL search returning empty Bundle vs populated Bundle

Search: `grep 'dicom-cid-29\|sect_CID_29' deltas.ndjson` finds all 10.


- `3e3359d1-7391-4620-8b72-552f197f21cf` (P6 URL search)
- `ab5f8ed0-5149-4967-af3a-3c649cbb10c5` (P3 direct read)

---

---

## P4 -- Status code mismatch

### [x] `0d164f0` Dev returns 404 instead of 422 for  when referenced CodeSystem is not found

Records-Impacted: 296
Tolerance-ID: expand-422-vs-404-codesystem-not-found
Record-ID: eee2c985-52e0-4520-b4e4-01766ede5a7d


```bash
curl -s -w '\nHTTP Status: %{http_code}\n' 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://ontariohealth.ca/fhir/questionnaire/CodeSystem/breastSiteCodes"}]}}}]}'

curl -s -w '\nHTTP Status: %{http_code}\n' 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://ontariohealth.ca/fhir/questionnaire/CodeSystem/breastSiteCodes"}]}}}]}'
```

Prod returns HTTP 422, dev returns HTTP 404. Both return the same OperationOutcome error: "A definition for CodeSystem '...' could not be found, so the value set cannot be expanded".


When a ValueSet $expand fails because a referenced CodeSystem definition cannot be found, prod returns HTTP 422 (Unprocessable Entity) while dev returns HTTP 404 (Not Found). The OperationOutcome error message is identical on both sides: "A definition for CodeSystem '...' could not be found, so the value set cannot be expanded". The issue code is `not-found` in both cases.

Additionally, dev includes `location: [null]` and `expression: [null]` arrays in the OperationOutcome issue (prod omits these), and dev omits the `text` narrative element that prod includes. These are secondary cosmetic differences; the primary issue is the status code mismatch.


296 records in this comparison batch. All are POST /r4/ValueSet/$expand operations where the error message contains "could not be found, so the value set cannot be expanded".

Search: `grep '"prodStatus":422,"devStatus":404' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 296

All 296 have:
- Operation: POST /r4/ValueSet/$expand
- Prod status: 422
- Dev status: 404
- OperationOutcome issue code: not-found
- Identical error message text


Tolerance ID: `expand-422-vs-404-codesystem-not-found`
Matches: POST /r4/ValueSet/$expand where prodStatus=422 and devStatus=404, and the OperationOutcome contains "could not be found, so the value set cannot be expanded".
Normalizes: status code difference, strips null location/expression arrays from dev, strips text narrative from prod. Compares remaining OperationOutcome content.
Affects: 296 records.


ID: eee2c985-52e0-4520-b4e4-01766ede5a7d

---


01d01e6 #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev returns 404 instead of 422 when referenced CodeSystem not found

---

## P6 -- Content differences

### [x] `be888eb` v2-0360 $lookup returns version 3.0.0 vs prod 2.0.0 with extra definition/designation

Records-Impacted: 157
Tolerance-ID: v2-0360-lookup-version-skew
Record-ID: 80a780e6-8842-43a9-a260-889ce87f76ac


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN' \
-H 'Accept: application/fhir+json'
```

Prod returns `version: "2.0.0"` with no top-level `definition` or `designation` parameters. Dev returns `version: "3.0.0"` with an extra `definition` parameter ("Registered Nurse") and an extra `designation` parameter (use=preferredForLanguage).


$lookup on CodeSystem v2-0360 (DegreeLicenseCertificate) returns different version and content between prod and dev:

1. **Version**: prod returns `version: "2.0.0"`, dev returns `version: "3.0.0"`
2. **Definition parameter**: dev returns a top-level `definition` parameter (`"Registered Nurse"`); prod returns the definition only as a property (code=definition)
3. **Designation parameter**: dev returns a `designation` parameter with `preferredForLanguage` use coding; prod does not include designation

These differences reflect that dev has loaded a newer edition (3.0.0) of the v2-0360 CodeSystem than prod (2.0.0). The structural differences (definition as top-level param, extra designation) are consistent with the newer version having richer content.


All 157 $lookup deltas are for this same system and show the identical pattern. All use code=RN.

```
grep '"op":"lookup"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l

grep '"op":"lookup"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | grep -c 'v2-0360'
```

Request properties that predict this difference:
- Operation: $lookup
- System: http://terminology.hl7.org/CodeSystem/v2-0360
- FHIR version: /r4/


Tolerance ID: `v2-0360-lookup-version-skew`
Matches: $lookup requests on v2-0360 system
Normalizes: strips version, definition, and designation parameters from both sides; removes property with code=definition from both sides
Affects: 157 records


ID: `80a780e6-8842-43a9-a260-889ce87f76ac`
URL: GET /r4/CodeSystem/$lookup?system=http://terminology.hl7.org/CodeSystem/v2-0360&code=RN


b3e6838 #1 Claude (AI Assistant) <>

Adjudicated by GG: Dev is correct (v2-0360 lookup version skew)

---

### [x] `1fff165` Dev returns empty-string expression/location in OperationOutcome issues

Records-Impacted: 318
Tolerance-ID: dev-empty-string-expression-location
Record-ID: 7de52d92-3166-495e-ac5e-af262b1019e4


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"109691-6","display":"Influenza virus A Ag [Measurement] in Nasopharynx"}]}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"109691-6","display":"Influenza virus A Ag [Measurement] in Nasopharynx"}]}}]}'
```

At data collection time, prod omitted `expression` and `location` on the TX_GENERAL_CC_ERROR_MESSAGE issue (correct), while dev returned `"expression": [""]` and `"location": [""]` (invalid FHIR). As of 2026-02-07, dev no longer returns the empty-string fields — the bug appears fixed on the current dev server.

Dev returns `"expression": [""]` and `"location": [""]` on certain OperationOutcome issue entries in $validate-code responses, where prod correctly omits these fields entirely.


In $validate-code responses (both ValueSet and CodeSystem), dev includes `"expression": [""]` and `"location": [""]` on OperationOutcome issue entries that have no specific FHIRPath location. Prod omits these fields entirely, which is correct — FHIR requires strings to be non-empty if present. The empty string `""` is invalid FHIR.

This occurs on issues with these message IDs:
- TX_GENERAL_CC_ERROR_MESSAGE (311 records)
- MSG_DRAFT (4 records)
- MSG_DEPRECATED (3 records)


318 delta records show this pattern. All are $validate-code operations (both ValueSet/$validate-code and CodeSystem/$validate-code), all P6 priority.

Search: examined all records in deltas.ndjson where dev OperationOutcome issues contain empty-string expression or location arrays.


Tolerance ID: `dev-empty-string-expression-location`. Normalizes by removing `expression: [""]` and `location: [""]` from OperationOutcome issues in dev responses, matching what prod does (omit the fields). This is a normalize tolerance (not skip) so other differences in these records still surface.


- `7de52d92-3166-495e-ac5e-af262b1019e4` (ValueSet/$validate-code, TX_GENERAL_CC_ERROR_MESSAGE)
- `dcdd2b94-db9...` (CodeSystem/$validate-code, TX_GENERAL_CC_ERROR_MESSAGE)

---

### [x] `c3069e3` Wrong Display Name message format differs: different display option count, formatting, and language tags

Records-Impacted: 44
Tolerance-ID: invalid-display-message-format
Record-ID: beb4276b-f937-46c3-81ab-7f63cb7798b7


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-US"},{"name":"display","valueString":"English"},{"name":"displayLanguage","valueCode":"en-US"}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-US"},{"name":"display","valueString":"English"},{"name":"displayLanguage","valueCode":"en-US"}]}'
```

Prod returns "one of 6 choices" with duplicate display options and no language tags; dev returns "one of 3 choices" with de-duplicated options and `(en)` language tags appended to each.


When $validate-code detects a wrong display name, prod and dev return different error message text in both the `message` parameter and `issues` OperationOutcome `details.text`.

Specific differences:
- **Display option count**: Prod may list duplicate display options (e.g., "6 choices" with repeats), while dev de-duplicates (e.g., "3 choices" with unique entries)
- **Language tags**: Dev appends language tags like `(en)` after each display option; prod does not
- **Example**: For `urn:ietf:bcp:47#en-US`:
- Prod: "Valid display is one of 6 choices: 'English (Region=United States)', 'English (United States)', 'English (Region=United States)', ..."
- Dev: "Valid display is one of 3 choices: 'English (Region=United States)' (en), 'English (United States)' (en) or 'English (Region=United States)' (en) ..."

The core validation result (`result: false`) agrees in all but 1 of 41 records. The difference is confined to the human-readable error message text.


44 delta records have `invalid-display` issue type with only `message` and `issues` diffs. 41 records contain "Wrong Display Name" in the delta text.

Search: `grep -c 'Wrong Display Name' jobs/2026-02-round-1/results/deltas/deltas.ndjson` → 41
Search: `grep -c 'invalid-display' jobs/2026-02-round-1/results/deltas/deltas.ndjson` → 53 (44 with only message/issues diffs)

Affected operations: $validate-code on both CodeSystem and ValueSet
Affected systems: urn:ietf:bcp:47, http://snomed.info/sct, and others


Tolerance ID: `invalid-display-message-format`
Matches: validate-code records where both prod and dev have `invalid-display` issue type and only the message/issues text differs. Normalizes the message and issues text to prod's version.
Expected elimination: ~44 records.


`beb4276b-f937-46c3-81ab-7f63cb7798b7` — grep -n 'beb4276b-f937-46c3-81ab-7f63cb7798b7' jobs/2026-02-round-1/comparison.ndjson


cd32006 #1 Claude (AI Assistant) <>

Adjudicated by GG: Won't fix — Dev is correct (Wrong Display Name message format)

---

### [x] `b77d7cd` BCP-47 display text format: dev returns 'Region=...' instead of standard format

Records-Impacted: 7
Tolerance-ID: bcp47-display-format
Record-ID: da702ab4-7ced-4b69-945c-0b5bbbc088c0


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=urn:ietf:bcp:47&code=en-US' -H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=urn:ietf:bcp:47&code=en-US' -H 'Accept: application/fhir+json'
```

As of 2026-02-07, both servers return `"display": "English (Region=United States)"` — the original difference (prod had "English (United States)") is no longer present. Prod appears to have been updated to match dev's format.


For BCP-47 language codes (system urn:ietf:bcp:47), dev returns display text with explicit subtag labels like "English (Region=United States)" while prod returns the standard format "English (United States)".

Specific example for code en-US:
- prod: "English (United States)"
- dev: "English (Region=United States)"

The "Region=" prefix in dev's display text is non-standard. The IANA/BCP-47 convention is to show the region name without a label prefix.


7 P6 $validate-code records in the current delta set match this pattern — all are urn:ietf:bcp:47 validate-code operations for code en-US where the only difference (after diagnostics stripping and parameter sorting) is the display parameter value.

Search: grep -c 'Region=' deltas.ndjson → 10 total hits (7 are this display-only P6 pattern; 2 are P1 case-sensitivity issues for en-us; 1 is an $expand with transient metadata diffs where "Region=" appears only in diagnostics).


Tolerance: bcp47-display-format. Matches $validate-code records where system=urn:ietf:bcp:47, both prod and dev return display parameters, and the values differ. Canonicalizes dev display to match prod. Expected to eliminate 7 records.


da702ab4-7ced-4b69-945c-0b5bbbc088c0 — POST /r4/ValueSet/$validate-code? for en-US in urn:ietf:bcp:47


e0019ec #1 Claude (AI Assistant) <claude@anthropic.com>

Closing: no longer reproducible as of 2026-02-07. Both prod and dev now return the same 'Region=...' format for BCP-47 display text. Servers have converged.

---

### [x] `4fa9a6e` Searchset Bundle formatting: empty entry array, extra pagination links, absolute URLs

Records-Impacted: 491
Tolerance-ID: searchset-bundle-format
Record-ID: c97f36a4-973b-42c5-8b6d-58464195cfd5


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fwww.rsna.org%2FRadLex_Playbook.aspx' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fwww.rsna.org%2FRadLex_Playbook.aspx' \
-H 'Accept: application/fhir+json'
```

Prod returns a searchset Bundle with `total: 0`, no `entry` field, a single `self` link with a relative URL, and server-generated `id`/`meta.lastUpdated`. Dev returns a searchset Bundle with `total: 0`, an empty `entry: []` array, three links (`self`/`first`/`last`) with absolute URLs and `_offset=0`, and no `id` or `meta`.


Dev's searchset Bundle responses differ from prod in several ways:

1. **`entry: []` on empty results**: When a search returns no results (total: 0), dev includes `entry: []` (an empty array). Prod omits the entry field entirely. Empty arrays violate FHIR's general rule that arrays, if present, must be non-empty.

2. **Extra pagination link relations**: Dev returns `self`, `first`, and `last` link relations. Prod returns only `self`. This applies to both empty and non-empty search results.

3. **Absolute vs relative link URLs**: Dev uses absolute URLs with full host prefix (e.g., `http://tx.fhir.org/r4/ValueSet?...&_offset=0`). Prod uses relative URLs (e.g., `ValueSet?&url=...`). Dev also appends `_offset=0` to search links.

4. **Server-generated metadata**: Prod includes `id` and `meta.lastUpdated` on searchset Bundles. Dev omits these. (This is server-generated transient metadata and is the least significant difference.)


Affects all searchset Bundle responses for ValueSet and CodeSystem searches:
- 337 empty ValueSet search Bundles
- 154 empty CodeSystem search Bundles
- 7 non-empty searchset Bundles (these also have the extra links, and may have other substantive differences like total count disagreements)

Total: **498 records** in the deltas file.

Search used: Parsed all records with `ValueSet?` or `CodeSystem?` in the URL where prodBody contains a Bundle with type "searchset".


- `c97f36a4-973b-42c5-8b6d-58464195cfd5` (empty ValueSet search, RadLex Playbook)
- `4ab7655f-015d-4f44-b184-5ba0fd256926` (empty ValueSet search, DICOM)
- `640875e4-3839-40d1-aaa1-0bf79bef77f2` (non-empty CodeSystem search, USPS)

---


48faa69 #1 Claude (AI Assistant) <>

GG: Jose is looking into search. Tolerance removed to track progress.

---

## Temporary tolerances (real bugs, suppressed for triage)

### [x] `a9cf20c` Dev omits deprecated location field on OperationOutcome issues

Records-Impacted: ~3316
Record-ID: 59eff7c6-9fd2-45b2-8f27-c790368bcc54, 1697b0cd-971b-475c-8075-f249215b1205, 199de988-2772-45c3-83cb-5ff1de1f01ce
Tolerance-ID: oo-missing-location-field, oo-missing-location-post-version-skew

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.114222.4.11.1066&code=1223P0106X&_format=json&system=http:%2F%2Fnucc.org%2Fprovider-taxonomy' \
-H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name == "issues") | .resource.issue[0] | {severity, code, location, expression}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.114222.4.11.1066&code=1223P0106X&_format=json&system=http:%2F%2Fnucc.org%2Fprovider-taxonomy' \
-H 'Accept: application/fhir+json' | jq '.parameter[] | select(.name == "issues") | .resource.issue[0] | {severity, code, location, expression}'
```

Prod returns `"location": ["system"]`, dev returns `"location": null` (field is omitted).

#####Root Cause

**Classification**: code-level defect

**Prod** populates both `location` and `expression` with the same path value on every OperationOutcome issue:
[`library/fhir4/fhir4_common.pas#L1480-L1492`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/fhir4/fhir4_common.pas#L1480-L1492)
— The `addIssue` method (line 1487-1488) adds the path to both `iss.locationList` and `iss.expressionList`. The same pattern appears in `addIssueNoId` at lines 1457-1458.

**Dev** only sets `expression`, never sets `location`:
[`tx/library/operation-outcome.js#L25-L46`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/library/operation-outcome.js#L25-L46)
— The `asIssue()` method (line 33-35) sets `res.expression = [this.path]` but has no corresponding `res.location = [this.path]` line.

**Fix**: In `tx/library/operation-outcome.js`, add `res.location = [this.path]` alongside the existing `res.expression = [this.path]` in the `asIssue()` method (after line 34).

#####Tolerances

######1. `oo-missing-location-field` (~3069 records)

**What it handles**: Strips `location` from prod's OperationOutcome issues when dev lacks it and `location` equals `expression`. Handles both flat `$validate-code` responses (top-level issues parameter) and nested `$batch-validate-code` responses (issues inside `validation` parameter entries).

**Representative records**:
- `59eff7c6-9fd2-45b2-8f27-c790368bcc54` (flat validate-code, NUCC provider-taxonomy)
- `1697b0cd-971b-475c-8075-f249215b1205` (batch-validate-code, nested validation structure)

**Details**: Of the ~3069 affected records, ~2555 are fully eliminated from deltas (location was the only remaining difference). The remaining ~514 still have other differences but the location diff is normalized away. The batch-validate-code subset accounts for ~38 records where the nested response structure required additional handling.

######2. `oo-missing-location-post-version-skew` (~247 records)

**What it handles**: Same root cause, but catches records where `oo-missing-location-field` misses the difference due to pipeline ordering. Specifically, when HL7 terminology version-skew tolerances (`hl7-terminology-cs-version-skew`) strip extra `status-check` informational issues from prod, the OperationOutcome issue arrays only become aligned after those normalizations run. Since `oo-missing-location-field` runs earlier in the pipeline, the misaligned arrays prevent index-based comparison from detecting the location difference. This tolerance runs later to catch those remaining records.

**Representative record**: `199de988-2772-45c3-83cb-5ff1de1f01ce` (validate-code against `condition-category` CodeSystem, prod has extra status-check issue stripped by version-skew tolerance)

#####Total impact

~3316 records across both tolerances (~34% of all deltas). All are `$validate-code` or `$batch-validate-code` operations.


ac90cff #1 Claude (AI Assistant) <>

(Consolidated into comment #0.)


a29dcff #2 Claude (AI Assistant) <>

Closing: GG adjudicated as won't fix. The `location` field is deprecated in FHIR R4 and prod has been populating it incorrectly — stopping populating it altogether is the correct behavior. Tolerances `oo-missing-location-field` and `oo-missing-location-post-version-skew` reclassified from temp-tolerance to equiv-autofix with adjudication: ['gg'].

---

### [ ] `3e1d117` validate-code: dev returns result=false with 'undefined' system when dev cache not warm at comparison start

Tolerance-ID: validate-code-undefined-system-result-disagrees
Record-ID: 49614070-0a84-4943-942d-0f40746020a5

POST $validate-code: dev returns result=false with "undefined" system in diagnostics where prod returns result=true. Dev server cache was not warm at start of comparison run, causing it to fail to resolve systems that prod resolves.

Also covers the related pattern `validate-code-undefined-system-missing-params` where both return result=false but dev is missing code/system/display params due to the same undefined system issue.

Previously adjudicated by GG as equiv-autofix test artifact. Converted to temp-tolerance so it is re-evaluated in future rounds.

---

### [ ] `dfd179a` Dev fails to process VSAC ValueSets with vsacOpModifier extension

Dev returns a generic error "Cannot process resource at \"exclude[0].filter\" due to the presence of the modifier extension vsacOpModifier" instead of processing VSAC ValueSets that use the vsacOpModifier extension in their exclude filters.


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.4.642.40.2.48.1|20250419&system=urn:oid:2.16.840.1.113883.6.238&code=2184-0&display=Dominican' -H 'Accept: application/fhir+json'

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

---

## Other

### [x] `e18fdef` Dev returns 404 for LOINC answer list ValueSet $expand (appends |4.0.1 to canonical URL)

Records-Impacted: 2
Tolerance-ID: loinc-answer-list-expand-404
Record-ID: 7cf61657-1a32-4b8f-a4c6-f626df7381e0


```bash
curl -s https://tx.fhir.org/r4/ValueSet/\$expand \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://loinc.org/vs/LL379-9"}]}'

curl -s https://tx-dev.fhir.org/r4/ValueSet/\$expand \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://loinc.org/vs/LL379-9"}]}'
```

**Result:** Both servers now return 200 with identical ValueSet expansions containing 7 codes. The bug is no longer reproduced - the dev server previously returned 404 with "ValueSet not found: http://loinc.org/vs/LL379-9|4.0.1" but now correctly expands the LOINC answer list.


When expanding the LOINC answer list ValueSet `http://loinc.org/vs/LL379-9` via `POST /r4/ValueSet/$expand`, prod returns 200 with a successful expansion (7 codes), while dev **previously** returned 404 with:

  ValueSet not found: http://loinc.org/vs/LL379-9|4.0.1

Dev was appending `|4.0.1` (the FHIR R4 version) to the ValueSet canonical URL when resolving it, causing the lookup to fail.


2 records in the comparison dataset showed this exact pattern — both are `POST /r4/ValueSet/$expand` for the same LOINC answer list LL379-9, both with prod=200/dev=404, and both with the same `|4.0.1` suffix in the dev error message.

Search:
- `grep 'LL379-9' deltas.ndjson` → 2 records
- `grep 'missing-resource' deltas.ndjson` → 3 total (1 is a separate CodeSystem/SOP issue)
- All 2 matching records had identical error diagnostic

The full comparison.ndjson had 64 records referencing LL379-9, but the other 62 are `GET /r4/ValueSet?_elements=url,version` (search/list operations, not expand) and succeeded on both servers.


Tolerance ID: `loinc-answer-list-expand-404`
Matched: `missing-resource` category, `POST /r4/ValueSet/$expand`, dev 404 with diagnostics containing `|4.0.1`
Eliminated: 2 records

---

### [ ] `2337986` Dev returns 404 instead of 422 when ValueSet not found for $expand

Records-Impacted: 756
Tolerance-ID: expand-valueset-not-found-status-mismatch
Record-ID: 8b7a9262-90d3-4753-a197-9a631ffdcf2f


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fdavinci-pdex-plan-net%2FValueSet%2FPractitionerRoleVS&_format=json' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fdavinci-pdex-plan-net%2FValueSet%2FPractitionerRoleVS&_format=json' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 422 with `issue.code: "unknown"` and `issue.details.text`, dev returns HTTP 404 with `issue.code: "not-found"` and `issue.diagnostics`.


When a ValueSet cannot be found for a $expand operation, prod returns HTTP 422 (Unprocessable Entity) with an OperationOutcome using issue code `unknown` and `details.text`, while dev returns HTTP 404 (Not Found) with issue code `not-found` and `diagnostics`. Both communicate the same semantic meaning ("this ValueSet doesn't exist"), but the HTTP status code and OperationOutcome structure differ.

Prod response (status 422):
- issue.code: "unknown"
- issue.details.text: "Unable to find value set for URL \"...\""

Dev response (status 404):
- issue.code: "not-found"
- issue.diagnostics: "ValueSet not found: ..."


756 records in the comparison dataset show this exact pattern (prod=422, dev=404). All are $expand operations (722 GET, 34 POST) across many different ValueSet URLs. The pattern is universal — every prod=422/dev=404 status mismatch is an $expand of an unknown ValueSet.

Search used: `grep -c '"prodStatus":422,"devStatus":404' results/deltas/deltas.ndjson`


Tolerance ID: `expand-valueset-not-found-status-mismatch`
Matches: $expand operations where prod=422 and dev=404, and both responses are OperationOutcomes indicating a ValueSet was not found.
Records eliminated: 756

#####Root Cause

**Classification**: code-level defect

**Prod** returns HTTP 422 with issue code `unknown` for unfound ValueSets:
[`server/tx_operations.pas#L335-L336`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/tx_operations.pas#L335-L336)
— Raises `ETerminologyError` with `itUnknown` when ValueSet URL lookup fails during $expand.

[`server/endpoint_storage.pas#L1553-L1561`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/endpoint_storage.pas#L1553-L1561)
— All `ETerminologyError` exceptions are caught and returned with `HTTP_ERR_BUSINESS_RULES_FAILED` (422), preserving the exception's `issueType` (`itUnknown` -> `"unknown"`) in the OperationOutcome.

**Dev** returns HTTP 404 with issue code `not-found`:
[`tx/workers/expand.js#L1669-L1672`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/expand.js#L1669-L1672)
— When `findValueSet` returns null, the expand handler returns `res.status(404)` with issue code `not-found` and puts the error message only in `diagnostics`.

There are two divergences:
1. **HTTP status**: Dev uses 404 instead of 422. Prod treats all terminology errors as "business rules failed" (422), regardless of whether the issue is "not found" or something else.
2. **Issue code**: Dev uses `not-found` instead of `unknown`. Prod uses `itUnknown` because the error semantics are "the system doesn't know this ValueSet", not a pure resource-not-found.

**Fix**: In `tx/workers/expand.js` line 1670, change `res.status(404)` to `res.status(422)` and change the issue code from `'not-found'` to `'unknown'` to match prod's behavior. The same fix should be applied to `tx/workers/related.js` line 1670 which has identical code.

---

### [ ] `cd4b7d1` Dev returns 400 instead of 422 for error responses across validate-code and expand operations

Records-Impacted: 1897
Tolerance-ID: error-status-422-vs-400
Record-ID: e5639442-a91b-4de0-b1d9-9b901023b6c1

#####Repro

```bash
####Prod
curl -s -w "\nHTTP Status: %{http_code}\n" \
'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http://hl7.org/fhir/us/davinci-pdex-plan-net/ValueSet/PractitionerRoleVS&code=ho&_format=json&system=http://hl7.org/fhir/us/davinci-pdex-plan-net/CodeSystem/ProviderRoleCS' \
-H 'Accept: application/fhir+json'

####Dev
curl -s -w "\nHTTP Status: %{http_code}\n" \
'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http://hl7.org/fhir/us/davinci-pdex-plan-net/ValueSet/PractitionerRoleVS&code=ho&_format=json&system=http://hl7.org/fhir/us/davinci-pdex-plan-net/CodeSystem/ProviderRoleCS' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 422 with OperationOutcome (issue code "not-found"). Dev returns HTTP 400 with the same OperationOutcome content. Both agree on the error semantics (same error code, same error message), differing only in HTTP status.

#####What differs

Prod returns HTTP 422 (Unprocessable Entity) while dev returns HTTP 400 (Bad Request) for error responses. Both servers return OperationOutcome resources with error-level issues and agree on the error semantics (same error codes, same error messages). The only difference is the HTTP status code.

Example: a $validate-code request for a ValueSet that doesn't exist. Both return OperationOutcome with issue code "not-found" and text "A definition for the value Set '...' could not be found", but prod uses 422 and dev uses 400.

#####How widespread

1897 records in the comparison dataset show this pattern (prod=422, dev=400). All 1897 have OperationOutcome on both sides.

Breakdown by operation type:
- validate-code: 1331 records
- expand: 566 records

Both GET and POST requests are affected. The pattern spans all FHIR versions (/r4/, etc.) and all code systems/ValueSets.

Found via: grep -c '"prodStatus":422,"devStatus":400' results/deltas/deltas.ndjson

#####What the tolerance covers

Tolerance ID: error-status-422-vs-400
Matches: any record where prod.status=422, dev.status=400, and both response bodies are OperationOutcome resources (resourceType check).
Action: skip (since the status code difference IS the categorization trigger — normalizing bodies doesn't change the status-mismatch category).
Eliminates: 1897 records.

#####Representative record

e5639442-a91b-4de0-b1d9-9b901023b6c1 — GET /r4/ValueSet/$validate-code for PractitionerRoleVS (davinci-pdex-plan-net). Prod=422, dev=400, both return "not-found" OperationOutcome.

#####Root Cause

**Classification**: code-level defect

**Prod** returns HTTP 422 for all terminology operation errors via two mechanisms:

1. For `$validate-code`, when the ValueSet is not found, it creates an OperationOutcome directly and sets `response.HTTPCode := 422`:
[`server/tx_operations.pas#L611-L616`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/tx_operations.pas#L611-L616)
— When `oOut` (OperationOutcome) is non-nil, the response code is hardcoded to 422. Same pattern at [line 882-887](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/tx_operations.pas#L882-L887) for the POST path.

2. For `$expand` and other operations, `ETerminologyError` exceptions propagate to the general handler in `endpoint_storage.pas` which sends `HTTP_ERR_BUSINESS_RULES_FAILED`:
[`server/endpoint_storage.pas#L1553-L1561`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/endpoint_storage.pas#L1553-L1561)
— `HTTP_ERR_BUSINESS_RULES_FAILED` is defined as `422` in [`library/fhir/fhir_objects.pas#L900`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/fhir/fhir_objects.pas#L900).

**Dev** returns HTTP 400 because error `Issue` objects are created with `statusCode = 400`:
[`tx/workers/validate.js#L2212`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/validate.js#L2212)
— "ValueSet not found" Issue is constructed with `400` as the last parameter. The catch block at [`tx/workers/validate.js#L2034-L2037`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/validate.js#L2034-L2037) uses `error.statusCode || 500`, so it sends 400. The same pattern appears throughout expand.js (e.g., [lines 515-533](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/expand.js#L515-L533)).

**Fix**: Change the `statusCode` from `400` to `422` in all Issue constructors and `.handleAsOO()` calls across `validate.js` and `expand.js` where the error represents a terminology operation failure (not-found, invalid filter, missing supplement, etc.). The `Issue` constructor default at `operation-outcome.js:14` is already `500`, so each call site needs updating. Alternatively, change the error handler catch blocks (e.g., `validate.js:2037`, `expand.js:1555`) to always use `422` when the error is a terminology-level Issue, matching prod's convention that all terminology OperationOutcome responses use HTTP 422.

---

### [x] `167be81` Dev returns result=false for valid v3 terminology codes in ValueSet $validate-code

Records-Impacted: 187
Tolerance-ID: v3-valueset-validate-code-result-disagrees
Record-ID: 92d4fd1a-70fc-4497-adb5-309a3f564716

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=INFA&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fv3-ActCode' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=INFA&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fv3-ActCode' \
-H 'Accept: application/fhir+json'
```

Prod returns `result: true` (code is valid in the ValueSet), dev returns `result: false` with error message "The provided code 'http://terminology.hl7.org/CodeSystem/v3-ActCode#INFA' was not found in the value set 'http://hl7.org/fhir/ValueSet/consent-category|4.0.1'".

The bug reproduces across multiple ValueSets:
- encounter-participant-type with code CON from v3-ParticipationType
- v3-ActEncounterCode with code AMB from v3-ActCode

#####Root Cause

**Classification**: code-level defect

HL7 v3 CodeSystems (e.g., v3-ActCode, v3-ParticipationType, v3-RoleCode) use a **flat concept list** with a property named `subsumedBy` to define hierarchy. This property is declared with `uri: "http://hl7.org/fhir/concept-properties#parent"` — the standard FHIR URI for parent relationships — but with the non-standard property code `subsumedBy` instead of `parent`.

**Prod** resolves hierarchy by matching on the property URI, not just the code:
[`fhir_codesystem_service.pas#L438-L458`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_codesystem_service.pas#L438-L458)
— In `loadCodeSystem`, iterates the CodeSystem's `property` declarations and matches any property where `prop.code = 'parent'` **or** `prop.uri = 'http://hl7.org/fhir/concept-properties#parent'`. This finds the `subsumedBy` property via its URI. Then uses `prop.code` (= `subsumedBy`) to look up concept-level properties and build parent-child relationships.

**Dev** only matches on hardcoded property code names `parent` and `child`:
[`tx/library/codesystem.js#L507-L523`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/library/codesystem.js#L507-L523)
— In `_buildHierarchyMaps`, checks `property.code === 'parent'` and `property.code === 'child'` only. Never consults the CodeSystem's property declarations or their URIs. Since v3 CodeSystems use `subsumedBy` (not `parent`), no hierarchy relationships are built. `getDescendants('_ActConsentType')` returns empty, so `is-a` filter matching in `checkConceptSet` finds no descendants, and validation returns false.

**Fix**: In `_buildHierarchyMaps`, look up the CodeSystem's `property` declarations to find which property code maps to `http://hl7.org/fhir/concept-properties#parent` (and `#child`), then use those codes when scanning concept properties — matching the prod server's approach.

#####What differs

Prod returns `result: true` for $validate-code of HL7 v3 terminology codes against their corresponding ValueSets. Dev returns `result: false` with message "The provided code was not found in the value set."

Both servers agree on the CodeSystem version, code, and display text — dev can look up the code successfully in the CodeSystem. But dev fails to determine that the code is a member of the ValueSet.

Example (this record): GET /r4/ValueSet/$validate-code with system=v3-ActCode, code=INFA, url=consent-category.
- Prod: result=true, version=9.0.0, display="information access"
- Dev: result=false, version=9.0.0, display="information access", message="code not found in value set consent-category|4.0.1"

#####How widespread

187 records across 5 ValueSets, all GET requests, all r4, all using terminology.hl7.org/CodeSystem/v3-* systems:

- 103 records: v3-ActEncounterCode ValueSet (codes AMB, IMP, HH, EMER from v3-ActCode)
- 69 records: encounter-participant-type ValueSet (codes CON, ADM, ATND from v3-ParticipationType)
- 9 records: consent-category ValueSet (code INFA from v3-ActCode)
- 4 records: v3-ServiceDeliveryLocationRoleType ValueSet (codes ER, CARD, SLEEP from v3-RoleCode)
- 2 records: v3-PurposeOfUse ValueSet (code HMARKT from v3-ActReason)

Search used: grep 'result-disagrees' deltas.ndjson, filtered to terminology.hl7.org/CodeSystem/v3-* systems.

#####What the tolerance covers

Tolerance `v3-valueset-validate-code-result-disagrees` skips records where:
- Operation is ValueSet/$validate-code
- System is terminology.hl7.org/CodeSystem/v3-*
- prodResult=true, devResult=false
- Both sides report the same CodeSystem version

Eliminates 187 records.

---

### [ ] `6edc96c` Dev loads different versions of HL7 terminology CodeSystems (terminology.hl7.org) than prod

Records-Impacted: ~465
Record-ID: 04364a8a-acce-491a-8018-9ac010d47d21, ef77e7ca-9afa-4325-a1f3-a939a62a490f, 7813f9ee-79ee-445b-8064-603a98e876bf, 83509e51-1a8b-4d77-8f4e-7b0037009c4a, 2d18564d-4e72-425d-aca0-358240df2c57, 118efc0f-ad5c-4db9-b9e6-2120a5824b92
Tolerance-ID: hl7-terminology-cs-version-skew, expand-hl7-terminology-version-skew-params, expand-hl7-terminology-version-skew-content, validate-code-hl7-terminology-vs-version-skew, expand-hl7-terminology-version-skew-vs-metadata, hl7-terminology-lookup-definition-designation-skew

#####Summary

Dev loads older/different versions of HL7 terminology CodeSystems and ValueSets (`http://terminology.hl7.org/CodeSystem/*`, `http://terminology.hl7.org/ValueSet/*`) than prod. For example, prod loads `consentcategorycodes` at version `4.0.1` while dev loads `1.0.1`; prod loads `observation-category` at `4.0.1` while dev loads `2.0.0`. Dev also loads different ValueSet versions (e.g., `v3-TribalEntityUS|4.0.0` vs dev's `|2018-08-12`, `v3-ActEncounterCode|3.0.0` vs dev's `|2014-03-26`). This version skew is the single root cause behind six distinct manifestations affecting `$validate-code`, `$expand`, and `$lookup` operations.

Known affected CodeSystems and their version mismatches:
- `consentcategorycodes`: prod=4.0.1, dev=1.0.1
- `goal-achievement`: prod=4.0.1, dev=1.0.1
- `observation-category`: prod=4.0.1, dev=2.0.0
- `consentpolicycodes`: prod=4.0.1, dev=3.0.1
- `condition-category`: prod=4.0.1, dev=2.0.0
- `condition-clinical`: prod=4.0.1, dev=3.0.0
- `v2-0116`: prod=2.9, dev=3.0.0

Known affected ValueSets:
- `v3-ActEncounterCode`: prod=3.0.0, dev=2014-03-26
- `v3-TribalEntityUS`: prod=4.0.0, dev=2018-08-12

#####Tolerances

######1. `hl7-terminology-cs-version-skew` (~58 records)

**What it handles**: `$validate-code` responses where the only differences are CodeSystem version strings in the `version` parameter, `message` text, and `issues` OperationOutcome `details.text`. Also strips draft `status-check` informational issues that prod includes but dev omits (because dev loads a version that lacks the draft status metadata). Both servers agree on validation results for all affected codes.

**Normalizes**: Dev's version parameter and version strings in message/issues text to prod's values; strips prod's draft status-check issues.

**Representative record**: `04364a8a-acce-491a-8018-9ac010d47d21` — validate-code for `consentcategorycodes` where prod says "version '4.0.1'", dev says "version '1.0.1'".

######2. `expand-hl7-terminology-version-skew-params` (~236 records)

**What it handles**: `$expand` responses where the `expansion.parameter` entries differ due to version skew. The `used-codesystem` version strings differ (e.g., `observation-category|4.0.1` vs `|2.0.0`) and prod includes `warning-draft` parameters that dev omits.

**Normalizes**: `used-codesystem` versions for `terminology.hl7.org` systems to prod's values; strips `warning-draft` parameters from both sides.

**Representative record**: `ef77e7ca-9afa-4325-a1f3-a939a62a490f` — expand of `us-core-simple-observation-category` where used-codesystem version and warning-draft differ.

######3. `expand-hl7-terminology-version-skew-content` (~163 records)

**What it handles**: `$expand` responses where prod and dev return slightly different sets of codes (1-5 extra/missing) because different CodeSystem versions include different codes. For example, dev's older `consentpolicycodes` includes `ch-epr` (removed in 4.0.1), and dev's older `observation-category` includes an extra `symptom` code. The common codes between prod and dev are identical.

**Normalizes**: Both sides to the intersection of codes present in both responses; adjusts the total count accordingly.

**Representative record**: `7813f9ee-79ee-445b-8064-603a98e876bf` — expand of `consent-policy` where dev returns 27 codes vs prod's 26 (extra `ch-epr`).

######4. `validate-code-hl7-terminology-vs-version-skew` (4 records)

**What it handles**: `$validate-code` responses where the only difference is the ValueSet version string in message text and issues details text. Both servers agree on `result=false` and all other parameters. The difference appears in "not found in the value set 'url|version'" messages where prod references the newer ValueSet version (e.g., `v3-ActEncounterCode|3.0.0`) and dev references the older version (e.g., `|2014-03-26`).

**Normalizes**: ValueSet pipe-delimited version strings in message and issues text to prod's values.

**Representative record**: `83509e51-1a8b-4d77-8f4e-7b0037009c4a` — validate-code for PLB in v3-ActEncounterCode where prod says `|3.0.0`, dev says `|2014-03-26`.

######5. `expand-hl7-terminology-version-skew-vs-metadata` (3 records)

**What it handles**: `$expand` responses where the ValueSet-level metadata fields (date, name, title, version, identifier, language, immutable, meta) differ because prod and dev loaded different editions of the same HL7 terminology ValueSet. The expansion contents are handled by other tolerances (e.g., code intersection), but the wrapper metadata still reflects the different loaded ValueSet versions. For example, TribalEntityUS: prod returns version=4.0.0/name=TribalEntityUS/date=2014-03-26, dev returns version=2018-08-12/name=v3.TribalEntityUS/date=2018-08-12.

**Normalizes**: Dev's metadata fields (date, name, title, version, identifier, language, immutable, meta) to prod's values.

**Representative record**: `2d18564d-4e72-425d-aca0-358240df2c57` — expand of v3-TribalEntityUS where all ValueSet metadata differs between versions.

######6. `hl7-terminology-lookup-definition-designation-skew` (1 record)

**What it handles**: `$lookup` responses for HL7 terminology CodeSystems where dev returns extra top-level `definition` and `designation` parameters that prod doesn't return. Dev has `definition` as a top-level parameter (with version-dependent text), while prod returns `definition` only as a property entry. Dev also includes a `designation` parameter with `preferredForLanguage` use that prod omits entirely. Both are consequences of dev loading a newer CodeSystem version with richer content.

**Normalizes**: Strips `definition` and `designation` top-level parameters and `definition` property entries from both sides.

**Representative record**: `118efc0f-ad5c-4db9-b9e6-2120a5824b92` — lookup of `active` in `condition-clinical` where dev (version 3.0.0) returns extra definition and designation, prod (version 4.0.1) returns definition only as a property.

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2Fv3-TribalEntityUS&incomplete-ok=true&_format=json' -H 'Accept: application/fhir+json' | jq '{version, name, title, date}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2Fv3-TribalEntityUS&incomplete-ok=true&_format=json' -H 'Accept: application/fhir+json' | jq '{version, name, title, date}'
```

Prod returns `version=4.0.0, name=TribalEntityUS`, dev returns `version=2018-08-12, name=v3.TribalEntityUS`.


61e2d5c #1 Claude (AI Assistant) <>

The HL7 terminology CodeSystem version skew also affects $expand operations. Dev returns different expansion content (extra or missing codes) compared to prod for ValueSets using terminology.hl7.org CodeSystems.

163 expand records have minor code differences (1-5 extra/missing codes, e.g., consent-policy 26 vs 27, observation-category 17 vs 18). The common codes between prod and dev are identical — only the set of included codes differs.

Additionally, 246 expand records show dev returning total=1 where prod returns many codes for v3 ValueSets. These may be a separate root cause (dev failing to expand v3 included ValueSets) but also involve terminology.hl7.org CodeSystems.

Adding tolerance `expand-hl7-terminology-version-skew-content` for the 163 minor-diff records.


66ecd7c #2 Claude (AI Assistant) <>

#####Updated scope (as of round 71)

This bug now covers 3 tolerances handling different manifestations of the same root cause: dev loads older versions of HL7 terminology CodeSystems (terminology.hl7.org) than prod.

######Tolerances

1. **`hl7-terminology-cs-version-skew`** (original) — Normalizes version strings in $validate-code message text and OperationOutcome issue details. Covers ~58 validate-code records where the only difference is the version string in error messages (e.g., prod says "version '4.0.1'", dev says "version '1.0.1'").

2. **`expand-hl7-terminology-version-skew-content`** — Intersects code membership in $expand results where prod and dev return slightly different code sets (1-5 extra/missing codes) due to the version skew. Covers ~163 expand records.

3. **`expand-hl7-terminology-version-skew-params`** — Normalizes `used-codesystem` version strings in expansion parameters (e.g., `observation-category|4.0.1` vs `|2.0.0`) and strips `warning-draft` parameters that only prod includes. Covers ~236 expand records.

######Total impact: ~457 records across validate-code and expand operations.

55 records referencing terminology.hl7.org remain in the delta file, likely involving additional patterns not yet covered by these tolerances.


6be2dac #3 Claude (AI Assistant) <>

Adding tolerance `expand-hl7-terminology-used-valueset-version-skew` to cover used-valueset version differences.

The existing `expand-hl7-terminology-version-skew-params` tolerance handles used-codesystem and warning-draft parameter differences, but not used-valueset version strings. Prod reports newer HL7 terminology ValueSet versions (e.g., `|3.0.0`, `|3.1.0`) while dev reports older versions (e.g., `|2014-03-26`, `|2018-08-12`) for the same ValueSets. Same root cause — different loaded HL7 terminology editions.

Also adding `expand-hl7-terminology-extra-params` to handle prod including `displayLanguage` and `warning-retired` parameters that dev omits.

These tolerances affect the same 18 security-labels expand records. Updated total records impacted under this bug: ~255 (237 original + 18 new).


6cead9c #4 Claude (AI Assistant) <>

Closing as won't-fix. Version skew is by design. Round-1 precedent: be888eb (v2-0360) adjudicated by GG as 'Dev is correct'. Generalizing to all terminology.hl7.org CodeSystems. Covered by unified version-skew equiv-autofix tolerance.

---

### [ ] `4336772` Dev  returns only root concept for v3 hierarchical ValueSets (missing child codes)

Records-Impacted: 246
Tolerance-ID: expand-v3-hierarchical-incomplete
Record-ID: 18d8209b-15f4-486d-8009-25ed8cb2cbcb


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-PurposeOfUse&_format=json' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://terminology.hl7.org/ValueSet/v3-PurposeOfUse&_format=json' \
-H 'Accept: application/fhir+json'
```

Prod returns `expansion.total=63` with 63 codes (PurposeOfUse root + 62 child codes like HMARKT, HOPERAT, TREAT, etc.). Dev returns `expansion.total=1` with only the root abstract concept `PurposeOfUse`.


When expanding v3 ValueSets that include hierarchical concepts from `terminology.hl7.org/CodeSystem/v3-ActReason`, dev returns only the root abstract concept while prod returns the full hierarchy of child codes.

For example, expanding `http://terminology.hl7.org/ValueSet/v3-PurposeOfUse`:
- Prod: `expansion.total=63`, contains 63 codes (PurposeOfUse root + 62 child codes like HMARKT, HOPERAT, TREAT, etc.)
- Dev: `expansion.total=1`, contains only the root abstract concept `PurposeOfUse`

The same pattern affects 4 distinct v3 ValueSets:
- `v3-ActEncounterCode`: prod=12 codes, dev=1 (209 records)
- `v3-ServiceDeliveryLocationRoleType`: prod=139 codes, dev=1 (24 records)
- `v3-PurposeOfUse`: prod=63 codes, dev=1 (6 records)
- `v3-ActPharmacySupplyType`: prod=35 codes, dev=1 (7 records)

In all cases, dev returns only the root concept and completely omits the descendant codes that should be included in the expansion.


246 records across the 4 ValueSets listed above. Found via:
```bash
grep '"op":"expand"' jobs/2026-02-round-2/results/deltas/deltas.ndjson | python3 -c '...' # script checking prod_total>1 and dev_total==1
```

All are GET requests to `/r4/ValueSet/$expand` with `url=http://terminology.hl7.org/ValueSet/v3-*`.


Tolerance ID: `expand-v3-hierarchical-incomplete`. Matches expand operations where both prod and dev return 200, the ValueSet URL matches `terminology.hl7.org/ValueSet/v3-`, and dev expansion total is 1 while prod expansion total is greater than 1. Skips these records. Eliminates 246 records.


Bug 6edc96c mentions these 246 records in a comment as potentially a separate root cause from the version skew issue. This bug tracks the specific failure to expand hierarchical v3 ValueSets.

#####Root Cause

**Classification**: code-level defect

**Prod** resolves parent-child hierarchy from CodeSystem property definitions by matching on URI:
[`library/ftx/fhir_codesystem_service.pas#L438-L458`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_codesystem_service.pas#L438-L458)
— Iterates CodeSystem property definitions and matches any property where `code = 'parent'` OR `uri = 'http://hl7.org/fhir/concept-properties#parent'`. Then uses the matched property's actual `code` (e.g. `subsumedBy`) to find concept-level property entries and build parent-child relationships.

**Dev** only matches hardcoded property code names `parent` and `child`:
[`tx/library/codesystem.js#L507-L523`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/library/codesystem.js#L507-L523)
— The `_buildHierarchyMaps` method checks `property.code === 'parent'` and `property.code === 'child'` but never consults the CodeSystem's property definitions to discover that `subsumedBy` maps to the standard parent URI `http://hl7.org/fhir/concept-properties#parent`.

The v3 CodeSystems (e.g. `v3-ActReason`) define their parent property as `{code: "subsumedBy", uri: "http://hl7.org/fhir/concept-properties#parent"}`. Since the dev server only checks for the literal string `"parent"`, it never builds the hierarchy for these code systems. When ValueSets like `v3-PurposeOfUse` use a `filter: [{property: "concept", op: "is-a", value: "PurposeOfUse"}]`, the `_addDescendants` call in `cs-cs.js` finds zero descendants because the `parentToChildrenMap` was never populated.

**Fix**: In `_buildHierarchyMaps` (or `buildMaps`), consult the CodeSystem's top-level `property` definitions to identify which property codes map to `http://hl7.org/fhir/concept-properties#parent` (or `#child`), then use those codes when scanning concept properties — matching the prod server's approach.

---

### [ ] `f2b2cef` Dev : missing valueset-unclosed extension and spurious expansion.total on incomplete expansions

Records-Impacted: 352
Tolerance-ID: expand-unclosed-extension-and-total
Record-ID: b6156665-797d-4483-971c-62c00a0816b8

#####What differs

For $expand operations that return incomplete/truncated expansions (e.g., SNOMED CT is-a queries requesting count=1000 from a set with 124,412 total codes):

1. **Prod includes `expansion.extension` with `valueset-unclosed: true`; dev omits it.** Per the FHIR R4 spec, this extension signals that an expansion is incomplete due to inclusion of post-coordinated or unbounded value sets. Prod correctly marks these expansions as unclosed; dev does not.

2. **Dev includes `expansion.total` (e.g., 124412); prod omits it.** The `total` field is optional (0..1) per spec. Prod omits it on these incomplete expansions; dev includes it. Since these expansions are truncated to the `count` parameter (e.g., 1000 codes returned), the behavioral difference is: dev tells the client the full count but doesn't signal incompleteness, while prod signals incompleteness but doesn't provide the full count.

These two differences frequently co-occur in the same records — most records where prod has `valueset-unclosed` but dev doesn't also have dev providing `total` while prod doesn't. However, some records show only the extension difference (both sides have null total), particularly when both sides hit the count limit and neither calculates a total.

#####How widespread

- **Round 2**: 292 records in the comparison dataset showed both patterns simultaneously. All were successful (200/200) $expand operations.
- **Round 3**: 60 records eliminated by the tolerance. Of these, 29 had only the extension difference (both sides total=null), and 32 had both extension + total differences. All are SNOMED CT filter expansions (is-a, descendent-of).

Total across rounds: ~352 records impacted.

#####Tolerances

- `expand-unclosed-extension-and-total`: Matches $expand records where prod has `valueset-unclosed` extension but dev doesn't. Normalizes by stripping the extension from prod's expansion and stripping dev's total when prod doesn't have one.

#####Representative record IDs

- `b6156665-797d-4483-971c-62c00a0816b8` (round 2): POST /r4/ValueSet/$expand — SNOMED CT is-a 404684003 (Clinical finding), count=1000
- `95392d8c-d8b0-4386-8b73-f50df7c71001` (round 3): POST /r4/ValueSet/$expand — SNOMED CT is-a 404684003 (Clinical finding), count=1000

#####Root Cause

**Classification**: code-level defect

**Prod** calls `cs.isNotClosed()` per-filter to check if the code system's expansion is unclosed:
[`library/ftx/fhir_valuesets.pas#L4028-L4029`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_valuesets.pas#L4028-L4029)
— After each filter is applied, calls `cs.isNotClosed(opContext, filter, f)`. For SNOMED CT, this unconditionally returns `true`:
[`library/ftx/ftx_sct_services.pas#L5354-L5357`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/ftx_sct_services.pas#L5354-L5357)

**Dev** uses a separate `filtersNotClosed()` method that SNOMED doesn't override:
[`tx/workers/expand.js#L816-L818`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/expand.js#L816-L818)
— Calls `cs.filtersNotClosed(prep)` after executing filters. The SNOMED provider (`tx/cs/cs-snomed.js`) does not override this method, so it inherits the base class default which returns `false`:
[`tx/cs/cs-api.js#L557`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/cs/cs-api.js#L557)

The consequence is that `notClosed` stays `false` for SNOMED filter expansions. This causes both symptoms: (1) the `valueset-unclosed` extension is not added (expand.js L1296-1297), and (2) `expansion.total` is set (expand.js L1308-1311) because the code falls into the else branch that only runs when `notClosed` is `false`.

**Fix**: Add `async filtersNotClosed() { return true; }` to the SNOMED provider class in `tx/cs/cs-snomed.js`, matching the existing `isNotClosed() { return true; }` at line 950.

#####Repro

```bash
curl -s https://tx.fhir.org/r4/ValueSet/\$expand \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
--data-binary @- << 'REQUEST'
{
"resourceType": "Parameters",
"parameter": [
  {
    "name": "count",
    "valueInteger": 1000
  },
  {
    "name": "offset",
    "valueInteger": 0
  },
  {
    "name": "valueSet",
    "resource": {
      "resourceType": "ValueSet",
      "status": "active",
      "compose": {
        "inactive": true,
        "include": [
          {
            "system": "http://snomed.info/sct",
            "filter": [
              {
                "property": "concept",
                "op": "is-a",
                "value": "404684003"
              }
            ]
          }
        ]
      }
    }
  }
]
}
REQUEST
```

Prod returns `expansion.extension` with `valueset-unclosed: true` and no `expansion.total`. Dev returns `expansion.total` (e.g. 124412) with no unclosed extension.

---

### [ ] `801aef1` Dev adds expression field on informational OperationOutcome issues where prod omits it

Records-Impacted: 6
Tolerance-ID: oo-extra-expression-on-info-issues
Record-ID: 9160e659-1af6-4bc6-9c89-e0a8b4df55cf

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?system=http%3A%2F%2Funitsofmeasure.org&code=TEST' \
-H 'Accept: application/fhir+json' | \
jq '.parameter[] | select(.name == "issues") | .resource.issue[] | select(.severity == "information") | {severity, code, expression}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?system=http%3A%2F%2Funitsofmeasure.org&code=TEST' \
-H 'Accept: application/fhir+json' | \
jq '.parameter[] | select(.name == "issues") | .resource.issue[] | select(.severity == "information") | {severity, code, expression}'
```

Prod returns `"expression": null` (field absent) on the informational issue, dev returns `"expression": ["code"]`.

#####What differs

In $validate-code responses, both prod and dev return OperationOutcome issues. On error-severity issues, both include `expression: ["code"]`. On information-severity issues, prod omits the `expression` field entirely while dev includes `expression: ["code"]`.

For example, on `GET /r4/CodeSystem/$validate-code?system=http%3A%2F%2Funitsofmeasure.org&code=TEST`:
- Prod: informational issue has no `expression` field
- Dev: informational issue has `"expression": ["code"]`

The `expression` value is semantically correct (the issue relates to the `code` parameter), so dev is providing more complete information, but the difference in field presence is a real behavioral divergence.

#####How widespread

6 records across the dataset exhibit this pattern:
- 4 SNOMED CT records (all `code=K29` variants on different FHIR version paths)
- 1 UCUM record (`code=TEST`)
- 1 SNOMED CT POST record (`code=freetext`)

All are `$validate-code` or `$batch-validate-code` operations where the code is invalid and the informational issue provides supplementary error context (e.g., UCUM parse error, SNOMED expression parse error).

Search: node script checking all 3948 delta records for issues where dev has `expression` and prod lacks it on the same positional issue.

#####What the tolerance covers

Tolerance `oo-extra-expression-on-info-issues` matches validate-code Parameters responses where any OperationOutcome information-severity issue in dev has `expression` that prod lacks. Normalizes by removing the extra `expression` from dev to match prod. Eliminates 6 records.

---

### [ ] `bd89513` Dev returns extra message/issues for display language resolution on validate-code result=true

Records-Impacted: 718+
Tolerance-ID: dev-extra-display-lang-not-found-message, prod-display-comment-default-display-lang, display-comment-vs-invalid-display-issues, display-lang-invalid-display-different-coding, display-lang-result-disagrees, display-lang-prod-only-invalid-display, dev-message-appends-display-lang-text
Record-ID: 299d1b7f-b8f7-4cee-95ab-fa83da75ea80, c9f3b468-dc3d-47f5-a305-0346bf5b4cab, 92e9d6ed-f142-49e9-9bf1-3451af87c593, 71ec4cbd-849a-447d-94a4-5ed9565baf20, 1b420213-1e39-4839-96e8-77cc1f98ca44, aa3b6190-20cb-4f12-b46c-e3547d5b55f3, ee67e8d5-293d-45c5-9198-d47a49d47757, 4075d0b1-054d-4e61-b929-b6a67528cb8f

#####What differs

When $validate-code is called with a `displayLanguage` parameter, dev handles "no valid display names found for the requested language" differently from prod. The root cause is that dev does not pass `defLang` to `hasDisplay` in the `checkDisplays` method, making display validation stricter than prod. This manifests in seven variants:

**Variant 1 — extra message/issues (dev-extra-display-lang-not-found-message):** Both servers agree result=true. Prod omits message/issues entirely. Dev returns extra `message` ("There are no valid display names found for the code ...") and `issues` (OperationOutcome with informational severity, tx-issue-type=`invalid-display`). Affected systems: SNOMED, ISO 3166, M49 regions.

**Variant 2 — display-comment vs no issues (prod-display-comment-default-display-lang, 372 records):** Both agree result=true. Prod returns `issues` with tx-issue-type=`display-comment` ("X is the default display; the code system has no Display Names for the language Y"). Dev either had its issues stripped by dev-extra-display-lang-not-found-message or never had issues. After existing tolerances run, prod's display-comment issue is the only remaining difference.

**Variant 3 — display-comment vs invalid-display (display-comment-vs-invalid-display-issues, 153 records):** Both agree result=true. Prod has a `display-comment` issue (information severity) and possibly other issues. Dev has `invalid-display` issue (warning severity) instead. After stripping the display-comment from prod and corresponding extra invalid-display from dev, the remaining issues match. Includes 21 records where dev also has an extra `message` about "Wrong Display Name ... Valid display is ..." that prod lacks.

**Variant 4 — result-disagrees (display-lang-result-disagrees):** Prod returns result=true. Dev returns result=false with "Wrong Display Name" error. When the provided display doesn't exactly match the default display AND no language-specific displays exist, dev rejects it while prod accepts via default language fallback. Most severe manifestation.

**Variant 5 — invalid-display on different codings (display-lang-invalid-display-different-coding, 94 records):** Both agree result=true, both have same number of issues after earlier tolerances strip display-comment. But the remaining `invalid-display` issues reference different codings — prod flags one coding (e.g., LOINC at coding[1]) while dev flags a different one (e.g., SNOMED at coding[0]). The issues also differ in severity (warning vs information). The non-invalid-display issues (status-check, etc.) are identical. This is a multi-coding CodeableConcept pattern where displayLanguage causes each server to flag a different coding for the display warning. Tolerance normalizes dev's invalid-display issues to prod's text, expression, and severity.

**Variant 6 — prod-only invalid-display with lenient-display-validation (display-lang-prod-only-invalid-display, 98 records):** When `mode=lenient-display-validation` is used with `displayLanguage`, prod generates `invalid-display` warning issues (severity=warning, 106 records; severity=information, 8 records) about "Wrong Display Name" or "There are no valid display names found". Dev omits these invalid-display issues entirely. Both servers agree on `result`. The only diffs are the missing `invalid-display` issue(s) and the corresponding `message` parameter. All 114 records in the full dataset match this pattern (98 eliminated by the tolerance, 16 remain because they also have result-disagrees as a separate primary issue). Affected code systems: LOINC, SNOMED, ISO 11073, UCUM, and others.

**Variant 7 — dev appends display-lang text to existing message (dev-message-appends-display-lang-text, 1 record in deltas, 13 in full comparison):** Both servers agree result=true and have matching OperationOutcome issues (after earlier tolerances). Both have a `message` parameter with the same base text (e.g., inactive concept warning). But dev appends extra display-language text ("; There are no valid display names found for the code ...") to the message. Prod's message contains only the non-display-language issue texts. The OperationOutcome issues for the display-language difference are already handled by `display-comment-vs-invalid-display-issues`, but the message parameter still carries the extra text.

#####How widespread

718+ records across round 3, affecting validate-code operations with `displayLanguage` parameter across multiple code systems (SNOMED, LOINC, ISO 3166, M49 regions, UCUM, ISO 11073).

#####Tolerances

- `dev-extra-display-lang-not-found-message`: Matches validate-code where result=true on both sides, prod has no message, dev has message containing "no valid display names found". Strips dev's extra message/issues.
- `prod-display-comment-default-display-lang`: Matches when prod has display-comment issues about "is the default display" and dev has no issues (after earlier tolerances ran). Strips prod's display-comment issues. Eliminates 372 records.
- `display-comment-vs-invalid-display-issues`: Matches when prod has display-comment issues and dev also has issues (not yet stripped). Strips display-comment from prod, strips extra dev-only invalid-display issues, and strips dev's extra wrong-display-name message. Eliminates 153 records.
- `display-lang-invalid-display-different-coding`: Matches when both sides have same number of issues but invalid-display issues differ in text/expression/severity (referencing different codings). Normalizes dev's invalid-display issues to prod's text, expression, and severity. Eliminates 94 records (previously 78, increased by 16 after adding severity normalization).
- `display-lang-result-disagrees`: Matches when prod result=true, dev result=false, and dev's message contains "Wrong Display Name" + "no valid display names found". Normalizes dev's result to true and strips error message/issues.
- `display-lang-prod-only-invalid-display`: Matches when prod has invalid-display issues that dev lacks entirely. All affected records use lenient-display-validation mode with displayLanguage. Strips prod-only invalid-display issues and corresponding message parameter. Eliminates 98 records.
- `dev-message-appends-display-lang-text`: Matches when both sides have a message, dev's message starts with prod's message, and the extra appended text contains "no valid display names found". Normalizes dev's message to match prod's. Eliminates 1 record in deltas (13 in full comparison, 12 handled by earlier tolerances).

#####Repro

```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"urn:iso:std:iso:3166","code":"FR","display":"France"}]}},{"name":"displayLanguage","valueCode":"fr"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"jurisdiction","url":"http://hl7.org/fhir/ValueSet/jurisdiction","version":"4.0.1","compose":{"include":[{"system":"urn:iso:std:iso:3166"},{"system":"urn:iso:std:iso:3166:-2"},{"system":"http://unstats.un.org/unsd/methods/m49/m49.htm","filter":[{"property":"class","op":"=","value":"region"}]}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"urn:iso:std:iso:3166","code":"FR","display":"France"}]}},{"name":"displayLanguage","valueCode":"fr"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"jurisdiction","url":"http://hl7.org/fhir/ValueSet/jurisdiction","version":"4.0.1","compose":{"include":[{"system":"urn:iso:std:iso:3166"},{"system":"urn:iso:std:iso:3166:-2"},{"system":"http://unstats.un.org/unsd/methods/m49/m49.htm","filter":[{"property":"class","op":"=","value":"region"}]}]}}}]}'
```

#####Root Cause

**Classification**: code-level defect

**Prod** passes `defLang` to `hasDisplay` when checking whether the provided display matches known designations, so default-language displays count as a match and the display warning block is skipped entirely:
[`library/ftx/fhir_valuesets.pas#L1768`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_valuesets.pas#L1768)
— `list.hasDisplay(FParams.workingLanguages, defLang, c.display, ...)` finds "France" via the default language fallback, so no display error is generated.

**Dev** passes `null` instead of `defLang` to `hasDisplay` in the `checkDisplays` method, so default-language displays are not considered a match. This causes the code to enter the display-not-found path and emit the `NO_VALID_DISPLAY_FOUND_NONE_FOR_LANG_OK` informational message:
[`tx/workers/validate.js#L1343`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/validate.js#L1343)
— `list.hasDisplay(this.params.workingLanguages(), null, c.display, ...)` does not find "France" because `_langsMatch` skips the default-language shortcut when `defLang` is `null`:
[`tx/library/designations.js#L778-L781`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/library/designations.js#L778-L781)

**Fix**: In `checkDisplays` at `tx/workers/validate.js` line 1343, change the second argument of `list.hasDisplay(...)` from `null` to `defLang` (which is already passed as a parameter to `checkDisplays`), matching what prod does at `fhir_valuesets.pas` line 1768.

---

### [ ] `b6d19d8` Dev omits system/code/version/display params on CodeSystem/$validate-code with codeableConcept containing unknown system

Records-Impacted: 171
Tolerance-ID: cc-validate-code-missing-known-coding-params, validate-code-xcaused-unknown-system-disagree
Record-ID: 84b0cee7-5f7e-4fbc-af8a-aed5ad7a91d4, 2e1dab4e-07c3-4a29-8bab-983289ba6a7d

#####Repro

```bash
curl -s 'https://tx.fhir.org/r5/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"https://fhir.smartypower.app/CodeSystem/smartypower-cognitive-tests","code":"SP-QUICKSTOP","display":"QuickStop Response Inhibition Test"},{"system":"http://loinc.org","code":"72106-8","display":"Cognitive functioning [Interpretation]"}],"text":"Go/No-Go task measuring response inhibition and impulse control"}},{"name":"displayLanguage","valueString":"en"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r5/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"https://fhir.smartypower.app/CodeSystem/smartypower-cognitive-tests","code":"SP-QUICKSTOP","display":"QuickStop Response Inhibition Test"},{"system":"http://loinc.org","code":"72106-8","display":"Cognitive functioning [Interpretation]"}],"text":"Go/No-Go task measuring response inhibition and impulse control"}},{"name":"displayLanguage","valueString":"en"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

#####What differs

When `$validate-code` is called with a CodeableConcept containing multiple codings and `result=false` on both sides, prod returns system/code/display params for the known coding while dev omits them. Additionally, when both sides disagree on which system is unknown, all downstream params (code, display, system, version, message, issues) diverge.

Three sub-patterns:

**Pattern 1: Same unknown system, dev omits known-coding params (155 records, tolerance `cc-validate-code-missing-known-coding-params`)**

When the CodeableConcept contains one coding with an unknown system version and one coding from a known system (LOINC in 140 cases, SNOMED in 15), and both sides agree on the same `x-caused-by-unknown-system` value:
- Prod validates the known coding and returns `system`, `code`, `display` params for it, plus any related informational OperationOutcome issues (e.g., display-language warnings)
- Dev only returns `result=false` with the unknown-system error, omitting `system`/`code`/`display` params and the informational issues for the known coding entirely

All 155 records are POST `/r4/CodeSystem/$validate-code` (153 records) or `/r5/CodeSystem/$validate-code` (2 records). All involve multi-coding CodeableConcepts where one SNOMED CT edition version is unavailable on the server.

**Pattern 2: Dev omits known-coding params with truly unknown system (5 records, also in tolerance `cc-validate-code-missing-known-coding-params`)**

Same as Pattern 1, but the unknown system is a completely unrecognized CodeSystem URI (e.g., smartypower-cognitive-tests, el-observation-code-cs) rather than an unavailable version of a known system.

**Pattern 3: x-caused-by-unknown-system disagrees (11 records, tolerance `validate-code-xcaused-unknown-system-disagree`)**

When both sides encounter unknown system versions, they disagree on *which* system to report as unknown. Sub-patterns include LOINC/SNOMED version skew, missing x-caused-by-unknown-system, Cerner/RxNorm disagreements, and b-zion count mismatches.

#####Tolerance details

- `cc-validate-code-missing-known-coding-params`: Matches validate-code with result=false, same x-caused-by-unknown-system on both sides, where prod has code/system params that dev lacks. Normalizes by copying prod's code/system/display params and issues to dev. Eliminates 155 records (round 3) + 5 records (round 2, Pattern 2).
- `validate-code-xcaused-unknown-system-disagree`: Matches validate-code, both result=false, where x-caused-by-unknown-system values differ between sides. Normalizes by replacing dev's error-related params with prod's values. Eliminates 11 records. (round 3)

Total: 171 records impacted across both tolerances.

#####Representative records

- 2e1dab4e-07c3-4a29-8bab-983289ba6a7d (Pattern 1: LOINC + SNOMED unknown version, /r4)
- 84b0cee7-5f7e-4fbc-af8a-aed5ad7a91d4 (Pattern 2: LOINC + smartypower, /r5)
- 6f70f14a-81e1-427e-9eed-1b2c53801296 (Pattern 2: SNOMED + essilorluxottica, /r4)
- ebda357c-2153-47cc-800c-61aac44fedb2 (Pattern 3: LOINC/SNOMED version skew, /r4)
- 64d09ecc-5a88-4173-889c-2cd0681a59fc (Pattern 3: b-zion count mismatch, /r4)

---

### [ ] `2ed80bd` Dev  omits expansion.total when prod includes it

Records-Impacted: 51
Tolerance-ID: expand-dev-missing-total
Record-ID: a1f653a2-a199-4228-a7f7-2522abde6953

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' -H 'Accept: application/fhir+json' -H 'Content-Type: application/fhir+json' -d '{"resourceType":"Parameters","parameter":[{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/11000315107"},{"name":"displayLanguage","valueCode":"fr"},{"name":"includeDefinition","valueBoolean":false},{"name":"excludeNested","valueBoolean":true},{"name":"cache-id","valueId":"4d94febc-fb6a-407d-a69c-29b8de3c56c3"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"urn:iso:std:iso:3166:-2"}]}}}]}' | jq '.expansion | {total, contains_count: (.contains | length)}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' -H 'Accept: application/fhir+json' -H 'Content-Type: application/fhir+json' -d '{"resourceType":"Parameters","parameter":[{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/11000315107"},{"name":"displayLanguage","valueCode":"fr"},{"name":"includeDefinition","valueBoolean":false},{"name":"excludeNested","valueBoolean":true},{"name":"cache-id","valueId":"4d94febc-fb6a-407d-a69c-29b8de3c56c3"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"urn:iso:std:iso:3166:-2"}]}}}]}' | jq '.expansion | {total, contains_count: (.contains | length)}'
```

Prod returns `"total": 5099` with 1000 contains entries. Dev returns `"total": null` (field missing) with 1000 contains entries.

#####What differs

In $expand responses, prod returns `expansion.total` (the total count of matching concepts) while dev omits it entirely. The `total` field is a 0..1 optional integer in FHIR R4's ValueSet.expansion, documented as "Total concept count; permits server pagination." Without it, clients cannot determine how many pages exist in a paged expansion.

Examples:
- Prod: `"total": 5099` with 1000 contains (paged)
- Dev: no `total` field, same 1000 contains

Both servers return identical `contains` arrays and `offset` values in all sampled records.

#####How widespread

51 total records across round-2 (47 records) and round-3 (7 records, of which 4 eliminated as sole remaining diff after other tolerances). Affects both R4 and R5 endpoints. Systems affected:
- `urn:iso:std:iso:3166:-2` (ISO 3166-2 country subdivision codes, total=5099)
- `http://unitsofmeasure.org` (UCUM, total=1364)
- `urn:ietf:bcp:47` (BCP-47 language tags, total=0)

#####What the tolerance covers

Tolerance ID: `expand-dev-missing-total`
Matches: Any $expand response (ValueSet resourceType) where prod has `expansion.total` and dev does not.
Normalizes by removing `expansion.total` from prod to prevent re-triaging.

Representative Record IDs:
- Round 2: `a1f653a2-a199-4228-a7f7-2522abde6953`
- Round 3: `cd702b5d-dd1e-407b-9d13-21b62460773b`

---

### [ ] `c7004d3` Dev omits valueset-toocostly extension and adds spurious used-codesystem on  for grammar-based code systems

Records-Impacted: 22
Tolerance-ID: expand-toocostly-extension-and-used-codesystem
Record-ID: a272aa8c-96d7-4905-a75a-ea21d67b83fc

#####Repro

```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/mimetypes","compose":{"include":[{"system":"urn:ietf:bcp:13"}]}}}]}' \
| jq '.expansion.extension, [.expansion.parameter[] | select(.name == "used-codesystem")]'
```

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/mimetypes","compose":{"include":[{"system":"urn:ietf:bcp:13"}]}}}]}' \
| jq '.expansion.extension, [.expansion.parameter[] | select(.name == "used-codesystem")]'
```

Prod returns `expansion.extension` with `valueset-toocostly: true`, dev returns `null`. Dev includes `used-codesystem: urn:ietf:bcp:13` in parameters, prod does not.

#####What differs

For $expand on grammar-based code systems (primarily BCP-13 MIME types via `urn:ietf:bcp:13`, plus all-languages), both prod and dev return 200 with an empty expansion (total=0, no `contains`). However:

1. **Prod includes `expansion.extension` with `valueset-toocostly: true`; dev omits it.** This extension signals that the expansion could not be performed because the code system is grammar-based or too costly to enumerate. Prod correctly marks these expansions; dev does not.

2. **Dev includes `expansion.parameter` with `used-codesystem` (e.g., `urn:ietf:bcp:13`); prod omits it.** Dev reports which code system it consulted, even though the expansion returned no results. Prod does not report a used-codesystem on these too-costly expansions.

Both differences always co-occur in the same records.

#####How widespread

- **Round 2**: 13 records (12 mimetypes, 1 Brazilian ValueSet)
- **Round 3**: 9 records (all mimetypes via `urn:ietf:bcp:13`)
- Total: ~22 records across both rounds
- All are $expand operations with both sides returning 200 and expansion total=0
- Both /r4/ and /r5/ FHIR versions affected

#####Tolerances

- `expand-toocostly-extension-and-used-codesystem` — matches $expand where both return 200, prod has `valueset-toocostly` extension but dev doesn't. Normalizes by stripping the toocostly extension from prod and any dev-only `used-codesystem` parameters.

#####Representative records

- `a272aa8c-96d7-4905-a75a-ea21d67b83fc` — POST /r4/ValueSet/$expand, mimetypes (round-2)
- `b3b6b035-dd81-463b-a210-d9cdd67e0250` — POST /r4/ValueSet/$expand, mimetypes (round-3)

---

### [ ] `3103b01` Dev returns extra informational HGVS syntax issue in $validate-code for varnomen.hgvs.org

Records-Impacted: 62
Tolerance-ID: hgvs-extra-syntax-issue
Record-ID: cdf72565-a646-4daa-86f9-ed5ead0058d6


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://varnomen.hgvs.org","code":"NC_000003.11"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://varnomen.hgvs.org","code":"NC_000003.11"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

Prod returns 1 OperationOutcome issue (error-level only), dev returns 2 issues (error-level plus an additional informational-level issue with text: "Error while processing 'NC_000003.11': Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'.")


For $validate-code operations against http://varnomen.hgvs.org, both prod and dev correctly return result=false for invalid HGVS codes. Both return the same error-level OperationOutcome issue ("Unknown code 'X' in the CodeSystem 'http://varnomen.hgvs.org' version '2.0'").

However, dev returns an additional informational-level OperationOutcome issue that prod does not:

- severity: "information"
- code: "code-invalid"
- text: "Error while processing '<code>': Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'."

This appears to be HGVS-specific syntax validation feedback that dev performs but prod does not.


62 records in content-differs category show this exact pattern. All involve $validate-code POST to /r4/CodeSystem/$validate-code? with system http://varnomen.hgvs.org. All have the same extra informational issue text pattern ("Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'").

Search: grep -c "Missing one of" results/deltas/deltas.ndjson => 62


Tolerance ID: hgvs-extra-syntax-issue. Matches $validate-code records for http://varnomen.hgvs.org where dev has more OperationOutcome issues than prod, and the extra issues are informational-level. Normalizes by trimming dev's issue list to match prod's length. Eliminates 62 records.


cdf72565-a646-4daa-86f9-ed5ead0058d6

#####Root Cause

**Classification**: code-level defect

**Dev** adds an extra informational issue from the `locate()` message when a code is not found:
[`tx/workers/validate.js#L1506-L1508`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/validate.js#L1506-L1508)
— In `checkConceptSet`, after adding the `Unknown_Code_in_Version` error, dev checks `if (loc.message && op)` and adds an informational issue with the message returned by the HGVS provider's `locate()` method.

**Dev HGVS provider** passes the NLM service error message through as `loc.message`:
[`tx/cs/cs-hgvs.js#L111-L115`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/cs/cs-hgvs.js#L111-L115)
— When the NLM `$validate-code` returns `result=false`, the HGVS syntax error message (e.g., "Missing one of 'c', 'g', 'm', 'n', 'p', 'r' followed by '.'") is returned as `{ context: null, message: result.message }`.

**Prod** does not add informational issues from the `locate()` message:
[`library/ftx/fhir_valuesets.pas#L2273-L2281`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_valuesets.pas#L2273-L2281)
— In `checkConceptSet`, when `loc = nil`, prod only adds the `Unknown_Code_in_Version` error issue. There is no code to emit the `message` var as an additional informational issue. (Additionally, the prod HGVS `locate` at [`server/tx/tx_hgvs.pas#L252-L253`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/server/tx/tx_hgvs.pas#L252-L253) reads `o.str['message']` instead of `o.str['valueString']`, so the NLM error message is never captured regardless.)

**Fix**: Remove the informational issue emission in `tx/workers/validate.js` lines 1506-1508, or gate it behind a condition that matches prod behavior. The `loc.message` from `locate()` should not be surfaced as a separate OperationOutcome issue since prod does not emit it.

---

### [ ] `36da928` Dev returns 404 for SNOMED CT implicit ValueSet  (fhir_vs URLs)

Records-Impacted: 36
Tolerance-ID: snomed-implicit-valueset-expand-404
Record-ID: 871b3f66-9e31-4b6c-9774-adb378e935df

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fsnomed.info%2Fsct%3Ffhir_vs&filter=diabetes&count=5' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fsnomed.info%2Fsct%3Ffhir_vs&filter=diabetes&count=5' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 200 with a valid ValueSet expansion containing 5 SNOMED CT concepts matching "diabetes". Dev returns HTTP 404 with OperationOutcome: `"ValueSet not found: http://snomed.info/sct?fhir_vs"`.

#####What differs

When expanding SNOMED CT implicit ValueSets using the standard `fhir_vs` URL pattern, prod returns 200 with a valid ValueSet expansion, while dev returns 404 with OperationOutcome "ValueSet not found: http://snomed.info/sct?fhir_vs".

This affects all SNOMED CT implicit ValueSet URLs:
- `http://snomed.info/sct?fhir_vs` (all of SNOMED CT)
- `http://snomed.info/sct?fhir_vs=isa/<sctid>` (descendants of a concept)

These are FHIR-standard implicit ValueSet URLs defined in the SNOMED CT FHIR usage guide. A terminology server must recognize these URL patterns and synthesize the corresponding ValueSet rather than looking for a stored resource.

#####How widespread

36 records in the delta file show this pattern. All are `missing-resource` category, `expand` operation. All have prod=200, dev=404.

```
grep -c 'fhir_vs' jobs/2026-02-round-2/results/deltas/deltas.ndjson
####→ 36
```

The pattern is predicted by the URL containing `fhir_vs` combined with the $expand operation. Both /r4/ and /r5/ FHIR version prefixes are affected. Various filter and count parameters are used across the records but all fail the same way.

176 total records in comparison.ndjson contain `fhir_vs`; the other 140 are already handled (matched OK or skipped by existing tolerances).

#####What the tolerance covers

Tolerance `snomed-implicit-valueset-expand-404` matches records where:
- The URL contains `fhir_vs`
- Dev returns status 404
- Prod returns status 200

It skips these records entirely since no meaningful comparison is possible (dev doesn't return FHIR content). Eliminates 36 delta records.

#####Representative record

`871b3f66-9e31-4b6c-9774-adb378e935df` — GET /r4/ValueSet/$expand?url=http%3A%2F%2Fsnomed.info%2Fsct%3Ffhir_vs&filter=diabetes&count=5

---

### [ ] `e02b03e` Prod HGVS timeout: 62 records have prod=500 due to external service timeout, comparison invalid

Records-Impacted: 62
Tolerance-ID: skip-prod-hgvs-timeout
Record-ID: 286d30a9-e2b8-4967-8c56-265b3f6160a6


```bash
curl -s https://tx.fhir.org/r4/CodeSystem/'$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://varnomen.hgvs.org","code":"BRCA1:c.3143delG p.(Gly1048ValfsTer14)"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"cache-id","valueId":"7743c2e6-5b90-4b62-bcd2-6695b993e76b"},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/83821000000107"},{"name":"diagnostics","valueBoolean":true}]}'

curl -s https://tx-dev.fhir.org/r4/CodeSystem/'$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://varnomen.hgvs.org","code":"BRCA1:c.3143delG p.(Gly1048ValfsTer14)"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"cache-id","valueId":"7743c2e6-5b90-4b62-bcd2-6695b993e76b"},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/83821000000107"},{"name":"diagnostics","valueBoolean":true}]}'
```

Prod returns HTTP 500 with OperationOutcome: "Error parsing HGVS response: Read timed out." Dev returns HTTP 200 with Parameters: result=false, indicating the HGVS code is unknown.


Prod returns HTTP 500 with an OperationOutcome error: "Error parsing HGVS response: Read timed out." Dev returns HTTP 200 with a proper Parameters response (result=false, code not found in http://varnomen.hgvs.org version 2.0).

Prod's 500 is a transient failure — the prod server timed out calling an external HGVS validation service during data collection. Dev processes the same code locally and returns a valid terminology response.


62 records in the comparison dataset. All share:
- System: http://varnomen.hgvs.org
- Operation: $validate-code (POST /r4/CodeSystem/$validate-code?)
- Status: prod=500, dev=200
- Category: status-mismatch
- Prod body contains "Error parsing HGVS response: Read timed out."

Search: `grep -c 'Read timed out' results/deltas/deltas.ndjson` → 62

There are 124 total HGVS records in the dataset; the other 62 did not timeout and have prod=200, dev=200.


Tolerance `skip-prod-hgvs-timeout` skips any record where prod returned 500 and the prod body contains "Read timed out". These records have unreliable comparison data since prod failed to complete the operation. Eliminates 62 records.


286d30a9-e2b8-4967-8c56-265b3f6160a6

This is a data collection artifact — the comparison data is tainted because prod experienced transient external service timeouts during the collection run. These records should be recollected in a future run.

---

### [ ] `80ce6b2` Dev message parameter omits issue texts when validating CodeableConcept with multiple coding errors

Records-Impacted: 10
Tolerance-ID: message-concat-selective-issues
Record-ID: c350392e-d535-45e3-83cf-924b05e26a14

#####Repro

```bash
####Prod
cat > /tmp/repro-request.json << 'EOF'
{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"https://fhir.nwgenomics.nhs.uk/CodeSystem/GenomicClinicalIndication","code":"R210","display":"Inherited MMR deficiency (Lynch syndrome)"},{"system":"http://snomed.info/sct","code":"1365861003","display":"Lynch syndrome gene mutation detected"}],"text":"Inherited MMR deficiency (Lynch syndrome)"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"tx-resource","resource":{"resourceType":"CodeSystem","id":"GenomicClinicalIndication","url":"https://fhir.nwgenomics.nhs.uk/CodeSystem/GenomicClinicalIndication","version":"0.1.0","name":"GenomicClinicalIndication","title":"NHS England Genomic Clinical Indication Code","status":"draft","experimental":false,"date":"2025-05-08","publisher":"NHS North West Genomics","contact":[{"telecom":[{"system":"url","value":"https://www.nwgenomics.nhs.uk/contact-us"}]}],"description":"1st level Genomic Test Directory Codes","jurisdiction":[{"coding":[{"system":"urn:iso:std:iso:3166","code":"GB","display":"United Kingdom of Great Britain and Northern Ireland"}]}],"caseSensitive":true,"content":"fragment","concept":[{"code":"R240","display":"Diagnostic testing for known mutation(s)"},{"code":"R361","display":"Childhood onset hereditary spastic paraplegia"},{"code":"R362","display":"Not present in 8.0"},{"code":"R372","display":"Newborn screening for sickle cell disease in a transfused baby"},{"code":"R93","display":"Sickle cell, thalassaemia and other haemoglobinopathies"},{"code":"R94","display":"Not present in 8.0"},{"code":"R413","display":"Autoinflammatory Disorders"},{"code":"R67","display":"Monogenic hearing loss"},{"code":"R141","display":"Monogenic diabetes"},{"code":"R142","display":"Glucokinase-related fasting hyperglycaemia"},{"code":"R201","display":"Atypical haemolytic uraemic syndrome"},{"code":"M9","display":"Thyroid Papillary Carcinoma - Adult"},{"code":"M215","display":"Endometrial Cancer"}]}},{"name":"cache-id","valueId":"7743c2e6-5b90-4b62-bcd2-6695b993e76b"},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/83821000000107"},{"name":"diagnostics","valueBoolean":true}]}
EOF

cat /tmp/repro-request.json | curl -s https://tx.fhir.org/r4/CodeSystem/\$validate-code \
-X POST --header 'Content-Type: application/json' --header 'Accept: application/json' \
--data-binary @- | jq -r '.parameter[] | select(.name == "message") | .valueString'

####Dev
cat /tmp/repro-request.json | curl -s https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code \
-X POST --header 'Content-Type: application/json' --header 'Accept: application/json' \
--data-binary @- | jq -r '.parameter[] | select(.name == "message") | .valueString'
```

Prod returns: `Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/83821000000107/version/20230412' (UK Edition); Unknown Code 'R210' in the CodeSystem 'https://fhir.nwgenomics.nhs.uk/CodeSystem/GenomicClinicalIndication' version '0.1.0' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment`

Dev returns: `Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/83821000000107/version/20230412' (UK Edition)`

Dev omits the second error message about the GenomicClinicalIndication code R210.

#####What differs

When $validate-code is called on a CodeableConcept containing multiple codings that each fail validation, the `message` output parameter should concatenate all error/warning issue texts with "; ". Prod does this correctly. Dev only includes one of the error texts in the message, omitting the others.

For example, with a CodeableConcept containing two codings (GenomicClinicalIndication#R210 and SNOMED#1365861003), both invalid:
- **Prod message**: "Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct'...; Unknown Code 'R210' in the CodeSystem 'https://fhir.nwgenomics.nhs.uk/CodeSystem/GenomicClinicalIndication'..."
- **Dev message**: "Unknown code '1365861003' in the CodeSystem 'http://snomed.info/sct'..."

Dev omits the second error about the GenomicClinicalIndication code. The structured OperationOutcome `issues` resource is identical between prod and dev (both have all 3 issues). Only the `message` parameter text is incomplete.

#####How widespread

10 delta records, all POST /r4/CodeSystem/$validate-code, all validating the same GenomicClinicalIndication CodeableConcept with SNOMED coding. Identified by searching for records where the only diff is `message` value-differs and prod's message contains more semicolon-separated segments than dev's.

This is a variant of the same underlying bug as tolerance `message-concat-missing-issues` (which handles a different set of 8 records where prod message = all issue texts joined, dev message = first issue text only). The root cause is the same: dev doesn't properly concatenate all relevant issue texts into the message parameter.

#####What the tolerance covers

Tolerance `message-concat-selective-issues` matches validate-code records where:
- Both sides have identical OperationOutcome issues
- Messages differ
- Dev's message is a proper substring of prod's message (prod includes more issue texts)

Canonicalizes dev's message to prod's value. Eliminates 10 records.

---

### [ ] `b36a12b` validate-code: unknown version message says 'no versions known' when valid versions exist

Records-Impacted: 50
Tolerance-ID: unknown-version-no-versions-known
Record-ID: f8badb02-7ec3-4624-a906-eec8ec9f5656


```bash
curl -s https://tx.fhir.org/r4/CodeSystem/\$validate-code \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"https://fhir.nhs.uk/CodeSystem/England-GenomicTestDirectory","version":"9","code":"M119.5","display":"Multi Target NGS Panel Small"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"https://fhir.nhs.uk/CodeSystem/England-GenomicTestDirectory","version":"9","code":"M119.5","display":"Multi Target NGS Panel Small"}},{"name":"displayLanguage","valueString":"en-GB"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

**Repro inconclusive**: As of 2026-02-07, both servers now return "No versions of this code system are known". The England-GenomicTestDirectory CodeSystem appears to no longer be loaded on either server (tested versions 9, 7, and 0.1.0 all fail). The bug was real at the time of comparison (prod listed "Valid versions: 0.1.0" while dev said no versions known), but cannot be verified against the current live servers because the test CodeSystem is unavailable.


When validating a code against a CodeSystem with a version that doesn't exist, but other versions of the CodeSystem are known:

- **Prod** returns: "A definition for CodeSystem '...' version 'X' could not be found, so the code cannot be validated. Valid versions: 0.1.0"
- **Dev** returns: "A definition for CodeSystem '...' version 'X' could not be found, so the code cannot be validated. No versions of this code system are known"

Additionally, the `x-caused-by-unknown-system` parameter differs:
- **Prod**: includes the version suffix (e.g., `...England-GenomicTestDirectory|9`)
- **Dev**: omits the version suffix (e.g., `...England-GenomicTestDirectory`)

The OperationOutcome message-id also differs:
- **Prod**: `UNKNOWN_CODESYSTEM_VERSION`
- **Dev**: `UNKNOWN_CODESYSTEM_VERSION_NONE`

Dev's message is factually incorrect — it claims "No versions of this code system are known" but it does know version 0.1.0 (proven by 40 other records for the same code system that validate successfully against version 0.1.0).


All 50 impacted records are $validate-code operations against `https://fhir.nhs.uk/CodeSystem/England-GenomicTestDirectory` with requested versions 7 (40 records) or 9 (10 records). Neither version exists — only 0.1.0 is valid.

Search: `grep 'No versions of this code system are known' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l` → 50
All 50 are for England-GenomicTestDirectory. All 50 also have "Valid versions:" in prod.

The pattern may apply more broadly to any CodeSystem where a nonexistent version is requested but other versions are loaded.


Tolerance `unknown-version-no-versions-known` normalizes the message text, OperationOutcome details, x-caused-by-unknown-system, and message-id for records matching this pattern: both result=false, prod message contains "Valid versions:", dev message contains "No versions of this code system are known". Eliminates 50 records.

---

### [x] `9fd2328` Dev loads older SNOMED CT edition (20240201) than prod (20250201), causing  to return different code sets

Records-Impacted: 82
Tolerance-ID: expand-snomed-version-skew-content, expand-snomed-version-skew-content-no-used-cs, snomed-version-skew-message-text
Record-ID: 2c7143df-3316-422a-b284-237f16fbcd6e, accdb602-a8bc-4e9c-a8fb-22a12b740f0e, 3534e5f0-39e3-4375-9b37-4dc59848cb70

#####What differs

Prod and dev load different SNOMED CT editions, causing multiple types of differences across $expand and $validate-code operations. Three variants observed:

1. **$expand with `used-codesystem` parameter** (POST requests with inline ValueSets): Prod uses SNOMED International edition 20250201, dev uses 20240201. The `used-codesystem` expansion parameter confirms the version difference. Example: expanding descendants of 365636006 "Finding of blood group" — prod returns 208 codes, dev returns 207 (code 1351894008 "Mixed field RhD" only in prod).

2. **$expand without `used-codesystem` parameter** (GET requests for VSAC ValueSets): Prod uses SNOMED US edition 20250901, dev uses 20250301. Version difference is only visible in `contains[].version` strings. Example: ValueSet 2.16.840.1.113762.1.4.1240.3 ("Sex") — dev returns 5 codes including 184115007 "Patient sex unknown (finding)" which is absent from prod's 4-code expansion.

3. **$validate-code message/issues text version skew**: Both sides agree on result=false, but the error message text and OperationOutcome issue text contain different SNOMED edition version strings (e.g., "version 'http://snomed.info/sct/900000000000207008/version/20250201'" in prod vs "version/20240201" in dev). The message structure and content are otherwise identical — only the embedded version URI differs. All are POST /r4/ValueSet/$validate-code with SNOMED codes that are not found in the specified ValueSet.

#####How widespread

82 records total:
- 40 expand records with `used-codesystem` parameter (POST /r4/ValueSet/$expand with SNOMED filters)
- 7 expand records without `used-codesystem` parameter (GET /r4/ValueSet/$expand for VSAC ValueSet 2.16.840.1.113762.1.4.1240.3)
- 35 validate-code content-differs records where message/issues text contain SNOMED version strings that differ only due to edition version skew

#####What the tolerances cover

- **`expand-snomed-version-skew-content`** (40 records): Matches expand records where both sides return 200, SNOMED `used-codesystem` versions differ, and code membership differs. Normalizes both sides to the intersection of codes and adjusts total.

- **`expand-snomed-version-skew-content-no-used-cs`** (7 records): Matches expand records where SNOMED version skew is detectable only from `contains[].version` strings (no `used-codesystem` expansion parameter). Same normalization approach — intersects code membership, adjusts total, and normalizes version strings to prod's values.

- **`snomed-version-skew-message-text`** (35 records): Matches validate-code Parameters responses where SNOMED version strings in the `message` valueString and `issues` OperationOutcome issue text differ, but the text is otherwise identical after version normalization. Replaces dev's SNOMED version URIs with prod's values in both the message parameter and issue detail text fields.


92f4d02 #1 Claude (AI Assistant) <>

Closing as won't-fix. SNOMED edition version skew is by design. Round-1 precedent: 5b3ae71 adjudicated by GG as 'By design — added an old version to better support VSAC'. Covered by unified version-skew equiv-autofix tolerance.

---

### [ ] `f33161f` Dev returns 400 error instead of 200 toocostly expansion for grammar-based code systems

Records-Impacted: 12
Tolerance-ID: expand-toocostly-grammar-400
Record-ID: 4a993d89-3f8b-444d-9a63-e95c6944c4a7


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"x-system-cache-id","valueString":"dc8fd4bc-091a-424a-8a3b-6198ef146891"},{"name":"defaultDisplayLanguage","valueCode":"en-US"},{"name":"_limit","valueInteger":10000},{"name":"_incomplete","valueBoolean":true},{"name":"displayLanguage","valueCode":"en"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"excludeNested","valueBoolean":false},{"name":"cache-id","valueId":"26888bd4-58f1-4cae-b379-f6f52937a918"},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"all-languages","status":"active","compose":{"include":[{"system":"urn:ietf:bcp:47"}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"x-system-cache-id","valueString":"dc8fd4bc-091a-424a-8a3b-6198ef146891"},{"name":"defaultDisplayLanguage","valueCode":"en-US"},{"name":"_limit","valueInteger":10000},{"name":"_incomplete","valueBoolean":true},{"name":"displayLanguage","valueCode":"en"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"excludeNested","valueBoolean":false},{"name":"cache-id","valueId":"26888bd4-58f1-4cae-b379-f6f52937a918"},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"all-languages","status":"active","compose":{"include":[{"system":"urn:ietf:bcp:47"}]}}}]}'
```

Prod returns HTTP 200 with a ValueSet containing the `valueset-toocostly` extension (`valueBoolean: true`) and `limitedExpansion` parameter. Dev returns HTTP 400 with an OperationOutcome: `code: "too-costly"`, message: `"The code System \"urn:ietf:bcp:47\" has a grammar, and cannot be enumerated directly"`.


When expanding a ValueSet that includes a grammar-based code system (BCP-47 `urn:ietf:bcp:47` or SNOMED CT `http://snomed.info/sct`) without any filter constraints, prod returns HTTP 200 with a ValueSet containing the `valueset-toocostly` extension and `limitedExpansion` parameter (indicating the expansion is too large to enumerate). Dev instead returns HTTP 400 with an OperationOutcome error (`code: "too-costly"`, message: "The code System ... has a grammar, and cannot be enumerated directly").

Prod's approach (returning a ValueSet with the toocostly extension) is the expected FHIR behavior for expansions that are too costly to compute — it signals the condition without failing the request.


12 records in the comparison dataset show this pattern:
- 8 records involve BCP-47 (`urn:ietf:bcp:47`), including the `all-languages` ValueSet
- 4 records involve SNOMED CT (`http://snomed.info/sct`)
- Affects both /r4/ and /r5/ endpoints
- All are POST /r{4,5}/ValueSet/$expand requests

Search: `grep 'has a grammar' deltas.ndjson` finds 223 matches across all records (most already handled by existing tolerances), but filtering to status-mismatch expand records with prod=200/dev=400 and dev issue code "too-costly" yields exactly 12.


Tolerance ID: `expand-toocostly-grammar-400`. Matches $expand requests where prod returns 200 with the `valueset-toocostly` extension and dev returns 400 with an OperationOutcome containing issue code "too-costly". Skips these records entirely since the status codes and response formats are incomparable.


- `4a993d89-3f8b-444d-9a63-e95c6944c4a7` (BCP-47, /r4/)
- `b96706f9-c555-40e7-bdd2-f682fe2d5d88` (SNOMED, /r4/)
- `d61127b2-3ed1-4deb-b11b-b8ccc77185ed` (BCP-47, /r5/)

---

### [ ] `44d1916` Dev returns 200 expansion instead of 422 too-costly for large code systems (LOINC, MIME types)

Records-Impacted: 40
Tolerance-ID: expand-too-costly-succeeds
Record-ID: 02653c32-ee08-4d24-b687-36574afddaf3

#####Repro

```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://loinc.org"}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://loinc.org"}]}}}]}'
```

Prod returns HTTP 422 with OperationOutcome `{"issue":[{"severity":"error","code":"too-costly","details":{"text":"The value set '' expansion has too many codes to display (>10000)"}}]}`. Dev returns HTTP 200 with a ValueSet containing 1000 LOINC codes.

#####What differs

For $expand of ValueSets including large code systems, prod returns HTTP 422 with an OperationOutcome containing `issue.code: "too-costly"`. Dev returns HTTP 200 with a ValueSet expansion. Prod correctly enforces an expansion size guard — refusing to expand code systems with >10000 codes even when pagination parameters (count/offset) are present. Dev does not enforce this guard and instead returns a paginated result or empty expansion.

Prod's error messages fall into two patterns:
- "The value set '' expansion has too many codes to display (>10000)" — for LOINC and BCP-13/MIME type expansions
- "The code System has a grammar, and cannot be enumerated directly" — for CPT and some MIME type expansions (covered by bug c31a8fe)

#####How widespread

40 records in the round-3 comparison dataset (jobs/2026-02-round-3) match this pattern:
- 20 records: `http://loinc.org` — dev returns 1000 codes in expansion
- 20 records: `urn:ietf:bcp:13` (MIME types) — dev returns empty expansion (total=0)
- Both /r4/ and /r5/ FHIR versions affected (32 /r4/, 8 /r5/)

Search: `grep '"too-costly"' deltas.ndjson` in the pre-tolerance delta file, filtered to status-mismatch with prod=422 dev=200, yields 40 records.

#####Tolerance

Tolerance `expand-too-costly-succeeds` matches any $expand request where prod returns 422 with OperationOutcome containing `issue.code: "too-costly"` and dev returns 200. Skips these records since the responses are fundamentally incomparable (error vs success). Eliminates all 40 records. Validated with 12-record sample — all legitimate.

#####Representative records

- `02653c32-ee08-4d24-b687-36574afddaf3` (LOINC, POST /r4/ValueSet/$expand, round-3)
- `d9734f68-d8b4-475d-9204-632c9b4ccbf0` (LOINC, POST /r5/ValueSet/$expand, round-2)
- `3a2672db-cb0d-4312-87f1-5d6b685fbfe0` (MIME types, GET /r4/ValueSet/$expand?url=...mimetypes, round-2)

---

### [x] `1bc5e64` Dev returns x-caused-by-unknown-system for CodeSystem versions that prod resolves (RxNorm 04072025, SNOMED US 20220301)

Records-Impacted: 7
Tolerance-ID: validate-code-x-unknown-system-extra
Record-ID: f7e61c56-3c3c-4925-8822-f0f4e4406e3f

#####Repro

```bash
####Test RxNorm version 04072025
curl -s https://tx.fhir.org/r4/ValueSet/\$validate-code \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{
"resourceType": "Parameters",
"parameter": [
  {
    "name": "url",
    "valueUri": "http://hl7.org/fhir/ValueSet/substance-code"
  },
  {
    "name": "coding",
    "valueCoding": {
      "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
      "version": "04072025",
      "code": "1049221"
    }
  }
]
}' | jq '.parameter[] | select(.name=="x-unknown-system" or .name=="x-caused-by-unknown-system")'

####Dev (same request)
curl -s https://tx-dev.fhir.org/r4/ValueSet/\$validate-code \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{
"resourceType": "Parameters",
"parameter": [
  {
    "name": "url",
    "valueUri": "http://hl7.org/fhir/ValueSet/substance-code"
  },
  {
    "name": "coding",
    "valueCoding": {
      "system": "http://www.nlm.nih.gov/research/umls/rxnorm",
      "version": "04072025",
      "code": "1049221"
    }
  }
]
}' | jq '.parameter[] | select(.name=="x-unknown-system" or .name=="x-caused-by-unknown-system")'
```

**Result**: Both servers now return identical responses with `x-unknown-system` parameter. The bug describes a scenario where prod did NOT return this parameter but dev did. The servers have converged — both now handle the unknown version the same way.

#####What differs

When validating a code against a ValueSet that includes codes from RxNorm or SNOMED CT, and the request pins a specific CodeSystem version, dev fails to resolve certain versions that prod resolves:

- **RxNorm version `04072025`**: Dev returns "A definition for CodeSystem 'http://www.nlm.nih.gov/research/umls/rxnorm' version '04072025' could not be found". Prod resolves it (falls back to known version `??`) and performs actual validation, returning "code not found in valueset".
- **SNOMED US edition version `20220301`** (`http://snomed.info/sct/731000124108/version/20220301`): Same pattern — dev can't find this version, prod resolves it.

Dev returns `x-caused-by-unknown-system` parameter (e.g., `http://www.nlm.nih.gov/research/umls/rxnorm|04072025`) and a single OperationOutcome issue with code `not-found`. Prod omits `x-caused-by-unknown-system` and returns the actual validation result with issues like `this-code-not-in-vs` and `not-in-vs`.

Both return `result=false`, but for completely different reasons: prod says "code not in valueset", dev says "can't validate because CodeSystem version not found."

#####How widespread

7 records in the deltas match this pattern (dev has `x-caused-by-unknown-system`, prod does not):
- 4 records: RxNorm version 04072025
- 3 records: SNOMED US edition version 20220301

All are POST /r4/ValueSet/$validate-code operations.

Search: `grep 'x-caused-by-unknown-system' deltas.ndjson` → 8 hits total, 7 where only dev has the parameter.

#####What the tolerance covers

Tolerance `validate-code-x-unknown-system-extra` matches validate-code records where dev has `x-caused-by-unknown-system` but prod does not. It normalizes dev's issues, message, and x-caused-by-unknown-system to match prod's values. Eliminates 7 records.

Note: This tolerance previously existed but had a bug — it matched on parameter name `x-unknown-system` instead of the correct `x-caused-by-unknown-system`, so it matched 0 records. The fix corrects the parameter name.


11bbc25 #1 Claude (AI Assistant) <>

Updated scope: tolerance now covers 10 records (not 7). Three additional records use parameter name `x-unknown-system` (not `x-caused-by-unknown-system`) for SNOMED US version 20250301. Same root cause — dev doesn't recognize the CodeSystem version that prod resolves.

Total breakdown:
- 4 records: RxNorm version 04072025 (x-caused-by-unknown-system)
- 3 records: SNOMED US version 20220301 (x-caused-by-unknown-system)  
- 3 records: SNOMED US version 20250301 (x-unknown-system)

---

### [x] `44d6f07` Dev truncates BCP-47 language tag region in expand displayLanguage parameter

Records-Impacted: 2
Tolerance-ID: expand-displayLanguage-region-truncated
Record-ID: 4bd05003-c9ae-4886-9009-3f794f2690a1


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "displayLanguage", "valueCode": "fr-FR"},
    {"name": "excludeNested", "valueBoolean": true},
    {"name": "count", "valueInteger": 10},
    {"name": "valueSet", "resource": {
      "resourceType": "ValueSet",
      "status": "active",
      "compose": {
        "include": [{"system": "http://loinc.org", "concept": [{"code": "11369-6"}]}]
      }
    }}
  ]
}' | jq '.expansion.parameter[] | select(.name == "displayLanguage")'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{
  "resourceType": "Parameters",
  "parameter": [
    {"name": "displayLanguage", "valueCode": "fr-FR"},
    {"name": "excludeNested", "valueBoolean": true},
    {"name": "count", "valueInteger": 10},
    {"name": "valueSet", "resource": {
      "resourceType": "ValueSet",
      "status": "active",
      "compose": {
        "include": [{"system": "http://loinc.org", "concept": [{"code": "11369-6"}]}]
      }
    }}
  ]
}' | jq '.expansion.parameter[] | select(.name == "displayLanguage")'
```

**Result**: Both servers now return `{"name": "displayLanguage", "valueCode": "fr-FR"}`. The bug has been fixed - dev no longer truncates the region subtag.


In $expand responses, the `displayLanguage` expansion parameter echoed back by dev truncates the BCP-47 language tag to just the language code, dropping the region subtag. When the request specifies `displayLanguage=fr-FR`, prod echoes back `fr-FR` in the expansion parameters, but dev echoes back `fr`.

The actual expansion content (codes, display text) is identical between prod and dev — the difference is only in the echoed `displayLanguage` parameter value.


2 records in the current comparison show this pattern. Both are POST /r4/ValueSet/$expand requests with `displayLanguage=fr-FR` in the request body.

Search: grep for records where both prod and dev have a `displayLanguage` expansion parameter but with different values — found only these 2 records (IDs: 4bd05003-c9ae-4886-9009-3f794f2690a1, 57537a3f-f65b-4f96-b9d7-3354772c3973).

There are an additional 62 records with a different displayLanguage mismatch pattern (prod has displayLanguage=en or en-US but dev omits it entirely), which is a separate issue.


Tolerance `expand-displayLanguage-region-truncated` normalizes the displayLanguage expansion parameter to the prod value when both sides have a displayLanguage parameter but the values differ only by region subtag truncation (e.g., fr-FR vs fr). This eliminates 2 records.


`grep -n '4bd05003-c9ae-4886-9009-3f794f2690a1' jobs/2026-02-round-2/comparison.ndjson`

---

### [ ] `4aebc14` Dev -code result=false for SNOMED codes valid in prod due to older SNOMED edition

Records-Impacted: 57
Tolerance-ID: snomed-version-skew-validate-code-result-disagrees
Record-ID: a74520f2-677a-41d4-a489-57b323c8dfb9

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"39154008","display":"Clinical diagnosis"}},{"name":"valueSetMode","valueString":"NO_MEMBERSHIP_CHECK"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"ndhm-diagnosis-use","url":"https://nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use","version":"6.5.0","compose":{"include":[{"system":"http://snomed.info/sct","filter":[{"property":"concept","op":"is-a","value":"106229004"}]}],"exclude":[{"system":"http://snomed.info/sct","concept":[{"code":"106229004","display":"Qualifier for type of diagnosis"}]}]}}},{"name":"system-version","valueString":"http://snomed.info/sct|http://snomed.info/sct/900000000000207008"}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"39154008","display":"Clinical diagnosis"}},{"name":"valueSetMode","valueString":"NO_MEMBERSHIP_CHECK"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"ndhm-diagnosis-use","url":"https://nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use","version":"6.5.0","compose":{"include":[{"system":"http://snomed.info/sct","filter":[{"property":"concept","op":"is-a","value":"106229004"}]}],"exclude":[{"system":"http://snomed.info/sct","concept":[{"code":"106229004","display":"Qualifier for type of diagnosis"}]}]}}},{"name":"system-version","valueString":"http://snomed.info/sct|http://snomed.info/sct/900000000000207008"}]}'
```

Prod returns `result: true` with SNOMED version 20250201. Dev returns `result: false` with SNOMED version 20240201 and an error message that code 39154008 was not found in the ValueSet.

#####What differs

On ValueSet $validate-code operations with SNOMED CT codes, prod returns result=true while dev returns result=false. The root cause is that dev loads older SNOMED CT editions than prod (e.g., International 20240201 vs 20250201, US 20240201 vs 20250901). When a ValueSet uses hierarchy-based filters (e.g., is-a or descendent-of), the code membership can differ between SNOMED versions because the hierarchical relationships change between editions.

For example, in the representative record, SNOMED code 39154008 ("Clinical diagnosis") is validated against ValueSet ndhm-diagnosis-use (which filters for descendants of 106229004 "Qualifier for type of diagnosis"). Prod (version 20250201) says the code is in the ValueSet; dev (version 20240201) says it is not.

#####How widespread

57 records in the full comparison.ndjson have SNOMED version-skewed validate-code result disagreements. Of those, 12 still appear in deltas.ndjson (the remaining 45 are already handled by other tolerances, likely because they also have status mismatches). Found via:

```python
####Check all validate-code records for SNOMED version skew + result disagreement
####across comparison.ndjson
```

Affected SNOMED modules: International (20240201 vs 20250201) and US (20240201/20230301 vs 20250901). Multiple codes affected: 39154008, 116154003, 309343006, 1287116005, 428041000124106, and others.

#####What the tolerance covers

Tolerance `snomed-version-skew-validate-code-result-disagrees` skips validate-code records where both prod and dev return 200, both have SNOMED version parameters that differ, and the result boolean disagrees. This is the validate-code counterpart of the existing expand-snomed-version-skew-content tolerance (bug 9fd2328). Eliminates 1 delta record (the others are already handled by existing status-mismatch tolerances).

#####Related

Same root cause as bug 9fd2328 (Dev loads older SNOMED CT edition), which covers $expand operations.


47a7ebb #1 Claude (AI Assistant) <>

Closing as won't-fix. Duplicate of round-1 bug 5b3ae71 (SNOMED CT edition version skew), which was adjudicated by GG as by-design ('added an old version to better support VSAC'). The validate-code result disagreements are a downstream consequence of the intentional version skew.

---

### [ ] `1433eb6` Dev returns 400 ValueSet-not-found for validate-code requests that prod handles successfully (10 records)

Records-Impacted: 10
Tolerance-ID: validate-code-valueset-not-found-dev-400
Record-ID: 064711fa-e287-430e-a6f4-7ff723952ff1

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/@all"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"48546005","display":"Diazepam-containing product"}]}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/@all"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"48546005","display":"Diazepam-containing product"}]}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

Prod returns HTTP 200 with `{"resourceType":"Parameters","parameter":[{"name":"result","valueBoolean":true},...]}` indicating successful validation. Dev returns HTTP 400 with `{"resourceType":"OperationOutcome","issue":[{"severity":"error","code":"not-found","details":{"text":"A definition for the value Set 'http://hl7.org/fhir/ValueSet/@all' could not be found"}}]}`.

For $validate-code requests against certain ValueSets, prod returns HTTP 200 with a valid Parameters response (result=true or result=false), while dev returns HTTP 400 with an OperationOutcome saying "A definition for the value Set '...' could not be found."

Prod successfully resolves these ValueSets and performs code validation. Dev fails at the ValueSet resolution step and returns an error instead of a validation result.


10 records show this pattern (prod=200, dev=400 with "could not be found"):

- 3 records: `nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use*` (Indian NDHM ValueSets)
- 5 records: `ontariohealth.ca/fhir/ValueSet/*` (Ontario Health ValueSets)
- 2 records: `hl7.org/fhir/ValueSet/@all` (special @all ValueSet)

Search: `grep 'could not be found' results/deltas/deltas.ndjson` filtered to prod=200 dev=400

All are POST /r4/ValueSet/$validate-code requests. The ValueSets come from different IG packages (NDHM India, Ontario Health, and core FHIR @all), so the root cause may be that dev is missing certain IG-provided ValueSet definitions or doesn't support the @all pseudo-ValueSet.


Tolerance `validate-code-valueset-not-found-dev-400` matches: POST validate-code, prod=200, dev=400, where dev body contains OperationOutcome with "could not be found" text. Eliminates all 10 records.


- 064711fa-e287-430e-a6f4-7ff723952ff1 (nrces.in ndhm-diagnosis-use--0)
- 5beceead-a754-4f88-8dec-1a7a931166b9 (ontariohealth.ca symptoms-of-clinical-concern)
- 38f6e665-4c34-4589-8d29-77c522b97845 (hl7.org/fhir/ValueSet/@all)

---

### [ ] `1932f81` Dev returns SQLITE_MISUSE error on RxNorm-related $expand requests

Records-Impacted: 16
Tolerance-ID: dev-sqlite-misuse-expand-rxnorm
Record-ID: e108a92a-a962-45b4-ad35-e0aa4fe4cf32

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?_limit=1000&_incomplete=true' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{
"resourceType": "Parameters",
"parameter": [
  {
    "name": "x-system-cache-id",
    "valueString": "dc8fd4bc-091a-424a-8a3b-6198ef146891"
  },
  {
    "name": "includeDefinition",
    "valueBoolean": false
  },
  {
    "name": "excludeNested",
    "valueBoolean": false
  },
  {
    "name": "valueSet",
    "resource": {
      "resourceType": "ValueSet",
      "status": "active",
      "compose": {
        "inactive": true,
        "include": [
          {
            "system": "http://www.nlm.nih.gov/research/umls/rxnorm"
          }
        ]
      }
    }
  },
  {
    "name": "_limit",
    "valueString": "1000"
  },
  {
    "name": "_incomplete",
    "valueString": "true"
  }
]
}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?_limit=1000&_incomplete=true' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{
"resourceType": "Parameters",
"parameter": [
  {
    "name": "x-system-cache-id",
    "valueString": "dc8fd4bc-091a-424a-8a3b-6198ef146891"
  },
  {
    "name": "includeDefinition",
    "valueBoolean": false
  },
  {
    "name": "excludeNested",
    "valueBoolean": false
  },
  {
    "name": "valueSet",
    "resource": {
      "resourceType": "ValueSet",
      "status": "active",
      "compose": {
        "inactive": true,
        "include": [
          {
            "system": "http://www.nlm.nih.gov/research/umls/rxnorm"
          }
        ]
      }
    }
  },
  {
    "name": "_limit",
    "valueString": "1000"
  },
  {
    "name": "_incomplete",
    "valueString": "true"
  }
]
}'
```

Prod returns 500 with `"fdb_sqlite3_objects error: no such column: cui1"` (specific database schema error). Dev returns 500 with `"SQLITE_MISUSE: not an error"` (generic SQLite misuse error).

#####What differs

Dev returns 500 with error message "SQLITE_MISUSE: not an error" on POST /r4/ValueSet/$expand requests involving RxNorm-related code systems. This affects two sub-patterns:

1. **8 records (both 500)**: Prod also returns 500 but with a different, more descriptive SQLite error: "fdb_sqlite3_objects error: no such column: cui1". Both servers crash, but dev's error is generic/unhelpful while prod's points to a specific database schema issue.

2. **8 records (prod 422, dev 500)**: Prod returns 422 with a proper error message like "A definition for CodeSystem 'https://hl7.org/fhir/sid/ndc' could not be found, so the value set cannot be expanded". Dev crashes with 500 SQLITE_MISUSE instead of returning a proper error response.

All 16 records are POST requests to /r4/ValueSet/$expand?_limit=1000&_incomplete=true with request bodies that include RxNorm (http://www.nlm.nih.gov/research/umls/rxnorm) in the ValueSet compose.

#####How widespread

16 records total in the dataset. All are expand operations on the same URL pattern. Searched with:
grep -c 'SQLITE_MISUSE' results/deltas/deltas.ndjson  → 16

All have the same dev error text "SQLITE_MISUSE: not an error". The prod responses vary between internal SQLite errors (500) and proper FHIR error responses (422).

#####What the tolerance covers

Tolerance ID: dev-sqlite-misuse-expand-rxnorm
Matches records where the dev response is an OperationOutcome containing "SQLITE_MISUSE" in the error details, on $expand operations. Skips the entire record since dev's crash prevents meaningful content comparison.
Eliminates 16 records.

---

### [x] `4f12dda` Dev loads older SNOMED CT and CPT editions, causing expand contains[].version to differ

Records-Impacted: 198
Tolerance-ID: expand-contains-version-skew
Record-ID: 6f9cf4c7-e6f4-445c-bc86-323b2b6d7165

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1267.23&_format=json' \
-H 'Accept: application/fhir+json' | jq '.expansion.contains[:3] | map({system, code, version})'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1267.23&_format=json' \
-H 'Accept: application/fhir+json' | jq '.expansion.contains[:3] | map({system, code, version})'
```

Prod returns SNOMED version `http://snomed.info/sct/731000124108/version/20250901` and CPT version `2026`, dev returns SNOMED version `http://snomed.info/sct/731000124108/version/20250301` and CPT version `2025`.

#####What differs

In $expand responses, prod and dev return the same set of codes (same system + code pairs) but with different `version` strings on `expansion.contains[]` entries:

- **SNOMED CT US edition**: prod returns `http://snomed.info/sct/731000124108/version/20250901`, dev returns `http://snomed.info/sct/731000124108/version/20250301`
- **CPT (AMA)**: prod returns `2026`, dev returns `2025`

Both sides return 200 with identical code membership (280 codes in the representative record), but each code's version field reflects the loaded edition.

This differs from bug 9fd2328, which covers the case where SNOMED version skew causes *different* code sets to appear. Here, the codes are the same — only the version annotations differ.

#####How widespread

198 expand delta records exhibit this pattern. All are the same ValueSet URL (`http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1267.23`) requested with different parameters. Each contains 280 codes with both SNOMED and CPT codes, where all codes match but version strings differ.

Found via:
```python
####For each expand delta with same code membership,
####check if contains[].version differs for common codes
```

#####What the tolerance covers

Tolerance `expand-contains-version-skew` matches expand records where both sides return 200, the code membership is identical, but `contains[].version` strings differ for common codes. It normalizes all `contains[].version` values to prod's values. This only triggers when code sets are the same (no extra/missing codes) — the existing `expand-snomed-version-skew-content` tolerance handles cases with code membership differences.


48fa1f2 #1 Claude (AI Assistant) <>

Closing as won't-fix. SNOMED/CPT version annotations differ due to edition skew. Round-1 precedent: 5b3ae71 adjudicated by GG as 'By design — added an old version to better support VSAC'. Covered by unified version-skew equiv-autofix tolerance.

---

### [ ] `f73e488` Dev crashes (500) on GET  when CodeSystem content mode prevents expansion

Records-Impacted: 258
Tolerance-ID: expand-dev-crash-on-error
Record-ID: 6b9d3a10-654f-4823-aadb-0fabc0d915bb

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-procedure-code&_format=json' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-procedure-code&_format=json' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 422 with issue code "too-costly" and clean error message: "The code System 'http://www.ama-assn.org/go/cpt' has a grammar, and cannot be enumerated directly". Dev returns HTTP 500 with issue code "business-rule" and a JavaScript source code leak in the error message: `contentMode() {\r\n    return this.codeSystem.content;\r\n  }` instead of the actual content mode value.

#####Root Cause

**Classification**: code-level defect

**Prod** uses `CODES_TFhirCodeSystemContentMode[cs.contentMode]` to convert the enum to a string for the error message and the `addParamUri` call:
[`library/ftx/fhir_valuesets.pas#L3717-L3719`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/library/ftx/fhir_valuesets.pas#L3717-L3719)
— Correctly interpolates the content mode value (e.g., "fragment") into the error message and uses it as the parameter name for `addParamUri`.

**Dev** references `cs.contentMode` (the method itself) instead of `cs.contentMode()` (calling the method) on two lines:
[`tx/workers/expand.js#L629-L631`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/expand.js#L629-L631)
— Line 629: `this.addParamUri(cs.contentMode, ...)` passes the function object as the parameter name instead of the return value. Line 631: `'... is a ' + cs.contentMode + ', so this expansion...'` stringifies the function body into the error message, leaking JS source code.

Note: lines 623-626 of the same block correctly use `cs.contentMode()` with parentheses — the bug is only in the else branches (lines 629 and 631).

**Same bug also exists in**:
[`tx/workers/related.js#L629-L631`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/related.js#L629-L631)
— Identical code with the same missing `()`.

[`tx/workers/validate.js#L600-L604`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/tx/workers/validate.js#L600-L604)
— Same missing `()` on lines 600 and 604. This doesn't cause a crash because the function object is compared to a string (always false), but it means incomplete code systems are silently mishandled instead of being properly detected.

**Fix**: Change `cs.contentMode` to `cs.contentMode()` on these lines:
- `tx/workers/expand.js` lines 629, 631
- `tx/workers/related.js` lines 629, 631
- `tx/workers/validate.js` lines 600, 604

#####What differs

When expanding ValueSets that include code systems with restrictive content modes (e.g., HCPCS, ICD-9-CM), prod returns HTTP 422 with a clear OperationOutcome (issue code "too-costly", message like "The code System X has a grammar, and cannot be enumerated directly"). Dev returns HTTP 500 with multiple issues:

1. **JS source code leak in error message**: Dev's error text contains interpolated JavaScript function body: `contentMode() {\r\n    return this.codeSystem.content;\r\n  }` instead of the actual content mode value. The message reads: "The code system definition for <URL> is a contentMode() { return this.codeSystem.content; }, so this expansion is not permitted..."

2. **Different issue code**: Dev uses "business-rule" instead of prod's "too-costly"

3. **Different HTTP status**: Dev returns 500 (server error) instead of 422 (semantic error)

4. **Different code system referenced**: For us-core-procedure-code, prod references CPT (http://www.ama-assn.org/go/cpt) while dev references HCPCS (http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets). Both are included in the ValueSet but the servers stop at different code systems.

Additionally, 4 records within this category show different dev crashes:
- 2 records: "searchText.toLowerCase is not a function" (medication-codes expand with filter)
- 1 record: "Unable to understand default system version" (iso3166 expand)
- 1 record: "Cannot read properties of null (reading 'coding')" (CodeSystem validate-code)

#####How widespread

258 total dev-crash-on-error records in the delta file:
- 257 are GET /r4/ValueSet/$expand (query params in URL)
- 1 is POST /r4/CodeSystem/$validate-code
- All share prod=422, dev=500

The contentMode JS leak specifically affects 254 records across 2 ValueSets:
- us-core-procedure-code (200 records, code system: HCPCS)
- us-core-condition-code (54 records, code system: ICD-9-CM)

#####What the tolerance covers

The existing tolerance `expand-dev-crash-on-error` only matched POST requests (exact URL match `/r4/ValueSet/$expand`). Updated to match URL starting with `/r4/ValueSet/$expand` (covering GET requests with query params) and also the CodeSystem/$validate-code crash. This brings coverage from ~0 to 258 records eliminated.

#####Representative record

6b9d3a10-654f-4823-aadb-0fabc0d915bb — GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fcore%2FValueSet%2Fus-core-procedure-code


fc7d33e #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev crashes (500) on $expand when CodeSystem content mode prevents expansion

---

### [ ] `af1ce69` validate-code: dev renders null status as literal 'null' in inactive concept message

Records-Impacted: 24
Tolerance-ID: validate-code-null-status-in-message
Record-ID: 20db1af0-c1c6-4f83-9019-2aaeff9ef549

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=http:%2F%2Fwww.nlm.nih.gov%2Fresearch%2Fumls%2Frxnorm&code=70618&_format=json' \
-H 'Accept: application/fhir+json' | jq -r '.parameter[] | select(.name == "message") | .valueString'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http:%2F%2Fwww.nlm.nih.gov%2Fresearch%2Fumls%2Frxnorm&code=70618&_format=json' \
-H 'Accept: application/fhir+json' | jq -r '.parameter[] | select(.name == "message") | .valueString'
```

Prod returns `"The concept '70618' has a status of  and its use should be reviewed"` (empty string for status), dev returns `"The concept '70618' has a status of null and its use should be reviewed"` (literal word "null").

#####What differs

In $validate-code responses for inactive concepts, the message and issues text differ in how a missing status value is rendered:

- Prod: `"The concept '70618' has a status of  and its use should be reviewed"` (empty string for status)
- Dev: `"The concept '70618' has a status of null and its use should be reviewed"` (literal word "null")

Both servers agree on result=true, inactive=true, display, system, and version. The only difference is this string interpolation of a null/missing status value in the INACTIVE_CONCEPT_FOUND message.

#####How widespread

24 records in the current delta file, all identical: GET /r4/CodeSystem/$validate-code for RxNorm code 70618. The same underlying pattern (empty vs "null" in status message) also affects 20 NDC records already covered by a separate tolerance (ndc-validate-code-extra-inactive-params, bug 7258b41).

Search: `grep 'has a status of  and' results/deltas/deltas.ndjson | wc -l` → 24
All 24 are validate-code operations on http://www.nlm.nih.gov/research/umls/rxnorm, code 70618.

#####What the tolerance covers

Tolerance ID: validate-code-null-status-in-message
Matches: validate-code Parameters responses where prod message contains "status of " (empty) and dev message contains "status of null" at the same position. Normalizes both message and issues text by replacing "status of null" with "status of " (prod's rendering) in dev. Eliminates 24 delta records.

---

### [ ] `e4e45bc` Dev returns 200 instead of 422 for validate-code with code but no system parameter

Records-Impacted: 133
Tolerance-ID: validate-code-no-system-422
Record-ID: 5ea323a9-073d-4ebf-b1ae-0a374b35c26d


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http%3A%2F%2Fterminology.hl7.org%2FValueSet%2FUSPS-State&code=TX&_format=json' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http%3A%2F%2Fterminology.hl7.org%2FValueSet%2FUSPS-State&code=TX&_format=json' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 422 with OperationOutcome: "Unable to find code to validate (looked for coding | codeableConcept | code+system | code+inferSystem in parameters ...)". Dev returns HTTP 200 with Parameters containing `result=true`, `system=https://www.usps.com/`, `code=TX`, `display=Texas`.


When $validate-code is called with `code` but no `system` parameter (and no `context`), prod returns HTTP 422 with an OperationOutcome error: "Unable to find code to validate (looked for coding | codeableConcept | code+system | code+inferSystem in parameters ...)". Dev returns HTTP 200 with a successful Parameters response, inferring the system from the ValueSet.

Per the FHIR spec for ValueSet/$validate-code: "If a code is provided, a system or a context must be provided." Prod correctly rejects these requests; dev incorrectly accepts them by inferring the system.


133 records across 14 distinct request URLs, all sharing the same pattern:
- GET /r4/ValueSet/$validate-code with `url=...&code=...` but no `system` parameter
- One POST /r4/CodeSystem/$validate-code with only `code` in the Parameters body (no system)

Examples include ValueSets for USPS-State, defined-types, iso3166-1-2, mimetypes, languages, administrative-gender, encounter-status, event-status, patient-contactrelationship, and a CTS ValueSet.

Found via: `grep '"status-mismatch"' deltas.ndjson > /tmp/sm.ndjson` then filtering for prod.status=422, dev.status=200, op=validate-code.


Tolerance ID: `validate-code-no-system-422`. Matches validate-code records where prod returns 422 and dev returns 200, and the request has `code` but no `system` parameter (checked in both URL query params and POST request body). Eliminates 133 records.


5ea323a9-073d-4ebf-b1ae-0a374b35c26d — GET /r4/ValueSet/$validate-code?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2FUSPS-State&code=TX&_format=json

---

### [ ] `7716e08` Dev uses R5-style property instead of R4 extension for deprecated status in expand contains

Records-Impacted: 26
Tolerance-ID: expand-r4-deprecated-status-representation
Record-ID: 307d55c7-f148-4ddc-a360-3962e4e2fe7c, 131242e8-b7fb-4c3a-a45b-680355b8a70f

In R4 $expand responses, prod and dev represent deprecated code status differently in two ways:

**1. Per-code deprecated annotations on expansion.contains entries**

- **security-labels (18 records)**: Prod uses R4-compatible extension `http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.contains.property` to convey `status: deprecated`. Dev uses R5-native `property` elements directly (e.g., `"property": [{"code": "status", "valueCode": "deprecated"}]`). The R4 spec does not define `property` on `expansion.contains` — that was introduced in R5.

- **patient-contactrelationship (5 records) + v3-TribalEntityUS (3 records)**: Prod annotates deprecated codes with the same R5 backport extension. Dev omits the deprecated status annotation entirely — no extension and no property.

**2. Expansion-level property declaration extension**

Prod includes an expansion-level extension `http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.property` that declares the "status" property used in per-code annotations. Dev either omits this entirely (patient-contactrelationship) or includes it with different key ordering (TribalEntityUS). This is the R5 backport mechanism for declaring expansion properties in R4.

**How widespread**

26 expand records across 3 ValueSets. All are R4 $expand operations containing codes from HL7 terminology CodeSystems with deprecated entries.

```bash
grep 'extension-ValueSet.expansion.contains.property' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l
grep 'extension-ValueSet.expansion.property' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l
```

**Tolerance**

Tolerance `expand-r4-deprecated-status-representation` normalizes by stripping both per-code annotations (R5 backport extension and R5-native property) and the expansion-level property declaration extension from both sides. This eliminates the structural difference so other content differences can still surface.

---

### [ ] `d05a4a6` Dev omits retired status-check informational issues in validate-code OperationOutcome

Records-Impacted: 13
Tolerance-ID: missing-retired-status-check-issue
Record-ID: dc21c18a-fd57-429c-a51b-54bbfd23753f

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fsecurity-labels%7C4.0.1&code=code8&_format=json&system=urn:ihe:xds:scheme8' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fsecurity-labels%7C4.0.1&code=code8&_format=json&system=urn:ihe:xds:scheme8' \
-H 'Accept: application/fhir+json'
```

Prod returns 3 OperationOutcome issues: an informational `status-check` issue ("Reference to retired ValueSet http://terminology.hl7.org/ValueSet/v3-ActUSPrivacyLaw|3.0.0") plus two error-level issues (UNKNOWN_CODESYSTEM and not-in-vs). Dev returns only the 2 error-level issues, omitting the retired status-check informational issue entirely.

#####What differs

When validating a code against a ValueSet that includes a retired sub-ValueSet, prod returns an informational status-check issue in the OperationOutcome reporting the retired reference. Dev omits this issue entirely.

Specifically, for validate-code on `http://hl7.org/fhir/ValueSet/security-labels|4.0.1` (which composes `http://terminology.hl7.org/ValueSet/v3-ActUSPrivacyLaw|3.0.0`, a retired ValueSet), prod includes:

```json
{
"severity": "information",
"code": "business-rule",
"details": {
  "coding": [{"system": "http://hl7.org/fhir/tools/CodeSystem/tx-issue-type", "code": "status-check"}],
  "text": "Reference to retired ValueSet http://terminology.hl7.org/ValueSet/v3-ActUSPrivacyLaw|3.0.0"
}
}
```

Dev's OperationOutcome has no such issue. All other parameters (result, system, code, message, and the two error-level issues) match between prod and dev.

#####How widespread

13 records in deltas.ndjson. All are GET validate-code requests on `http://hl7.org/fhir/ValueSet/security-labels|4.0.1` with system `urn:ihe:xds:scheme8`. Found via:
```
grep 'status-check' results/deltas/deltas.ndjson | wc -l
```

Note: the existing `hl7-terminology-cs-version-skew` tolerance already strips *draft* status-check issues for `terminology.hl7.org/CodeSystem/*` systems (bug 6edc96c). This is a separate pattern — *retired* status-check issues for ValueSet composition references.

#####What the tolerance covers

Tolerance `missing-retired-status-check-issue` strips informational status-check issues containing "retired" from prod's OperationOutcome, matching any validate-code operation where prod has a retired status-check issue and dev does not. Eliminates 13 records.

---

### [ ] `dc0132b` Dev SNOMED  returns URI-based name and omits most properties

Records-Impacted: 2170
Tolerance-ID: snomed-lookup-name-and-properties
Record-ID: 1a78565a-0d41-448b-b6cc-ae96754dd093

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=446050000' -H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=446050000' -H 'Accept: application/fhir+json'
```

Prod returns `name: "SNOMED CT"` with properties `copyright`, `moduleId`, `normalForm`, `normalFormTerse`, `parent`. Dev returns `name: "http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201"` with only the `inactive` property.

#####What differs

For SNOMED CT CodeSystem/$lookup requests, dev differs from prod in three ways:

1. **`name` parameter**: Prod returns the human-readable code system name `"SNOMED CT"`. Dev returns a system|version URI like `"http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201"`. Per the FHIR R4 $lookup spec, the `name` output parameter (1..1 string) is defined as "A display name for the code system", so prod's value is correct.

2. **Missing properties**: Prod returns properties `copyright`, `moduleId`, `normalForm`, `normalFormTerse`, `parent` (and `child` when applicable). Dev returns only `inactive`. Per the FHIR spec, "If no properties are specified, the server chooses what to return", but dev returns significantly fewer SNOMED-specific properties than prod.

3. **Missing `abstract` parameter on R5**: For R5 SNOMED lookups (2170 of 2176 R5 records), prod returns `abstract: false` but dev omits the parameter entirely.

#####How widespread

2186 SNOMED $lookup delta records match the name + properties pattern. The tolerance eliminates 2170 of them. The remaining 16 have additional differences beyond what this tolerance covers (e.g., designation content differences).

Search: `grep '$lookup.*snomed' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l` → 2187 (before tolerance)

All three issues co-occur on every affected record.

#####What the tolerance covers

Tolerance `snomed-lookup-name-and-properties` normalizes by:
- Setting dev's `name` to prod's value (`"SNOMED CT"`)
- Removing properties from prod that dev doesn't have (copyright, moduleId, normalForm, normalFormTerse, parent, child)
- Removing `abstract` from prod when dev doesn't have it (R5 lookups)

#####Representative record

1a78565a-0d41-448b-b6cc-ae96754dd093 — `GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=446050000`

---

### [ ] `7b445b0` SNOMED $lookup: dev returns Synonym designation use type where prod returns Inactive

Records-Impacted: 4
Tolerance-ID: snomed-lookup-inactive-designation-use
Record-ID: eebd3d87-2015-48c3-84ac-c46d76ac23e1

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=303071001' \
-H 'Accept: application/fhir+json'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=303071001' \
-H 'Accept: application/fhir+json'
```

Prod returns designation "People in the family" with `use.code: "73425007"` (display: "Inactive"), dev returns the same designation with `use.code: "900000000000013009"` (display: "Synonym (core metadata concept)"). Also reproducible with code 116101001 where prod marks 7 of 9 designations as Inactive while dev marks none.

#####What differs

For SNOMED CT CodeSystem/$lookup responses containing inactive descriptions, prod marks those designations with `use.code: "73425007"` (display: "Inactive") while dev marks the same designations with `use.code: "900000000000013009"` (display: "Synonym (core metadata concept)").

In SNOMED CT, concept 73425007 identifies a description that is inactive (no longer preferred). Using Synonym (900000000000013009) instead loses the information that the description is inactive.

Example for code 303071001 (Family member):
- Prod: designation "People in the family" has `use.code: "73425007"` (Inactive)
- Dev: same designation has `use.code: "900000000000013009"` (Synonym)

For code 116101001, prod marks 7 of 9 designations with Inactive use type; dev marks none as Inactive, using Synonym or FSN instead.

#####How widespread

4 records in the delta set match this pattern. All are SNOMED $lookup operations on R4:
- 1 record for code 303071001 (Family member)
- 3 records for code 116101001 (Gonadotropin releasing hormone) — same code, different comparison record IDs

Search: `python3` script checking for `73425007` in prodBody across all SNOMED lookup deltas found exactly 4 matches. Broader search across all 2187 SNOMED lookups in comparison.ndjson also found only 4 records.

#####What the tolerance covers

Tolerance `snomed-lookup-inactive-designation-use` normalizes the designation use type difference by:
- Matching SNOMED $lookup records where prod has designation use code 73425007 and dev has 900000000000013009 for the same designation value
- Normalizing dev designations to match prod's use type when the designation text matches

Eliminates 4 records.

#####Representative records

- eebd3d87-2015-48c3-84ac-c46d76ac23e1 — GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=303071001
- fcb6b89e-a38f-444f-8bcb-41eefd5509b0 — GET /r4/CodeSystem/$lookup?system=http://snomed.info/sct&code=116101001

---

### [ ] `6b31694` Dev crashes (500) on GET  with filter parameter: searchText.toLowerCase is not a function

Records-Impacted: 58
Tolerance-ID: expand-filter-crash
Record-ID: dabcdc4f-feed-4ac8-adea-8999b06187a5

#####Repro

```bash
####Prod (returns 200 with ValueSet expansion)
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/participant-role&filter=referr&count=50' \
-H 'Accept: application/fhir+json'

####Dev (returns 500 with error)
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/participant-role&filter=referr&count=50' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 200 with a valid ValueSet expansion. Dev returns HTTP 500 with OperationOutcome: `searchText.toLowerCase is not a function`. Reproduced with multiple filter values (`referr`, `family`, `referring`) across different ValueSets.

#####What differs

Dev returns HTTP 500 with OperationOutcome error `searchText.toLowerCase is not a function` on all GET `$expand` requests (R4 and R5) that include a `filter` parameter. Prod returns 200 with a valid ValueSet expansion.

The error is a JavaScript TypeError indicating that `searchText` is null/undefined when `.toLowerCase()` is called during filter processing.

#####How widespread

All 58 records matching this error in the comparison dataset. Every one is a GET `/r4/ValueSet/$expand` or `/r5/ValueSet/$expand` request with a `filter=` query parameter. They span 3 distinct ValueSets:
- `http://hl7.org/fhir/ValueSet/participant-role` (R4 and R5)
- `http://hl7.org/fhir/ValueSet/condition-code` (R4)
- `http://hl7.org/fhir/ValueSet/medication-codes` (R4)

Search: `grep -c 'searchText.toLowerCase is not a function' jobs/2026-02-round-2/results/deltas/deltas.ndjson` → 58

#####What the tolerance covers

Tolerance ID: `expand-filter-crash`
Matches: GET requests to `/r[345]/ValueSet/$expand` where `filter=` is in the URL, `prod.status=200`, `dev.status=500`, and the dev response contains `searchText.toLowerCase is not a function`.
Eliminates: 58 records.

#####Representative records

- `dabcdc4f-feed-4ac8-adea-8999b06187a5` — `GET /r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/participant-role&filter=referr&count=50`

---

### [ ] `44136eb` Dev returns expansion codes when prod marks expansion as too-costly (both HTTP 200)

Records-Impacted: 1
Tolerance-ID: expand-toocostly-dev-returns-codes
Record-ID: 227d1960-bfbd-4ca4-9c10-c5614d0e62d5

#####Repro

```bash
####Save the request body from the record (1.2MB, includes inline CodeSystem resources)
####Extract from: jobs/2026-02-round-2/issues/227d1960-bfbd-4ca4-9c10-c5614d0e62d5/record.json
####python3 -c "import json; r=json.load(open('record.json')); open('/tmp/body.json','w').write(r['requestBody'])"

####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d @/tmp/body.json | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('expansion',{}); print('total:', e.get('total'), 'contains:', len(e.get('contains',[])), 'toocostly:', any(x.get('url','').endswith('valueset-toocostly') for x in e.get('extension',[])))"

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d @/tmp/body.json | python3 -c "import sys,json; d=json.load(sys.stdin); e=d.get('expansion',{}); print('total:', e.get('total'), 'contains:', len(e.get('contains',[])), 'toocostly:', any(x.get('url','').endswith('valueset-toocostly') for x in e.get('extension',[])))"
```

Prod returns `total: 0, contains: 0, toocostly: True`. Dev returns `total: None, contains: 1000, toocostly: False`.

#####What differs

For $expand of ValueSets that include large code systems, prod returns HTTP 200 with an empty expansion (0 codes in `contains`) and marks it with `valueset-toocostly: true` extension and `limitedExpansion: true` parameter. Dev returns HTTP 200 with 1000 codes in `expansion.contains` — it proceeds with the expansion that prod considers too costly.

After existing normalizations strip the toocostly extension difference (tolerance `expand-toocostly-extension-and-used-codesystem`), the remaining difference is: prod has no `expansion.contains` array while dev has 1000 codes.

The observed record involves a Brazilian ValueSet (`cid10-ciap2`, URL `https://fhir.saude.go.gov.br/r4/core/ValueSet/cid10-ciap2`) that includes codes from `BRCID10` and `BRCIAP2` code systems.

#####How widespread

1 record in the current delta file shows this exact pattern (both 200, prod empty+toocostly, dev has codes). Related but distinct from bug 44d1916 (where prod returns 422 instead of 200).

Search: checked all 56 records where prod has 0 codes and dev has >0 codes in comparison.ndjson; 55 of those have prod with no expansion metadata at all (handled by other tolerances), and only this 1 record has prod explicitly marking the expansion as too-costly with the toocostly extension.

#####Tolerance

Tolerance `expand-toocostly-dev-returns-codes` matches $expand records where both return 200, prod has the `valueset-toocostly` extension, and dev has codes in `expansion.contains` while prod does not. Skips these records since the responses are fundamentally different in content (empty vs populated expansion) and this is a known behavioral difference in expansion size enforcement.

---

### [ ] `15f5ce0` GET /r5/CodeSystem/$subsumes returns 400 despite valid system parameter

Records-Impacted: 2
Tolerance-ID: r5-get-subsumes-status-mismatch
Record-ID: 065c2fa7-d80e-416a-b50d-ed4f78a48fd7


```bash
curl -s 'https://tx.fhir.org/r5/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=40127002&codeB=159033005' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r5/CodeSystem/$subsumes?system=http://snomed.info/sct&codeA=40127002&codeB=159033005' \
-H 'Accept: application/fhir+json'
```

Prod returns HTTP 400 with OperationOutcome: "No CodeSystem Identified (need a system parameter, or execute the operation on a CodeSystem resource)". Dev returns HTTP 200 with Parameters containing `{"name":"outcome","valueCode":"subsumed-by"}`.


GET requests to `/r5/CodeSystem/$subsumes` with `system`, `codeA`, and `codeB` query parameters return HTTP 400 from prod with an OperationOutcome error: "No CodeSystem Identified (need a system parameter, or execute the operation on a CodeSystem resource)". Dev returns HTTP 200 with a valid Parameters response containing the subsumption outcome.

The `system` parameter is clearly present in the URL (e.g., `system=http://snomed.info/sct`), so prod appears to fail to recognize it. POST requests to the same R5 $subsumes endpoint succeed on both prod and dev.


2 records in the current comparison dataset, both GET requests to `/r5/CodeSystem/$subsumes` with SNOMED system:

- `065c2fa7-d80e-416a-b50d-ed4f78a48fd7`: codeA=40127002, codeB=159033005 (dev: subsumed-by)
- `d48aa838-d4f2-492a-aedb-5562103b1ae3`: codeA=159033005, codeB=309414002

Found via: `grep '/r5/CodeSystem/\$subsumes' comparison.ndjson` — 3 total records, of which 2 are GET (both failing) and 1 is POST (succeeding).

No R4 $subsumes records exist in the dataset for comparison.


Tolerance ID `r5-get-subsumes-status-mismatch` skips GET requests to `/r5/CodeSystem/$subsumes` where prod=400 and dev=200. Eliminates 2 records.

---

### [ ] `f9f6206` validate-code: dev renders JavaScript undefined/null as literal strings when code/version absent

Records-Impacted: 1
Tolerance-ID: validate-code-undefined-null-in-unknown-code-message
Record-ID: 7f0c6cf8-a250-4935-8ab6-32f499d65302


```bash
curl -s 'https://tx.fhir.org/r5/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:ietf:bcp:47"}},{"name":"displayLanguage","valueString":"en"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r5/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:ietf:bcp:47"}},{"name":"displayLanguage","valueString":"en"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

Prod returns message `"Unknown code '' in the CodeSystem 'urn:ietf:bcp:47' version ''"` (empty strings for missing code/version), dev returns `"Unknown code 'undefined' in the CodeSystem 'urn:ietf:bcp:47' version 'null'"` (JavaScript undefined/null as literal strings). Dev also includes an extra informational issue `"Empty code"` that prod does not return.


In a POST /r5/CodeSystem/$validate-code request for system `urn:ietf:bcp:47` with a coding that has no `code` or `version`, the message and issues text differ:

- Prod: `"Unknown code '' in the CodeSystem 'urn:ietf:bcp:47' version ''"`
- Dev: `"Unknown code 'undefined' in the CodeSystem 'urn:ietf:bcp:47' version 'null'"`

Dev renders JavaScript's `undefined` and `null` as literal strings instead of empty strings when code and version are absent from the request.

Additionally, dev includes an extra informational OperationOutcome issue (`"Empty code"`, severity=information) that prod does not return.

Both servers agree on result=false and system=urn:ietf:bcp:47.


1 record in the current delta file. Searched for broader patterns:
- `grep "'undefined'" deltas.ndjson` → 37 hits total, but only 2 have 'undefined' in non-diagnostics params (this record and 06cfc4c9 which has "and undefined" in a version list — a different pattern)
- `grep "version 'null'" deltas.ndjson` → 1 hit (this record only)
- `grep "Empty code" deltas.ndjson` → 1 hit (this record only)


Tolerance ID: validate-code-undefined-null-in-unknown-code-message
Matches: validate-code Parameters responses where dev message contains `'undefined'` or `version 'null'` and prod has the same message but with empty strings. Normalizes the message and issues text to prod's rendering, and removes the extra "Empty code" informational issue from dev. Eliminates 1 delta record.


`grep -n '7f0c6cf8-a250-4935-8ab6-32f499d65302' comparison.ndjson`

---

### [ ] `5f3b796` LOINC $lookup: dev returns extra designations, RELATEDNAMES2 properties, and different CLASSTYPE format

Records-Impacted: 1
Tolerance-ID: loinc-lookup-extra-designations-properties
Record-ID: e5ceaa8d-ae90-42ed-a02d-1dc612d44d30


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$lookup' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"4548-4"}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$lookup' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"4548-4"}]}'
```

Prod returns CLASSTYPE with `value: "Laboratory class"` and 0 RELATEDNAMES2 properties. Dev returns CLASSTYPE with `value: "1"` plus `description: "Laboratory class"`, an extra `preferredForLanguage` designation, and 14 RELATEDNAMES2 properties with language-specific related names.


On POST /r4/CodeSystem/$lookup for LOINC code 4548-4, dev returns three categories of differences compared to prod:

1. **Extra `preferredForLanguage` designation**: Dev includes a designation with `use.system: "http://terminology.hl7.org/CodeSystem/hl7TermMaintInfra"` and `use.code: "preferredForLanguage"` that prod omits entirely. (Prod instead has a duplicate LONG_COMMON_NAME designation with identical content.)

2. **Different CLASSTYPE property format**: Prod returns `CLASSTYPE` with `value: "Laboratory class"` (a single valueString). Dev returns `CLASSTYPE` with `value: "1"` (the numeric code) plus a separate `description: "Laboratory class"` part. These represent different data modeling choices for the same property.

3. **Extra RELATEDNAMES2 properties**: Dev returns 14 `RELATEDNAMES2` property parameters with language-specific related names (en-US, ar-JO, de-AT, de-DE, el-GR, es-ES, et-EE, fr-BE, it-IT, pl-PL, pt-BR, ru-RU, uk-UA, zh-CN). Prod returns none of these RELATEDNAMES2 properties.


Only 1 LOINC $lookup record exists in this comparison dataset. All LOINC $lookup requests would likely be affected since these differences stem from how LOINC properties and designations are served.

grep 'lookup' deltas.ndjson | grep 'loinc' → 1 record


Tolerance `loinc-lookup-extra-designations-properties` normalizes all three differences:
- Strips the `preferredForLanguage` designation from dev
- Strips duplicate LONG_COMMON_NAME designations from prod
- Normalizes CLASSTYPE to use prod's format (value only, no description)
- Strips all RELATEDNAMES2 properties from dev

This eliminates 1 record from deltas.

---

### [ ] `f33ebd3` validate-code: prod reports UNKNOWN_CODESYSTEM, dev reports UNKNOWN_CODESYSTEM_VERSION when system-version pins unavailable SNOMED edition

Records-Impacted: 1
Tolerance-ID: unknown-system-vs-unknown-version
Record-ID: 06cfc4c9-c3c4-42a6-abb8-3068cd06190f

#####Repro

```bash
####Prod
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"29857009","display":"Chest pain"}},{"name":"default-to-latest-version","valueBoolean":true},{"name":"system-version","valueString":"http://snomed.info/sct|http://snomed.info/sct/20611000087101"}]}'

####Dev
curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"29857009","display":"Chest pain"}},{"name":"default-to-latest-version","valueBoolean":true},{"name":"system-version","valueString":"http://snomed.info/sct|http://snomed.info/sct/20611000087101"}]}'
```

Prod returns message-id `UNKNOWN_CODESYSTEM` ("A definition for CodeSystem 'http://snomed.info/sct' could not be found"), dev returns message-id `UNKNOWN_CODESYSTEM_VERSION` ("...version 'http://snomed.info/sct/20611000087101' could not be found...Valid versions: ..."). Dev also includes `display: "Chest pain"` and version-qualified `x-caused-by-unknown-system`.

#####What differs

When `$validate-code` on `CodeSystem` is called with `system-version` pinning an unavailable SNOMED CT edition (Canadian edition `http://snomed.info/sct/20611000087101`), prod and dev disagree on the error classification:

- **Prod**: Treats the entire CodeSystem as unknown — message-id `UNKNOWN_CODESYSTEM`, message "A definition for CodeSystem 'http://snomed.info/sct' could not be found", `x-caused-by-unknown-system: http://snomed.info/sct` (no version), no `display` parameter
- **Dev**: Recognizes SNOMED is loaded but the specific edition is not — message-id `UNKNOWN_CODESYSTEM_VERSION`, message "A definition for CodeSystem 'http://snomed.info/sct' version 'http://snomed.info/sct/20611000087101' could not be found ... Valid versions: ..." listing all available editions, `x-caused-by-unknown-system: http://snomed.info/sct|http://snomed.info/sct/20611000087101` (with version), and includes `display: "Chest pain"` parameter

Both return `result: false` but for different reasons: prod says the system is entirely unknown, dev says the specific version is unknown and helpfully lists available versions.

The request includes `system-version` parameter `http://snomed.info/sct|http://snomed.info/sct/20611000087101` (Canadian SNOMED edition), `default-to-latest-version: true`, and code `29857009` (Chest pain).

#####How widespread

Only 1 record in the deltas matches this exact pattern (prod=UNKNOWN_CODESYSTEM, dev=UNKNOWN_CODESYSTEM_VERSION). In the full comparison data, also only 1 record has this specific disagreement — the remaining SNOMED records with system-version for this edition are handled by existing tolerances.

Search: `grep 'UNKNOWN_CODESYSTEM' deltas.ndjson` → 2 hits, but only 1 has this prod-vs-dev message-id disagreement (the other is a missing-resource for $expand).

#####What the tolerance covers

Tolerance `unknown-system-vs-unknown-version` matches validate-code records where prod has message-id `UNKNOWN_CODESYSTEM` and dev has `UNKNOWN_CODESYSTEM_VERSION`. Normalizes dev's messages, issues, x-caused-by-unknown-system, and display to match prod's values. Eliminates 1 record.

---

### [ ] `e107342` SNOMED $lookup: prod returns 400 where dev returns 404 for unknown code

Records-Impacted: 1
Tolerance-ID: lookup-unknown-code-status-400-vs-404
Record-ID: 442928d4-a15c-4934-b21f-0713857f1c04

#####Repro

Reproduced on 2026-02-07. Prod returns HTTP 400 with issue code `invalid`; dev returns HTTP 404 with issue code `not-found`.

```bash
####Prod (returns 400)
curl -s -o /dev/null -w "%{http_code}" -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r5/CodeSystem/\$lookup?system=http://snomed.info/sct&code=710136005"
####=> 400

####Dev (returns 404)
curl -s -o /dev/null -w "%{http_code}" -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r5/CodeSystem/\$lookup?system=http://snomed.info/sct&code=710136005"
####=> 404
```

Prod response (HTTP 400):
```json
{
"resourceType": "OperationOutcome",
"issue": [{"severity": "error", "code": "invalid", "diagnostics": "Unable to find code 710136005 in http://snomed.info/sct version http://snomed.info/sct/900000000000207008/version/20250201"}]
}
```

Dev response (HTTP 404):
```json
{
"resourceType": "OperationOutcome",
"issue": [{"severity": "error", "code": "not-found", "details": {"text": "Unable to find code '710136005' in http://snomed.info/sct version http://snomed.info/sct/900000000000207008/version/20250201"}}]
}
```

#####What differs

For a SNOMED CT $lookup on an unknown code (`GET /r5/CodeSystem/$lookup?system=http://snomed.info/sct&code=710136005`):

- **Prod** returns HTTP 400 with OperationOutcome issue code `invalid` and error message in `diagnostics`
- **Dev** returns HTTP 404 with OperationOutcome issue code `not-found` and error message in `details.text`

Both servers agree the code doesn't exist in SNOMED CT (same version `http://snomed.info/sct/900000000000207008/version/20250201`), but differ on:
1. HTTP status code: 400 (Bad Request) vs 404 (Not Found)
2. OperationOutcome issue code: `invalid` vs `not-found`
3. Error message field: `diagnostics` vs `details.text`

Note: The FHIR R4 spec example for $lookup error responses uses `not-found` with `details.text` (matching dev's behavior), though the spec doesn't mandate a specific HTTP status code.

#####How widespread

Only 1 record in the current dataset shows this pattern. Out of 2991 total $lookup operations, this is the only one with a status mismatch. The specific SNOMED code 710136005 only appears once.

```bash
grep '"prodStatus":400.*"devStatus":404' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l
####=> 1
```

#####Tolerance

Tolerance `lookup-unknown-code-status-400-vs-404` matches $lookup operations where prod returns 400 and dev returns 404, both returning OperationOutcome with "Unable to find code" messages. It skips the record since the content difference (status code and issue structure) is entirely covered by the status mismatch pattern.

---

### [ ] `2f5929e` expand: dev returns 404 for unknown ISO 3166 version that prod resolves by fallback

Records-Impacted: 1
Tolerance-ID: expand-iso3166-unknown-version-fallback
Record-ID: 3d803696-e4e1-40e7-a249-c18cd3ff07aa

#####Repro

**Request** (GET, same for both servers):
```
curl -s -H "Accept: application/fhir+json" \
'https://tx.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fiso3166-1-2&system-version=urn:iso:std:iso:3166|2020&count=1000'
```

Replace `tx.fhir.org` with `tx-dev.fhir.org` for the dev server.

**Prod (tx.fhir.org)** -- HTTP 200:
- Returns a ValueSet with `expansion.total` = 249 country codes
- `used-codesystem` parameter: `urn:iso:std:iso:3166|2018` (falls back to known version)
- `system-version` parameter: `urn:iso:std:iso:3166|2020` (echoes the requested version)

**Dev (tx-dev.fhir.org)** -- HTTP 404:
```json
{
"resourceType": "OperationOutcome",
"issue": [{
  "severity": "error",
  "code": "not-found",
  "details": {
    "text": "A definition for CodeSystem 'urn:iso:std:iso:3166' version '2020' could not be found, so the value set cannot be expanded. Valid versions: 2018 or 20210120"
  }
}]
}
```

**Result**: Reproduced. Prod gracefully falls back to version 2018 when version 2020 is requested. Dev rejects the request outright with a 404 OperationOutcome.

#####What differs

When $expand is called on ValueSet/iso3166-1-2 with `system-version=urn:iso:std:iso:3166|2020`:

- **Prod (200)**: Successfully expands the ValueSet with 249 country codes. Falls back to version 2018 (shown in `used-codesystem` parameter as `urn:iso:std:iso:3166|2018`), while also echoing the requested `system-version` as `urn:iso:std:iso:3166|2020`.
- **Dev (404)**: Returns an OperationOutcome with error: "A definition for CodeSystem 'urn:iso:std:iso:3166' version '2020' could not be found, so the value set cannot be expanded. Valid versions: 2018 or 20210120"

Prod gracefully handles the unknown version by falling back to a known edition and succeeding. Dev rejects the request outright with a 404.

#####How widespread

Only 1 record in the deltas matches this exact pattern (prod=200, dev=404 for ISO 3166 $expand with unknown version). This is the only missing-resource record in the entire delta set.

Search: `grep 'missing-resource' deltas.ndjson | wc -l` → 1

The pattern is conceptually related to bug 1bc5e64 (dev not resolving code system versions prod resolves), but that bug covers validate-code operations where both return result=false. This is an $expand where the outcome diverges completely (200 with data vs 404 with error).

#####What the tolerance covers

Tolerance `expand-iso3166-unknown-version-fallback` matches $expand records where prod=200 and dev=404, the URL targets `iso3166-1-2`, and `system-version` contains `iso:3166`. Skips the record. Eliminates 1 record.

---

### [ ] `fdc587a` validate-code: dev returns result=false for ISO 3166 user-assigned code AA that prod considers valid

Records-Impacted: 3
Tolerance-ID: validate-code-iso3166-AA-result-disagrees
Record-ID: 5a8b1eb2-7256-40a1-b0d4-9ba62b35f8e2

#####Repro

```bash
####Prod: returns result=true, display="User-assigned"
curl -s -H "Accept: application/fhir+json" \
"https://tx.fhir.org/r4/CodeSystem/\$validate-code?url=urn:iso:std:iso:3166&code=AA"

####Dev: returns result=false, "Unknown code 'AA'"
curl -s -H "Accept: application/fhir+json" \
"https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code?url=urn:iso:std:iso:3166&code=AA"
```

**Prod response** (result=true):
```json
{
"resourceType": "Parameters",
"parameter": [
  {"name": "result", "valueBoolean": true},
  {"name": "system", "valueUri": "urn:iso:std:iso:3166"},
  {"name": "code", "valueCode": "AA"},
  {"name": "version", "valueString": "2018"},
  {"name": "display", "valueString": "User-assigned"}
]
}
```

**Dev response** (result=false):
```json
{
"resourceType": "Parameters",
"parameter": [
  {"name": "result", "valueBoolean": false},
  {"name": "system", "valueUri": "urn:iso:std:iso:3166"},
  {"name": "code", "valueCode": "AA"},
  {"name": "message", "valueString": "Unknown code 'AA' in the CodeSystem 'urn:iso:std:iso:3166' version '2018'"}
]
}
```

Reproduced 2026-02-07. Prod considers ISO 3166 user-assigned code "AA" valid; dev does not recognize it.

#####What differs

When CodeSystem/$validate-code is called with `url=urn:iso:std:iso:3166&code=AA`:

- **Prod (200, result=true)**: Validates successfully. Returns `result: true`, `version: 2018`, `display: "User-assigned"`. Code "AA" is recognized as a valid user-assignable code in ISO 3166.
- **Dev (200, result=false)**: Returns `result: false` with error message "Unknown code 'AA' in the CodeSystem 'urn:iso:std:iso:3166' version '2018'". Dev does not recognize "AA" as a valid code.

This is a `result-disagrees` — the core validation result differs. Prod says the code is valid; dev says it's unknown.

"AA" is a user-assigned code in ISO 3166. The ISO 3166 standard reserves certain codes (AA, QM-QZ, XA-XZ, ZZ) for user-defined purposes. Prod includes these in its code system data; dev does not.

#####How widespread

3 records in the deltas show this exact pattern — all are CodeSystem/$validate-code for `urn:iso:std:iso:3166` with code "AA", all with prod=true/dev=false.

Search: `grep 'result-disagrees' deltas.ndjson | grep 'urn:iso:std:iso:3166' | wc -l` → 3

#####What the tolerance covers

Tolerance `validate-code-iso3166-AA-result-disagrees` matches validate-code requests on `urn:iso:std:iso:3166` where the result disagrees. Skips these records. Eliminates 3 records.

#####Repro

```
GET /r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA
```


ffdbc75 #1 Claude (AI Assistant) <>

Re-verified 2026-02-08: Bug no longer reproduces. Both prod and dev now return identical responses for ISO 3166 code AA: result=true, version=2018, display='User-assigned'. Dev now recognizes user-assigned codes.

---

### [ ] `1e5268a` validate-code: dev renders empty status in INACTIVE_DISPLAY_FOUND message where prod shows 'inactive'

Records-Impacted: 1
Tolerance-ID: inactive-display-empty-status-in-message
Record-ID: f5fcec17-986f-4f27-994d-d49aeca30d13

#####Repro

**Reproduced 2026-02-07** against live servers.

```bash
####POST to both servers:
curl -s -X POST "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s -X POST "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

**Prod** returns message text:
> 'oral' is no longer considered a correct display for code '26643006' (status = inactive). The correct display is one of "Oral route"

**Dev** returns message text:
> 'oral' is no longer considered a correct display for code '26643006' (status = ). The correct display is one of Oral route,Per os,Oral route (qualifier value),Oral use,Per oral route,PO - Per os,By mouth

The empty `(status = )` on dev vs `(status = inactive)` on prod confirms the bug. The concept is inactive, so prod is correct.

#####What differs

In $validate-code responses for SNOMED codes with an inactive display, the INACTIVE_DISPLAY_FOUND `display-comment` issue text differs in the status rendering:

- Prod: `'oral' is no longer considered a correct display for code '26643006' (status = inactive). The correct display is one of "Oral route"`
- Dev: `'oral' is no longer considered a correct display for code '26643006' (status = ). The correct display is one of Oral route,Per os,...`

Dev renders the status as empty `(status = )` where prod renders `(status = inactive)`. The concept (SNOMED 26643006 "Oral route") is indeed inactive, so prod's rendering is correct.

A secondary difference (dev listing all designations vs prod listing only the preferred term) is already adjudicated as equiv-autofix (GG adjudicated, tolerance `inactive-display-message-extra-synonyms`), but that tolerance cannot fire here because the prefix text differs due to the empty status.

#####How widespread

1 record in the current delta file: POST /r4/CodeSystem/$validate-code for SNOMED code 26643006 with display "oral".

Search: `grep '(status = )' comparison.ndjson | wc -l` → 1

This is related to but distinct from bug af1ce69 (dev renders "null" in INACTIVE_CONCEPT_FOUND messages). Both are about dev mishandling status values in message templates, but the message IDs and rendering failures differ: af1ce69 has "null" appearing, this has an empty string where "inactive" should be.

#####What the tolerance covers

Tolerance ID: inactive-display-empty-status-in-message
Matches: validate-code Parameters responses with display-comment issues where the INACTIVE_DISPLAY_FOUND message text differs only in the `(status = ...)` portion between prod and dev. Normalizes dev's empty status to match prod's status value. Combined with the existing `inactive-display-message-extra-synonyms` tolerance, this eliminates the record. Eliminates 1 delta record.

---

### [x] `56d28d0` UCUM -code: dev returns human-readable display instead of code-as-display

Records-Impacted: 220
Tolerance-ID: ucum-display-code-as-display
Record-ID: 6ae99904-538b-4241-89db-b15eab6e637e


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=%5Bin_i%5D' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://unitsofmeasure.org&code=%5Bin_i%5D' \
-H 'Accept: application/fhir+json'
```

Prod returns `display: "[in_i]"` (the UCUM code itself), dev returns `display: "(inch)"` (human-readable name).


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


220 records in deltas.ndjson match this pattern. All are validate-code operations on system http://unitsofmeasure.org where display is the only diff. Found with:

grep '"param":"display"' deltas.ndjson | grep 'unitsofmeasure.org' | wc -l

In all 220 cases, prod's display equals the UCUM code exactly.


Tolerance ID: ucum-display-code-as-display
Matches: validate-code operations on http://unitsofmeasure.org where display values differ
Normalizes both sides to prod's display value (the code itself, per FHIR convention)


6ae99904-538b-4241-89db-b15eab6e637e (POST /r4/ValueSet/$validate-code, code=[in_i])


5268de2 #1 Claude (AI Assistant) <>

GG confirmed fixed: UCUM validate-code: dev returns human-readable display

---

### [x] `5b3ae71` SNOMED CT edition version skew: dev loads older editions than prod

Records-Impacted: 181
Tolerance-ID: snomed-version-skew
Record-ID: e5716810-0ced-4937-85a5-5651fb884719


The version skew is visible in both the metadata endpoint and $validate-code responses.
The International edition has been partially fixed (both servers now resolve to 20250201),
but the US edition (731000124108) still shows the bug: dev defaults to 20230301 instead
of 20250901. Both servers have the 20250901 edition loaded, but dev picks the wrong default.


```bash
curl -s "https://tx.fhir.org/r4/metadata?mode=terminology" \
-H "Accept: application/fhir+json" | \
jq '.codeSystem[] | select(.uri=="http://snomed.info/sct") | .version[].code | select(contains("731000124108"))'

curl -s "https://tx-dev.fhir.org/r4/metadata?mode=terminology" \
-H "Accept: application/fhir+json" | \
jq '.codeSystem[] | select(.uri=="http://snomed.info/sct") | .version[].code | select(contains("731000124108"))'
```

Expected: both list only `http://snomed.info/sct/731000124108/version/20250901`
Actual: dev also has `http://snomed.info/sct/731000124108/version/20230301`


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
--data-raw '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"243796009"},{"name":"version","valueString":"http://snomed.info/sct/731000124108"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
--data-raw '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"243796009"},{"name":"version","valueString":"http://snomed.info/sct/731000124108"}]}'
```

Expected: both return `"version": "http://snomed.info/sct/731000124108/version/20250901"`
Actual: dev returns `"version": "http://snomed.info/sct/731000124108/version/20230301"`


- 36822cee-7132-4003-bf9e-a5602f839466 (US edition, code 243796009)
- 1796976f-3807-40ec-aa48-f8758b0fee62 (US edition, code 272379006)
- 03fec18b-e871-4041-b9b8-5c770b2b17c7 (International edition, code 106292003)

Tested: 2026-02-07

Dev returns different (generally older) SNOMED CT edition versions than prod across multiple modules.


The `version` parameter in $validate-code responses contains different SNOMED CT edition URIs:

- International edition (900000000000207008): prod=20250201, dev=20240201 (256 records)
- US edition (731000124108): prod=20250901, dev=20230301 (46 records, some with reversed newer dev versions)
- Swedish edition (45991000052106): prod=20220531, dev=20231130 (13 records)
- Plus other national editions with smaller counts


279 total records in the current comparison dataset show SNOMED version parameter differences:
- 265 categorized as content-differs (version string is the only or primary diff)
- 14 categorized as result-disagrees (validation result boolean differs — codes valid in one edition but not the other)

All are $validate-code operations. The version difference also correlates with display text differences in ~80 records (display names changed between editions).

Matched by: system=http://snomed.info/sct AND version parameter contains snomed.info/sct AND prod version != dev version.


Tolerance ID: snomed-version-skew
Normalizes the `version` parameter to prod's value on both sides when both contain snomed.info/sct URIs with different version dates. This eliminates records where version is the only diff (~190 records). Records with additional diffs (display, message, result) still surface for separate triage.


- e5716810-0ced-4937-85a5-5651fb884719 (International edition, version-only diff)
- e85ce5f3-b23f-41c0-892e-5f7b2aa672ef (result-disagrees, code 116154003)


51b43fa #1 Claude (AI Assistant) <>

Adjudicated by GG: By design — added an old version to better support VSAC

---

### [x] `a62854a` Dev $expand returns empty string id on ValueSet response

Records-Impacted: 690
Tolerance-ID: expand-dev-empty-id
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7


Attempted to reproduce on 2026-02-07 but the bug appears to have been **fixed** on tx-dev.fhir.org since the data was collected (2026-02-06).

Tried 4 different $expand POST requests — none returned `"id":""` from dev:

```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medicationrequest-category"}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"8480-6"}]}]}}}]}'
```

All three return a ValueSet without `"id":""`. Both inline and registered ValueSet expansions now omit `id` entirely, matching prod behavior.

**Status**: No longer reproducible — likely fixed between 2026-02-06 and 2026-02-07.

Dev $expand responses include `"id": ""` at the top level of the returned ValueSet resource. Prod does not include an `id` field at all.


In all 690 $expand delta records where dev returns a successful ValueSet expansion, the dev response includes `"id": ""` (an empty string). Prod omits the `id` field entirely, which is the correct behavior — per FHIR, string values must be non-empty if present. An empty string `""` is invalid FHIR.

This affects all POST /r4/ValueSet/$expand records across all code systems (SNOMED, LOINC, ICD, etc.) — it's not specific to any particular ValueSet or code system.


```bash
grep '"op":"expand"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | python3 -c "
import json, sys
for line in sys.stdin:
rec = json.loads(line)
dev = json.loads(rec.get('devBody','{}'))
if dev.get('id') == '': print(rec['id'])
" | wc -l
```


**Dev** (incorrect):
```json
{"resourceType":"ValueSet","status":"active","id":"","expansion":{...}}
```

**Prod** (correct):
```json
{"resourceType":"ValueSet","status":"active","expansion":{...}}
```

---

### [x] `2cdb0d3` Dev $expand echoes includeDefinition=false parameter in expansion

Records-Impacted: 677
Tolerance-ID: expand-dev-includeDefinition-param
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7


```bash
curl -s "https://tx.fhir.org/r4/ValueSet/\$expand" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-status"},{"name":"excludeNested","valueBoolean":true},{"name":"includeDefinition","valueBoolean":false}]}'

curl -s "https://tx-dev.fhir.org/r4/ValueSet/\$expand" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-status"},{"name":"excludeNested","valueBoolean":true},{"name":"includeDefinition","valueBoolean":false}]}'
```

Prod expansion.parameter: `[excludeNested, used-codesystem]` — no includeDefinition.
Dev expansion.parameter: `[excludeNested, includeDefinition, used-codesystem]` — echoes `{"name":"includeDefinition","valueBoolean":false}`.

Dev $expand responses include an extra `includeDefinition` parameter (value: false) in the expansion.parameter array. Prod does not include this parameter.


In 677 of the 893 $expand delta records, dev includes `{"name":"includeDefinition","valueBoolean":false}` in the `expansion.parameter` array. Prod omits this parameter entirely.

The `includeDefinition` parameter is an input parameter to the $expand operation. While it's valid to echo input parameters in the expansion.parameter array, prod doesn't do it for this parameter (presumably because false is the default). This is a behavioral difference — not a conformance violation per se, but a real difference in what the servers return.


```bash
grep '"op":"expand"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | python3 -c "
import json, sys
for line in sys.stdin:
rec = json.loads(line)
dev = json.loads(rec.get('devBody','{}'))
params = dev.get('expansion',{}).get('parameter',[])
if any(p.get('name')=='includeDefinition' for p in params): print(rec['id'])
" | wc -l
```


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


2bccd5b #1 Claude (AI Assistant) <>

Adjudicated by GG: Won't fix — design decision (includeDefinition parameter)

---

### [x] `ebcb5a6` Dev $expand reports different used-codesystem versions than prod

Records-Impacted: 37
Tolerance-ID: expand-used-codesystem-version-skew
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/731000124108"}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"160245001"}]}]}}},{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/731000124108"}]}'
```

Prod returns `used-codesystem` version `20250901`, dev returns `20230301` for SNOMED US edition.

Dev $expand responses report different code system versions in the `used-codesystem` expansion parameter compared to prod. This is the $expand counterpart of the existing SNOMED version skew bug (da50d17), but affects multiple code systems and is specific to expansion metadata rather than validate-code Parameters.


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
```


ecb2ccb #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev $expand reports different used-codesystem versions

---

### [ ] `c66245d` Dev crashes (500) on $expand when CodeSystem content mode prevents expansion

Records-Impacted: 186
Tolerance-ID: expand-dev-crash-on-error
Record-ID: f39ee3d3-8249-4e0c-a8a6-c2d5d1ffdcbd


```bash
curl -s -w '\nHTTP_STATUS:%{http_code}\n' 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/sid/icd-9-cm"}]}}}]}'

curl -s -w '\nHTTP_STATUS:%{http_code}\n' 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/sid/icd-9-cm"}]}}}]}'
```

Prod returns HTTP 422 with `"is a fragment, so this expansion is not permitted"`. Dev returns HTTP 500 with `"is a contentMode() {\r\n    return this.codeSystem.content;\r\n  }, so this expansion is not permitted"` — a JavaScript function body leaked into the error message.


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


All 186 records are POST /r4/ValueSet/$expand with prod=422, dev=500. This accounts for all `dev-crash-on-error` records in the current delta set.

Code systems involved in sub-pattern 1:
- http://hl7.org/fhir/sid/icd-9-cm (154 records)
- https://fhir.progyny.com/CodeSystem/identifier-type-cs (24 records)

Search: `grep -c 'contentMode()' results/deltas/deltas.ndjson` → 178
Search: `grep '"dev-crash-on-error"' results/deltas/deltas.ndjson | wc -l` → 186


Tolerance `expand-dev-crash-on-error` skips all records matching POST /r4/ValueSet/$expand with prod.status=422 and dev.status=500. Eliminates all 186 records.

---

### [ ] `d5bac5b` Draft CodeSystem message missing provenance suffix in dev

Records-Impacted: 4
Tolerance-ID: draft-codesystem-message-provenance-suffix
Record-ID: dcdd2b94-db92-4e95-973c-5ced19783bef


Validate a code against a draft CodeSystem (e.g. `event-status`) on both servers and compare the `details.text` in the OperationOutcome issue:

```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/event-status"},{"name":"code","valueCode":"completed"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/event-status"},{"name":"code","valueCode":"completed"}]}'
```

**Expected** (prod): `details.text` = `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1`
**Actual** (dev): `details.text` = `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1`

Also reproduces with other draft CodeSystems: `narrative-status`, `medicationrequest-status`, `medicationrequest-intent`.


When validating codes against draft CodeSystems, both prod and dev return an informational OperationOutcome issue with code "status-check" and message ID "MSG_DRAFT". The details.text differs:

- **Prod**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1 from hl7.fhir.r4.core#4.0.1`
- **Dev**: `Reference to draft CodeSystem http://hl7.org/fhir/event-status|4.0.1`

Dev omits the ` from <package>#<version>` provenance suffix that identifies which FHIR package the CodeSystem was loaded from.


4 records in the comparison dataset, all POST /r4/CodeSystem/$validate-code against draft CodeSystems from hl7.fhir.r4.core#4.0.1:
- http://hl7.org/fhir/event-status
- http://hl7.org/fhir/narrative-status
- http://hl7.org/fhir/CodeSystem/medicationrequest-status
- http://hl7.org/fhir/CodeSystem/medicationrequest-intent

Found via: `grep -c 'from hl7.fhir' results/deltas/deltas.ndjson` (4 matches out of 910 deltas).

All 4 records agree on result (true), system, code, version, and display. The only remaining difference after normalization is the details.text provenance suffix.


Tolerance ID: `draft-codesystem-message-provenance-suffix`. Matches validate-code Parameters responses where OperationOutcome issue text in prod ends with ` from <package>#<version>` and dev has the same text without that suffix. Normalizes both sides to the prod text (which includes provenance). Eliminates 4 records.

---

### [x] `43d7ea3` NDC validate-code: dev returns inactive/version/message/issues params that prod omits

Records-Impacted: 16
Tolerance-ID: ndc-validate-code-extra-inactive-params
Record-ID: ac23726f-6ff2-4b72-b2c8-584922d04c92

Validate NDC code 0777-3105-02 against both servers:

```bash
curl -s -X POST "https://tx.fhir.org/r4/CodeSystem/\$validate-code?" \
-H "Content-Type: application/fhir+json" \
-H "Accept: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/ndc"},{"name":"code","valueCode":"0777-3105-02"}]}'

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


For NDC ($validate-code on http://hl7.org/fhir/sid/ndc), both servers agree result=true and return matching system, code, and display. However, dev returns four additional parameters that prod omits entirely:

- `version: "2021-11-01"` — the NDC code system version
- `inactive: true` — flags the concept as inactive
- `message: "The concept '<code>' has a status of null and its use should be reviewed"` — a warning about the concept status
- `issues` — an OperationOutcome with a warning (severity=warning, code=business-rule, tx-issue-type=code-comment, message-id=INACTIVE_CONCEPT_FOUND)

Prod's diagnostics show it uses NDC with no version: `Using CodeSystem "http://hl7.org/fhir/sid/ndc|" (content = complete)` (empty string after the pipe). Dev uses NDC version 2021-11-01.


16 records in deltas.ndjson match this exact pattern. All are POST /r4/CodeSystem/$validate-code? for http://hl7.org/fhir/sid/ndc. Three distinct NDC codes are affected: 0777-3105-02, 0002-8215-01, and 0169-4132-12.

Search: `grep '"param":"inactive"' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 16

All 16 have the same diff signature: extra-in-dev for inactive, issues, message, and version.


Tolerance `ndc-validate-code-extra-inactive-params` matches validate-code responses where system is http://hl7.org/fhir/sid/ndc and dev has inactive/version/message/issues parameters that prod lacks. It strips the four extra parameters from dev to eliminate the diff. Eliminates 16 records.


ac23726f-6ff2-4b72-b2c8-584922d04c92 — NDC code 0777-3105-02 (Prozac 100 capsule)


4a35dd7 #1 Claude (AI Assistant) <>

Closing as won't-fix. NDC version skew — dev loads version 2021-11-01, prod has no version. Dev is correct in returning inactive/version/message/issues params (GG adjudicated: 'dev is right so far as I can tell'). Covered by unified version-skew equiv-autofix tolerance.

---

### [ ] `16f1bf2` Dev $expand includes extra ValueSet metadata (contact) that prod omits

Records-Impacted: 12
Tolerance-ID: expand-dev-extra-contact-metadata
Record-ID: 80d06a63-cebf-4a33-af1b-583b4f6a1c10


Dev includes the `contact` field in `$expand` responses; prod omits it. Reproduce with any of these ValueSets:

**medicationrequest-category** (contact has URL only):
```bash
curl -s -H 'Accept: application/fhir+json' \
'https://tx.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/medicationrequest-category&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d)"

curl -s -H 'Accept: application/fhir+json' \
'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/medicationrequest-category&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d, d.get('contact'))"
```

**administrative-gender** (contact has URL + email):
```bash
curl -s -H 'Accept: application/fhir+json' \
'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http://hl7.org/fhir/ValueSet/administrative-gender&count=0' \
| python3 -c "import sys,json; d=json.load(sys.stdin); print('contact' in d, d.get('contact'))"
```

Other affected ValueSets include: `address-type`, `address-use`, `identifier-use`, `gender-identity`, `iso3166-1-2`, `languages`, `mimetypes`, `name-use`.


Dev $expand responses include the ValueSet `contact` field (publisher contact information) that prod omits from expansion results. The contact data comes from the source ValueSet definition and contains HL7 FHIR contact info such as:

- `{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}]}`
- `{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}, {"system": "email", "value": "fhir@lists.hl7.org"}]}`

Prod strips this metadata from the expansion response; dev passes it through.


12 records in deltas, 59 in the full comparison dataset (others already eliminated by existing tolerances). All are $expand operations on /r4/ValueSet/$expand. Matched with:

```
grep '"contact":[' deltas.ndjson  # in devBody
```

Filtered to cases where dev has contact but prod does not.


Tolerance `expand-dev-extra-contact-metadata` matches ValueSet $expand responses where dev has a `contact` field and prod does not. It strips the `contact` field from dev to normalize both sides. Eliminates 12 delta records (9 where contact was the sole remaining difference, 3 where other differences also exist — those 3 will remain in deltas due to the other differences).


`80d06a63-cebf-4a33-af1b-583b4f6a1c10` — POST /r4/ValueSet/$expand for medicationrequest-category ValueSet. Dev includes `contact: [{telecom: [{system: "url", value: "http://hl7.org/fhir"}]}]`, prod omits it.

---

### [x] `f588f80` Dev echoes display param on failed validate-code when CodeSystem unknown

Records-Impacted: 74
Tolerance-ID: validate-code-display-echo-on-unknown-system
Record-ID: d9457f4d-39c0-445a-96d4-0721961e169d


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"https://codesystem.x12.org/005010/1338"},{"name":"code","valueCode":"U"},{"name":"display","valueString":"Urgent"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"https://codesystem.x12.org/005010/1338"},{"name":"code","valueCode":"U"},{"name":"display","valueString":"Urgent"}]}'
```

Prod returns `result=false` with parameters: result, system, x-caused-by-unknown-system, code, message, issues -- no `display`. Dev returns all the same plus `display: "Urgent"` echoed from the request input.


When $validate-code returns result=false because the CodeSystem is unknown (x-caused-by-unknown-system), dev echoes back the input `display` parameter in the response while prod omits it.

For example, validating code "U" against unknown system `https://codesystem.x12.org/005010/1338`:
- Prod: returns result=false, system, code, message, x-caused-by-unknown-system, issues — no display parameter
- Dev: returns all of the above PLUS `display: "Urgent"` (echoed from the request input)

Per the FHIR spec, the output `display` parameter is "a valid display for the concept if the system wishes to present it to users." When the CodeSystem is unknown, the server has no basis to return a valid display — it is simply echoing back the unvalidated input.


74 records in deltas.ndjson match this pattern. 73 have `x-caused-by-unknown-system` in prod response; 1 has no system at all. All are $validate-code with result=false. Across 38+ distinct code systems including x12.org, various OID-based systems, and others.

Search: parsed all deltas.ndjson records where comparison.diffs includes {type: "extra-in-dev", param: "display"} and result=false.


Tolerance ID: `validate-code-display-echo-on-unknown-system`
Matches: $validate-code Parameters responses where result=false, prod has no display parameter, and dev has a display parameter.
Normalizes: strips the display parameter from dev to match prod.
Eliminates: 74 records (73 with only the display diff, 1 with additional message/issues diffs that will remain after normalization).


d9457f4d-39c0-445a-96d4-0721961e169d — POST /r4/CodeSystem/$validate-code, code U in system https://codesystem.x12.org/005010/1338


f45c848 #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev echoes display param on failed validate-code

---

### [x] `cff4061` HCPCS CodeSystem loaded in dev but unknown in prod — 110 result-disagrees

Records-Impacted: 123
Tolerance-ID: hcpcs-codesystem-availability
Record-ID: 238a26b7-46b6-4095-a3ba-364b1973da4d


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?system=http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets&code=G0154' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?system=http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets&code=G0154' \
-H 'Accept: application/fhir+json'
```

Prod returns `result: false` with `x-caused-by-unknown-system` ("A definition for CodeSystem 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets' could not be found"). Dev returns `result: true` with `version: "2025-01"` and `display: "health or hospice setting, each 15 minutes"`.


For $validate-code requests involving system http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets, prod returns result=false with the error "A definition for CodeSystem 'http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets' could not be found, so the code cannot be validated" and x-caused-by-unknown-system. Dev returns result=true with version 2025-01, display text, system, and code parameters — successfully finding and validating the codes.

The diagnostics confirm: prod says "CodeSystem not found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets" while dev says "CodeSystem found: http://www.cms.gov/Medicare/Coding/HCPCSReleaseCodeSets|2025-01".


123 delta records mention HCPCS (all validate-code operations):
- 110 result-disagrees: prod=false dev=true (prod doesn't have HCPCS, dev does)
- 4 result-disagrees: prod=true dev=false (code 33206, likely a different sub-issue)
- 9 content-differs: same result but differences in surrounding content

Searched with: grep -c 'HCPCSReleaseCodeSets' jobs/2026-02-round-1/results/deltas/deltas.ndjson
All 110 prod=false/dev=true records have x-caused-by-unknown-system pointing to HCPCSReleaseCodeSets.


Tolerance ID: hcpcs-codesystem-availability. Matches validate-code records where prod has x-caused-by-unknown-system for HCPCSReleaseCodeSets and dev returns result=true. Skips these records since the root cause is code system availability, not a logic bug.


c3faf44 #1 Claude (AI Assistant) <>

GG confirmed: HCPCS will be defined in tx.fhir.org next time it restarts

---

### [ ] `dc0b0d1` CodeSystem/$validate-code without system: different error message and severity

Records-Impacted: 1
Tolerance-ID: cs-validate-code-no-system-error-format
Record-ID: 9afb9fcf-df5f-4766-a56a-33379c66b90a


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"code":"OBG"}}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"code":"OBG"}}]}'
```

Prod returns severity=`warning` with message "Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided" and includes `details.coding` with code `invalid-data` from the `tx-issue-type` system. Dev returns severity=`error` with message "No CodeSystem specified - provide url parameter or codeSystem resource" and no `details.coding`.


POST /r4/CodeSystem/$validate-code with code "OBG" and no system parameter.

Both servers return result=false, but they differ in how they report the error:

- **Prod**: severity=warning, message="Coding has no system. A code with no system has no defined meaning, and it cannot be validated. A system should be provided", includes details.coding with code "invalid-data" from tx-issue-type system
- **Dev**: severity=error, message="No CodeSystem specified - provide url parameter or codeSystem resource", no details.coding at all

Three distinct differences:
1. Severity: warning (prod) vs error (dev)
2. Message text: completely different wording
3. Issue detail coding: prod includes structured tx-issue-type coding, dev omits it


This is the only record in the dataset with this specific pattern. Searched for "No CodeSystem specified" across both comparison.ndjson and deltas.ndjson — found exactly 1 match. The request shape (POST to /r4/CodeSystem/$validate-code without trailing ?) is also unique.


Tolerance ID: cs-validate-code-no-system-error-format
Matches: POST /r4/CodeSystem/$validate-code (without trailing ?), where dev message contains "No CodeSystem specified". Normalizes message and issues to prod's values to suppress this single record.


9afb9fcf-df5f-4766-a56a-33379c66b90a

---

### [x] `a881823` CPT -code: dev fails to recognize valid CPT codes (result=false)

Records-Impacted: 45
Tolerance-ID: cpt-validate-code-result-disagrees
Record-ID: d05e7906-16ee-4915-8c8a-92137b4e62c7


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99214"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99214"}]}'
```

Prod returns `result: true` with display "Office or other outpatient visit for the evaluation and management of an established patient..." and version "2023". Dev returns `result: false` with "Unknown code '99214' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'".


Dev returns `result: false` with "Unknown code '<code>' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'" for CPT codes that prod successfully validates as `result: true`. Prod returns the code's display text and version; dev returns an error OperationOutcome with `code-invalid`.

Example: CPT code 99214 (a standard E&M visit code). Prod validates it successfully with display text. Dev says it's unknown.

This affects 17 distinct CPT codes: 33206, 44211, 44401, 45346, 58545, 70551, 73722, 74263, 77061, 77081, 81528, 82274, 83036, 87624, 88175, 93978, 99214.

Both servers reference the same CodeSystem version (2023), suggesting dev has the CPT CodeSystem loaded but its concept list is incomplete or not being searched correctly.


45 result-disagrees records total:
- 41 on POST /r4/CodeSystem/$validate-code
- 4 on POST /r4/ValueSet/$validate-code

All are prod=true/dev=false (dev never finds these codes). Searched with:
grep 'ama-assn.org/go/cpt' results/deltas/deltas.ndjson | grep result-disagrees

There are also 71 content-differs and 8 status-mismatch records for CPT (124 total CPT delta records), likely related to the same underlying data issue, but those are separate patterns.


Tolerance `cpt-validate-code-result-disagrees` skips all validate-code records where system is http://www.ama-assn.org/go/cpt and prod=true/dev=false (result-disagrees). Eliminates 45 records.


af85881 #1 Claude (AI Assistant) <>

GG confirmed fixed: CPT validate-code: dev fails to recognize valid CPT codes

---

### [x] `6c31e76` Dev appends 'and undefined' to valid version list in UNKNOWN_CODESYSTEM_VERSION messages

Records-Impacted: 26
Tolerance-ID: unknown-version-valid-versions-message
Record-ID: a3cf69a7-48f3-47b8-a29d-cd6453647621


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"116101001"},{"name":"version","valueString":"2017-09"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"116101001"},{"name":"version","valueString":"2017-09"}]}'
```

Prod message ends cleanly: `...http://snomed.info/xsct/900000000000207008/version/20250814`. Dev message ends with: `...http://snomed.info/xsct/900000000000207008/version/20250814 and undefined`.


When a requested CodeSystem version is not found, both prod and dev return an UNKNOWN_CODESYSTEM_VERSION error listing available versions. Dev appends " and undefined" at the end of this version list in 26 of 40 such records.

Example from dev message:
"...http://snomed.info/xsct/900000000000207008/version/20250814 and undefined"

Prod message ends cleanly:
"...http://snomed.info/xsct/900000000000207008/version/20250814"

This appears to be a JS undefined value being concatenated into the version list string, likely from an off-by-one or array join issue.


26 records in deltas.ndjson contain "and undefined" in the devBody. All are validate-code operations. The pattern appears across SNOMED and other code systems when the requested version is not found.

Search: grep -c 'and undefined' deltas.ndjson => 26


Tolerance `unknown-version-valid-versions-message` normalizes the message and issues text in UNKNOWN_CODESYSTEM_VERSION responses by stripping "Valid versions:" lists from both sides. This covers both the "and undefined" bug and the version list differences caused by different editions being loaded.


a3cf69a7-48f3-47b8-a29d-cd6453647621 — POST /r4/CodeSystem/$validate-code for SNOMED 2017-09, both return result=false


69c2361 #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev appends "and undefined" to valid version list

---

### [x] `f45a4bc` Expand display text differs between prod and dev for same codes

Records-Impacted: 157
Tolerance-ID: expand-display-text-differs
Record-ID: 6d25c912-25f4-45cf-8dea-3dd07d9d7e1e


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"116101001"}]}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://snomed.info/sct","concept":[{"code":"116101001"}]}]}}}]}'
```

Prod returns display `"Product containing gonadotropin releasing hormone receptor antagonist (product)"` (FSN), dev returns `"Gonadotropin releasing hormone antagonist"` (inactive synonym). Same SNOMED version on both servers (20250201).


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


157 expand delta records have display text diffs in expansion.contains.

By code system:
- http://snomed.info/sct: 134 records
- urn:iso:std:iso:3166: 22 records
- http://unitsofmeasure.org: 1 record

Search: Compared expansion.contains display values between prodBody and devBody for
all expand deltas in results/deltas/deltas.ndjson.


Tolerance ID: expand-display-text-differs
Matches: $expand responses (resourceType=ValueSet with expansion) where any
contains[].display differs between prod and dev for the same code.
Normalizes: Sets both sides' display to prod's value (canonical), preserving other
field differences.


- 6d25c912-25f4-45cf-8dea-3dd07d9d7e1e (SNOMED 116101001)
- 44f0851b-80e8-4a27-b05e-551c0522e39b (SNOMED 425901007, 161744009)
- 2ff10aef-7210-489d-bb28-6c7739c27027 (ISO 3166 CUW, ALA, CIV)


f2425ca #1 Claude (AI Assistant) <>

Adjudicated by GG: Same issue as SNOMED display text — fixed but both sides random

---

### [ ] `4bd6271` ISO 3166 : prod includes 42 reserved/user-assigned codes that dev omits

Records-Impacted: 7
Tolerance-ID: expand-iso3166-extra-reserved-codes
Record-ID: 70faaf64-3ca5-4ee1-94f1-7f89ad1cf7ed


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=urn:iso:std:iso:3166&code=AA' \
-H 'Accept: application/fhir+json'
```

Prod validates code `AA` (a reserved/user-assigned code) as valid in `urn:iso:std:iso:3166`, dev rejects it as unknown. This confirms prod's code system includes 42 reserved/user-assigned ISO 3166-1 codes that dev omits. The original bug was observed via `$expand` (291 vs 249 codes); the expand for the canonical `iso3166-1-2` ValueSet now returns 249 on both servers (the ValueSet compose filters to assigned codes only), but the underlying code system data still differs as shown by `$validate-code`.


POST /r4/ValueSet/$expand for ValueSets containing urn:iso:std:iso:3166: prod returns 291 codes (total=291), dev returns 249 codes (total=249). The 42 extra codes in prod are all ISO 3166-1 reserved/user-assigned codes:

- AA (User-assigned)
- QM through QZ (15 User-assigned codes)
- XA through XJ, XL through XZ (24 codes: mostly User-assigned, plus XK=Kosovo, XX=Unknown, XZ=International Waters)
- ZZ (Unknown or Invalid Territory)

Dev returns only the 249 standard assigned country codes.


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


Tolerance `expand-iso3166-extra-reserved-codes` matches expand records where both prod and dev use urn:iso:std:iso:3166 and prod.expansion.total > dev.expansion.total. It normalizes by filtering prod's contains array to only include codes present in dev, and sets both totals to dev's count. This eliminates 7 records while preserving any other differences (display text, etc.) for detection.

---

### [ ] `ccb86ff` Dev crashes (500) on valid $expand requests with JavaScript TypeErrors

Records-Impacted: 15
Tolerance-ID: expand-dev-crash-on-valid
Record-ID: 7598431b-1c90-409c-b8f2-2be8358e8be3


Prod returns 200 with valid ValueSet expansion; dev returns 500 with OperationOutcome containing JavaScript TypeErrors. Two distinct error messages observed:

1. `vs.expansion.parameter is not iterable` (1 record) — triggered when expanding `http://hl7.org/fhir/us/core/ValueSet/us-core-pregnancy-status`
2. `exp.addParamUri is not a function` (14 records) — triggered when expanding Verily phenotype ValueSets (e.g., `http://fhir.verily.com/ValueSet/verily-phenotype-*`)

Both are unhandled JS TypeErrors during the expand code path, causing 500 instead of a valid expansion.


15 records in deltas, all `POST /r4/ValueSet/$expand` with prod=200, dev=500:

```
grep '"dev-crash-on-valid"' results/deltas/deltas.ndjson | grep expand | wc -l
```

The `addParamUri` errors are all Verily phenotype ValueSets (14 records). The `parameter is not iterable` error affects 1 US Core ValueSet.


Tolerance `expand-dev-crash-on-valid` matches POST /r4/ValueSet/$expand where prod=200 and dev=500. Eliminates all 15 records.


- `7598431b-1c90-409c-b8f2-2be8358e8be3` (parameter is not iterable)
- `9ec233b5-f523-4ec4-b4f9-fcdf8b63d17f` (addParamUri)

---

### [ ] `5f7faaa` Dev crashes (500) on POST /r4/ValueSet/$validate-code with 'No Match for undefined|undefined'

Records-Impacted: 1
Tolerance-ID: validate-code-crash-undefined-system-code
Record-ID: 6b937ddc-13c0-49e1-bd96-24ef10f06543


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","code":"2108-9","display":"EUROPEAN"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/us/core/ValueSet/detailed-race","version":"6.1.0","status":"active","compose":{"include":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.1.11.14914"]},{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103"]}],"exclude":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.2074.1.1.3"]}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","code":"2108-9","display":"EUROPEAN"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/us/core/ValueSet/detailed-race","version":"6.1.0","status":"active","compose":{"include":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.1.11.14914"]},{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103"]}],"exclude":[{"valueSet":["http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113883.3.2074.1.1.3"]}]}}}]}'
```

Prod returns 200 with a Parameters response (result=false, with code system version details). Dev returns 500 with OperationOutcome `"No Match for undefined|undefined"`. The bug triggers when a ValueSet has `compose.exclude` entries with only a `valueSet` reference (no `system`); dev's exclude-processing code path reads `cc.system` and `cc.version` as `undefined` from the exclude entry.


Prod returns 200 with a successful $validate-code Parameters response (result=true, system=urn:oid:2.16.840.1.113883.6.238, code=2108-9, display="European", version="1.2"). Dev returns 500 with an OperationOutcome error: "No Match for undefined|undefined".

The error message "undefined|undefined" indicates that dev failed to extract the system and code parameters from the POST request body, receiving them as JavaScript `undefined` values instead.

The request is POST /r4/ValueSet/$validate-code against the http://hl7.org/fhir/us/core/ValueSet/detailed-race ValueSet (US Core detailed race codes). The request body was not captured in the comparison data, but two other POST $validate-code requests involving the same ValueSet (detailed-race) succeeded on both sides, suggesting this may be related to a specific combination of request parameters rather than the ValueSet itself.


Only 1 record in the comparison dataset exhibits this exact pattern. Searched:
- `grep -c 'undefined|undefined' comparison.ndjson` → 1
- All dev=500/prod=200 validate-code records → only this one
- All detailed-race records → 3 total, 2 succeed on both sides


Tolerance `validate-code-crash-undefined-system-code` matches POST /r4/ValueSet/$validate-code where prod=200, dev=500, and dev error contains "undefined|undefined". Skips the record. Eliminates 1 record.


6b937ddc-13c0-49e1-bd96-24ef10f06543

---

### [ ] `7069f54` BCP-47 case-sensitive validation: dev accepts 'en-us' (lowercase), prod correctly rejects it

Records-Impacted: 2
Tolerance-ID: bcp47-case-sensitive-validation
Record-ID: ba44d44e-929e-4b34-8d18-39ead53a68b6


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-us"},{"name":"display","valueString":"English (Region=United States)"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"urn:ietf:bcp:47"},{"name":"code","valueCode":"en-us"},{"name":"display","valueString":"English (Region=United States)"}]}'
```

Prod returns `result: false` with error "Unknown code 'en-us' in the CodeSystem 'urn:ietf:bcp:47'", dev returns `result: true` with display "English (Region=United States)".


Dev returns result=true for BCP-47 code "en-us" with display "English (Region=United States)". Prod returns result=false with error "Unknown code 'en-us' in the CodeSystem 'urn:ietf:bcp:47'" and informational issue "Unable to recognise part 2 (\"us\") as a valid language part".

The correct BCP-47 regional variant format is "en-US" (uppercase region code). BCP-47 is case-sensitive in FHIR (the code system has caseSensitive=true by default per the 2022 FHIR update). Prod correctly rejects the lowercase variant; dev incorrectly accepts it.


2 records in deltas, both for code "en-us" in system urn:ietf:bcp:47:
- ba44d44e-929e-4b34-8d18-39ead53a68b6: POST /r4/CodeSystem/$validate-code
- 175c5449-c70c-4c69-9e2e-4f728d035c1f: POST /r4/ValueSet/$validate-code

Search: grep 'en-us' jobs/2026-02-round-1/results/deltas/deltas.ndjson (2 matches, both result-disagrees with prodResult=false, devResult=true)

Both records show the same root cause: dev's BCP-47 code lookup is case-insensitive when it should be case-sensitive.


Tolerance ID: bcp47-case-sensitive-validation
Matches: result-disagrees records where system is urn:ietf:bcp:47 and prodResult=false, devResult=true.
Eliminates 2 records.

---

### [ ] `c31a8fe` Dev  succeeds (200) where prod refuses with too-costly (422) for grammar/large code systems

Records-Impacted: 12
Tolerance-ID: expand-too-costly-succeeds
Record-ID: 4fe6282f-ccf2-4340-9758-cbc70b7d2b79


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt"}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt"}]}}}]}'
```

Prod returns HTTP 422 with OperationOutcome code `too-costly`: "The code System has a grammar, and cannot be enumerated directly". Dev returns HTTP 200 with a ValueSet expansion containing 7 CPT codes (99202, 99203, 0001A, 25, P1, 1P, F1).


Prod returns HTTP 422 with an OperationOutcome containing issue code `too-costly` for certain $expand requests. Dev returns HTTP 200 with a successful ValueSet expansion containing codes.

Prod's error messages fall into two patterns:
- "The code System \"X\" has a grammar, and cannot be enumerated directly" (10 records: 8 CPT, 2 BCP-13/MIME types)
- "The value set '' expansion has too many codes to display (>10000)" (2 records: NDC)

Dev expands these successfully, returning actual codes. For example, for CPT, dev returns 7 codes with full display text; for NDC, dev returns total=0 (empty expansion).


12 records, all POST /r4/ValueSet/$expand, all with prodStatus=422 and devStatus=200.

Breakdown by code system:
- 8 records: http://www.ama-assn.org/go/cpt (CPT)
- 2 records: urn:ietf:bcp:13 (MIME types)
- 2 records: http://hl7.org/fhir/sid/ndc (NDC — "too many codes" variant)

Search: `grep '"prodStatus":422,"devStatus":200' results/deltas/deltas.ndjson | wc -l` → 12


Tolerance ID: `expand-too-costly-succeeds`. Matches POST /r4/ValueSet/$expand where prod.status=422 and dev.status=200, and prod body contains issue code `too-costly`. Skips the record. Eliminates all 12 records.


- 4fe6282f-ccf2-4340-9758-cbc70b7d2b79 (CPT grammar)
- d1360bdd-814e-4da9-af67-e4c9e145f3f1 (BCP-13 grammar)
- 3a9f2a04-94d7-431a-95dd-af16ff2ee3f7 (NDC too many codes)

---

### [x] `39d9af6` SNOMED display text differs for same edition version

Records-Impacted: 59
Tolerance-ID: snomed-same-version-display-differs
Record-ID: 9e9e9c20-cc34-43f8-a0fa-54e8cac48e55


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=48546005' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code?url=http://snomed.info/sct&code=48546005' \
-H 'Accept: application/fhir+json'
```

Prod returns `display: "Product containing diazepam (medicinal product)"`, dev returns `display: "Diazepam"`. Both report version `http://snomed.info/sct/900000000000207008/version/20250201`. Also confirmed with code 409063005: prod returns `"Counselling"`, dev returns `"Counseling (regime/therapy)"`.


For SNOMED $validate-code requests where both prod and dev report the same SNOMED CT edition version (e.g., 20250201), the display text returned for certain codes differs between the two servers. Examples:

- Code 10019 (Diazepam product): prod="Product containing diazepam (medicinal product)", dev="Diazepam"
- Code 385049006 (Capsule): prod="Capsule", dev="Capsule (product)"
- Code 44808001 (Counselling): prod="Counselling", dev="Counseling (regime/therapy)"
- Code 15188001 (Hearing loss): prod="Hearing loss", dev="Deafness"
- Code 46635009 (Diabetes type I): prod="Diabetes mellitus type I", dev="Insulin dependent diabetes mellitus"

Both servers agree on result=true, system, code, and version. Only the display (preferred term) differs.


59 validate-code records show this pattern. All involve http://snomed.info/sct with matching version strings (primarily 20250201). Found via:

grep '"param":"display"' results/deltas/deltas.ndjson | grep 'snomed'

then filtering to records where prod and dev version parameters are identical.


Tolerance ID: snomed-same-version-display-differs. Matches SNOMED validate-code Parameters responses where versions are identical but display text differs. Normalizes both sides to prod's display value.


329fd29 #1 Claude (AI Assistant) <>

Adjudicated by GG: Fixed — but won't achieve consistency with prod, since prod has the same bug (random which it chooses)

---

### [ ] `674611c` Dev returns extra 'message' parameter with filter-miss warnings on successful validate-code

Records-Impacted: 12
Tolerance-ID: validate-code-extra-filter-miss-message
Record-ID: 7c3bf322-7db7-42f5-82d6-dd1ef9bd9588


**Status: Inconclusive** -- the IPS ValueSets (e.g. `allergies-intolerances-uv-ips|2.0.0`) used in all 12 affected records are not loaded on the public tx.fhir.org / tx-dev.fhir.org servers, so the original requests cannot be replayed. The request bodies were not stored in the comparison records.

Attempted:
1. Reconstructed POST to `/r4/ValueSet/$validate-code` for SNOMED 716186003 against `http://hl7.org/fhir/uv/ips/ValueSet/allergies-intolerances-uv-ips` (with and without version) -- both servers return "value Set could not be found"
2. Checked 33 related delta records -- only IPS ValueSet records (not publicly available) match the exact bug pattern (result=true on both, dev extra message, prod no message)
3. Non-IPS records (medication-form-codes, us-core-encounter-type) show a different pattern (result=false on both sides, different message content)


On $validate-code requests against ValueSets with multiple include filters (e.g. IPS allergies-intolerances, medical-devices), when the code is valid (result=true, found in at least one filter), dev returns an extra `message` parameter containing "Code X is not in the specified filter" for each filter the code did NOT match. Prod omits the `message` parameter entirely when the overall result is true.

Example (record 7c3bf322):
- Prod: result=true, no message parameter
- Dev: result=true, message="Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter; Code 716186003 is not in the specified filter"

The code 716186003 (No known allergy) is valid in the IPS allergies ValueSet but only matches the 4th include filter (concept<<716186003). Dev reports failure messages for the 3 filters it didn't match.


12 records in deltas.ndjson, all POST /r4/ValueSet/$validate-code with result=true. All involve SNOMED codes against IPS ValueSets with multiple include filters. Found via:
```
grep 'extra-in-dev' results/deltas/deltas.ndjson | grep '"message"' → 23 hits
```
Of those, 12 have this pattern (single diff: extra-in-dev:message, result=true on both sides, dev message contains "is not in the specified filter", prod has no message param).

The remaining 11 are different patterns (multiple diffs, result=false, or different message content).


Tolerance ID: validate-code-extra-filter-miss-message
Matches: validate-code where result=true on both sides, dev has a `message` parameter that prod lacks, and the dev message matches the pattern "is not in the specified filter".
Normalizes: strips the extra `message` parameter from dev.

---

### [ ] `2938dc7` POST -code: dev returns result=false due to undefined system in request body extraction

Records-Impacted: 89
Tolerance-ID: validate-code-undefined-system-result-disagrees
Record-ID: a27be88a-8e1e-4ce8-8167-af0515f294d3


**Attempt 1** — CodeSystem/$validate-code with SNOMED 26643006:
```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"26643006"},{"name":"display","valueString":"oral"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Both servers now return `result: true`. Bug no longer reproduces on this endpoint.

**Attempt 2** — ValueSet/$validate-code with LOINC 8302-2 against vital signs ValueSet:
```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"8302-2"},{"name":"display","valueString":"Body height"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"system","valueUri":"http://loinc.org"},{"name":"code","valueCode":"8302-2"},{"name":"display","valueString":"Body height"},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Both servers now return `result: true`. Bug no longer reproduces on this endpoint.

**Attempt 3** — ValueSet/$validate-code with SNOMED 116154003 against CTS ValueSet:
```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1099.30"},{"name":"valueSetVersion","valueString":"20190418"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"116154003","display":"Patient (person)"}],"text":"Patient"}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1099.30"},{"name":"valueSetVersion","valueString":"20190418"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"116154003","display":"Patient (person)"}],"text":"Patient"}},{"name":"displayLanguage","valueCode":"en-US"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```
Result: Prod returns `result: true`, dev returns `result: false`. Dev's error message ends with "and undefined" in the valid SNOMED versions list, confirming the "undefined" leak persists in dev's internal data. However, the primary failure is a SNOMED US Edition version mismatch (dev looks for version `20250301` which it doesn't have), so this is not a clean repro of the POST body extraction bug specifically.

**Conclusion**: The original bug (system=undefined in POST body extraction causing result=false) no longer reproduces on simple CodeSystem and ValueSet endpoints. Dev may have partially fixed the POST body parameter extraction. However, "undefined" still appears in dev's valid-versions list, suggesting residual issues. The original IPS ValueSets (medication-uv-ips, results-laboratory-pathology-observations-uv-ips) used by the 89 affected records are no longer available on either server.


Dev returns `result: false` on POST $validate-code requests where prod returns `result: true`. Dev's diagnostics reveal the system URI is "undefined" during validation:

- Validate trace shows: `Validate "[undefined#CODE (...)]"` instead of `[http://snomed.info/sct#CODE (...)]`
- ValueSet include filters show as empty `()` instead of actual SNOMED/LOINC filter expressions (e.g. `(http://snomed.info/sct)(concept<763158003)`)
- CodeSystem/$validate-code returns "Unknown code 'undefined' in the CodeSystem ..." for 14 LOINC records

Both servers use the same SNOMED/LOINC editions (version strings match). Prod correctly validates the codes; dev fails to extract the system parameter from the POST request body and receives it as JavaScript `undefined`.


89 result-disagrees records, ALL with prodResult=true and devResult=false:

- 74 POST /r4/ValueSet/$validate-code (42 IPS lab results, 15 @all, 9 VSAC, 7 CTS medication, 6 IPS procedures, 3 IPS medication, 2 CTS medication v2)
- 15 POST /r4/CodeSystem/$validate-code (14 LOINC property components, 1 SNOMED with display validation)

Code systems affected: LOINC (56), SNOMED (24), RxNorm (9).

Search used: `grep 'result-disagrees' results/deltas/deltas.ndjson > /tmp/result-disagrees.ndjson` then analyzed by URL, system, and ValueSet.

All 89 records show "undefined" in dev diagnostics trace.

Related to bug 4cdcd85 which covers the crash (500) variant of the same root cause — dev fails to extract system/code from POST body. These 89 records are the non-crash variant where dev returns 200 but with wrong result.


Tolerance `validate-code-undefined-system-result-disagrees` matches POST $validate-code records where prod result=true, dev result=false, and dev diagnostics contain the literal string "undefined". This covers all 89 records.


`a27be88a-8e1e-4ce8-8167-af0515f294d3` — POST /r4/ValueSet/$validate-code, SNOMED 48546005 in IPS medication ValueSet. Prod: result=true, display="Product containing diazepam (medicinal product)". Dev: result=false, "No valid coding was found for the value set".

---

### [x] `d444de7` Dev prepends filter-miss details to validate-code message when result=false

Records-Impacted: 32
Tolerance-ID: validate-code-filter-miss-message-prefix
Record-ID: 6d44fc66-34dd-4ebe-889e-02cf345990f3


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-form-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"385049006","display":"Capsule"}]}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-form-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"385049006","display":"Capsule"}]}}]}'
```

Prod message: `"No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`, dev message: `"Code 385049006 is not in the specified filter; No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"`. Dev prepends the filter-miss detail exactly as described.


On $validate-code requests against ValueSets with include filters, when the code is not found (result=false on both sides), dev prepends "Code X is not in the specified filter; " to its `message` parameter. Prod returns only the standard error message (e.g. "No valid coding was found for the value set '...'").

Example (record 6d44fc66):
- Prod message: "No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"
- Dev message: "Code 385049006 is not in the specified filter; No valid coding was found for the value set 'http://hl7.org/fhir/ValueSet/medication-form-codes|4.0.1'"

Dev repeats the filter-miss prefix once per include filter in the ValueSet. Some records have 17+ repetitions (e.g. IPS results-coded-values-laboratory-pathology with 17 include filters).

Both sides agree on result=false. The only difference is dev's message has extraneous filter-checking details prepended. This is the result=false variant of bug eaeccdd (which covers result=true, where prod omits message entirely).


32 records in deltas.ndjson, all POST /r4/ValueSet/$validate-code with result=false on both sides. Found via:
```
grep 'is not in the specified filter' results/deltas/deltas.ndjson | wc -l  → 32
```

All are validate-code / content-differs. 30 have message as the only diff; 2 also have a version diff (SNOMED version skew, separate issue).

ValueSets affected include medication-form-codes, problems-uv-ips, vaccines-uv-ips, results-coded-values-laboratory-pathology-uv-ips, and others with SNOMED include filters.


Tolerance ID: validate-code-filter-miss-message-prefix
Matches: validate-code where result=false on both sides, dev's message ends with prod's message, and the extra prefix contains "is not in the specified filter".
Normalizes: sets dev's message to prod's message value.


d54c4b4 #1 Claude (AI Assistant) <>

GG confirmed fixed: Dev prepends filter-miss details to validate-code message

---

### [ ] `3b864c6` SNOMED inactive display message lists extra synonyms vs prod

Records-Impacted: 3
Tolerance-ID: inactive-display-message-extra-synonyms
Record-ID: 292172fe-c9f1-4ca4-b1a7-1f353187c9ba


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/condition-severity"},{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"6736007","display":"Moderate"}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/condition-severity"},{"name":"coding","valueCoding":{"system":"http://snomed.info/sct","code":"6736007","display":"Moderate"}}]}'
```

Prod returns `"The correct display is one of Midgrade"`, dev returns `"The correct display is one of Midgrade,Moderate (severity modifier) (qualifier value),Moderate (severity modifier),Moderate severity"`.


When validating a code with an inactive display (INACTIVE_DISPLAY_FOUND), the OperationOutcome issue details.text "correct display" list differs between prod and dev:

- Prod: "'Moderate' is no longer considered a correct display for code '6736007' (status = inactive). The correct display is one of Midgrade"
- Dev: "'Moderate' is no longer considered a correct display for code '6736007' (status = inactive). The correct display is one of Midgrade,Moderate (severity modifier) (qualifier value),Moderate (severity modifier),Moderate severity"

Prod lists only the preferred display term. Dev lists multiple synonyms/designations in addition to the preferred term.

Same pattern for code 78421000 (Intramuscular): prod lists only "Intramuscular route" (quoted), dev lists "Intramuscular route,Intramuscular route (qualifier value),Intramuscular use,IM route,IM use".


3 records in the comparison dataset, all in deltas:
- 292172fe: POST /r4/ValueSet/$validate-code (SNOMED 6736007)
- 01902b33: POST /r4/CodeSystem/$validate-code (SNOMED 78421000)
- a0e9c508: POST /r4/CodeSystem/$validate-code (SNOMED 78421000)

All are SNOMED validate-code with display-comment issue type and INACTIVE_DISPLAY_FOUND message ID.

Search: grep 'INACTIVE_DISPLAY_FOUND' deltas.ndjson | wc -l → 3


Tolerance ID: inactive-display-message-extra-synonyms
Matches validate-code records where OperationOutcome has display-comment issues with differing details.text that share the same prefix up to "The correct display is one of". Normalizes both sides to prod's text. Eliminates 3 records.

---

### [ ] `0abae17` POST -code: dev missing code/system/display params and extra issues due to undefined system extraction

Records-Impacted: 3
Tolerance-ID: validate-code-undefined-system-missing-params
Record-ID: 243e44e8-cafb-44ba-a521-de4aab9d6985


Could not reproduce live. The original request was a POST to `/r4/ValueSet/$validate-code` with a `codeableConcept` parameter (SNOMED code 785126002) validated against the IPS medication ValueSet (`http://hl7.org/fhir/uv/ips/ValueSet/medication-uv-ips|2.0.0`). The ValueSet is not natively available on either server — it was provided inline via the test framework (likely as a `tx-resource` parameter). The request body was not stored in the comparison data, and the inline ValueSet definition is not available, so the exact request cannot be reconstructed.

Attempted with a server-resident ValueSet (`http://hl7.org/fhir/ValueSet/medication-codes`), but both servers correctly return `system`, `code`, and `display` for that case — the undefined system extraction bug only manifests when the ValueSet is provided inline via the test framework's request format.

```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"785126002","display":"Product containing precisely methylphenidate hydrochloride 5 milligram/1 each conventional release chewable tablet"}]}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/medication-codes"},{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://snomed.info/sct","code":"785126002","display":"Product containing precisely methylphenidate hydrochloride 5 milligram/1 each conventional release chewable tablet"}]}}]}'
```

Both servers return matching `system`, `code`, and `display` parameters with server-resident ValueSets. The bug requires the inline ValueSet provision path used by the Java validator test framework.


On POST /r4/ValueSet/$validate-code with codeableConcept input, dev fails to return `code`, `system`, and `display` output parameters that prod returns. Dev also returns extra OperationOutcome issues (`this-code-not-in-vs`, `not-in-vs`) that prod does not include. Both servers agree result=false (because the submitted display text is wrong).

Specific differences in the normalized output:
- **Prod returns**: code=785126002, system=http://snomed.info/sct, display="Methylphenidate hydrochloride 5 mg chewable tablet"
- **Dev returns**: none of these three parameters
- **Prod issues**: 1 issue (invalid-display error)
- **Dev issues**: 3 issues (this-code-not-in-vs information, invalid-display error, not-in-vs error)
- **Message**: Dev prepends "No valid coding was found for the value set..." to the message; prod has only the invalid-display message (already handled by invalid-display-message-format tolerance)

Dev diagnostics show `Validate "[undefined#785126002 ...]"` — the system is JavaScript "undefined", confirming the same POST body extraction failure as bugs 19283df and 4cdcd85.


3 records, all POST /r4/ValueSet/$validate-code with the same SNOMED code 785126002 validating against medication-uv-ips ValueSet:
- 243e44e8-cafb-44ba-a521-de4aab9d6985
- 683c85d6-b337-4460-a005-df239084339a
- 1e7a78b8-c2ec-4819-b871-31cd30f5af28

All 3 have result=false on both sides (display text is wrong), same SNOMED version. Pattern identified by searching for validate-code records where dev is missing both code and system parameters.


Tolerance `validate-code-undefined-system-missing-params` matches POST $validate-code with result=false where prod has code/system params but dev lacks them, and dev diagnostics contain "undefined". Eliminates all 3 records.


Same root cause as bug 19283df (result-disagrees variant, 89 records) and bug 4cdcd85 (crash variant, 1 record). All three stem from dev failing to extract system/code from POST request body.

---

### [ ] `16cbe05` Dev  includes warning-experimental expansion parameter that prod omits

Records-Impacted: 1
Tolerance-ID: expand-dev-warning-experimental-param
Record-ID: 5d1cbf41-db75-4663-8f3a-c492eb8a33aa


```bash
curl -sL 'https://tx.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50' \
-H 'Accept: application/fhir+json'

curl -sL 'https://tx-dev.fhir.org/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50' \
-H 'Accept: application/fhir+json'
```

Prod expansion parameters: `["count", "used-codesystem"]`. Dev expansion parameters: `["warning-experimental", "count", "used-codesystem"]`. Dev includes `{"name":"warning-experimental","valueUri":"http://hl7.org/fhir/ValueSet/languages|4.0.1"}` that prod omits entirely.


Dev $expand for http://hl7.org/fhir/ValueSet/languages includes an extra expansion.parameter `{"name":"warning-experimental","valueUri":"http://hl7.org/fhir/ValueSet/languages|4.0.1"}` that prod omits entirely.

The ValueSet has `experimental: true` in its metadata (both sides agree). Dev adds a `warning-experimental` parameter to the expansion to flag this fact; prod does not emit this warning parameter.


Only 1 record in the dataset contains this difference. Searched for:
- `grep -c 'warning-experimental' comparison.ndjson` → 1
- All expand records checked for dev-only `warning-*` parameters → only this one record
- Prod never emits any `warning-*` expansion parameters in any record

The pattern is specific to this ValueSet, though the behavior could in principle affect any experimental ValueSet expansion.


Tolerance `expand-dev-warning-experimental-param` matches $expand responses (ValueSet resourceType) where dev has `warning-experimental` parameter and prod does not. Strips the extra parameter from dev. Eliminates 1 record.


`5d1cbf41-db75-4663-8f3a-c492eb8a33aa` — GET /r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50

---

### [ ] `399b413` SNOMED expression parse error message differs: wording and character offset

Records-Impacted: 2
Tolerance-ID: snomed-expression-parse-message-diff
Record-ID: 2a323fee-2b5e-4c5f-ad4d-d623797b7f6f


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"freetext"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://snomed.info/sct"},{"name":"code","valueCode":"freetext"}]}'
```

Prod returns `"...and neither could it be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 1)"`, dev returns `"...and could not be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 0)"`.


When validating an invalid SNOMED CT code (e.g. "freetext"), both prod and dev return an informational issue with a SNOMED expression parse error. The message text differs in two ways:

- **Wording**: prod says "and neither could it be parsed as an expression", dev says "and could not be parsed as an expression"
- **Character offset**: prod reports "at character 1", dev reports "at character 0"

Prod: `Code freetext is not a valid SNOMED CT Term, and neither could it be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 1)`
Dev:  `Code freetext is not a valid SNOMED CT Term, and could not be parsed as an expression (Concept not found (next char = "f", in "freetext") at character 0)`

All other aspects of the response match (result=false, system, code, error issues, etc.).


2 records in the delta file, both for SNOMED code "freetext":
- 2a323fee: POST /r4/ValueSet/$batch-validate-code (batch-validate-code op)
- 1160ac1d: POST /r4/CodeSystem/$validate-code (validate-code op)

Search: `grep -c 'neither could it be parsed' deltas.ndjson` → 2

The pattern is specific to invalid SNOMED codes that trigger the expression parser fallback. Only "freetext" triggers it in this dataset.


Tolerance ID: snomed-expression-parse-message-diff
Matches: OperationOutcome issues where prod text contains "neither could it be parsed as an expression" and dev text contains "could not be parsed as an expression" for the same issue. Normalizes dev text to prod text.
Eliminates: 2 records.

---

### [ ] `d70be11` CodeSystem/-code with multi-coding CodeableConcept: prod and dev report different coding in system/code/version output params

Records-Impacted: 22
Tolerance-ID: multi-coding-cc-system-code-version-disagree
Record-ID: 40b1ef6a-5a08-4bf8-a34f-53ae336441d9

#####What differs

When POST $validate-code (CodeSystem or ValueSet level) is called with a CodeableConcept containing 2-3 codings, the scalar output parameters (system, code, version) disagree on which coding to report as the "primary" one. Both servers agree on the result boolean. This occurs in two scenarios:

1. **result=true** (3 records from round 1): Both validate successfully, but prod picks one coding (e.g., SNOMED) while dev picks another (e.g., custom CodeSystem). GG adjudicated: "not sure I care."

2. **result=false** (19 records from round 3): Both fail validation (e.g., due to an unknown SNOMED version), but prod picks LOINC as the "primary" coding and dev picks MDC (urn:iso:std:iso:11073:10101), or prod picks SNOMED and dev picks LOINC. Both sides have identical x-caused-by-unknown-system values. The most common pattern is 3-coding CodeableConcepts (MDC + SNOMED + LOINC) where the SNOMED version is unavailable on both servers.

#####How widespread

22 records total across rounds 1 and 3. All are POST $validate-code with multi-coding CodeableConcepts. Breakdown:
- 18 records: prod=LOINC, dev=MDC (3-coding CC with MDC/SNOMED/LOINC)
- 3 records: prod=SNOMED, dev=custom CS (2-coding CC, round 1 data)
- 1 record: prod=SNOMED, dev=LOINC (2-coding CC, wrong display name)

Found by searching for validate-code records where system param differs between prod and dev:
```
grep '"value-differs"' deltas.ndjson | grep '"param":"code"' | grep '"param":"system"'
```

#####Tolerances

- **multi-coding-cc-system-code-version-disagree**: Matches POST $validate-code where both results agree, system differs, and CodeableConcept has ≥2 codings. For result=false, also requires matching x-caused-by-unknown-system. Normalizes system/code/version to prod values. Eliminates 19 records in round 3 (3 from round 1 were in a different dataset).

#####Representative records

- 40b1ef6a-5a08-4bf8-a34f-53ae336441d9 (MDC/SNOMED/LOINC, result=false, prod=LOINC, dev=MDC)
- 76ce8632-cd73-48d7-970a-4da238b79be8 (LOINC/SNOMED, result=false, wrong display, prod=SNOMED, dev=LOINC)
- 65fabdc4-930b-49e8-9ff1-60c176cbbfee (custom CS/SNOMED, result=true, from round 1)

---

### [ ] `0b7549d` Resource read: prod omits text.div when text.status=generated, dev includes it

Records-Impacted: 4
Tolerance-ID: read-resource-text-div-diff
Record-ID: 31a631b5-8579-48d8-a95c-e40eadfd4714


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/us-core-laboratory-test-codes' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/us-core-laboratory-test-codes' \
-H 'Accept: application/fhir+json'
```

Prod returns `"text": {"status": "generated"}` with no `div` element. Dev returns `"text": {"status": "generated", "div": "<div>...Generated Narrative...</div>"}` with a full generated narrative. Same behavior on both the direct read (`/r4/ValueSet/us-core-laboratory-test-codes`) and search (`/r4/ValueSet?url=...`) paths.


When reading ValueSet resources (both direct reads like `/r4/ValueSet/us-core-laboratory-test-codes` and search reads like `/r4/ValueSet?url=...`), prod returns `text: {"status": "generated"}` without the `div` element, while dev returns `text: {"status": "generated", "div": "<div>...</div>"}` with a full generated narrative.

In FHIR R4, when `text.status` is present, the `div` element is required. Prod's omission of `div` with `status=generated` is technically non-conformant. Dev includes the correct generated narrative HTML.

The narrative content itself is auto-generated from the resource structure (e.g., listing included code systems and filters) and has no direct terminology significance.


4 delta records are affected, all for the same ValueSet (`us-core-laboratory-test-codes`) accessed via 2 URL patterns (direct read and search), each appearing twice in the test data:

- 31a631b5: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 296cf150: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)
- 9a2a81a0: GET /r4/ValueSet?url=...us-core-laboratory-test-codes (search)
- 6e354570: GET /r4/ValueSet/us-core-laboratory-test-codes (direct)

Search used: `grep '"op":"read"' deltas.ndjson` then checked all 8 results for text.div presence. Only these 4 had the pattern (the other 4 had different issues: entry count mismatch or other diffs).


Tolerance ID: `read-resource-text-div-diff`. Matches read operations (resource reads returning ValueSet, CodeSystem, or Bundle with entries) where both sides have `text.status=generated` but differ on `div` presence. Normalizes by stripping `text.div` from both sides and comparing the rest. Eliminates 4 records.


`grep -n '31a631b5-8579-48d8-a95c-e40eadfd4714' comparison.ndjson`

---

### [x] `de3b882` CPT $expand: dev returns empty expansion (total=0) for ValueSets containing CPT codes

Records-Impacted: 45
Tolerance-ID: cpt-expand-empty-results
Record-ID: d03ce6c0-d498-4c96-9165-261fdecc484c


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt","concept":[{"code":"83036"}]}]}}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"ValueSet","status":"active","compose":{"include":[{"system":"http://www.ama-assn.org/go/cpt","concept":[{"code":"83036"}]}]}}'
```

Prod returns `total: 1` with CPT code 83036 ("Hemoglobin; glycosylated (A1C)") in `expansion.contains`. Dev returns `total: 0` with no `contains` array. Both report `used-codesystem: http://www.ama-assn.org/go/cpt|2023`.


Dev returns `total: 0` with no `expansion.contains` array for $expand requests involving CPT codes (`http://www.ama-assn.org/go/cpt|2023`). Prod returns `total: 1` (or more) with the expected CPT codes in `expansion.contains`.

Example (record d03ce6c0): POST /r4/ValueSet/$expand for a ValueSet containing CPT code 83036 ("Hemoglobin; glycosylated (A1C)"). Prod returns the code in the expansion; dev returns an empty expansion with total=0.

Both servers use the same `used-codesystem` version (`http://www.ama-assn.org/go/cpt|2023`), indicating dev believes it has CPT loaded but fails to resolve any codes from it.


45 out of 50 $expand delta records with CPT codes show this pattern. Found via:
```bash
python3 -c "..." # -> 45 of 46 CPT expand deltas
```

All 45 records are POST /r4/ValueSet/$expand with `used-codesystem` of `http://www.ama-assn.org/go/cpt|2023`.


Same root cause as bug f559b53 (CPT validate-code returns "Unknown code"). Dev's CPT data appears non-functional — codes are unknown for validation and absent from expansions.


Tolerance `cpt-expand-empty-results` matches POST /r4/ValueSet/$expand where dev returns total=0 and prod returns total>0, and the expansion uses CPT as a code system. Skips these records entirely since comparison is meaningless when dev has no CPT data.


ddec37b #1 Claude (AI Assistant) <>

GG confirmed fixed: CPT $expand: dev returns empty expansion

---

### [x] `4f824c2` validate-code: dev omits message parameter when result=true

Records-Impacted: 150
Tolerance-ID: validate-code-missing-message-on-true
Record-ID: e934228b-f819-4119-bdd2-dcf4a72988bc


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/icd-9-cm"},{"name":"code","valueCode":"441"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/icd-9-cm"},{"name":"code","valueCode":"441"}]}'
```

Prod returns `result: true` with a `message` parameter: "Unknown Code '441' in the CodeSystem 'http://hl7.org/fhir/sid/icd-9-cm' version '2015' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment". Dev returns `result: true` but omits the `message` parameter entirely.


Dev omits the `message` output parameter on $validate-code responses when `result=true`. Prod includes it. The FHIR spec explicitly states that when result is true, the message parameter "carries hints and warnings."

In this dataset, all 150 affected records have `result=true` and prod returns a `message` containing warnings like "Unknown Code '441' in the CodeSystem 'http://hl7.org/fhir/sid/icd-9-cm' version '2015' - note that the code system is labeled as a fragment, so the code may be valid in some other fragment."

When `result=false`, dev correctly includes the `message` parameter.


150 records in comparison.ndjson (38 in current deltas after other tolerances):
- 111 POST /r4/ValueSet/$validate-code
- 39 POST /r4/CodeSystem/$validate-code

All 150 have `result=true` in both prod and dev. The pattern is: validate-code + result=true + prod has message + dev omits message.

Search: `grep 'missing-in-dev.*message' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 48 lines (38 with actual message param diff after filtering false positives from grep matching "message" elsewhere in the line).

Verified in full comparison.ndjson: all 150 records where prod has a message param and dev doesn't have dev result=true (0 with result=false, 0 with no result).


Tolerance ID: validate-code-missing-message-on-true. Matches validate-code Parameters responses where result=true, prod has a message parameter, and dev does not. Normalizes by stripping the message parameter from prod (since dev doesn't have it and we can't fabricate it). This is a lossy normalization — it hides the missing warning, but the warning content is already present in the issues OperationOutcome.


e934228b-f819-4119-bdd2-dcf4a72988bc — POST /r4/CodeSystem/$validate-code for ICD-9-CM code 441.


48fc8a2 #1 Claude (AI Assistant) <>

GG: Ignored — no reproduction instructions. Tolerance removed to see if pattern recurs.

---

### [ ] `1d45060` CPT validate-code: dev omits informational 'Code X not found in CPT' issue

Records-Impacted: 10
Tolerance-ID: cpt-validate-code-missing-info-issue
Record-ID: e8127050-3f19-4115-bf45-a50dfea09d40


```bash
curl -s "https://tx.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"19304"}]}'

curl -s "https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"19304"}]}'
```

Prod returns 2 OperationOutcome issues: `severity=error` ("Unknown code '19304' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'") and `severity=information` ("Code '19304' not found in CPT"). Dev returns only the error issue and omits the informational one.


When validating an unknown CPT code (result=false), prod returns two OperationOutcome issues:
1. severity=error: "Unknown code 'X' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'"
2. severity=information: "Code 'X' not found in CPT"

Dev returns only the first (error) issue and omits the second (informational) issue.

For ValueSet/$validate-code (2 of the 10 records), this also affects the message parameter: prod prefixes the message with "Code 'X' not found in CPT; " while dev omits this prefix.

Both sides agree on result=false, system, code, and the primary error issue text.


10 records total: 8 POST /r4/CodeSystem/$validate-code and 2 POST /r4/ValueSet/$validate-code. All involve system http://www.ama-assn.org/go/cpt, result=false, where the code is unknown in CPT version 2023.

Search: checked all 57 delta records for cases where prod has more OperationOutcome issues than dev — found exactly 10 CPT records matching this pattern.

Codes affected: 19304 (2 records), 98000 (2 records), 99201 (6 records).


Tolerance ID: cpt-validate-code-missing-info-issue. Matches CPT validate-code records where result=false and prod has an extra informational "not found in CPT" issue. Normalizes by stripping the extra informational issue from prod and removing the corresponding message prefix. Eliminates 10 records.

---

### [ ] `61d43e0` Case-insensitive validate-code: dev returns extra normalized-code param, different severity and issue text

Records-Impacted: 4
Tolerance-ID: case-insensitive-code-validation-diffs
Record-ID: b6d0a8c8-a6e9-4acb-8228-f08aad1b1c49


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/\$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/icd-10-cm"},{"name":"code","valueCode":"M80.00xA"}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/\$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/sid/icd-10-cm"},{"name":"code","valueCode":"M80.00xA"}]}'
```

Prod returns severity `"warning"`, no `normalized-code` param, and bare system URI in issue text. Dev returns severity `"information"`, extra `normalized-code: "M80.00XA"` param, and versioned system URI (`http://hl7.org/fhir/sid/icd-10-cm|2024`) in issue text.

When validating codes in case-insensitive code systems (ICD-10, ICD-10-CM) where the submitted code has incorrect casing (e.g., "M80.00xA" instead of "M80.00XA", or "i50" instead of "I50"):

1. Dev returns an extra `normalized-code` output parameter containing the correctly-cased code. Prod omits this parameter entirely. The `normalized-code` parameter is a valid $validate-code output per the FHIR spec, so dev is arguably more informative, but the difference needs tracking.

2. The OperationOutcome issue severity differs: prod returns `"warning"`, dev returns `"information"` for the CODE_CASE_DIFFERENCE issue. Both convey the same message about case differences.

3. The issue details text includes the system URI version in dev but not in prod. Prod: "the code system 'http://hl7.org/fhir/sid/icd-10-cm' is case insensitive". Dev: "the code system 'http://hl7.org/fhir/sid/icd-10-cm|2024' is case insensitive".

All 4 records are POST /r4/CodeSystem/$validate-code with case-insensitive code systems (2 ICD-10-CM with code M80.00xA, 2 ICD-10 with code i50). Both sides agree result=true.

Search: `grep 'normalized-code' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 4
Cross-check: `grep 'CODE_CASE_DIFFERENCE' jobs/2026-02-round-1/results/deltas/deltas.ndjson | wc -l` → 4 (same records)

---

### [ ] `c59229b` CPT validate-code: dev says 'Unknown code' while prod says 'Wrong Display Name' for same CPT codes

Records-Impacted: 4
Tolerance-ID: cpt-validate-code-unknown-vs-invalid-display
Record-ID: d6a5e829-c5cc-44f3-b708-9615095c396b


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-H 'Accept-Language: en-US' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99235"},{"name":"display","valueString":"Observation or inpatient hospital care for problems of moderate severity"}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-H 'Accept-Language: en-US' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://www.ama-assn.org/go/cpt"},{"name":"code","valueCode":"99235"},{"name":"display","valueString":"Observation or inpatient hospital care for problems of moderate severity"}]}'
```

Prod returns `result=false` with issue `invalid-display` ("Wrong Display Name") — it finds CPT 99235 but rejects the display. Dev returns `result=false` with issue `invalid-code` ("Unknown code '99235'") — it cannot find the code at all. Confirmed 2026-02-07.


On POST /r4/CodeSystem/$validate-code for CPT code 99235, both servers return result=false, but for entirely different reasons:

- **Prod**: Finds the code in CPT 2023, returns version="2023", display (the correct display text), and error "Wrong Display Name" with issue code `invalid-display`. The code exists but the submitted display text is wrong.
- **Dev**: Cannot find the code at all, returns "Unknown code '99235' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'" with issue code `invalid-code`. No version or display parameters returned.

Additional parameter differences: prod returns `display` and `version` parameters that dev omits entirely.


4 delta records match this pattern. All are POST /r4/CodeSystem/$validate-code for CPT code 99235 with system http://www.ama-assn.org/go/cpt.

Search: all records where system=CPT, both result=false, prod has invalid-display issue, dev has invalid-code issue.

Record IDs: d6a5e829-c5cc, cce32e6a-60b5, b305620e-f843, f6ec96ae-ab93.


Same root cause as bug f559b53 (dev fails to recognize valid CPT codes). The existing tolerance cpt-validate-code-result-disagrees only covers the case where prodResult=true and devResult=false. This bug covers a different manifestation where both return result=false but for different reasons — prod recognizes the code and rejects the display, dev doesn't find the code at all.


Tolerance ID: cpt-validate-code-unknown-vs-invalid-display
Matches: CPT validate-code where both result=false, prod has invalid-display issue, dev has invalid-code issue.
Eliminates: 4 records.

---

### [ ] `0a23e86` Dev stringifies undefined code as literal 'undefined' in validate-code error messages

Records-Impacted: 2
Tolerance-ID: validate-code-undefined-code-message-diff
Record-ID: 712fb856-cb1d-47ca-87a5-3b9d82bfc8cd


```bash
curl -s "https://tx.fhir.org/r4/ValueSet/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"coding","valueCoding":{"system":"http://loinc.org"}}]}'

curl -s "https://tx-dev.fhir.org/r4/ValueSet/\$validate-code" \
-H "Accept: application/fhir+json" \
-H "Content-Type: application/fhir+json" \
-d '{"resourceType":"Parameters","parameter":[{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult"},{"name":"coding","valueCoding":{"system":"http://loinc.org"}}]}'
```

Prod returns message with `'http://loinc.org#'` (empty code, correct), plus `version: "2.81"`. Dev returns message with `'http://loinc.org#undefined'` (JS undefined coercion), an extra `invalid-code` OperationOutcome issue for "Unknown code 'undefined'", and omits the `version` parameter.


POST /r4/ValueSet/$validate-code: when the request contains a coding with no code value, dev treats the absent code as the literal string "undefined" (JavaScript undefined-to-string coercion). Both sides agree result=false, but:

- Prod message: "The provided code 'http://loinc.org#' was not found in the value set..."
- Dev message: "The provided code 'http://loinc.org#undefined' was not found in the value set..."

Dev also returns an extra OperationOutcome issue (invalid-code: "Unknown code 'undefined' in the CodeSystem 'http://loinc.org' version '2.81'") that prod does not include, and uses issue type code "invalid-code" instead of "not-in-vs".

The version parameter is also absent from dev's response (prod returns version: "2.81").


2 records in deltas show this pattern (both POST /r4/ValueSet/$validate-code). 16 total records in comparison.ndjson have #undefined in devBody, but 14 are CodeSystem/$validate-code where result disagrees (prod=true, dev=false) — those are already handled by tolerance validate-code-undefined-system-result-disagrees (bug 19283df). The remaining 2 are ValueSet/$validate-code where both agree result=false but the error messages differ.

Search: `grep '#undefined' results/deltas/deltas.ndjson` → 2 matches


Tolerance ID: validate-code-undefined-code-message-diff
Matches POST $validate-code records where both result=false and dev's message contains '#undefined' while prod's message contains '#' (empty code). Skips these records. Eliminates 2 delta records.


- 712fb856-cb1d-47ca-87a5-3b9d82bfc8cd
- ab72ac62-6f86-41fe-89b8-fae8b0701db4

Same root cause as bugs 19283df and 4cdcd85 — dev fails to extract values from POST request bodies, receiving JavaScript undefined.

---

### [ ] `23b3e84` validate-code message parameter only includes first issue text instead of all

Records-Impacted: 8
Tolerance-ID: message-concat-missing-issues
Record-ID: 69462376-1a61-4aa3-a8ea-3a140347fb3a


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"SI"}},{"name":"abstract","valueBoolean":false}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"SI"}},{"name":"abstract","valueBoolean":false}]}'
```

Prod message: `"A definition for CodeSystem 'SI' could not be found, so the code cannot be validated; Coding.system must be an absolute reference, not a local reference"` (both issue texts joined with `; `).
Dev message: `"A definition for CodeSystem 'SI' could not be found, so the code cannot be validated"` (only first issue text). Both servers return identical OperationOutcome `issues` with both errors.


When a $validate-code response has multiple OperationOutcome issues, the `message` parameter should concatenate all issue texts (joined with `; `). Prod does this correctly. Dev only includes the text from the first issue in the `message` parameter, omitting subsequent issue texts.

Example: for a relative system URI like "SI", both servers return two issues:
1. "A definition for CodeSystem 'SI' could not be found, so the code cannot be validated"
2. "Coding.system must be an absolute reference, not a local reference"

Prod message: "A definition for CodeSystem 'SI' could not be found, so the code cannot be validated; Coding.system must be an absolute reference, not a local reference"
Dev message: "A definition for CodeSystem 'SI' could not be found, so the code cannot be validated"

The OperationOutcome `issues` resource itself is identical between both servers — same issue codes, same details text, same severity. Only the top-level `message` summary parameter differs.


8 records in comparison.ndjson match this pattern. 5 are CodeSystem/$validate-code with relative system URIs (like "SI", "prov"), 3 are ValueSet/$validate-code. All are validate-code operations where multiple issues exist.

Search: Records where prod message equals '; '.join(all issue texts) and dev message equals only the first issue text, with 2+ issues.


Tolerance `message-concat-missing-issues` normalizes the `message` parameter to prod's concatenated value when the pattern matches (dev message equals first issue text, prod message equals all issues joined with '; '). This eliminates the 5 delta records matching this pattern.

---

### [ ] `3b1d8dc` Prod returns duplicate entries in searchset Bundle for same resource URL

Records-Impacted: 3
Tolerance-ID: searchset-duplicate-entries
Record-ID: 71e7b8c5-f8da-4323-b233-575727a2f583


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1021.103' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet?_format=json&url=http%3A%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1021.103' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx.fhir.org/r4/CodeSystem?_format=json&url=https%3A%2F%2Fnahdo.org%2Fsopt&version=9.2' \
-H 'Accept: application/fhir+json'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem?_format=json&url=https%3A%2F%2Fnahdo.org%2Fsopt&version=9.2' \
-H 'Accept: application/fhir+json'
```

Prod returns `total: 2` with duplicate entries for both the ValueSet and CodeSystem searches. Dev returns `total: 1` with a single entry in each case. For the ValueSet, the two prod entries have different `meta.lastUpdated` timestamps (2024-04-29 vs 2025-10-22). For the CodeSystem, the two prod entries are identical copies. Tested 2026-02-07.


When searching for ValueSet or CodeSystem resources by URL (e.g., `GET /r4/ValueSet?url=...`), prod returns Bundle with `total: 2` and two entries, while dev returns `total: 1` with one entry.

In record 71e7b8c5, prod returns two versions of ValueSet 2.16.840.1.113762.1.4.1021.103 with different `meta.lastUpdated` (2024-04-29 vs 2025-10-22), different `purpose` text, different `resource-lastReviewDate` extension values, and different expansion timestamps/identifiers. Dev returns only the first version.

In record c8adc8ae, prod returns two identical copies of CodeSystem `https://nahdo.org/sopt` version 9.2 (searched via `GET /r4/CodeSystem?url=https://nahdo.org/sopt&version=9.2`).


3 records in comparison.ndjson show `prod total > 1` in search Bundle responses out of 503 total resource search operations:
- 71e7b8c5: `/r4/ValueSet?url=http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103`
- c8adc8ae: `/r4/CodeSystem?url=https://nahdo.org/sopt&version=9.2`
- b9db7af5: `/r4/ValueSet?url=http://cts.nlm.nih.gov/fhir/ValueSet/2.16.840.1.113762.1.4.1021.103` (same URL, different request)

The pattern is: `GET /r4/{ValueSet|CodeSystem}?url=...` where prod has loaded multiple copies/versions of the same resource.


Tolerance `searchset-duplicate-entries` matches searchset Bundles where prod returns more entries than dev. It normalizes by keeping only the first entry from prod (matching dev's single entry) and setting both totals to the minimum. Affects 3 records.

---

### [ ] `8ef44d0` 500 OperationOutcome structural differences: missing issue.code on prod, extra diagnostics/text

Records-Impacted: 4
Tolerance-ID: error-operationoutcome-structure-diff
Record-ID: 1bb4cd9f-c99d-4431-b974-f6b5423eb529


Request bodies were not stored for these POST records. Attempted to reproduce
by constructing similar validate-code requests against unknown CodeSystem
`http://hl7.org/fhir/v3/AdministrativeGender`:

```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://hl7.org/fhir/v3/AdministrativeGender","code":"M"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/v3/AdministrativeGender"}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"http://hl7.org/fhir/v3/AdministrativeGender","code":"M"}},{"name":"valueSet","resource":{"resourceType":"ValueSet","compose":{"include":[{"system":"http://hl7.org/fhir/v3/AdministrativeGender"}]}}}]}'
```

**Result**: Both servers return HTTP 200 with `result: false` (not the original 500
OperationOutcome). Server behavior has changed since the comparison was captured
(2026-02-06). Three different request body variations were tried; none reproduced
the 500/500 pattern.

When both prod and dev return HTTP 500 with OperationOutcome, the response structures
differ in three ways:

1. **issue.code field**: Dev includes `code: "exception"` on each issue, prod omits it
 entirely. Per FHIR R4, `OperationOutcome.issue.code` is required (1..1), so prod is
 technically non-conformant.

2. **issue.diagnostics field**: Dev includes a `diagnostics` string (duplicating the
 `details.text` content), prod omits it. The `diagnostics` field is optional (0..1)
 per spec.

3. **text narrative element**: Prod includes `text: {status: "generated", div: "..."}`,
 dev omits the `text` element entirely. (The div is already stripped by the
 `read-resource-text-div-diff` tolerance, leaving just `text.status` on prod.)

All 4 affected records are POST /r4/ValueSet/$validate-code requests that result in
500 errors due to unknown CodeSystems. The error messages are identical between prod
and dev — both correctly identify the same failure. Only the OperationOutcome structure
differs.

Found with:
grep through deltas.ndjson for records where both prod.status=500 and dev.status=500,
then checked OperationOutcome issue field structure differences. All 4 records show
the same pattern.

---

### [x] `4c5d0f9` Dev returns x-unknown-system for code system versions that prod recognizes

Records-Impacted: 5
Tolerance-ID: validate-code-x-unknown-system-extra
Record-ID: e23bae38-016e-46ef-bd71-160ddb1ea35a


```bash
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","version":"v1","code":"2054-5"}}]}'

curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"coding","valueCoding":{"system":"urn:oid:2.16.840.1.113883.6.238","version":"v1","code":"2054-5"}}]}'
```

**Not reproduced.** Both servers now return identical behavior for unknown code system versions: both return `x-caused-by-unknown-system` parameter, both return `UNKNOWN_CODESYSTEM_VERSION` issue, and both omit `display`. The original ValueSet (`omb-race-category|4.1.0`) is no longer loaded on the public servers, so the exact original request cannot be replayed, but the underlying code system version handling has converged. The parameter name has also changed from `x-unknown-system` to `x-caused-by-unknown-system` on both servers, confirming a code update that aligned the behavior.


When validating a code against a ValueSet where the requested code system version is not found, dev and prod behave differently:

1. **x-unknown-system parameter**: Dev returns an extra `x-unknown-system` parameter (e.g., `urn:oid:2.16.840.1.113883.6.238|v1`), prod does not.
2. **Extra OperationOutcome issue**: Dev returns an additional issue with code `not-found`, message-id `UNKNOWN_CODESYSTEM_VERSION`, and text like "A definition for CodeSystem '...' version 'v1' could not be found, so the code cannot be validated. Valid versions: 1.2". Prod only returns the `not-in-vs` issue.
3. **Message text**: Dev's message parameter prepends the unknown-system error before the not-in-vs message. Prod only includes the not-in-vs message.
4. **Display parameter**: Prod returns a display value (e.g., "Black or African American") looked up from its known version. Dev omits display entirely since it considers the system unknown.
5. **Version parameter**: Prod returns two version parameters — the actual known version (`1.2`) and the requested version (`v1`). Dev only returns the requested version (`v1`).

Both agree `result=false`, so the validation outcome is the same. The difference is in how each server handles the unknown version — prod falls back to a known version and provides display/version details, while dev treats the version as entirely unknown.


5 records in deltas match this pattern (all POST /r4/ValueSet/$validate-code with `x-unknown-system` in dev response):
- 4 records involve `urn:oid:2.16.840.1.113883.6.238|v1` (CDC Race and Ethnicity)
- 1 record involves `http://snomed.info/sct|http://snomed.info/sct/731000124108/version/20250301` (SNOMED edition)

Search: `grep -c 'x-unknown-system' jobs/2026-02-round-1/results/deltas/deltas.ndjson` → 5
Full comparison data has 21 records mentioning x-unknown-system (16 handled by existing tolerances).


Tolerance ID: `validate-code-x-unknown-system-extra`. Matches $validate-code responses where dev has `x-unknown-system` parameter that prod lacks. Normalizes by:
- Stripping `x-unknown-system` from dev
- Canonicalizing message and issues to prod's values
- Canonicalizing display and version to prod's values

Eliminates 5 delta records.

---

### [ ] `516d895` UCUM error message formatting differs between prod and dev

Records-Impacted: 1
Tolerance-ID: ucum-error-message-format
Record-ID: 392830d5-650f-42a4-9149-a8f7a1246016


```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$batch-validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"validation","resource":{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://unitsofmeasure.org"},{"name":"code","valueCode":"Torr"}]}}]}'

curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$batch-validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"validation","resource":{"resourceType":"Parameters","parameter":[{"name":"system","valueUri":"http://unitsofmeasure.org"},{"name":"code","valueCode":"Torr"}]}}]}'
```

Prod returns `Error processing Unit: 'Torr': The unit "Torr" is unknown at character 1`, dev returns `Error processing unit 'Torr': The unit 'Torr' is unknown at character 1`.


UCUM $validate-code (via batch-validate-code) for unknown code "Torr": the informational OperationOutcome issue text for UCUM parsing errors has different formatting between prod and dev.

Prod: `Error processing Unit: 'Torr': The unit "Torr" is unknown at character 1`
Dev: `Error processing unit 'Torr': The unit 'Torr' is unknown at character 1`

Three formatting differences:
1. Capitalization: "Unit:" (prod) vs "unit" (dev)
2. Punctuation: extra colon after unit name in prod ("'Torr':") vs none in dev ("'Torr'")
3. Quoting style: escaped double quotes in prod (`"Torr"`) vs single quotes in dev (`'Torr'`)

Both agree on result=false, system, code, and the primary error message. The only difference is in this secondary informational issue text about UCUM parsing.


1 record in the full comparison dataset. Searched with:
- `grep -c 'Error processing Unit' comparison.ndjson` → 1
- `grep -c 'Error processing unit' comparison.ndjson` → 1

This is a batch-validate-code request: POST /r4/ValueSet/$batch-validate-code


Tolerance ID: `ucum-error-message-format`. Matches batch-validate-code records for unitsofmeasure.org where nested validation issue text differs due to UCUM error message formatting. Normalizes dev issue text to prod value. Eliminates 1 record.


392830d5-650f-42a4-9149-a8f7a1246016

---

### [x] `b839c0e` Typo "conplete" in factory CodeSystem content field (read.js:107)

#####Summary

In `tx/workers/read.js` line 107, the factory CodeSystem content value is set to `"conplete"` instead of `"complete"`. This affects all iterable factory CodeSystems (e.g., `x-us-states`).

#####Repro

```
curl -s -H 'Accept: application/fhir+json' 'https://tx-dev.fhir.org/r4/CodeSystem/x-us-states' | jq .content
```

Returns: `"conplete"`
Expected: `"complete"`

#####Notes

- Production (Pascal) returns 404 for factory CodeSystem reads — this is a JS-only feature, so no prod comparison available.
- `"conplete"` is not a valid FHIR CodeSystem content code. Valid values: not-present, example, fragment, complete, supplement.

---

### [x] `9f41615` POST _search with form-encoded body crashes with 500 error

#####Summary

`POST /r4/CodeSystem/_search` with `Content-Type: application/x-www-form-urlencoded` crashes on the JS server with a 500 error. The form-encoded body is not parsed, so query parameters like `_offset` are undefined.

#####Repro

```
curl -s -H 'Accept: application/fhir+json' \
-H 'Content-Type: application/x-www-form-urlencoded' \
-d '_count=5' \
'https://tx-dev.fhir.org/r4/CodeSystem/_search'
```

Returns OperationOutcome with:
- severity: error
- diagnostics: "Cannot read properties of undefined (reading '_offset')"

#####Expected

Should return a search Bundle with 5 entries (same as `GET /r4/CodeSystem?_count=5`).

Production (Pascal) handles this correctly and returns results.

#####Root cause

The Express app configures `express.raw()` and `express.json()` middleware but not `express.urlencoded()`. The FHIR _search operation requires form-encoded POST bodies per the spec (https://hl7.org/fhir/R4/search.html#Introduction).

---

### [x] `e3866e4` _count=0 returns 20 results instead of summary-only response

#####Summary

`GET /r4/CodeSystem?_count=0` returns 20 entries on the JS server instead of a summary-only response (0 entries). This is because `parseInt("0") || 20` evaluates to `20` in JavaScript since `0` is falsy.

#####Repro

```
curl -s -H 'Accept: application/fhir+json' 'https://tx-dev.fhir.org/r4/CodeSystem?_count=0'
```

Returns: Bundle with total=2007 and 20 entries
Expected: Bundle with total=2007 and 0 entries (summary-only)

#####Comparison

Production (Pascal) also doesn't handle _count=0 per spec — it returns 10 entries (its default). So both servers are wrong, but in different ways.

Per the FHIR spec: "_count=0 can be used to return only the count and total and not any matches."

#####Root cause

In `tx/workers/search.js`, the count parsing is:
```js
count = parseInt(count) || 20
```

Since `parseInt("0")` returns `0` and `0` is falsy in JS, it falls through to the default of 20. Should use `parseInt(count) ?? 20` or explicit null check.

---

### [ ] `f9e35f6` validate-code: version-not-found issue text and count differ due to code system version skew

Records-Impacted: 19
Tolerance-ID: version-not-found-skew
Record-ID: 91de2c9c-52d4-4038-b525-d2ace69ec62e

#####What differs

When `$validate-code` returns `result: false` and includes issues about unknown code system versions ("A definition for CodeSystem '...' version '...' could not be found, so the code cannot be validated. Valid versions: ..."), prod and dev differ in two ways:

1. **Valid versions lists differ**: The "Valid versions: ..." text lists different available editions. For example, for SNOMED CT, prod lists editions like `449081005/version/20250510` and `900000000000207008/version/20240801` that dev doesn't have, while dev lists `731000124108/version/20230301` that prod doesn't.

2. **Extra not-found issues on dev**: Dev sometimes reports additional not-found errors for code system versions that prod considers valid. For example, dev reports LOINC version 2.77 as "could not be found" (only knows 2.81), while prod has both 2.77 and 2.81 loaded.

Both servers agree `result=false`. The differences are only in the explanatory details about which versions are available, caused by different code system editions loaded on each server.

Affected code systems include: SNOMED CT, LOINC, ICD-11, observation-category, PHIN VS, and various other code systems where available versions differ between prod and dev.

#####How widespread

19 records eliminated by this tolerance. All are content-differs validate-code (both CodeSystem and ValueSet endpoints), all with both prod and dev returning result=false. Found via: `content-differs validate-code with both result=false and "could not be found, so the code cannot be validated" in issues, where stripping those issues and the message param makes prod and dev identical`.

#####What the tolerance covers

Tolerance `version-not-found-skew` matches validate-code records where both result=false and at least one issue contains "could not be found, so the code cannot be validated". Normalizes by stripping all such issues and the message parameter from both sides. After stripping, the remaining issues are identical between prod and dev, confirming these are pure version-skew differences.

Representative record IDs:
- 91de2c9c-52d4-4038-b525-d2ace69ec62e (LOINC 2.77 + SNOMED version skew)
- 49648ad8-3e20-4181-82d8-... (SNOMED-only version skew)
- 05fc8815-b9cc-4fdd-b0ed-... (scc_primary code system)


f09de53 #1 Claude (AI Assistant) <>

No repro needed: this is a version-skew difference caused by different code system editions loaded on prod vs dev, not a code bug. Both servers agree result=false; only the explanatory text about available versions differs.

---

### [ ] `d45bc62` Dev returns 400 'No ValueSet specified' for validate-code with codeableConcept-only (prod returns 200)

Records-Impacted: 9
Tolerance-ID: validate-code-no-valueset-codeableconcept
Record-ID: abd1a7d8-3110-4b8a-a14b-267543425ffd

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","version":"2.77","code":"8867-4","display":"Heart rate"},{"system":"http://loinc.org","version":"2.77","code":"8480-6","display":"Systolic blood pressure"}]}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","version":"2.77","code":"8867-4","display":"Heart rate"},{"system":"http://loinc.org","version":"2.77","code":"8480-6","display":"Systolic blood pressure"}]}}]}'
```

**Prod** (HTTP 200) returns:
> `"result": true`, `"system": "http://loinc.org"`, `"code": "8480-6"`, `"display": "Systolic blood pressure"`, plus echoed codeableConcept with both codings

**Dev** (HTTP 400) returns:
> `"severity": "error"`, `"code": "invalid"`, `"details": {"text": "No ValueSet specified - provide url parameter or valueSet resource"}`

#####What differs

POST /r4/ValueSet/$validate-code with only a `codeableConcept` parameter (no `url`, `context`, or `valueSet`):
- **Prod** (HTTP 200): Validates the codeableConcept against each coding's CodeSystem and returns a Parameters response with result=true/false, system, code, version, display, and the echoed codeableConcept.
- **Dev** (HTTP 400): Returns an OperationOutcome error: "No ValueSet specified - provide url parameter or valueSet resource"

The FHIR spec says "If the operation is not called at the instance level, one of url, context, or valueSet must be provided." So dev is arguably more strictly spec-compliant, but prod handles this gracefully by validating each coding in the codeableConcept against its code system directly.

#####How widespread

9 records match this pattern. All are:
- POST /r4/ValueSet/$validate-code
- Request body has only a `codeableConcept` parameter (no url, context, or valueSet)
- All use http://loinc.org codings
- Prod returns 200 with Parameters, dev returns 400 with OperationOutcome

Search: `grep 'No ValueSet specified' results/deltas/deltas.ndjson | wc -l` → 9

#####What the tolerance covers

Tolerance `validate-code-no-valueset-codeableconcept` matches POST validate-code requests where prod=200, dev=400, and dev body contains "No ValueSet specified". Skips all 9 records.

#####Representative records

- abd1a7d8-3110-4b8a-a14b-267543425ffd (LOINC codeableConcept with 8867-4 + 8480-6, prod result=true)
- 47660ea6 (LOINC codeableConcept, prod result=false)

---

### [ ] `7b694ba` validate-code: dev omits version params for secondary codings in multi-coding CodeableConcept responses

Records-Impacted: 148
Tolerance-ID: validate-code-missing-extra-version-params
Record-ID: 1f21c334-667f-4e2a-ae2c-6e73b8760cce

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"85354-9","display":"Blood pressure panel with all children optional"},{"system":"http://snomed.info/sct","code":"75367002","display":"Blood pressure (observable entity)"}]}},{"name":"displayLanguage","valueString":"en-US"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"observation-vitalsignresult","meta":{"lastUpdated":"2019-11-01T09:29:23.356+11:00","profile":["http://hl7.org/fhir/StructureDefinition/shareablevalueset"]},"extension":[{"url":"http://hl7.org/fhir/StructureDefinition/structuredefinition-wg","valueCode":"oo"}],"url":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult","identifier":[{"system":"urn:ietf:rfc:3986","value":"urn:oid:2.16.840.1.113883.3.88.12.80.62"}],"version":"4.0.1","name":"VitalSigns","title":"Vital Signs","status":"active","experimental":false,"date":"2019-11-01T09:29:23+11:00","publisher":"FHIR project team","contact":[{"telecom":[{"system":"url","value":"http://hl7.org/fhir"}]}],"description":"This value set indicates the allowed vital sign result types.","copyright":"This content from LOINC is copyright 1995 Regenstrief Institute, Inc.","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"85353-1"},{"code":"9279-1"},{"code":"8867-4"},{"code":"2708-6"},{"code":"8310-5"},{"code":"8302-2"},{"code":"9843-4"},{"code":"29463-7"},{"code":"39156-5"},{"code":"85354-9"},{"code":"8480-6"},{"code":"8462-4"},{"code":"8478-0"}]}]}}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"85354-9","display":"Blood pressure panel with all children optional"},{"system":"http://snomed.info/sct","code":"75367002","display":"Blood pressure (observable entity)"}]}},{"name":"displayLanguage","valueString":"en-US"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","id":"observation-vitalsignresult","meta":{"lastUpdated":"2019-11-01T09:29:23.356+11:00","profile":["http://hl7.org/fhir/StructureDefinition/shareablevalueset"]},"extension":[{"url":"http://hl7.org/fhir/StructureDefinition/structuredefinition-wg","valueCode":"oo"}],"url":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult","identifier":[{"system":"urn:ietf:rfc:3986","value":"urn:oid:2.16.840.1.113883.3.88.12.80.62"}],"version":"4.0.1","name":"VitalSigns","title":"Vital Signs","status":"active","experimental":false,"date":"2019-11-01T09:29:23+11:00","publisher":"FHIR project team","contact":[{"telecom":[{"system":"url","value":"http://hl7.org/fhir"}]}],"description":"This value set indicates the allowed vital sign result types.","copyright":"This content from LOINC is copyright 1995 Regenstrief Institute, Inc.","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"85353-1"},{"code":"9279-1"},{"code":"8867-4"},{"code":"2708-6"},{"code":"8310-5"},{"code":"8302-2"},{"code":"9843-4"},{"code":"29463-7"},{"code":"39156-5"},{"code":"85354-9"},{"code":"8480-6"},{"code":"8462-4"},{"code":"8478-0"}]}]}}}]}'
```

**Prod** returns two `version` parameters:
> `"version": "http://snomed.info/sct/900000000000207008/version/20250201"` (SNOMED CT)
> `"version": "2.81"` (LOINC)

**Dev** returns only one `version` parameter:
> `"version": "2.81"` (LOINC only -- SNOMED version is missing)

#####What differs

When $validate-code is called with a CodeableConcept containing multiple codings from different code systems, prod returns `version` parameters for all systems involved in validation, while dev returns fewer (typically only the primary system's version). For example:

- **Request**: CodeableConcept with LOINC 85354-9 + SNOMED 75367002 against observation-vitalsignresult ValueSet
- **Prod**: returns `version: "2.81"` (LOINC) AND `version: "http://snomed.info/sct/900000000000207008/version/20250201"` (SNOMED)
- **Dev**: returns only `version: "2.81"` (LOINC), omitting the SNOMED version

The version parameter tells clients which code system edition was used during validation. Omitting it for secondary codings loses this provenance information.

This also affects single-coding and no-CodeableConcept cases on CodeSystem/$validate-code where dev returns 0 version params and prod returns 1, as well as cases with 3 vs 1 version params.

#####How widespread

~459 records in comparison.ndjson have version count mismatch (prod > dev). Of these, 148 have version count as the sole remaining difference after the full tolerance pipeline — these are directly eliminated by this tolerance. The remaining ~311 records also have the version mismatch normalized but remain as deltas due to other differences (display text, message text, etc.).

Breakdown by version count (raw):
- prod=1 dev=0: 187 records
- prod=2 dev=1: 119 records
- prod=3 dev=1: 140 records

By request type:
- Multi-coding CodeableConcept: 414 records
- Single-coding CodeableConcept: 29 records
- No CodeableConcept: 3 records (CodeSystem/$validate-code)

Found via:
```python
prod_versions = [p for p in prod.parameter if p.name == 'version']
dev_versions = [p for p in dev.parameter if p.name == 'version']
if len(prod_versions) > len(dev_versions): count += 1
```

#####What the tolerance covers

Tolerance ID: `validate-code-missing-extra-version-params`
Matches validate-code records where prod has more `version` parameters than dev.
Normalizes by adding the missing version values from prod to dev, then applying stable sort by name+value on both sides for consistent ordering.
Eliminates 148 records directly. Normalizes version params on ~311 additional records (reducing noise for other tolerance passes).

---

### [ ] `b9034b0` validate-code: display text differs for LOINC, ISO 3166, UCUM, BCP-13 codes with same version

Records-Impacted: 275
Tolerance-ID: validate-code-display-text-differs
Record-ID: 4da8e1fd-f8a0-4474-b81b-57cbd5b0b4b6

#####Repro

```bash
####Example 1: LOINC 8478-0 via ValueSet/$validate-code (en-US)

####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"8478-0","display":"Mean blood pressure"},{"system":"http://snomed.info/sct","code":"6797001","display":"Mean blood pressure (observable entity)"}]}},{"name":"displayLanguage","valueString":"en-US"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult","version":"4.0.1","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"85353-1"},{"code":"9279-1"},{"code":"8867-4"},{"code":"2708-6"},{"code":"8310-5"},{"code":"8302-2"},{"code":"9843-4"},{"code":"29463-7"},{"code":"39156-5"},{"code":"85354-9"},{"code":"8480-6"},{"code":"8462-4"},{"code":"8478-0"}]}]}}}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"8478-0","display":"Mean blood pressure"},{"system":"http://snomed.info/sct","code":"6797001","display":"Mean blood pressure (observable entity)"}]}},{"name":"displayLanguage","valueString":"en-US"},{"name":"default-to-latest-version","valueBoolean":true},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/observation-vitalsignresult","version":"4.0.1","compose":{"include":[{"system":"http://loinc.org","concept":[{"code":"85353-1"},{"code":"9279-1"},{"code":"8867-4"},{"code":"2708-6"},{"code":"8310-5"},{"code":"8302-2"},{"code":"9843-4"},{"code":"29463-7"},{"code":"39156-5"},{"code":"85354-9"},{"code":"8480-6"},{"code":"8462-4"},{"code":"8478-0"}]}]}}}]}'

####Example 2: LOINC 718-7 via CodeSystem/$validate-code (de displayLanguage)

####Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"718-7"}]}},{"name":"displayLanguage","valueString":"de"},{"name":"default-to-latest-version","valueBoolean":true}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"codeableConcept","valueCodeableConcept":{"coding":[{"system":"http://loinc.org","code":"718-7"}]}},{"name":"displayLanguage","valueString":"de"},{"name":"default-to-latest-version","valueBoolean":true}]}'
```

**Example 1** (LOINC 8478-0, en-US): Both return `"result": true`, `"code": "8478-0"`, `"version": "2.81"`.
- **Prod**: `"display": "Mean blood pressure"`
- **Dev**: `"display": "Mean arterial pressure"`

**Example 2** (LOINC 718-7, de): Both return `"result": true`, `"code": "718-7"`, `"version": "2.81"`.
- **Prod**: `"display": "Hämoglobin"`
- **Dev**: `"display": "Hämoglobin [Masse/Volumen] in Blut"`

#####What differs

In $validate-code responses, the `display` parameter returned for the same code and same version differs between prod and dev. Both servers agree on result, system, code, and version — only the display text (the human-readable name) differs.

Examples:
- LOINC 8478-0 (v2.81): prod="Mean blood pressure", dev="Mean arterial pressure"
- LOINC 8480-6 (v2.81, de-DE displayLanguage): prod="Blutdruck systolisch", dev="Systolischer Blutdruck"
- LOINC 718-7 (v2.81, de-DE): prod="Hämoglobin", dev="Hämoglobin [Masse/Volumen] in Blut"
- ISO 3166 DE (v2018): prod="Deutschland", dev="Germany"
- UCUM mL (v2.2): prod="ml", dev="mL"
- BCP-13 application/pdf: prod="PDF", dev="application/pdf"

Prod tends to return a shorter/common name, dev returns a different designation (sometimes longer, sometimes different language, sometimes different case).

#####How widespread

275 validate-code delta records where `display` is the only difference. Breakdown by system:
- http://loinc.org: 261 records
- urn:iso:std:iso:3166: 10 records
- http://unitsofmeasure.org: 2 records
- urn:ietf:bcp:13: 2 records

Found via: `grep '"type":"value-differs","param":"display"' results/deltas/deltas.ndjson` then filtering to records where display is the sole diff.

This is the same class of issue as the previously filed and closed SNOMED display text bug (39d9af6) — both servers load the same version of each code system but pick different designations/display names for the same code.

#####What the tolerance covers

Tolerance ID: `validate-code-display-text-differs`. Matches validate-code Parameters responses where both sides are Parameters, the system is NOT http://snomed.info/sct (already handled by snomed-same-version-display-differs) and NOT urn:ietf:bcp:47 (already handled by bcp47-display-format), the display values differ, but everything else matches. Normalizes both sides to prod's display value.

#####Representative records

- 4da8e1fd-f8a0-4474-b81b-57cbd5b0b4b6 (LOINC 8478-0, "Mean blood pressure" vs "Mean arterial pressure")

---

### [ ] `3071698` Dev  omits limitedExpansion parameter when expansion is truncated

Records-Impacted: 24
Tolerance-ID: expand-missing-limited-expansion
Record-ID: 5b67c797-72f0-45ff-b8ca-a9b57e6fddb1

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-codes"}]}'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"url","valueUri":"http://hl7.org/fhir/ValueSet/observation-codes"}]}'
```

**Prod** returns (in `expansion.parameter`):
> `{"name": "limitedExpansion", "valueBoolean": true}`, `{"name": "offset", "valueInteger": 0}`, `{"name": "count", "valueInteger": 1000}`, `{"name": "used-codesystem", "valueUri": "http://loinc.org|2.81"}`

**Dev** returns (in `expansion.parameter`):
> `{"name": "offset", "valueInteger": 0}`, `{"name": "count", "valueInteger": 1000}`, `{"name": "used-codesystem", "valueUri": "http://loinc.org|2.81"}`

Both return 1000 codes in `expansion.contains`. Prod includes `limitedExpansion: true` to signal the expansion is truncated; dev omits it entirely.

#####What differs

For $expand operations where the request includes `_incomplete: true` (which maps to the `limitedExpansion` expansion parameter), prod includes `limitedExpansion: true` in `expansion.parameter` to signal that the expansion was truncated. Dev omits this parameter entirely.

This affects large expansions (e.g., all LOINC codes via `observation-codes` ValueSet, all SNOMED codes) where the returned count is capped (e.g., count=1000) and the actual code system has far more codes. The `limitedExpansion` parameter tells clients that the expansion is incomplete — without it, a client cannot distinguish between "these are all the codes" and "there are more codes not shown."

In all 24 affected records:
- Both servers return 200 with the same number of codes (e.g., 1000)
- Both use the same code system versions (e.g., LOINC 2.81)
- Prod includes `{name: "limitedExpansion", valueBoolean: true}` in expansion.parameter
- Dev omits it

#####How widespread

24 records across both /r4/ and /r5/ $expand operations. All are POST ValueSet/$expand requests with `_incomplete: true` in the request parameters. The affected expansions span multiple code systems including LOINC, SNOMED, and others where the total code count exceeds the requested count limit.

Search: `grep 'limitedExpansion' results/deltas/deltas.ndjson | wc -l` → 24

Of these 24 records:
- 10 have limitedExpansion as the only remaining difference
- 14 have limitedExpansion plus other differences (e.g., missing used-codesystem, warning-experimental params)

#####What the tolerance covers

Tolerance `expand-missing-limited-expansion` matches $expand responses where prod has `limitedExpansion: true` in expansion.parameter and dev doesn't. Normalizes by stripping the parameter from prod.

#####Representative record IDs

- `5b67c797-72f0-45ff-b8ca-a9b57e6fddb1`: POST /r4/ValueSet/$expand — LOINC observation-codes, count=1000, _incomplete=true

---

### [ ] `3482632` Dev returns x-caused-by-unknown-system for systems/versions prod recognizes (LOINC 2.77, fhir.by ValueSets, old SNOMED editions)

Records-Impacted: 334
Tolerance-ID: dev-x-unknown-system-extra
Record-ID: (from round-3 deltas grep)

#####What differs

Dev returns `x-caused-by-unknown-system` or `x-unknown-system` parameter on validate-code responses where prod does not. Prod resolves the system/version and performs actual validation; dev fails at the CodeSystem-not-found level. Both agree `result=false` but for different reasons.

Directly matches 105 records; resolves 334 total (normalizing x-unknown-system enables downstream tolerances to match).

Affected systems:
- 34 records: LOINC version 2.77 (dev only has 2.81)
- 44 records: fhir.by custom ValueSets (not loaded on dev)
- 10 records: SNOMED CT version 20200131 (old edition dev doesn't have)
- 3 records: BCP-47 versions 1.0/2.0.0
- 14 records: other custom/versioned systems

Root cause is a mix of version skew (dev has fewer/newer editions) and missing custom resources (fhir.by ValueSets only on prod).

#####How widespread

105 direct matches, 334 records resolved to OK after full pipeline. All are validate-code with both result=false. Pattern: dev has x-caused-by-unknown-system param, prod does not.

#####What the tolerance covers

Tolerance `dev-x-unknown-system-extra` matches validate-code Parameters responses where dev has x-caused-by-unknown-system or x-unknown-system but prod does not. Normalizes by stripping those params from dev and canonicalizing message/issues to prod values.

Related to closed bug 1bc5e64 (same pattern but different systems — that one was RxNorm/SNOMED US specific and was fixed).

---

### [ ] `c0fe696` validate-code result-disagrees: dev returns false with x-caused-by-unknown-system for versions prod resolves

Records-Impacted: 43
Tolerance-ID: result-disagrees-unknown-system-version
Record-ID: 52ed1799-856b-4f9f-9c57-5fe9033847ab

#####What differs

When `$validate-code` is called with a code system version that prod has loaded but dev does not, the result boolean disagrees:

- **Prod**: Returns `result: true` — validates the code against the version it has loaded, returns system/code/version/display parameters and any informational issues (e.g., display language warnings).
- **Dev**: Returns `result: false` with `x-caused-by-unknown-system` parameter — it doesn't recognize the code system version at all, so it can't validate the code. Returns error-level OperationOutcome issue with `UNKNOWN_CODESYSTEM_VERSION` and message like "A definition for CodeSystem '...' version '...' could not be found, so the code cannot be validated. Valid versions: ..."

The request often includes `default-to-latest-version: true`, but dev still fails because it doesn't have the specific version referenced in the request.

#####How widespread

43 records in the deltas match this pattern (prod `result: true`, dev `result: false`, dev has `x-caused-by-unknown-system`):

- 34 records: LOINC version 2.77 (prod has 2.77, dev only has 2.81)
- 6 records: SNOMED CT International version 20200131 (prod has it, dev doesn't)
- 2 records: BCP-47 version 2.0.0
- 1 record: BCP-47 version 1.0

All are `$validate-code` operations (both CodeSystem and ValueSet endpoints, both `/r4/` and `/r5/` prefixes).

Search used: `grep 'x-caused-by-unknown-system' deltas.ndjson`, then filtered to records where prodResult=true and devResult=false in the comparison metadata.

#####What the tolerance covers

Tolerance `result-disagrees-unknown-system-version` matches validate-code records where prod `result=true`, dev `result=false`, and dev includes `x-caused-by-unknown-system`. It skips these records since the entire response differs due to the version not being loaded on dev. Eliminates 43 records.

Representative record IDs:
- 52ed1799-856b-4f9f-9c57-5fe9033847ab (LOINC 2.77, CodeSystem/$validate-code)

---

### [ ] `b3c97a1` Dev emits duplicate MSG_DRAFT status-check issues for draft CodeSystems with multiple codings

Records-Impacted: 6
Tolerance-ID: duplicate-draft-codesystem-status-check
Record-ID: 58504e01-4a61-49d1-9fb0-d19b8c05c752

#####What differs

When validating a CodeableConcept containing multiple codings from `urn:iso:std:iso:11073:10101` (a draft CodeSystem), dev emits one MSG_DRAFT `status-check` informational issue per coding from that system, while prod correctly emits just one per unique CodeSystem reference. For example, with 2 codings from ISO 11073 (codes 150364 and 150368), dev returns two identical issues:

```json
{"severity": "information", "code": "business-rule", "details": {"text": "Reference to draft CodeSystem urn:iso:std:iso:11073:10101|2024-12-05 from fhir.tx.support.r4#0.32.0", "coding": [{"code": "status-check"}]}}
{"severity": "information", "code": "business-rule", "details": {"text": "Reference to draft CodeSystem urn:iso:std:iso:11073:10101|2024-12-05 from fhir.tx.support.r4#0.32.0", "coding": [{"code": "status-check"}]}}
```

Prod returns only one such issue.

#####How widespread

12 records in the dataset have duplicate status-check issues in dev, all involving validate-code on CodeableConcepts with 2 codings from `urn:iso:std:iso:11073:10101`. 6 of these 12 are fully resolved by this tolerance (the duplicate was their only remaining difference). The other 6 have additional differences (missing invalid-display issues, "Unknown code ''" vs "Unknown code 'undefined'") that are separate bugs.

#####What the tolerance covers

Tolerance `duplicate-draft-codesystem-status-check` deduplicates status-check issues in dev's OperationOutcome where the same details.text appears more than once, keeping only the first occurrence. Eliminates 6 records.

#####Representative record IDs

- 58504e01-4a61-49d1-9fb0-d19b8c05c752 (POST /r4/CodeSystem/$validate-code)
- 81e6cbf7-003c-442a-b6cb-c63182804886 (POST /r4/ValueSet/$validate-code)
- ecb0a4c6-9494-448e-b9d7-b82c8e604fdb (POST /r4/CodeSystem/$validate-code)

---

