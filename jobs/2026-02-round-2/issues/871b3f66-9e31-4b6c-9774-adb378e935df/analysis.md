# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http%3A%2F%2Fsnomed.info%2Fsct%3Ffhir_vs&filter=diabetes&count=5`
**Category**: missing-resource
**Status**: prod=200 dev=404
**Bug**: 36da928
**Tolerance**: snomed-implicit-valueset-expand-404

## What differs

Prod returns a successful ValueSet expansion (HTTP 200) containing SNOMED CT codes matching the filter "diabetes". Dev returns HTTP 404 with an OperationOutcome: `"ValueSet not found: http://snomed.info/sct?fhir_vs"`.

The URL `http://snomed.info/sct?fhir_vs` is a FHIR-standard implicit ValueSet URL for SNOMED CT, meaning "all concepts in the edition." This is defined in the SNOMED CT FHIR usage guide and must be recognized by a conformant terminology server. Dev does not recognize this URL pattern and treats it as a literal ValueSet canonical URL lookup, which fails.

The pattern affects all SNOMED CT implicit ValueSet URL forms:
- `http://snomed.info/sct?fhir_vs` — all of SNOMED CT
- `http://snomed.info/sct?fhir_vs=isa/<sctid>` — descendants of a concept (e.g., isa/223366009, isa/224930009, isa/900000000000441003)

No tolerances were applied to this record (applied-tolerances.txt shows "none").

## Category: `temp-tolerance`

This is a real, meaningful difference — dev fails to support a required FHIR terminology feature. Implicit ValueSets are a core part of the SNOMED CT FHIR specification and are commonly used by clients. This is not cosmetic or equivalent; dev genuinely cannot expand these ValueSets.

Filed as git-bug 36da928 with labels `tx-compare` and `missing-resource`.

## Tolerance

Tolerance `snomed-implicit-valueset-expand-404` is a skip tolerance that matches records where:
- The URL contains `fhir_vs` (after URL-decoding)
- Dev returns status 404
- Prod returns status 200

This eliminates 36 records from the delta file (3811 → 3775). All 36 are `missing-resource` / `expand` records across both /r4/ and /r5/ FHIR versions, with various filter/count parameters.

Validation: sampled 10 of 36 eliminated records — all correctly match the pattern (prod=200 ValueSet, dev=404 "ValueSet not found" for a fhir_vs URL). No false positives detected.
