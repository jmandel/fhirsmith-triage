# Root Cause Investigation

Your job: given one or more bug IDs, investigate the underlying server source code to determine whether each bug is caused by a code-level defect or by configuration/data differences. Produce a short, high-quality write-up with direct GitHub source links showing where and why the two servers diverge.

## Context

The comparison dataset tests two FHIR terminology servers that should produce identical responses:

- **Prod** (`tx.fhir.org`): Pascal-based FHIR reference implementation by Health Intersections
  - Source: `reference/tx-prod-fhirserver/` (local checkout)
  - GitHub: `https://github.com/HealthIntersections/fhirserver`
  - Pinned commit: `ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac`
- **Dev** (`tx-dev.fhir.org`): FHIRsmith, a Node.js/Express reimplementation
  - Source: `reference/tx-dev-fhirsmith/` (local checkout)
  - GitHub: `https://github.com/HealthIntersections/FHIRsmith`
  - Pinned commit: `6440990b4d0f5ca87b48093bad6ac2868067a49e`

Many bugs reflect **configuration or data differences** (different SNOMED editions, missing ValueSets, version skew). These don't need code investigation. Focus your time on bugs where the dev server's **logic** diverges from prod's.

## Inputs

- **Bug ID(s)**: provided when this prompt is invoked
- **Job directory**: provided when this prompt is invoked

## Step 1: Understand the bug

1. Read the bug: `git-bug bug show <BUG_ID>`
2. Extract the `Tolerance-ID` and `Record-ID` from the bug body header
3. Read the issue directory for a representative record:
   - `<job-dir>/issues/<record-id>/record.json` — URL, method, statuses
   - `<job-dir>/issues/<record-id>/prod-raw.json` / `dev-raw.json` — actual responses
   - `<job-dir>/issues/<record-id>/analysis.md` — triage analysis
4. Read the tolerance in `<job-dir>/tolerances.js` to understand the match pattern

## Step 2: Triage code vs. config

Before reading source code, classify the bug:

**Likely code-level** (investigate):
- Structurally different response (missing/extra fields, different nesting)
- Different message formatting, error wording, or display text construction
- Different operation logic (subsumption, filtering, parameter handling)
- Different HTTP status code for the same logical condition
- Missing or extra FHIR extensions, properties, or designations

**Likely config/data** (skip with a note):
- Version skew in loaded terminology (SNOMED 20240201 vs 20250201)
- Missing CodeSystem or ValueSet definitions (404 for things prod has)
- Edition-dependent content differences (different display because different data)
- Transient/external service errors

For config/data bugs, write one line: `Config/data issue: <reason>`. Move on.

## Step 3: Trace through source code

### Building a GitHub permalink

When you find relevant code, construct a permalink using:
```
https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/<path>#L<line>
https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/<path>#L<line>
```

For line ranges use `#L<start>-L<end>`.

**Verify every link**: Before including a link in your output, confirm the file path and line number by reading that exact file and line from the local checkout. A wrong link is worse than no link.

### Prod server (Pascal): `reference/tx-prod-fhirserver/`

Entry points by operation:
- **$validate-code, $expand, $lookup, $subsumes, $translate**: `server/tx_operations.pas`
- **Terminology service core**: `library/ftx/ftx_service.pas`
- **CodeSystem handling**: `library/ftx/fhir_codesystem_service.pas`
- **ValueSet handling**: `library/ftx/fhir_valuesets.pas` (large — search, don't read whole)
- **Code system-specific**:
  - SNOMED: `library/ftx/ftx_sct_services.pas` (large)
  - LOINC: `library/ftx/ftx_loinc_services.pas`
  - UCUM: `library/ftx/ftx_ucum_services.pas`
  - Others: `server/tx/tx_<name>.pas`

### Dev server (Node.js): `reference/tx-dev-fhirsmith/`

Entry points by operation:
- **All TX operations**: `tx/tx.js` (main handler)
- **Library/source management**: `tx/library.js`
- **Provider coordination**: `tx/provider.js`
- **Parameter parsing**: `tx/operation-context.js`, `tx/params.js`
- **Code system providers**: `tx/cs/cs-<name>.js`
- **FHIR resource builders**: `tx/library/` (valueset.js, codesystem.js, operation-outcome.js, parameters.js)

### Investigation approach

1. **Identify the operation** from the bug's record URL ($validate-code, $expand, $lookup, etc.)
2. **Search for distinctive strings** from the bug (error messages, field names, extension URLs) in both codebases — this is usually the fastest way to find the relevant code
3. **Read the specific functions** that handle the divergent behavior, in both servers
4. **Pinpoint the divergence** — the specific lines where the two implementations make different choices
5. **Note the line numbers** for your GitHub links

**Tips**:
- Files can be 100KB+. Search with grep, don't read whole files.
- Pascal: `procedure`/`function`, `begin`/`end`, `TFhir*` class names.
- Dev server dispatches via `provider.js` to `cs-<name>.js` providers.
- Error messages in the bug report are often grep-able in source code.

## Step 4: Write findings

Edit the bug's first comment to add a `## Root Cause` section after any existing `## Repro` section (or after the metadata header if no repro). Preserve all existing content.

The write-up should be **concise** — a few paragraphs with 2-5 GitHub links. The goal is that a developer reading this can click the links, see the relevant code, and understand what to change.

Format:

```markdown
## Root Cause

**Classification**: code-level defect

**Prod** does X:
[`fhir_valuesets.pas#L420-L435`](https://github.com/HealthIntersections/fhirserver/blob/ec46dff.../<path>#L420-L435)
— brief explanation of what this code does

**Dev** does Y instead:
[`tx.js#L180-L195`](https://github.com/HealthIntersections/FHIRsmith/blob/6440990.../<path>#L180-L195)
— brief explanation of what this code does

**Fix**: <one-line description of what needs to change>
```

Keep it tight. No lengthy analysis — just show the code that matters and explain the difference.

To edit the bug:
```bash
git-bug bug show <BUG_ID>  # note the comment ID, e.g. "a1b2c3d #0"
git-bug bug comment edit <COMMENT_ID> -m "<entire new body>" --non-interactive
```

## Step 5: Label the result

```bash
# Code-level defect found:
git-bug bug label new <BUG_ID> "code-defect"

# Config/data issue:
git-bug bug label new <BUG_ID> "config-issue"

# Unclear after investigation:
git-bug bug label new <BUG_ID> "needs-investigation"
```
