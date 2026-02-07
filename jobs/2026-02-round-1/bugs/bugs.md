# tx-compare Bug Report

_7 bugs (7 open, 0 closed)_

| Priority | Count | Description |
|----------|-------|-------------|
| P3 | 1 | Missing resources |
| P4 | 1 | Status code mismatch |
| P6 | 5 | Content differences |

---

## P3 -- Missing resources

### [ ] `51f23f5` DICOM CID 29 AcquisitionModality ValueSet missing from dev

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

