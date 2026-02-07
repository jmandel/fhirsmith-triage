<!-- Source: https://hl7.org/fhir/R4/terminologies-systems.html -->
<!-- Reference material for triage agents: Known code systems and their URIs in FHIR R4 -->

# Known Code Systems in FHIR

## Overview

This is the registry of code systems known to the FHIR specification. The listed URIs SHALL be used in preference to any other identifying mechanisms. This list is incomplete and subject to change.

## Major External Code Systems

| URI | Source | OID | Notes |
|-----|--------|-----|-------|
| `http://snomed.info/sct` | SNOMED CT (IHTSDO) | 2.16.840.1.113883.6.96 | Clinical terminology system |
| `http://www.nlm.nih.gov/research/umls/rxnorm` | RxNorm (US NLM) | 2.16.840.1.113883.6.88 | Drug nomenclature resource |
| `http://loinc.org` | LOINC | 2.16.840.1.113883.6.1 | Laboratory observations coding |
| `http://unitsofmeasure.org` | UCUM | 2.16.840.1.113883.6.8 | Case-sensitive measurement units |
| `http://ncimeta.nci.nih.gov` | NCI Metathesaurus | 2.16.840.1.113883.3.26.1.2 | Cancer-related terminology |
| `http://www.ama-assn.org/go/cpt` | AMA CPT codes | 2.16.840.1.113883.6.12 | Procedural terminology |
| `http://hl7.org/fhir/ndfrt` | NDF-RT | 2.16.840.1.113883.6.209 | National Drug File reference |
| `http://fdasis.nlm.nih.gov` | UNII | 2.16.840.1.113883.4.9 | Unique ingredient identifiers |
| `http://hl7.org/fhir/sid/ndc` | NDC/NHRIC Codes | 2.16.840.1.113883.6.69 | FDA drug product codes |
| `http://hl7.org/fhir/sid/cvx` | CVX (Vaccine Administered) | 2.16.840.1.113883.12.292 | CDC vaccine codes |
| `urn:iso:std:iso:3166` | ISO Country & Regional Codes | 1.0.3166.1.2.2 | Geographic identifiers |
| `http://hl7.org/fhir/sid/dsm5` | DSM-5 | 2.16.840.1.113883.6.344 | Mental health diagnosis codes |
| `http://www.nubc.org/patient-discharge` | NUBC | 2.16.840.1.113883.6.301.5 | Patient discharge status |
| `http://www.radlex.org` | RadLex | 2.16.840.1.113883.6.256 | Radiology terminology |
| `http://hl7.org/fhir/sid/icpc-1` | ICPC | 2.16.840.1.113883.2.4.4.31.1 | Primary care classification |
| `http://hl7.org/fhir/sid/icpc-2` | ICPC-2 | 2.16.840.1.113883.6.139 | Primary care coding |
| `http://hl7.org/fhir/sid/icf-nl` | ICF (WHO) | 2.16.840.1.113883.6.254 | Functioning and disability |
| `https://www.gs1.org/gtin` | GTIN (GS1) | 1.3.160 | Product identification |
| `http://www.whocc.no/atc` | ATC Classification (WHO) | 2.16.840.1.113883.6.73 | Drug classification system |
| `urn:ietf:bcp:47` | IETF Language Tags (BCP 47) | -- | Language identification |
| `urn:ietf:bcp:13` | MIME Types (BCP 13) | -- | Content type identification |
| `urn:iso:std:iso:11073:10101` | ISO 11073-10101 | 2.16.840.1.113883.6.24 | Medical device codes |
| `http://dicom.nema.org/resources/ontology/DCM` | DICOM Code Definitions | 1.2.840.10008.2.16.4 | Medical imaging standards |

## Genetics Code Systems

| URI | Source | OID |
|-----|--------|-----|
| `http://www.genenames.org` | HGNC | 2.16.840.1.113883.6.281 |
| `http://www.ensembl.org` | ENSEMBL | Not assigned |
| `http://www.ncbi.nlm.nih.gov/refseq` | RefSeq (NCBI) | 2.16.840.1.113883.6.280 |
| `http://www.ncbi.nlm.nih.gov/clinvar` | ClinVar | Not assigned |
| `http://sequenceontology.org` | Sequence Ontology | Not assigned |
| `http://varnomen.hgvs.org` | HGVS | 2.16.840.1.113883.6.282 |
| `http://www.ncbi.nlm.nih.gov/projects/SNP` | dbSNP | 2.16.840.1.113883.6.284 |
| `http://cancer.sanger.ac.uk/cancergenome/projects/cosmic` | COSMIC | 2.16.840.1.113883.3.912 |
| `http://www.lrg-sequence.org` | LRG | 2.16.840.1.113883.6.283 |
| `http://www.omim.org` | OMIM | 2.16.840.1.113883.6.174 |

## HL7-Defined Code System Patterns

### V2 Code Systems
Pattern: `http://terminology.hl7.org/CodeSystem/v2-[X]` where `[X]` is the table identifier.

- Version 2 codes are case sensitive
- Version-dependent meanings may require namespace specifications like `http://terminology.hl7.org/CodeSystem/v2-0123/2.3+`

### V3 Code Systems
Pattern: `http://terminology.hl7.org/CodeSystem/v3-[X]`

- V3 code systems are case-sensitive

### FHIR-Defined Code Systems
Prefixed with `http://hl7.org/fhir/` or `http://terminology.hl7.org/CodeSystem/`.

## UMLS Integration

For unmapped UMLS code systems, implementers may use the pattern:
```
http://www.nlm.nih.gov/research/umls/[SAB]
```
where `[SAB]` is the lowercase UMLS source abbreviation.

## Special Notes

- All listed URIs SHALL be used in preference to any other identifying mechanisms
- Multiple system variants indicate different code systems, not mere variants of a single system
- URLs in the `http://example.org` domain are reserved for specification examples and testing only
- ISO standards without HL7 OID entries use the URN format per RFC 5141: `urn:iso:std:iso:11073:10101`
