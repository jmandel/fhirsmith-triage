# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: 19283df
**Tolerance**: validate-code-undefined-system-result-disagrees

## What differs

Prod returns `result: true` for SNOMED code 48546005 ("Product containing diazepam (medicinal product)") validated against `http://hl7.org/fhir/uv/ips/ValueSet/medication-uv-ips|2.0.0`. Dev returns `result: false` with error "No valid coding was found for the value set".

Dev's diagnostics reveal the root cause: the system URI appears as `undefined` during validation:
- `Validate "[undefined#48546005 ("Diazepam-containing product")]"` (should be `[http://snomed.info/sct#48546005 ...]`)
- `Prepare include[0]: "()"` (should be `(http://snomed.info/sct)(concept<763158003)`)
- `Filter undefined: Code "48546005" found in ...` (filter name is "undefined" instead of the actual SNOMED ECL expression)

Dev finds the code in the CodeSystem but fails to match it against the ValueSet include filters because the filter criteria are empty.

## Category: `temp-tolerance`

This is a real, meaningful difference (wrong validation result) that follows a recognizable pattern affecting 89 records. Dev fails to extract the system URI from POST request bodies for $validate-code, causing the system to be JavaScript `undefined`. This leads to:

- **ValueSet/$validate-code (74 records)**: Code not matched against include filters (empty criteria) -> result=false
- **CodeSystem/$validate-code (14 LOINC records)**: Code looked up as literal "undefined" -> "Unknown code 'undefined'" -> result=false
- **CodeSystem/$validate-code (1 SNOMED record)**: Display validation fails for language-specific reasons -> result=false

All 89 are POST requests, all have prodResult=true/devResult=false, and all show "undefined" in dev diagnostics. Code systems affected: LOINC (56), SNOMED (24), RxNorm (9). ValueSets span IPS lab results (42), @all (15), VSAC (9), CTS medication (7), IPS procedures (6), IPS medication (3), and others.

Related to bug 4cdcd85 (dev crashes with 500 on the same root cause — "No Match for undefined|undefined"). These 89 records are the non-crash variant.

## Tolerance

Tolerance `validate-code-undefined-system-result-disagrees` (kind: `temp-tolerance`, bugId: `19283df`) skips POST $validate-code records where prod result=true, dev result=false, and the raw devBody string contains "undefined". Eliminates exactly 89 records (272 -> 183 delta lines). Eliminates all result-disagrees records from the delta file.

Validated by sampling 12 eliminated records — all confirmed as legitimate: POST $validate-code, prod=true/dev=false, devBody contains "undefined" in diagnostics trace.
