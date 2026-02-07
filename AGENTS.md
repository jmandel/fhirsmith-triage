# Agent Context: FHIRsmith tx.fhir.org Comparison Testing

## What This Is

FHIRsmith is a Node.js reimplementation of the tx.fhir.org FHIR terminology server (originally Java).
We compare responses from **prod** (tx.fhir.org Java) vs **dev** (FHIRsmith Node.js) to find bugs.

## Data Format

`comparison.ndjson` contains 7,245 records. Each line:
```json
{
  "ts": "ISO timestamp",
  "id": "UUID",
  "method": "POST",
  "url": "/r4/Operation/$name?params",
  "match": false,
  "prod": {"status": 200, "contentType": "application/fhir+json", "size": 1894, "hash": "..."},
  "dev": {"status": 200, "contentType": "application/json; charset=utf-8", "size": 1181, "hash": "..."},
  "prodBody": "JSON string of FHIR Parameters response",
  "devBody": "JSON string of FHIR Parameters response"
}
```

No request bodies are stored. POST requests have `url` with trailing `?` (no query params).
GET requests (like $lookup) have params in the URL.

## FHIR Terminology Operations

### $validate-code (3,761 records)
Checks if a code is valid in a CodeSystem or ValueSet. Response has:
- `result` (boolean) - **critical**: must match between prod/dev
- `system`, `code`, `display`, `version` - should match
- `message` - human-readable validation message
- `issues` - OperationOutcome with structured error details
- `diagnostics` - trace output (IGNORE - formats differ by design)

### $expand (1,292 records)
Expands a ValueSet to list all codes. Response is a ValueSet with:
- `expansion.total` - count of matching codes
- `expansion.contains[]` - list of code/display pairs
- Large expansions may differ in ordering

### $lookup (157 records)
Looks up a code's properties. Response has:
- `display` - preferred display text
- `property[]` - code properties (parent, child, etc.)

### ValueSet/CodeSystem reads (789 records)
Direct resource reads. Compare full resource content.

### metadata (780 records)
CapabilityStatement. Expect differences (different server implementations).

## Priority Classification

| Priority | What | Count | Action |
|----------|------|-------|--------|
| P0 | prod=200, dev=500 (crashes) | 16 | File bug immediately |
| P1 | Both 200, result boolean disagrees | 246 | Investigate - likely real bugs |
| P2 | prod=422, dev=500 (crash on bad input) | 186 | Dev should return 422 not crash |
| P3 | prod=200, dev=404 (missing resources) | 8 | Missing content in dev |
| P4 | Error code differs (422 vs 404) | 308 | Error handling differences |
| P5 | /r4/ root 200 vs 404 | 359 | Skipped (cosmetic) |
| P6 | Same status+result, content differs | 516 | Triage in progress (down from 3,647) |

## Known Cosmetic Differences (Always Ignore)

1. **Parameter ordering** - prod and dev return Parameters in different order
2. **Diagnostics parameter** - completely different trace formats (by design)
3. **JSON whitespace** - prod pretty-prints, dev uses compact JSON
4. **Content-Type** - `application/fhir+json` vs `application/json; charset=utf-8`
5. **metadata responses** - different CapabilityStatements expected

## Confirmed Bug Patterns (from Round 1 triage)

### P0 Crashes (17 records, 3 distinct bugs)
- **`exp.addParamUri is not a function`** (15 records) - Expansion builder missing method, affects all `$expand` operations
- **`vs.expansion.parameter is not iterable`** (1 record) - Missing null guard on expansion.parameter iteration
- **`No Match for undefined|undefined`** (1 record) - validate-code crash when input params are missing

### P1 Result Disagreements (246 records, 6 bug groups)
- **HCPCS** (110): Dev says true (has system), prod says false (doesn't recognize system) - dev has HCPCS loaded but prod doesn't
- **LOINC** (56): Dev fails property-based ValueSet filters. Include/exclude filters show as `()` instead of `(http://loinc.org)(STATUS=ACTIVE,CLASSTYPE=1)`. Also `undefined` leaks into validate trace
- **CPT** (45): Dev can't find codes despite system being loaded
- **SNOMED** (24): Missing US Edition versions, wrong edition matching
- **RxNorm** (9): Code system appears not loaded in dev
- **BCP47** (2): Case sensitivity difference (`en-us` vs `en-US`)

### P2 Crash on Error (186 records, 3 patterns)
- **`contentMode()` function leak** (178): Error message includes JS method body instead of property value. Fix: use `.content` not `.contentMode()`
- **`exp.addParamUri is not a function`** (4): Same as P0 but on error path
- **`TerminologyError is not a constructor`** (4): Missing class or wrong import

### P3 Missing Resources (10 records, 4 resources)
- CodeSystem/SOP, CodeSystem/nucc-provider-taxonomy
- ValueSet LOINCAnswerList LL379-9, ValueSet dicom-cid-29-AcquisitionModality

### P4 Error Code Differences (350 records)
- 296: `$expand` returns 404 instead of 422 for unknown CodeSystem (same error message, wrong status)
- 50: `$expand` returns 200 instead of 422 for too-large/grammar-based expansions
- 4: `$validate-code` returns 400 instead of 422

### P6 Content Differences (516 remaining, down from 3,647)
Automated triage reduced P6 by ~86% through tolerances and normalizations. Remaining records need manual triage via `scripts/tx-compare/p6-loop.sh`.

See `scripts/tx-compare/results/p6-analyzed.txt` for the triage ledger and `scripts/tx-compare/results/p6-detailed-reports.md` for full analysis of each sampled record.

## Bug Tracking with git-bug

Use `git-bug` to file bugs. A "Claude (AI Assistant)" user is configured.

```bash
# File a new bug
git-bug bug new -t "Title here" -m "Description here" --non-interactive

# Add a label
git-bug bug label new <BUG_ID> "tx-compare"

# List bugs
git-bug bug

# Show a specific bug
git-bug bug show <BUG_ID>
```

Always add the `tx-compare` label. Use priority labels like `P0`, `P1`, etc.
Include in the bug description:
- The comparison record ID (from comparison.ndjson)
- The operation and URL
- What prod returned vs what dev returned
- Why this is a real bug (not cosmetic)

## Tolerance Pipeline

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of **tolerance objects** in `scripts/tx-compare/tolerances.js`. The comparison engine (`compare.js`) iterates this list for each record.

### Tolerance kinds

- **`equiv-autofix`**: Non-substantive difference. The two responses are semantically equivalent; the tolerance corrects for cosmetic/structural noise (JSON key order, server UUIDs, parameter ordering). Permanent.
- **`temp-tolerance`**: A real, meaningful difference being suppressed for triage efficiency. Each has a `bugId` linking to a git-bug issue. NOT equivalent — these are known patterns we stop re-triaging until the bug is fixed.

### How tolerances work

Each tolerance has a `match(ctx)` function that returns one of:
- `'skip'` — drop the entire record from comparison
- `'normalize'` — apply the tolerance's `normalize(ctx)` function to transform the parsed response bodies
- `null` — this tolerance doesn't apply to this record

The `ctx` object passed to both functions:
```js
{
  record: {                // full NDJSON log line
    url, method,           // request info
    prod: { status, ... }, // prod response metadata
    dev:  { status, ... }, // dev response metadata
    prodBody, devBody,     // raw response body strings
    requestBody,           // raw request body (when available)
  },
  prod: object | null,     // parsed prodBody
  dev:  object | null,     // parsed devBody
}
```

### Adding a new tolerance

Add an object to the `tolerances` array in `tolerances.js`:
```js
{
  id: 'my-tolerance-id',
  description: 'What this tolerance does and why',
  kind: 'equiv-autofix',               // or 'temp-tolerance'
  bugId: 'abc1234',                     // only for temp-tolerance
  match({ record, prod, dev }) {
    // return 'skip', 'normalize', or null
  },
  normalize({ prod, dev, record }) {    // only needed if match can return 'normalize'
    // return { prod, dev } with transformed bodies
  },
}
```

Ordering matters: tolerances are applied sequentially. Place skip tolerances first, structural cleanup next, content-specific transforms after, and sorting last.

## File Locations

- `comparison.ndjson` - Raw paired responses (225MB)
- `scripts/tx-compare/compare.js` - Comparison engine (pipeline + priority assignment)
- `scripts/tx-compare/tolerances.js` - Tolerance definitions (skip, normalize, metadata)
- `scripts/tx-compare/results/summary.json` - Latest comparison stats
- `scripts/tx-compare/results/deltas/*.ndjson` - Categorized differences
- `scripts/tx-compare/results/p6-analyzed.txt` - One-line triage ledger per sampled record
- `scripts/tx-compare/results/p6-detailed-reports.md` - Full analysis reports per record
- `scripts/tx-compare/results/bugs.html` - Self-contained HTML bug report (generated by `dump-bugs-html.py`)
- `scripts/tx-compare/sample-p6.py` - Random P6 record sampler for triage
- `scripts/tx-compare/p6-loop.sh` - Automated triage control loop
- `scripts/tx-compare/P6-triage.md` - Canonical triage agent prompt
