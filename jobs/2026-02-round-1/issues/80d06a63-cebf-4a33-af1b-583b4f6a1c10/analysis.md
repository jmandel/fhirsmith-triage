# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 3967e97
**Tolerance**: expand-dev-extra-contact-metadata

## What differs

Dev includes a `contact` field in the expanded ValueSet response that prod omits. The `contact` contains publisher contact information from the source ValueSet definition, e.g.:

```json
"contact": [{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}]}]
```

Some ValueSets also include an email contact:

```json
"contact": [{"telecom": [{"system": "url", "value": "http://hl7.org/fhir"}, {"system": "email", "value": "fhir@lists.hl7.org"}]}]
```

Prod strips this metadata from expansion results; dev passes it through from the source ValueSet definition.

Other differences in this record (used-codesystem version `4.0.1` vs `1.0.0`, empty `id` in dev, expansion identifier/timestamp) were already handled by existing tolerances (`expand-used-codesystem-version-skew`, `expand-dev-empty-id`, `expand-metadata-identifier-timestamp`).

## Category: `temp-tolerance`

This is a real behavioral difference, not cosmetic. The `contact` field is valid ValueSet metadata and its inclusion/exclusion reflects different implementation choices about what metadata to carry through in $expand responses. While not a terminology content error, it represents a difference in response shape that should be resolved.

## Tolerance

Tolerance `expand-dev-extra-contact-metadata` matches ValueSet $expand responses where dev has a `contact` field and prod does not, then strips `contact` from dev.

- **12 records** in deltas have this pattern (59 in full comparison, others already handled)
- **9 records eliminated** (where `contact` was the sole remaining difference)
- **3 records remain** in deltas (they have other differences beyond `contact`)
- All 9 eliminations validated: contact was confirmed as the sole remaining diff in each case
- Delta count: 878 -> 869
