# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fterminology.hl7.org%2FValueSet%2Fv3-ActEncounterCode&code=PLB&_format=json&system=http:%2F%2Fterminology.hl7.org%2FCodeSystem%2Fv3-ActCode`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (existing — Dev loads different versions of HL7 terminology CodeSystems/ValueSets)
**Tolerance**: validate-code-hl7-terminology-vs-version-skew

## What differs

Both prod and dev agree on the validation result (`result: false`), system (`v3-ActCode`), code (`PLB`), and CodeSystem version (`9.0.0`). The only difference is the **ValueSet version** referenced in the `message` and `issues` text:

- Prod: `v3-ActEncounterCode|3.0.0`
- Dev: `v3-ActEncounterCode|2014-03-26`

This appears in:
1. The `message` parameter: "not found in the value set '...v3-ActEncounterCode|3.0.0'" vs "|2014-03-26"
2. The `issues` OperationOutcome `details.text` for the `not-in-vs` issue

## Category: `temp-tolerance`

This is a real, meaningful difference — dev loads an older version of the v3-ActEncounterCode ValueSet (2014-03-26) than prod (3.0.0). Same root cause as existing bug 6edc96c, which covers HL7 terminology version skew across CodeSystems and ValueSets. The existing `hl7-terminology-cs-version-skew` tolerance handles CodeSystem version differences in validate-code messages but didn't cover the ValueSet version difference pattern.

## Tolerance

Added `validate-code-hl7-terminology-vs-version-skew` as a new tolerance under existing bug 6edc96c. It matches validate-code records where messages differ only in `terminology.hl7.org/ValueSet/*|version` pipe-delimited version strings, and normalizes both sides to prod's ValueSet version.

Affects 4 records (all v3-ActEncounterCode validate-code with code=PLB). Validated all 4 eliminated records: result, system, and code all match; messages match after ValueSet version normalization. No records unexpectedly added or removed.
