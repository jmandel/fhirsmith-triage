# tx-compare Bug Report

_38 bugs (34 open, 4 closed)_

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

Records-Impacted: ~3316
Record-ID: 59eff7c6-9fd2-45b2-8f27-c790368bcc54, 1697b0cd-971b-475c-8075-f249215b1205, 199de988-2772-45c3-83cb-5ff1de1f01ce
Tolerance-ID: oo-missing-location-field, oo-missing-location-post-version-skew

#####Root cause

Prod includes both the deprecated `location` field and the `expression` field on OperationOutcome issues. Dev includes only `expression`, omitting `location` entirely.

In FHIR R4, `OperationOutcome.issue.location` (0..*) is deprecated in favor of `expression`, but it remains a defined field. Prod populates both; dev omits `location`. In every observed case, `location` and `expression` have identical values (e.g., both `["system"]` or both `["code"]`).

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

While `location` is deprecated, it is still part of the FHIR R4 spec and clients may depend on it. The information is redundant (always equals `expression`), but its absence is a conformance gap.

Most common location values across all affected records:
- `["code"]`: ~1073
- `["Coding.system"]`: ~802
- `["Coding.code"]`: ~622
- `["system"]`: ~463
- `["CodeableConcept.coding[0].code"]`: ~283

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

Records-Impacted: ~464
Record-ID: 04364a8a-acce-491a-8018-9ac010d47d21, ef77e7ca-9afa-4325-a1f3-a939a62a490f, 7813f9ee-79ee-445b-8064-603a98e876bf, 83509e51-1a8b-4d77-8f4e-7b0037009c4a, 2d18564d-4e72-425d-aca0-358240df2c57
Tolerance-ID: hl7-terminology-cs-version-skew, expand-hl7-terminology-version-skew-params, expand-hl7-terminology-version-skew-content, validate-code-hl7-terminology-vs-version-skew, expand-hl7-terminology-version-skew-vs-metadata

#####Summary

Dev loads older/different versions of HL7 terminology CodeSystems and ValueSets (`http://terminology.hl7.org/CodeSystem/*`, `http://terminology.hl7.org/ValueSet/*`) than prod. For example, prod loads `consentcategorycodes` at version `4.0.1` while dev loads `1.0.1`; prod loads `observation-category` at `4.0.1` while dev loads `2.0.0`. Dev also loads different ValueSet versions (e.g., `v3-TribalEntityUS|4.0.0` vs dev's `|2018-08-12`, `v3-ActEncounterCode|3.0.0` vs dev's `|2014-03-26`). This version skew is the single root cause behind five distinct manifestations affecting both `$validate-code` and `$expand` operations.

Known affected CodeSystems and their version mismatches:
- `consentcategorycodes`: prod=4.0.1, dev=1.0.1
- `goal-achievement`: prod=4.0.1, dev=1.0.1
- `observation-category`: prod=4.0.1, dev=2.0.0
- `consentpolicycodes`: prod=4.0.1, dev=3.0.1
- `condition-category`: prod=4.0.1, dev=2.0.0
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

Records-Impacted: 21
Tolerance-ID: dev-extra-display-lang-not-found-message
Record-ID: 299d1b7f-b8f7-4cee-95ab-fa83da75ea80, c9f3b468-dc3d-47f5-a305-0346bf5b4cab

#####What differs

When $validate-code returns result=true and a displayLanguage parameter was specified in the request, prod and dev disagree on how to communicate "no display found in the requested language":

**Variant 1 (19 records):** Prod omits message/issues entirely. Dev returns extra `message` ("There are no valid display names found for the code ...") and `issues` (OperationOutcome with informational severity, tx-issue-type=`invalid-display`).

**Variant 2 (2 records):** Prod returns `issues` with tx-issue-type=`display-comment` ("'Laboratory procedure' is the default display; the code system http://snomed.info/sct has no Display Names for the language es-AR"). Dev returns `message` and `issues` with tx-issue-type=`invalid-display` with differently-worded text. Both are saying the same thing but using different issue type codes and message wording.

In all cases, both servers agree on result=true, and system/code/version/display parameters match.

#####How widespread

21 records total. Variant 1 affects 19 records (mostly urn:iso:std:iso:3166 codes with displayLanguage=fr/fr-FR, POST /r4/ValueSet/$validate-code). Variant 2 affects 2 records (SNOMED code 108252007 with displayLanguage=es-AR, POST /r5/CodeSystem/$validate-code).

Search: `grep 'There are no valid display names found' jobs/2026-02-round-2/comparison.ndjson | wc -l` → 21

#####Tolerance

Tolerance `dev-extra-display-lang-not-found-message` handles both variants. It matches validate-code Parameters where result=true, prod has no message parameter, and dev has a message containing "There are no valid display names found". It normalizes by stripping dev's extra message/issues, and also stripping prod's display-comment issues when all issues are about display language defaults. Eliminates 21 records.

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

### [ ] `4f12dda` Dev loads older SNOMED CT and CPT editions, causing expand contains[].version to differ

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

### [ ] `f9f6206` 



---

