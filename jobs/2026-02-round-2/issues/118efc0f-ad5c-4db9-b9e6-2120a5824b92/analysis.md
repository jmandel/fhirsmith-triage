# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$lookup`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (HL7 terminology version skew)
**Tolerance**: hl7-terminology-lookup-definition-designation-skew

## What differs

This is a `$lookup` for code `active` in `http://terminology.hl7.org/CodeSystem/condition-clinical`. After the existing `hl7-terminology-cs-version-skew` tolerance normalizes the version from dev's `3.0.0` to prod's `4.0.1`, two differences remain:

1. **`definition` parameter structure and text**: Prod returns the definition as a `property` entry (property with code=definition, value="The subject is currently experiencing the symptoms of the condition or there is evidence of the condition."). Dev returns it as a top-level `definition` parameter with different text ("The subject is currently experiencing the condition or situation, there is evidence of the condition or situation, or considered to be a significant risk."). Both the structural difference (property vs top-level param) and the text difference are caused by different CodeSystem versions being loaded.

2. **Extra `designation` parameter in dev**: Dev returns a `designation` parameter with `preferredForLanguage` use type and value "Active" that prod omits entirely. The newer CodeSystem version loaded by dev includes this designation.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. Different CodeSystem versions produce different content in `$lookup` responses. However, it is caused by the known HL7 terminology version skew (bug `6edc96c`) and follows the same pattern as the `v2-0360-lookup-version-skew` tolerance. Filed as an additional manifestation under the existing bug.

## Tolerance

Wrote `hl7-terminology-lookup-definition-designation-skew` tolerance under bug `6edc96c`. It matches any `$lookup` on `terminology.hl7.org/CodeSystem/*` where dev has extra `definition` or `designation` top-level parameters that prod lacks. Normalizes by stripping `definition` and `designation` top-level params and `definition` property entries from both sides.

Eliminated 1 record (this is the only condition-clinical $lookup in the dataset; the 802 v2-0360 lookups with similar patterns are already handled by the existing `v2-0360-lookup-version-skew` tolerance). Updated bug report comment 0 to include this tolerance.
