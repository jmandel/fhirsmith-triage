# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$lookup`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 5f3b796
**Tolerance**: loinc-lookup-extra-designations-properties

## What differs

LOINC $lookup for code 4548-4 (Hemoglobin A1c) shows three categories of differences between prod and dev:

1. **Extra `preferredForLanguage` designation in dev**: Dev includes a designation with `use.system: "http://terminology.hl7.org/CodeSystem/hl7TermMaintInfra"` and `use.code: "preferredForLanguage"` that prod omits. Prod instead has a duplicate LONG_COMMON_NAME designation (identical en-US LONG_COMMON_NAME designation appears twice).

2. **Different CLASSTYPE property format**: Prod returns `CLASSTYPE` with `valueString: "Laboratory class"`. Dev returns `CLASSTYPE` with `valueString: "1"` (the numeric code) plus a separate `description` part with `valueString: "Laboratory class"`. These represent different data modeling choices for the same underlying property.

3. **Extra RELATEDNAMES2 properties in dev**: Dev returns 14 `RELATEDNAMES2` property parameters with language-specific related names (en-US, ar-JO, de-AT, de-DE, el-GR, es-ES, et-EE, fr-BE, it-IT, pl-PL, pt-BR, ru-RU, uk-UA, zh-CN). Prod returns none.

Additionally, the designation ordering differs between prod and dev (same designations in different order within the parameter array).

## Category: `temp-tolerance`

All three differences are real, meaningful content differences:
- The `preferredForLanguage` designation reflects different designation selection logic
- The CLASSTYPE format difference is a real data representation choice (numeric code vs display text)
- The RELATEDNAMES2 properties are real terminology content that dev provides but prod doesn't

These are not cosmetic/equivalent — they represent different data being returned. Filed as bug 5f3b796.

## Tolerance

Tolerance `loinc-lookup-extra-designations-properties` normalizes all three differences for LOINC $lookup operations:
- Strips `preferredForLanguage` designation from dev
- Deduplicates identical designations from prod
- Removes RELATEDNAMES2 properties from dev
- Normalizes CLASSTYPE to use prod's format (description value as the value, strip description part)
- Sorts same-named parameter groups by content to handle ordering differences

Affects 1 record. Only 1 LOINC $lookup exists in this comparison dataset. Validation confirmed exactly 1 record eliminated (e5ceaa8d), no other records affected.
