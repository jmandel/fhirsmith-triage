# Root Cause Investigation — Single Bug

You are investigating one bug to find the code-level root cause. Produce a concise write-up with direct GitHub source links showing where and why the two FHIR terminology servers diverge.

## Servers

- **Prod** (`tx.fhir.org`): Pascal FHIR reference implementation
  - Local source: `reference/tx-prod-fhirserver/`
  - GitHub: `https://github.com/HealthIntersections/fhirserver`
  - Pinned commit: `ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac`
- **Dev** (`tx-dev.fhir.org`): FHIRsmith, Node.js reimplementation
  - Local source: `reference/tx-dev-fhirsmith/`
  - GitHub: `https://github.com/HealthIntersections/FHIRsmith`
  - Pinned commit: `6440990b4d0f5ca87b48093bad6ac2868067a49e`

## Inputs

- **Bug ID**: provided when this prompt is invoked
- **Job directory**: provided when this prompt is invoked

## Step 1: Understand the bug

1. Read the bug: `git-bug bug show <BUG_ID>`
2. Extract the `Tolerance-ID` and `Record-ID` from the bug body header
3. Read the representative record's issue directory:
   - `<job-dir>/issues/<record-id>/record.json` — URL, method, statuses
   - `<job-dir>/issues/<record-id>/prod-raw.json` / `dev-raw.json` — actual responses
   - `<job-dir>/issues/<record-id>/analysis.md` — triage analysis
4. Read the tolerance in `<job-dir>/tolerances.js` to understand the match pattern
5. Understand exactly what differs: which fields, what values, what pattern

## Step 2: Find the relevant source code

### Search strategy

Start by searching for **distinctive strings from the bug** in both codebases. Error messages, field names, extension URLs, and FHIR operation names are usually grep-able in source.

```bash
# Example: search for an error message
grep -rn "could not be found" reference/tx-dev-fhirsmith/tx/
grep -rn "could not be found" reference/tx-prod-fhirserver/library/ftx/ reference/tx-prod-fhirserver/server/
```

Then read the surrounding function to understand the code path.

### Prod server (Pascal) entry points

| Operation | Start here |
|-----------|-----------|
| $validate-code | `server/tx_operations.pas` |
| $expand | `server/tx_operations.pas` |
| $lookup | `server/tx_operations.pas` |
| $subsumes, $translate | `server/tx_operations.pas` |
| Terminology service core | `library/ftx/ftx_service.pas` |
| CodeSystem handling | `library/ftx/fhir_codesystem_service.pas` |
| ValueSet handling | `library/ftx/fhir_valuesets.pas` (large) |
| SNOMED | `library/ftx/ftx_sct_services.pas` (large) |
| LOINC | `library/ftx/ftx_loinc_services.pas` |
| UCUM | `library/ftx/ftx_ucum_services.pas` |
| NDC, RxNorm, CPT, HGVS, etc. | `server/tx/tx_<name>.pas` |

### Dev server (Node.js) entry points

| Operation | Start here |
|-----------|-----------|
| All TX operations | `tx/tx.js` (main handler) |
| Library/source management | `tx/library.js` |
| Provider dispatch | `tx/provider.js` |
| Parameter parsing | `tx/operation-context.js`, `tx/params.js` |
| Code system providers | `tx/cs/cs-<name>.js` |
| FHIR resource builders | `tx/library/` (valueset.js, codesystem.js, operation-outcome.js, parameters.js) |

### Tips

- Files can be 100KB+. **Search with grep, don't read whole files.**
- Pascal conventions: `procedure`/`function`, `begin`/`end`, `TFhir*` class names.
- Dev dispatches via `provider.js` → `cs-<name>.js` providers.
- When you find a relevant function, read 30-50 lines around it to understand the logic.

## Step 3: Build GitHub permalinks

Construct links using the pinned commits:
```
https://github.com/HealthIntersections/fhirserver/blob/ec46dff3fe631ddeeaa000a3ca9530e0dd8c9eac/<path>#L<start>-L<end>
https://github.com/HealthIntersections/FHIRsmith/blob/6440990b4d0f5ca87b48093bad6ac2868067a49e/<path>#L<start>-L<end>
```

**Verify every link before including it.** Read the file at the exact line range from the local checkout. Confirm the code you're referencing is actually there. A wrong link is worse than no link.

## Step 4: Write findings

Edit the bug's first comment to add a `## Root Cause` section. Insert it after any existing `## Repro` section, or after the metadata header block if no repro exists.

**Keep it concise** — a few paragraphs, 2-5 GitHub links. A developer should be able to click the links, see the code, and understand what to change.

Format:

```markdown
## Root Cause

**Classification**: code-level defect | config/data issue | unclear

**Prod** <does what>:
[`<filename>#L<start>-L<end>`](<full GitHub URL>)
— <one sentence: what this code does>

**Dev** <does what instead>:
[`<filename>#L<start>-L<end>`](<full GitHub URL>)
— <one sentence: what this code does>

**Fix**: <one line — what needs to change in the dev server>
```

If you find multiple divergence points for the same bug, list each one.

If investigation reveals this is actually a config/data issue, write:
```markdown
## Root Cause

**Classification**: config/data issue

<one paragraph explanation>
```

### Editing the bug

```bash
git-bug bug show <BUG_ID>  # find comment ID, e.g. "a1b2c3d #0"
git-bug bug comment edit <COMMENT_ID> -m "<entire new body>" --non-interactive
```

The `-m` value **replaces the entire comment**. Preserve all existing content.

## Step 5: Label

```bash
git-bug bug label new <BUG_ID> "code-defect"      # code-level defect
git-bug bug label new <BUG_ID> "config-issue"      # config/data
git-bug bug label new <BUG_ID> "needs-investigation"  # unclear
```
