# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 17ad254
**Tolerance**: ucum-display-code-as-display

## What differs

The only difference between prod and dev is the `display` parameter value for UCUM codes:

- **Prod**: Returns the UCUM code itself as display (e.g., `[in_i]`, `mg`, `%`, `mm[Hg]`)
- **Dev**: Returns a human-readable name (e.g., `(inch)`, `(milligram)`, `(percent)`, `(millimeter of mercury column)`)

All other parameters agree: `result=true`, `system=http://unitsofmeasure.org`, `code`, and `version=2.2`.

Per the FHIR UCUM guidance (terminology.hl7.org/UCUM.html): "No standardized display value is defined. The UCUM code itself is used directly as the display." Prod follows this convention; dev does not.

## Category: `temp-tolerance`

This is a real, meaningful difference in display text handling for UCUM codes. Display text is terminology content per AGENTS.md. Dev returns a UCUM print name instead of the FHIR-specified code-as-display convention. Filed as bug 17ad254.

## Tolerance

Tolerance `ucum-display-code-as-display` matches validate-code operations on `http://unitsofmeasure.org` where display values differ. Normalizes both sides to prod's display value (the code itself).

- **Records affected**: 220 (all UCUM validate-code records with display as the only diff)
- **Delta reduction**: 1953 -> 1733 (exactly 220 eliminated)
- **Validation**: Sampled 15 eliminated records. All confirmed: UCUM system, display-only diff, prod returns code as display, dev returns human-readable name. No other differences hidden.
