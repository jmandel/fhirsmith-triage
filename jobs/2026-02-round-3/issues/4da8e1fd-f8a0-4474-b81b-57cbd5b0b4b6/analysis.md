# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b9034b0
**Tolerance**: validate-code-display-text-differs

## What differs

The `display` parameter in the validate-code response differs between prod and dev for the same code and same version:

- Prod: `display = "Mean blood pressure"`
- Dev: `display = "Mean arterial pressure"`

Both for LOINC code 8478-0, version 2.81. Everything else is identical: `result=true`, `system=http://loinc.org`, `code=8478-0`, `version=2.81`, `codeableConcept`, and `issues` all match after normalization.

The LOINC code 8478-0 has multiple designations. Prod returns "Mean blood pressure" (the LOINC long common name), while dev returns "Mean arterial pressure" (a different designation). The request included `displayLanguage=en-US`.

## Broader pattern

275 validate-code delta records have display as their only difference, across multiple code systems:

- **http://loinc.org**: 261 records (prod returns short/common names, dev returns longer or different designations)
- **urn:iso:std:iso:3166**: 10 records (e.g., DE: prod="Deutschland", dev="Germany")
- **http://unitsofmeasure.org**: 2 records (e.g., mL: prod="ml", dev="mL")
- **urn:ietf:bcp:13**: 2 records (e.g., application/pdf: prod="PDF", dev="application/pdf")

Same class of issue as the previously handled SNOMED display text difference (bug 39d9af6, tolerance `snomed-same-version-display-differs`), but for non-SNOMED systems.

## Category: `temp-tolerance`

This is a real, meaningful difference — display text is terminology content and the two servers return different values for the same code. However, it follows a recognizable pattern (designation selection) affecting many records, and the same issue class was already triaged for SNOMED. Filed as temp-tolerance with a git-bug.

## Tolerance

Tolerance ID: `validate-code-display-text-differs`. Matches validate-code Parameters responses where both sides have display values that differ, excluding systems already handled by other tolerances (SNOMED, BCP-47). Normalizes both sides to prod's display value.

- Records eliminated: 275 (from 2434 to 2159 deltas)
- Validated 12 randomly sampled eliminated records: all had display as the sole difference, confirming the tolerance is correctly scoped.
