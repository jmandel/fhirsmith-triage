# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b9e3cfd
**Tolerance**: expand-display-text-differs

## What differs

After existing tolerances normalize away transient metadata (identifier, timestamp), empty id, and extra includeDefinition parameter, the only remaining difference is the display text for SNOMED code 116101001:

- **prod**: `"Product containing gonadotropin releasing hormone receptor antagonist (product)"`
- **dev**: `"Gonadotropin releasing hormone antagonist"`

Both servers return the same 4 codes in the same order. The display text difference reflects different preferred term selection for the same SNOMED concept.

## Category: `temp-tolerance`

Display text is meaningful terminology content — different display strings for the same code represent a real difference in what term the server selects as the preferred display. This is not cosmetic (it's not key ordering or whitespace); it reflects different underlying term data or preferred term logic.

However, this follows a widespread, recognizable pattern: 157 expand records show display text diffs in `expansion.contains` across multiple code systems (SNOMED: 134, ISO 3166: 22, UCUM: 1). Filing as a bug and suppressing with a tolerance to avoid re-triaging the same pattern.

## Tolerance

**ID**: `expand-display-text-differs`
**Bug**: b9e3cfd
**What it matches**: $expand responses (resourceType=ValueSet) where any `expansion.contains[].display` differs between prod and dev for the same system+code pair.
**Normalization**: Sets both sides' display to prod's value (canonical normalization). Other field differences (system, code, properties, etc.) are preserved and will still surface.
**Records eliminated**: 149 (of 610 total deltas, reducing to 461).
**Validation**: Sampled 15 eliminated records — all had only display diffs, no other differences were hidden.
