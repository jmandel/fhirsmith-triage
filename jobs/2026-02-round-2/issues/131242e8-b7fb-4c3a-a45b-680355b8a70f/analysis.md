# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fpatient-contactrelationship&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 7716e08 (existing — Dev uses R5-style property instead of R4 extension for deprecated status in expand contains)
**Tolerance**: expand-r4-deprecated-status-representation (updated)

## What differs

After existing tolerances had already normalized away per-code deprecated annotations, code ordering, version skew, contact metadata, and expansion identifiers/timestamps, the only remaining difference was:

**Prod** includes an `expansion.extension` entry declaring the "status" property:
```json
{
  "extension": [
    {"url": "uri", "valueUri": "http://hl7.org/fhir/concept-properties#status"},
    {"url": "code", "valueCode": "status"}
  ],
  "url": "http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.property"
}
```

**Dev** omits this extension entirely.

This is the R5 backport mechanism for declaring expansion properties in R4. Prod uses it to declare the "status" property that accompanies per-code deprecated annotations. Dev does not include this property declaration (and also omits the per-code deprecated annotations, as handled by the existing tolerance).

## Category: `temp-tolerance`

This is a real difference — prod declares a concept property that dev does not. It's part of the same root cause as bug 7716e08, where prod and dev handle deprecated code status differently in R4 $expand responses. The expansion-level property declaration is the "header" for the per-code annotations already covered by the existing tolerance.

## Tolerance

Updated the existing `expand-r4-deprecated-status-representation` tolerance to also strip the expansion-level property declaration extension (`http://hl7.org/fhir/5.0/StructureDefinition/extension-ValueSet.expansion.property`) from both sides. The match condition was extended to trigger when this expansion-level extension is present on either side.

- **Records eliminated by this update**: 5 (all patient-contactrelationship $expand operations)
- **Total records handled by tolerance**: 26 (unchanged — the other 21 were already eliminated by the original tolerance)
- **Validation**: All 5 eliminated records confirmed to be patient-contactrelationship expand operations where the only remaining difference was the expansion.extension property declaration
