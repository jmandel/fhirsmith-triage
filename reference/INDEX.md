<!-- Reference material index for triage agents -->
<!-- All content sourced from FHIR R4 specification and HL7 Terminology (terminology.hl7.org) -->

# Research Materials Index

Reference materials for triage agents working on FHIRsmith terminology server comparisons.

## Resources (`resources/`)

- **bundle.md** -- FHIR R4 Bundle resource: structure for collections of resources, used in batch/transaction operations and search results
- **codesystem.md** -- FHIR R4 CodeSystem resource: structure, properties, content modes, and how code systems are represented as FHIR resources
- **conceptmap.md** -- FHIR R4 ConceptMap resource: mappings between concepts in different code systems, equivalence types, and translation support
- **operationoutcome.md** -- FHIR R4 OperationOutcome resource: error/warning/information messages returned from operations, issue severity and codes
- **parameters.md** -- FHIR R4 Parameters resource: input/output format for FHIR operations ($validate-code, $lookup, $expand, etc.)
- **valueset.md** -- FHIR R4 ValueSet resource: compose/expansion structure, include/exclude rules, and how value sets are represented as FHIR resources

## Operations (`operations/`)

- **terminology-service-overview.md** -- FHIR Terminology Service overview: capabilities, conformance requirements, and how terminology operations fit together
- **codesystem-lookup.md** -- CodeSystem $lookup operation: parameters, expected behavior, and response format for looking up code details
- **codesystem-subsumes.md** -- CodeSystem $subsumes operation: parameters and behavior for testing subsumption relationships between codes
- **codesystem-validate-code.md** -- CodeSystem $validate-code operation: parameters, expected behavior, and response format for validating codes against a code system
- **conceptmap-translate.md** -- ConceptMap $translate operation: parameters and behavior for translating codes between code systems
- **valueset-expand.md** -- ValueSet $expand operation: parameters, expected behavior, and response format for expanding value sets to their full code lists
- **valueset-validate-code.md** -- ValueSet $validate-code operation: parameters, expected behavior, and response format for validating codes against a value set

## Terminology Guidance (`terminology-guidance/`)

### General FHIR Terminology

- **using-codes.md** -- How terminologies work in FHIR: code/system pairs, data types (code, Coding, CodeableConcept), system URI selection, binding strengths (required/extensible/preferred/example), and code validation rules
- **known-code-systems.md** -- Registry of known code systems with their canonical URIs and OIDs, including SNOMED CT, LOINC, RxNorm, UCUM, NDC, ICD, CPT, CVX, and others
- **known-value-sets.md** -- Overview of value sets defined in FHIR R4: categories (administrative, clinical, medication, document), extensional vs intensional definitions, and expansion behavior
- **concept-properties.md** -- Standard concept properties (inactive, deprecated, notSelectable, parent, child) used across code systems in $lookup, $validate-code, and $expand

### Code System-Specific Guidance

- **snomed-in-fhir.md** -- SNOMED CT in FHIR: system URI (`http://snomed.info/sct`), version format with edition SCTIDs, concept properties, ECL filter support, implicit value sets (`?fhir_vs=isa/...`), designation handling, and post-coordinated expression support
- **loinc-in-fhir.md** -- LOINC in FHIR: system URI (`http://loinc.org`), case-insensitive codes, multi-axial hierarchy for subsumption, answer lists as value sets, COMPONENT/PROPERTY/SYSTEM/SCALE_TYP properties, and display from SHORTNAME or LONG_COMMON_NAME
- **rxnorm-in-fhir.md** -- RxNorm in FHIR: system URI (`http://www.nlm.nih.gov/research/umls/rxnorm`), CUI-based codes with SAB=RXNORM restriction, no subsumption support, STY/SAB/TTY filter properties, and term type conventions
- **ucum-in-fhir.md** -- UCUM in FHIR: system URI (`http://unitsofmeasure.org`), case-sensitive compositional grammar, no enumerable code list, code-as-display convention, and comparability via canonical filter
- **ndc-in-fhir.md** -- NDC in FHIR: system URI (`http://hl7.org/fhir/sid/ndc`), 10-digit hyphenated format with three valid patterns (4-4-2, 5-4-1, 5-3-2), daily FDA updates, and incomplete marketplace enumeration
- **bcp47-in-fhir.md** -- BCP-47 language tags in FHIR: system URI (`urn:ietf:bcp:47`), case-sensitive tags, CommonLanguages value set with preferred binding, and usage in Resource.language and designation language fields
