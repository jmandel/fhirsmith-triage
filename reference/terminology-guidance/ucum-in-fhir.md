<!-- Source: https://terminology.hl7.org/UCUM.html -->
<!-- Reference material for triage agents: UCUM representation and behavior in FHIR -->

# UCUM in FHIR

## System Identification

- **System URI**: `http://unitsofmeasure.org`
- **OID**: 2.16.840.1.113883.6.8

## Version Format

Standard UCUM versioning (e.g., `1.9`). The specification notes that there is no need to use version in the Coding data type, only in value sets that use UCUM codes.

## Code Format

- Codes use **case-sensitive symbols** (this is critical -- UCUM is case-sensitive)
- UCUM is **compositional**: codes are expressions built using UCUM syntax
- Curly braces `{}` are discouraged as they add descriptive text without semantic meaning
- Examples: `mg`, `kg/m2`, `mm[Hg]`, `10*3/uL`

## Display Handling

No standardized display value is defined. The UCUM code itself is used directly as the display.

## Code Status

A limited number of codes are marked deprecated (examples: `ppb`, `pptr`).

## Subsumption

No subsumption relationships are defined for UCUM.

## Filter Properties

| Property | Operation | Purpose |
|----------|-----------|---------|
| `property` | `=` | Restricts to expressions comparable to base units with matching property values |
| `canonical` | `=`, `in` | Allows expressions comparable to named unit(s) |

## Implicit Value Sets

| Pattern | Meaning |
|---------|---------|
| `http://unitsofmeasure.org/vs` | All UCUM codes |
| `http://unitsofmeasure.org/vs/[expression]` | Expressions comparable to the given unit |

## Server Implementation Notes

- Servers that do not support the full UCUM grammar should document this in their Terminology Capabilities Statement
- The specification provides a common UCUM codes value set for pre-built expressions
- Full UCUM support requires implementing the compositional grammar to validate arbitrary unit expressions

## Known Quirks and Special Handling

1. **Case sensitivity is critical**: Unlike many other code systems, UCUM is strictly case-sensitive. `mg` and `MG` are different (and `MG` is not valid).
2. **Compositional nature**: UCUM codes are not enumerable -- any valid UCUM expression is a valid code. This means:
   - `$validate-code` must implement (or approximate) the UCUM grammar
   - `$expand` cannot enumerate all codes (only common ones)
   - `$lookup` may not find codes that are valid but not pre-enumerated
3. **No display text**: The code IS the display. There is no separate human-friendly name.
4. **Curly braces**: Annotations in curly braces (e.g., `{copies}/mL`) are valid UCUM but add no semantic meaning. Servers may need to handle these carefully.
5. **Comparability**: Two UCUM expressions may represent the same dimension (e.g., `mg` and `g` are comparable) but are not equal. The `canonical` filter helps find comparable units.
6. **Version rarely matters**: UCUM is very stable; version is rarely needed in Coding elements.
7. **Common in Quantity**: UCUM codes are most commonly used in the `Quantity.code` and `Quantity.system` elements rather than in CodeableConcept.
