<!-- Source: https://terminology.hl7.org/SNOMEDCT.html -->
<!-- Reference material for triage agents: SNOMED CT representation and behavior in FHIR -->

# SNOMED CT in FHIR

## System Identification

- **System URI**: `http://snomed.info/sct`
- **OID**: 2.16.840.1.113883.6.96
- **Concept URIs** (RDF): `http://snomed.info/id/[concept-id]`

## Version Format

Version URIs follow the SNOMED CT URI Specification:
```
http://snomed.info/sct/[sctid]/version/[YYYYMMDD]
```

- `[sctid]` identifies the specific edition (International or National)
- `[YYYYMMDD]` is the release date
- At minimum, implementations should include the sctid: `http://snomed.info/sct/[sctid]`

**Important**: Servers SHOULD regard provision of the date only for the version (without an sctid) as an error, and refuse to process the interaction.

### Common Edition SCTIDs

- International Edition: `900000000000207008`
- US Edition: `731000124108`
- UK Edition: `999000011000000103` (Clinical) / `999000021000000109` (Drug)
- Australian Edition: `32506021000036107`

## Code Format

Valid codes in `http://snomed.info/sct`:
- **Concept IDs**: Standard numeric identifiers (e.g., `128045006`)
- **SNOMED CT Expressions**: Using Compositional Grammar Syntax (e.g., `128045006:{363698007=56459004}`)

**Invalid as codes**: Terms, Description Identifiers, and alternative identifiers.

## Display Terms

The correct display is one of the terms associated with the concept. The best display is the preferred term in the relevant language/dialect, as specified in the associated language reference set.

For expressions without official published terms, the full expression with embedded terms may be used.

## Concept Properties

| Property | Type | Description |
|----------|------|-------------|
| `inactive` | boolean | Derived from RF2 active column (inverted) |
| `effectiveTime` | dateTime | From RF2 concepts file snapshot |
| `moduleId` | code | SNOMED CT concept ID of owning module |
| `normalForm` | string | Necessary Normal Form with terms (not for subsumption) |
| `normalFormTerse` | string | Necessary Normal Form with concept IDs only |
| `semanticTag` | code | Content within final brackets of Fully Specified Name |
| `sufficientlyDefined` | boolean | True if includes sufficient definition conditions |

### Concept Model Attributes as Properties

SNOMED CT relationships subsumed by `410662002 |Concept model attribute|` become properties. They are referenced by concept ID rather than human-readable term (e.g., property code `272741003` for laterality).

## Designation Handling

- Specify language as BCP-47 code from RF2 `languageCode` field (ISO-639-1 subset)
- Term types indicated via `designation.use`:
  - Fully Specified Name: `900000000000003001`
  - Synonym: `900000000000013009`
  - Definition: `900000000000550004`
- `$expand` supports `includeDesignations` parameter to return additional terms
- Use `ValueSet.compose.include.concept.designation` for enumerated value sets
- Use `CodeSystem.concept.designation` for intensionally-defined value sets

## Filter Properties

### By Subsumption
- **Property**: `concept`
- **Operations**: `is-a` (includes target), `descendant-of` (excludes target)
- **Value**: Concept ID
- Returns all transitively subsumed concepts

### By Reference Set
- **Property**: `concept`
- **Operation**: `in`
- **Value**: Reference set concept ID
- Returns all active members of specified reference set

### By Expression Constraint Language (ECL)
- **Property**: `constraint`
- **Operation**: `=`
- **Value**: ECL expression
- Executes constraint and returns matching concepts

### Post-coordination Control
- **Property**: `expressions`
- **Operation**: `=`
- **Values**: `true` or `false`
- Controls whether post-coordinated expressions are permitted in results

## Implicit Value Sets

Implicit value sets follow predictable URL patterns without requiring explicit ValueSet resources:

| Pattern | Meaning |
|---------|---------|
| `http://snomed.info/sct?fhir_vs` | All concepts in edition |
| `http://snomed.info/sct?fhir_vs=isa/[sctid]` | Concept and all descendants |
| `http://snomed.info/sct?fhir_vs=refset` | All concepts with associated reference sets |
| `http://snomed.info/sct?fhir_vs=refset/[sctid]` | All concepts in specific reference set |
| `http://snomed.info/sct?fhir_vs=ecl/[ecl]` | Concepts matching ECL expression |

Base URL can be unversioned (`http://snomed.info/sct`) or versioned with full edition/version URI.

When expanded without edition/version specification, the terminology service SHALL use the latest version available for its default edition (or the International Edition if no other edition is the default).

## Implicit Concept Maps

Pattern: `[edition/version]?fhir_cm=[sctid]`

Supported Association Reference Sets:

| Name | Concept ID | Equivalence |
|------|-----------|-------------|
| POSSIBLY EQUIVALENT TO | 900000000000523009 | inexact |
| REPLACED BY | 900000000000526001 | equivalent |
| SAME AS | 900000000000527005 | equal |
| ALTERNATIVE | 900000000000530003 | inexact |

Simple Map Reference Sets (descendants of `900000000000496009`) also define implicit concept maps.

## Known Quirks and Special Handling

1. **Version without sctid is an error**: Servers should reject version strings that contain only a date without an edition sctid.
2. **Post-coordinated expressions are valid codes**: Expressions using Compositional Grammar are valid in the `code` element.
3. **Description IDs are NOT valid codes**: Must use concept IDs only; description IDs require the Description ID Extension.
4. **Edition fragments**: SNOMED CT is distributed as overlapping code system fragments; implementers must track which fragments are in use.
5. **ECL in implicit value sets**: The ECL expression in the URL must be properly URL-encoded.
6. **Licensing**: Requires appropriate SNOMED CT Affiliate license.

## Subsumption Testing

SNOMED CT supports subsumption testing via `$subsumes`. The `is-a` relationship is transitive, so `$subsumes` checks the full transitive closure of the `is-a` hierarchy.
