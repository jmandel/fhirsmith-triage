# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Flanguages&count=50`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 67df517
**Tolerance**: expand-dev-warning-experimental-param

## What differs

After normalization (existing tolerances handled expansion identifier/timestamp, dev's empty `id:""`, and dev's extra `contact` metadata), the only remaining difference is:

Dev includes an extra expansion parameter that prod omits:
```json
{"name": "warning-experimental", "valueUri": "http://hl7.org/fhir/ValueSet/languages|4.0.1"}
```

Both sides agree on all terminology content: the same 50 codes in `expansion.contains`, `total: 56`, and all other expansion parameters (`displayLanguage`, `count`, `used-codesystem`).

The ValueSet has `experimental: true` in its metadata (both sides agree). Dev adds a `warning-experimental` expansion parameter to flag this fact; prod does not emit this warning.

## Category: `temp-tolerance`

This is a real behavioral difference, not a cosmetic one. Dev is including an additional informational parameter in expansion responses that prod does not produce. While the parameter is arguably helpful (warning consumers about experimental status), it represents different server behavior. Filed as bug 67df517.

This pattern is similar to the existing `expand-dev-includeDefinition-param` tolerance (bug d1b7d3b), where dev echoes extra expansion parameters that prod omits.

## Tolerance

Tolerance `expand-dev-warning-experimental-param` matches $expand responses where dev has a `warning-experimental` expansion parameter that prod lacks, and strips it from dev.

- Records affected: 1 (only the CommonLanguages ValueSet in this dataset)
- Searched full comparison.ndjson: no other records have `warning-*` expansion parameters in dev or prod
- Delta count: 147 -> 146 (1 record eliminated)
- Validation: the eliminated record is exactly our target; all terminology content (codes, displays, totals) is identical between prod and dev after this normalization
