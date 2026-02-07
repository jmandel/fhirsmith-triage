# tx-compare Bug Report

_2 bugs (2 open, 0 closed)_

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

