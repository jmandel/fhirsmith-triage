# tx-compare Bug Report

_8 bugs (7 open, 1 closed)_

| Priority | Count | Description |
|----------|-------|-------------|

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

### [ ] `a9cf20c` Dev omits deprecated location field on OperationOutcome issues

Records-Impacted: 3019
Tolerance-ID: oo-missing-location-field
Record-ID: 59eff7c6-9fd2-45b2-8f27-c790368bcc54

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

#####What differs

Prod includes both `location` and `expression` arrays on OperationOutcome issues. Dev includes only `expression`, omitting `location` entirely.

In FHIR R4, `location` (0..*) is deprecated in favor of `expression`, but it is still a defined field. Prod populates both; dev omits `location`.

In every observed case, `location` and `expression` have identical values (e.g., both `["system"]` or both `["code"]`).

Example from prod:
```json
{
"severity": "error",
"code": "not-found",
"details": { ... },
"location": ["system"],
"expression": ["system"]
}
```

Dev returns the same issue without `location`:
```json
{
"severity": "error",
"code": "not-found",
"details": { ... },
"expression": ["system"]
}
```

#####How widespread

3019 out of 9838 delta records exhibit this pattern (31% of all deltas). All are `validate-code` operations (3018 `content-differs`, 1 `status-mismatch`).

Search: compared parsed prod and dev bodies for all deltas, checking for OperationOutcome issues where prod has `location` and dev does not. In all 3628 individual OO issues across these 3019 records, `location` exactly equals `expression`.

Most common location values:
- `["code"]`: 1073
- `["Coding.system"]`: 802
- `["Coding.code"]`: 622
- `["system"]`: 463
- `["CodeableConcept.coding[0].code"]`: 283

#####What the tolerance covers

Tolerance `oo-missing-location-field` normalizes by stripping `location` from prod's OO issues when dev lacks it and `location` equals `expression`. This eliminates 3019 records from the deltas (where this is the only remaining difference after other tolerances).

#####Representative record

`grep -n '59eff7c6-9fd2-45b2-8f27-c790368bcc54' jobs/2026-02-round-2/comparison.ndjson`

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

---

### [ ] `167be81` Dev returns result=false for valid v3 terminology codes in ValueSet $validate-code

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

Records-Impacted: 32
Tolerance-ID: hl7-terminology-cs-version-skew
Record-ID: 04364a8a-acce-491a-8018-9ac010d47d21

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=idscl&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fconsentcategorycodes' -H 'Accept: application/fhir+json' | jq -r '.parameter[] | select(.name == "message") | .valueString'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$validate-code?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-category&code=idscl&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fconsentcategorycodes' -H 'Accept: application/fhir+json' | jq -r '.parameter[] | select(.name == "message") | .valueString'
```

Prod returns `version '4.0.1'`, dev returns `version '1.0.1'`.

#####What differs

For CodeSystems under `http://terminology.hl7.org/CodeSystem/*`, prod reports version `4.0.1` in error messages and OperationOutcome issue text, while dev reports different versions:

- `consentcategorycodes`: prod=4.0.1, dev=1.0.1
- `goal-achievement`: prod=4.0.1, dev=1.0.1
- `consentpolicycodes`: prod=4.0.1, dev=3.0.1
- `v2-0116`: prod=2.9, dev=3.0.0

The version difference appears in:
1. The `message` parameter valueString (e.g., "Unknown code 'idscl' in the CodeSystem '...' version '4.0.1'" vs "version '1.0.1'")
2. The `issues` OperationOutcome `details.text` field

Both servers agree on the validation result (e.g., result=false for invalid codes). The core terminology behavior is the same — only the loaded CodeSystem edition version differs.

#####How widespread

32 records in the delta file are affected, all validate-code operations on HL7 terminology CodeSystems. Found via:

```
grep for records where prod has version '4.0.1' and dev has '1.0.1' or '3.0.1',
plus v2-0116 where prod=2.9, dev=3.0.0
```

All are GET requests to `/r4/ValueSet/$validate-code` or `/r4/CodeSystem/$validate-code`.

#####What the tolerance covers

Tolerance ID: `hl7-terminology-cs-version-skew`. Matches validate-code records where the system is under `terminology.hl7.org/CodeSystem/` and the message/issues text differs only in the version string pattern. Normalizes version strings in message text and OperationOutcome issue details.text from dev's version to prod's version.


61e2d5c #1 Claude (AI Assistant) <>

The HL7 terminology CodeSystem version skew also affects $expand operations. Dev returns different expansion content (extra or missing codes) compared to prod for ValueSets using terminology.hl7.org CodeSystems.

163 expand records have minor code differences (1-5 extra/missing codes, e.g., consent-policy 26 vs 27, observation-category 17 vs 18). The common codes between prod and dev are identical — only the set of included codes differs.

Additionally, 246 expand records show dev returning total=1 where prod returns many codes for v3 ValueSets. These may be a separate root cause (dev failing to expand v3 included ValueSets) but also involve terminology.hl7.org CodeSystems.

Adding tolerance `expand-hl7-terminology-version-skew-content` for the 163 minor-diff records.

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

---

### [ ] `f2b2cef` Dev : missing valueset-unclosed extension and spurious expansion.total on incomplete expansions

Records-Impacted: 292
Tolerance-ID: expand-unclosed-extension-and-total
Record-ID: b6156665-797d-4483-971c-62c00a0816b8

#####What differs

For $expand operations that return incomplete/truncated expansions (e.g., SNOMED CT is-a queries requesting count=1000 from a set with 124,412 total codes):

1. **Prod includes `expansion.extension` with `valueset-unclosed: true`; dev omits it.** Per the FHIR R4 spec, this extension signals that an expansion is incomplete due to inclusion of post-coordinated or unbounded value sets. Prod correctly marks these expansions as unclosed; dev does not.

2. **Dev includes `expansion.total` (e.g., 124412); prod omits it.** The `total` field is optional (0..1) per spec. Prod omits it on these incomplete expansions; dev includes it. Since these expansions are truncated to the `count` parameter (e.g., 1000 codes returned), the behavioral difference is: dev tells the client the full count but doesn't signal incompleteness, while prod signals incompleteness but doesn't provide the full count.

These two differences always co-occur in the same records — every record where prod has `valueset-unclosed` but dev doesn't also has dev providing `total` while prod doesn't.

#####How widespread

292 records in the comparison dataset show both patterns simultaneously. All are successful (200/200) $expand operations. The pattern is predicted by: prod expansion has `valueset-unclosed` extension present AND dev expansion has `total` present but prod expansion does not.

Search: analyzed all 810 successful expand deltas; 292 match the combined pattern `unclosed=prod-only AND total=dev-only`. No records show unclosed prod-only without total dev-only or vice versa.

#####What the tolerance covers

Tolerance `expand-unclosed-extension-and-total` matches $expand records where:
- Both return 200 with expansion data
- Prod has the `valueset-unclosed` extension but dev doesn't
- Dev has `expansion.total` but prod doesn't

It normalizes by removing the `valueset-unclosed` extension from prod's expansion.extension array and removing `total` from dev's expansion object.

#####Representative record

b6156665-797d-4483-971c-62c00a0816b8: POST /r4/ValueSet/$expand — SNOMED CT is-a 404684003 (Clinical finding), count=1000. Prod returns 1000 codes with `valueset-unclosed: true` and no total. Dev returns 1000 codes with `total: 124412` and no unclosed extension.

---

