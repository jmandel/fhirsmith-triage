# tx-compare Bug Report

_3 bugs (3 open, 0 closed)_

| Priority | Count | Description |
|----------|-------|-------------|

---

## Other

### [ ] `e18fdef` Dev returns 404 for LOINC answer list ValueSet $expand (appends |4.0.1 to canonical URL)

Records-Impacted: 2
Tolerance-ID: loinc-answer-list-expand-404
Record-ID: 7cf61657-1a32-4b8f-a4c6-f626df7381e0

#####What differs

When expanding the LOINC answer list ValueSet `http://loinc.org/vs/LL379-9` via `POST /r4/ValueSet/$expand`, prod returns 200 with a successful expansion (7 codes), while dev returns 404 with:

  ValueSet not found: http://loinc.org/vs/LL379-9|4.0.1

Dev appears to be appending `|4.0.1` (the FHIR R4 version) to the ValueSet canonical URL when resolving it, causing the lookup to fail.

#####How widespread

2 records in the comparison dataset show this exact pattern — both are `POST /r4/ValueSet/$expand` for the same LOINC answer list LL379-9, both with prod=200/dev=404, and both with the same `|4.0.1` suffix in the dev error message.

Search:
- `grep 'LL379-9' deltas.ndjson` → 2 records
- `grep 'missing-resource' deltas.ndjson` → 3 total (1 is a separate CodeSystem/SOP issue)
- All 2 matching records have identical error diagnostic

The full comparison.ndjson has 64 records referencing LL379-9, but the other 62 are `GET /r4/ValueSet?_elements=url,version` (search/list operations, not expand) and succeed on both servers.

#####What the tolerance covers

Tolerance ID: `loinc-answer-list-expand-404`
Matches: `missing-resource` category, `POST /r4/ValueSet/$expand`, dev 404 with diagnostics containing `|4.0.1`
Eliminates: 2 records

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

