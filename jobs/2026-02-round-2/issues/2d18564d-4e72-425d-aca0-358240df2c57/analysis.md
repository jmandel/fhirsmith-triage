# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http%3A%2F%2Fterminology.hl7.org%2FValueSet%2Fv3-TribalEntityUS&incomplete-ok=true`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (Dev loads different versions of HL7 terminology CodeSystems/ValueSets)
**Tolerance**: expand-hl7-terminology-version-skew-vs-metadata

## What differs

After existing tolerances normalize expansion parameters and intersect code contents, the only remaining differences are ValueSet-level metadata fields reflecting different loaded editions:

| Field | Prod | Dev |
|-------|------|-----|
| version | 4.0.0 | 2018-08-12 |
| date | 2014-03-26 | 2018-08-12 |
| name | TribalEntityUS | v3.TribalEntityUS |
| title | TribalEntityUS | v3 Code System TribalEntityUS |
| identifier | present (OID) | absent |
| language | en | absent |
| immutable | absent | true |
| meta | absent | present (lastUpdated, profile) |

Both expansions are empty (total=0, contains=[]) after code intersection — the 2 codes dev returns are not in prod's 579 codes and vice versa.

## Category: `temp-tolerance`

This is a real, meaningful difference — prod and dev are loading different versions of the v3-TribalEntityUS ValueSet. This is another manifestation of the existing HL7 terminology version skew bug (6edc96c), which already covers version string differences in used-codesystem parameters, message text, expansion code membership, and ValueSet version strings in validate-code messages.

## Tolerance

Added `expand-hl7-terminology-version-skew-vs-metadata` under bug 6edc96c. It normalizes dev's top-level ValueSet metadata fields (date, name, title, version, identifier, language, immutable, meta) to prod's values when the expansion involves HL7 terminology systems. Eliminated 3 records (all v3-TribalEntityUS expand requests). All 3 were validated — same pattern of metadata differences from version skew, no other differences hidden.

Updated bug 6edc96c comment 0 to include this as tolerance #5, with total records impacted updated to ~464.
