# tx-compare Bug Report

_16 bugs (16 open, 0 closed)_

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

### [ ] `e9c7e58` Dev returns empty-string expression/location in OperationOutcome issues

Records-Impacted: 318
Tolerance-ID: dev-empty-string-expression-location
Record-ID: 7de52d92-3166-495e-ac5e-af262b1019e4

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

### [ ] `e09cff6` BCP-47 display text format: dev returns 'Region=...' instead of standard format

Records-Impacted: 7
Tolerance-ID: bcp47-display-format
Record-ID: da702ab4-7ced-4b69-945c-0b5bbbc088c0

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

### [ ] `2abe02d` Dev $expand returns empty string id on ValueSet response

Records-Impacted: 690
Tolerance-ID: expand-dev-empty-id
Record-ID: 2bbd9519-3a6b-4f55-8309-745d9f1b16a7

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
{"name":"includeDefinition","valueBoolean":false},  // <-- extra
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

