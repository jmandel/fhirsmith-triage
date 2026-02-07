# tx-compare Bug Report

_3 bugs (3 open, 0 closed)_

| Priority | Count | Description |
|----------|-------|-------------|
| P6 | 3 | Content differences |

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

