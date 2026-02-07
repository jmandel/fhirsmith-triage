<!-- Sources: https://terminology.hl7.org/5.5.0/CodeSystem-v3-ietf3066.html, https://hl7.org/fhir/R4/valueset-languages.html -->
<!-- Reference material for triage agents: BCP-47 language tags in FHIR -->

# BCP-47 Language Tags in FHIR

## System Identification

- **System URI**: `urn:ietf:bcp:47`
- **Legacy OID**: `2.16.840.1.113883.6.121` (superseded by the URN)
- **Computable Name**: `Ietf3066`
- **Case-Sensitive**: Yes

## Code Format

BCP-47 language tags follow IETF standards for language identification. The code system is case-sensitive, meaning tags must match specified capitalization rules.

### Structure

**Base codes** (single language):
- Two-letter codes: `en` (English), `es` (Spanish), `fr` (French), `de` (German), etc.

**Regional variants** (language with region):
- Extended codes: `en-US` (US English), `en-GB` (British English), `de-AT` (Austrian German), etc.
- Format: `[language]-[region]`

## Value Sets

### CommonLanguages
- **URL**: `http://hl7.org/fhir/ValueSet/languages`
- **OID**: 2.16.840.1.113883.4.642.3.20
- **Binding**: Preferred (systems should use these codes when available but may use others)
- **Maturity Level**: 3
- **Standards Status**: Trial Use

### AllLanguages
- Contains the complete set of BCP-47 language tags

### Common Languages (Written)
- Subset focused on written language representation

## Usage in FHIR Resources

Language codes appear across numerous FHIR elements:

| Element | Type | Description |
|---------|------|-------------|
| `Resource.language` | code | Language of the resource content |
| `Patient.communication.language` | CodeableConcept | Patient language proficiency |
| `Practitioner.communication` | CodeableConcept | Practitioner languages |
| `Attachment.language` | code | Language of attachment content |
| `CodeSystem.concept.designation.language` | code | Language of a designation |
| `ValueSet.compose.include.concept.designation.language` | code | Language of a value set designation |

## Known Quirks and Special Handling

1. **Case sensitivity**: BCP-47 is case-sensitive in FHIR. While the IETF standard itself treats tags as case-insensitive, FHIR code systems default to case-sensitive unless explicitly stated otherwise. A 2022 update established that code systems without an explicit `caseSensitive` element default to TRUE.
2. **No enumerable code list**: The `urn:ietf:bcp:47` code system defines codes but does not enumerate them in FHIR. Valid codes are determined by the BCP-47 standard itself.
3. **Preferred binding**: The CommonLanguages value set uses Preferred binding, meaning systems are encouraged but not required to use listed codes.
4. **Designation language**: BCP-47 codes are used within terminology operations to specify the language of designations in `$lookup` and `$expand` results.
5. **SNOMED CT integration**: SNOMED CT uses BCP-47 codes (derived from RF2 `languageCode` field) to identify the language of terms and designations.
6. **Subsumption**: No formal subsumption is defined, though language hierarchies exist conceptually (e.g., `en-US` is more specific than `en`).
