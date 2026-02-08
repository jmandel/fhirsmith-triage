# tx-compare Bug Report

_25 bugs (22 open, 3 closed)_

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

curl -s https://tx-dev.fhir.org/r4/ValueSet/\$expand \
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

Prod returns `expansion.extension` with `valueset-unclosed: true` and no `expansion.total`. Dev returns `expansion.total: 124412` with no unclosed extension.


For $expand operations that return incomplete/truncated expansions (e.g., SNOMED CT is-a queries requesting count=1000 from a set with 124,412 total codes):

1. **Prod includes `expansion.extension` with `valueset-unclosed: true`; dev omits it.** Per the FHIR R4 spec, this extension signals that an expansion is incomplete due to inclusion of post-coordinated or unbounded value sets. Prod correctly marks these expansions as unclosed; dev does not.

2. **Dev includes `expansion.total` (e.g., 124412); prod omits it.** The `total` field is optional (0..1) per spec. Prod omits it on these incomplete expansions; dev includes it. Since these expansions are truncated to the `count` parameter (e.g., 1000 codes returned), the behavioral difference is: dev tells the client the full count but doesn't signal incompleteness, while prod signals incompleteness but doesn't provide the full count.

These two differences always co-occur in the same records — every record where prod has `valueset-unclosed` but dev doesn't also has dev providing `total` while prod doesn't.


292 records in the comparison dataset show both patterns simultaneously. All are successful (200/200) $expand operations. The pattern is predicted by: prod expansion has `valueset-unclosed` extension present AND dev expansion has `total` present but prod expansion does not.

Search: analyzed all 810 successful expand deltas; 292 match the combined pattern `unclosed=prod-only AND total=dev-only`. No records show unclosed prod-only without total dev-only or vice versa.


Tolerance `expand-unclosed-extension-and-total` matches $expand records where:
- Both return 200 with expansion data
- Prod has the `valueset-unclosed` extension but dev doesn't
- Dev has `expansion.total` but prod doesn't

It normalizes by removing the `valueset-unclosed` extension from prod's expansion.extension array and removing `total` from dev's expansion object.


b6156665-797d-4483-971c-62c00a0816b8: POST /r4/ValueSet/$expand — SNOMED CT is-a 404684003 (Clinical finding), count=1000. Prod returns 1000 codes with `valueset-unclosed: true` and no total. Dev returns 1000 codes with `total: 124412` and no unclosed extension.

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

Records-Impacted: 19
Tolerance-ID: dev-extra-display-lang-not-found-message
Record-ID: 299d1b7f-b8f7-4cee-95ab-fa83da75ea80


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

Prod returns parameters: result, system, code, version, display, codeableConcept, diagnostics.

Dev returns the same parameters plus message ("There are no valid display names found for the code urn:iso:std:iso:3166#FR for language(s) 'fr'. The display is 'France' which is the default language display") and issues (OperationOutcome with informational severity).


When $validate-code returns result=true and a displayLanguage parameter was specified in the request, dev returns extra message and issues parameters that prod omits entirely. The dev message reads: "There are no valid display names found for the code <system>#<code> for language(s) '<lang>'. The display is '<display>' which is the default language display." The issues parameter contains an OperationOutcome with an informational issue (code=invalid, tx-issue-type=invalid-display).

Prod returns only: result, system, code, version, display, codeableConcept, diagnostics.
Dev returns all the above plus: message and issues with the display-language-not-found informational feedback.

Both servers agree on result=true, and the validated code/display/version are identical.


19 records in deltas match this pattern. All are POST /r4/ValueSet/$validate-code with result=true where prod has no message/issues and dev has "no valid display names found" message+issues. 17 of 19 involve urn:iso:std:iso:3166 codes (FR, FRA) with displayLanguage=fr or fr-FR. 2 involve urn:iso:std:iso:3166 with no explicit displayLanguage.

Search: grep 'There are no valid display names found' jobs/2026-02-round-2/results/deltas/deltas.ndjson | wc -l returns 21 total, but 2 of those have differing prod issues too (SNOMED, different root cause). The 19 clean matches are where prod lacks both message and issues entirely.


Tolerance dev-extra-display-lang-not-found-message matches validate-code Parameters responses where result=true, prod has no message parameter, and dev has a message containing "There are no valid display names found". It normalizes by stripping the extra message and issues from dev. Eliminates 19 records.

---

### [ ] `b6d19d8` Dev omits system/code/version/display params on CodeSystem/$validate-code with codeableConcept containing unknown system

Records-Impacted: 5
Tolerance-ID: cc-validate-code-missing-known-coding-params
Record-ID: 84b0cee7-5f7e-4fbc-af8a-aed5ad7a91d4


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

Prod returns `system=http://loinc.org`, `code=72106-8`, `display=Total score [MMSE]`, plus 2 OperationOutcome issues (UNKNOWN_CODESYSTEM + Display_Name_for__should_be_one_of__instead_of). Dev returns no system/code/display params and only 1 issue (UNKNOWN_CODESYSTEM).


When CodeSystem/$validate-code is called with a codeableConcept containing multiple codings — one from an unknown CodeSystem and one from a known CodeSystem — and result=false:

- **Prod** validates the known coding and returns `system`, `code`, `version`, `display` parameters for it. When the known coding also has issues (e.g. invalid-display), prod includes those as additional OperationOutcome issues.
- **Dev** only reports the unknown system error and omits the `system`, `code`, `version`, `display` parameters entirely. Dev also omits any additional OperationOutcome issues related to the known coding.

For example, with a codeableConcept containing a LOINC coding (known) and a smartypower coding (unknown):
- Prod returns: system=http://loinc.org, code=72106-8, version=2.81, display="Total score [MMSE]", plus 2 issues (UNKNOWN_CODESYSTEM + invalid-display)
- Dev returns: no system/code/version/display params, only 1 issue (UNKNOWN_CODESYSTEM)


5 records in deltas. All are CodeSystem/$validate-code (both /r4 and /r5) with codeableConcept containing one unknown and one known coding. Both sides agree result=false.

Search: `grep '"missing-in-dev","param":"system"' results/deltas/deltas.ndjson | wc -l` → 5

The 5 records involve 2 unknown systems:
- https://fhir.smartypower.app/CodeSystem/smartypower-cognitive-tests (2 records, LOINC known coding)
- http://fhir.essilorluxottica.com/fhir/CodeSystem/el-observation-code-cs (3 records, SNOMED known coding)


Tolerance ID: cc-validate-code-missing-known-coding-params
Matches: validate-code with codeableConcept, result=false on both sides, x-caused-by-unknown-system present, where prod has system/code params that dev lacks.
Normalizes by adding prod's system/code/version/display params to dev and canonicalizing issues to prod's set.
Eliminates: 5 records.


- 84b0cee7-5f7e-4fbc-af8a-aed5ad7a91d4 (LOINC + smartypower, /r5)
- 6f70f14a-81e1-427e-9eed-1b2c53801296 (SNOMED + essilorluxottica, /r4)

---

### [ ] `2ed80bd` Dev  omits expansion.total when prod includes it

Records-Impacted: 47
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

In $expand responses (POST /r4/ValueSet/$expand), prod returns `expansion.total` (the total count of matching concepts) while dev omits it entirely. The `total` field is a 0..1 optional integer in FHIR R4's ValueSet.expansion, documented as "Total concept count; permits server pagination." Without it, clients cannot determine how many pages exist in a paged expansion.

Examples:
- Prod: `"total": 5099` with 1000 contains (paged)
- Dev: no `total` field, same 1000 contains

Both servers return identical `contains` arrays and `offset` values in all sampled records.

#####How widespread

47 records in deltas.ndjson show this pattern (prod has expansion.total, dev omits it). Breakdown:
- 33 records with total=5099 (paged SNOMED expansions with count=1000)
- 13 records with total=0 (empty expansions)
- 1 record with total=249 (ISO 3166 codes, also has contains count mismatch)

Search: All 47 are expand operations, all POST /r4/ValueSet/$expand, all with both statuses 200.

Note: There is a separate existing tolerance (expand-unclosed-extension-and-total, bug f2b2cef) for the reverse case where prod omits total on unclosed expansions but dev includes it. That bug is about the valueset-unclosed extension. This bug is different — neither side has the unclosed extension; dev simply fails to include `total` in complete expansions.

#####What the tolerance covers

Tolerance ID: expand-dev-missing-total
Matches: $expand responses (POST /r4/ValueSet/$expand) where both sides return 200, prod has expansion.total, and dev doesn't.
Normalizes by removing expansion.total from prod (since dev lacks it) to prevent re-triaging.

---

### [ ] `c7004d3` Dev omits valueset-toocostly extension and adds spurious used-codesystem on  for grammar-based code systems

Records-Impacted: 13
Tolerance-ID: expand-toocostly-extension-and-used-codesystem
Record-ID: a272aa8c-96d7-4905-a75a-ea21d67b83fc


Prod:
```bash
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/mimetypes","compose":{"include":[{"system":"urn:ietf:bcp:13"}]}}}]}' \
| jq '.expansion.extension, [.expansion.parameter[] | select(.name == "used-codesystem")]'
```

Dev:
```bash
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"_incomplete","valueBoolean":true},{"name":"count","valueInteger":1000},{"name":"valueSet","resource":{"resourceType":"ValueSet","url":"http://hl7.org/fhir/ValueSet/mimetypes","compose":{"include":[{"system":"urn:ietf:bcp:13"}]}}}]}' \
| jq '.expansion.extension, [.expansion.parameter[] | select(.name == "used-codesystem")]'
```

Prod returns `expansion.extension` with `valueset-toocostly: true`, dev returns `null`. Dev includes `used-codesystem: urn:ietf:bcp:13` in parameters, prod does not.


For $expand on grammar-based code systems (primarily BCP-13 MIME types via `urn:ietf:bcp:13`, plus one Brazilian ICD-10 ValueSet), both prod and dev return 200 with an empty expansion (total=0, no `contains`). However:

1. **Prod includes `expansion.extension` with `valueset-toocostly: true`; dev omits it.** This extension signals that the expansion could not be performed because the code system is grammar-based or too costly to enumerate. Prod correctly marks these expansions; dev does not.

2. **Dev includes `expansion.parameter` with `used-codesystem` (e.g., `urn:ietf:bcp:13`); prod omits it.** Dev reports which code system it consulted, even though the expansion returned no results. Prod does not report a used-codesystem on these too-costly expansions.

Both differences always co-occur in the same records.


13 records in the current comparison dataset show both patterns simultaneously. All are successful (200/200) $expand operations. 12 of 13 involve `http://hl7.org/fhir/ValueSet/mimetypes` (BCP-13 MIME types). One involves a Brazilian ValueSet that includes LOINC and a Brazilian ICD-10 code system.

Search: `grep 'valueset-toocostly' deltas.ndjson` found 25 records total; of those, 13 have both sides returning 200 (the rest have status mismatches handled by other tolerances).


Tolerance `expand-toocostly-extension-and-used-codesystem` matches $expand records where both return 200, prod has the `valueset-toocostly` extension but dev doesn't, and normalizes by:
- Removing the `valueset-toocostly` extension from prod
- Removing any dev-only `used-codesystem` parameters

Eliminates 13 records from the delta file.


a272aa8c-96d7-4905-a75a-ea21d67b83fc: POST /r4/ValueSet/$expand — BCP-13 MIME types (http://hl7.org/fhir/ValueSet/mimetypes). Prod returns empty expansion with `valueset-toocostly: true` extension and `limitedExpansion: true` parameter. Dev returns empty expansion with `limitedExpansion: true` and `used-codesystem: urn:ietf:bcp:13` but no toocostly extension.

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

### [ ] `9fd2328` Dev loads older SNOMED CT edition (20240201) than prod (20250201), causing  to return different code sets

Records-Impacted: 40
Tolerance-ID: expand-snomed-version-skew-content
Record-ID: 2c7143df-3316-422a-b284-237f16fbcd6e

#####Repro

```bash
####Prod
curl -s 'https://tx.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/83821000000107"},{"name":"defaultDisplayLanguage","valueCode":"en-GB"},{"name":"includeDefinition","valueBoolean":false},{"name":"excludeNested","valueBoolean":false},{"name":"cache-id","valueId":"7743c2e6-5b90-4b62-bcd2-6695b993e76b"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://snomed.info/sct","version":"http://snomed.info/sct/900000000000207008","filter":[{"property":"concept","op":"descendent-of","value":"365636006"}]}]}}}]}' \
| jq '.expansion.parameter[] | select(.name == "used-codesystem") | .valueUri, .expansion.contains | length'

####Dev
curl -s 'https://tx-dev.fhir.org/r4/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"system-version","valueUri":"http://snomed.info/sct|http://snomed.info/sct/83821000000107"},{"name":"defaultDisplayLanguage","valueCode":"en-GB"},{"name":"includeDefinition","valueBoolean":false},{"name":"excludeNested","valueBoolean":false},{"name":"cache-id","valueId":"7743c2e6-5b90-4b62-bcd2-6695b993e76b"},{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://snomed.info/sct","version":"http://snomed.info/sct/900000000000207008","filter":[{"property":"concept","op":"descendent-of","value":"365636006"}]}]}}}]}' \
| jq '.expansion.parameter[] | select(.name == "used-codesystem") | .valueUri, .expansion.contains | length'
```

Prod uses SNOMED version 20250201 and returns 208 codes; dev uses version 20240201 and returns 207 codes. Code 1351894008 "Mixed field RhD (finding)" is present in prod but absent in dev.

#####What differs

Prod $expand uses SNOMED CT International edition version 20250201 while dev uses version 20240201. This causes expansion results to contain different sets of codes — prod includes codes added in the 2025 edition that dev does not have, and some codes present in both editions have different display text reflecting updates between versions.

For example, in the representative record (expanding descendants of 365636006 "Finding of blood group"), prod returns 208 codes while dev returns 207. Code 1351894008 "Mixed field RhD (finding)" is present in prod but absent from dev, consistent with it being added in the 2025 edition.

The used-codesystem parameter confirms the version difference:
- Prod: `http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20250201`
- Dev: `http://snomed.info/sct|http://snomed.info/sct/900000000000207008/version/20240201`

#####How widespread

40 expand content-differs records in the current comparison have SNOMED version skew with code membership differences. Identified via:
```
grep expand+content-differs in deltas.ndjson, then check for SNOMED used-codesystem version mismatch + different code sets
```

All 40 records are POST /r4/ValueSet/$expand requests using SNOMED CT.

#####What the tolerance covers

Tolerance `expand-snomed-version-skew-content` matches expand records where both sides return 200, SNOMED used-codesystem versions differ, and the expansion contains arrays have different code membership. It normalizes both sides to the intersection of codes and adjusts the total count. This is the same approach used by `expand-hl7-terminology-version-skew-content` (bug 6edc96c).

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

Records-Impacted: 17
Tolerance-ID: expand-too-costly-succeeds
Record-ID: d9734f68-d8b4-475d-9204-632c9b4ccbf0


```bash
curl -s 'https://tx.fhir.org/r5/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://loinc.org"}]}}}]}'

curl -s 'https://tx-dev.fhir.org/r5/ValueSet/$expand' \
-H 'Accept: application/fhir+json' \
-H 'Content-Type: application/fhir+json' \
-d '{"resourceType":"Parameters","parameter":[{"name":"count","valueInteger":1000},{"name":"offset","valueInteger":0},{"name":"valueSet","resource":{"resourceType":"ValueSet","status":"active","compose":{"inactive":true,"include":[{"system":"http://loinc.org"}]}}}]}'
```

Prod returns HTTP 422 with OperationOutcome: `{"resourceType":"OperationOutcome", "issue":[{"severity":"error","code":"too-costly","details":{"text":"The value set '' expansion has too many codes to display (>10000)"}}]}`.

Dev returns HTTP 200 with a ValueSet containing 1000 LOINC codes in the expansion (respecting the `count` parameter for pagination).


When expanding ValueSets that include very large code systems (all of LOINC via `http://loinc.org`, or MIME types via `http://hl7.org/fhir/ValueSet/mimetypes`), prod returns HTTP 422 with an OperationOutcome containing `issue.code: "too-costly"` and message "The value set '' expansion has too many codes to display (>10000)". Dev returns HTTP 200 with a ValueSet containing up to 1000 codes (honoring the count parameter for pagination).

Prod correctly enforces an expansion size guard — refusing to expand code systems with >10000 codes even when pagination parameters are present. Dev does not enforce this guard and instead returns a paginated result.


17 records in the comparison dataset show this pattern:
- 6 records: POST `/r5/ValueSet/$expand` expanding all of LOINC (`http://loinc.org`, with `inactive: true`)
- 11 records: GET `/r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fmimetypes` expanding MIME types

Search method: `grep 'too-costly' deltas.ndjson` finds 273 records total; filtering to `status-mismatch` category (prod=422, dev=200) yields 17. The remaining 256 are `dev-crash-on-error` (prod=422, dev=500) — same root cause but different symptom (dev crashes rather than succeeding).

Additionally, there are likely records already eliminated by the prior `expand-too-costly-succeeds` tolerance (bug e3fb3f6, which appears to have been removed from git-bug). The current tolerance was scoped too narrowly (exact URL match on `/r4/ValueSet/$expand` only, missing GET requests with query params and /r5/ requests).


Tolerance ID: `expand-too-costly-succeeds`. Matches any $expand request (any FHIR version, GET or POST) where prod returns 422 with an OperationOutcome containing `issue.code: "too-costly"` and dev returns 200. Skips these records entirely since the responses are fundamentally incomparable (error vs success).


- `d9734f68-d8b4-475d-9204-632c9b4ccbf0` (LOINC, POST /r5/ValueSet/$expand)
- `3a2672db-cb0d-4312-87f1-5d6b685fbfe0` (MIME types, GET /r4/ValueSet/$expand?url=...mimetypes)

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

---

### [ ] `1433eb6` Dev returns 400 ValueSet-not-found for validate-code requests that prod handles successfully (10 records)

Records-Impacted: 10
Tolerance-ID: validate-code-valueset-not-found-dev-400
Record-ID: 064711fa-e287-430e-a6f4-7ff723952ff1

#####What differs

For $validate-code requests against certain ValueSets, prod returns HTTP 200 with a valid Parameters response (result=true or result=false), while dev returns HTTP 400 with an OperationOutcome saying "A definition for the value Set '...' could not be found."

Prod successfully resolves these ValueSets and performs code validation. Dev fails at the ValueSet resolution step and returns an error instead of a validation result.

#####How widespread

10 records show this pattern (prod=200, dev=400 with "could not be found"):

- 3 records: `nrces.in/ndhm/fhir/r4/ValueSet/ndhm-diagnosis-use*` (Indian NDHM ValueSets)
- 5 records: `ontariohealth.ca/fhir/ValueSet/*` (Ontario Health ValueSets)
- 2 records: `hl7.org/fhir/ValueSet/@all` (special @all ValueSet)

Search: `grep 'could not be found' results/deltas/deltas.ndjson` filtered to prod=200 dev=400

All are POST /r4/ValueSet/$validate-code requests. The ValueSets come from different IG packages (NDHM India, Ontario Health, and core FHIR @all), so the root cause may be that dev is missing certain IG-provided ValueSet definitions or doesn't support the @all pseudo-ValueSet.

#####What the tolerance covers

Tolerance `validate-code-valueset-not-found-dev-400` matches: POST validate-code, prod=200, dev=400, where dev body contains OperationOutcome with "could not be found" text. Eliminates all 10 records.

#####Representative record IDs

- 064711fa-e287-430e-a6f4-7ff723952ff1 (nrces.in ndhm-diagnosis-use--0)
- 5beceead-a754-4f88-8dec-1a7a931166b9 (ontariohealth.ca symptoms-of-clinical-concern)
- 38f6e665-4c34-4589-8d29-77c522b97845 (hl7.org/fhir/ValueSet/@all)

---

