<!-- Source: https://terminology.hl7.org/RxNorm.html -->
<!-- Reference material for triage agents: RxNorm representation and behavior in FHIR -->

# RxNorm in FHIR

## System Identification

- **System URI**: `http://www.nlm.nih.gov/research/umls/rxnorm`
- **OID**: 2.16.840.1.113883.6.88

## Version Format

Versions are encoded as release dates in the format used by download files (e.g., `07092014`).

## Code Format

RxNorm codes use Concept Identifiers (CUIs). Only CUIs where `SAB=RXNORM` are valid -- this means only concepts with an RXNORM source attribution.

## Display Handling

The display string corresponds to the string description for the CUI associated with source RXNORM. Display values are case-insensitive but should preserve original casing.

SQL for retrieval:
```sql
SELECT STR FROM rxnconso
WHERE RXCUI = :code
AND SAB = 'RXNORM'
AND TTY IN ('SCD', 'SBD')
```

## Filter Properties

| Property | Operations | Purpose |
|----------|-----------|---------|
| `STY` (Semantic Type) | `=`, `in` | Filter CUIs by semantic classification |
| `SAB` (Source) | `=`, `in` | Filter concepts with mappings to specific sources |
| `TTY` (Term Type) | `=`, `in` | Filter by designated term type |
| Relationship (`REL`) | `=`, `in` | Filter by relationships: SY, SIB, RN, PAR, CHD, RB, RO |
| Relationship Type (`RELA`) | `=`, `in` | Filter by specific relationship types per RxNorm Appendix 1 |

## Subsumption

No subsumption relationships are defined by RxNorm. The `$subsumes` operation is not supported.

## Inactive Concepts

Inactive concept handling is not fully documented ("Todo" in the spec).

## Implicit Value Sets

- `http://www.nlm.nih.gov/research/umls/rxnorm/vs` -- All RxNorm CUIs

## Licensing

Using RxNorm codes does not require a UMLS license, but implementers must acquire a license to use RxNorm in their own right.

## Known Quirks and Special Handling

1. **No subsumption**: Unlike SNOMED CT, RxNorm does not define subsumption relationships. Hierarchy-based filtering uses relationship properties instead.
2. **CUI restriction**: Only CUIs with `SAB=RXNORM` are valid codes. CUIs from other UMLS sources referenced through RxNorm are not valid RxNorm codes.
3. **Term type filtering**: The TTY filter is important for distinguishing between different RxNorm concept types (SCD = Semantic Clinical Drug, SBD = Semantic Branded Drug, etc.).
4. **Version format**: Uses date format from download files rather than semantic versioning.
5. **Display selection**: The display depends on which TTY rows exist for the CUI; SCD and SBD are preferred.
6. **Inactive concepts**: The specification does not fully define how to determine if an RxNorm concept is inactive.

## Common RxNorm Term Types (TTY)

| TTY | Description |
|-----|-------------|
| IN | Ingredient |
| PIN | Precise Ingredient |
| MIN | Multiple Ingredients |
| SCDC | Semantic Clinical Drug Component |
| SCDF | Semantic Clinical Drug Form |
| SCD | Semantic Clinical Drug |
| BN | Brand Name |
| SBDC | Semantic Branded Drug Component |
| SBDF | Semantic Branded Drug Form |
| SBD | Semantic Branded Drug |
| GPCK | Generic Pack |
| BPCK | Branded Pack |
