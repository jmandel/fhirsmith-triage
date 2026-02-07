# Agent Context: FHIRsmith tx.fhir.org Comparison Testing

## What This Is

FHIRsmith is a Node.js reimplementation of the tx.fhir.org FHIR terminology server (originally Java).
We compare responses from **prod** (tx.fhir.org Java) vs **dev** (FHIRsmith Node.js) to find bugs.

## Data Format

`comparison.ndjson` contains paired request/response records. Each line:
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
  "devBody": "JSON string of FHIR Parameters response",
  "requestBody": "JSON string of request body (when available)"
}
```

POST requests have `url` with trailing `?` (no query params).
GET requests (like $lookup) have params in the URL.

## FHIR Terminology Operations

### $validate-code
Checks if a code is valid in a CodeSystem or ValueSet. Response has:
- `result` (boolean) - **critical**: must match between prod/dev
- `system`, `code`, `display`, `version` - should match
- `message` - human-readable validation message
- `issues` - OperationOutcome with structured error details
- `diagnostics` - trace output (IGNORE - formats differ by design)

### $expand
Expands a ValueSet to list all codes. Response is a ValueSet with:
- `expansion.total` - count of matching codes
- `expansion.contains[]` - list of code/display pairs
- Large expansions may differ in ordering

### $lookup
Looks up a code's properties. Response has:
- `display` - preferred display text
- `property[]` - code properties (parent, child, etc.)

### ValueSet/CodeSystem reads
Direct resource reads. Compare full resource content.

### metadata
CapabilityStatement. Expect differences (different server implementations).

## Priority Classification

| Priority | What | Action |
|----------|------|--------|
| P0 | prod=200, dev=500 (crashes) | File bug immediately |
| P1 | Both 200, result boolean disagrees | Investigate - likely real bugs |
| P2 | prod=422, dev=500 (crash on bad input) | Dev should return 422 not crash |
| P3 | prod=200, dev=404 (missing resources) | Missing content in dev |
| P4 | Error code differs (422 vs 404) | Error handling differences |
| P5 | /r4/ root 200 vs 404 | Skipped (cosmetic) |
| P6 | Same status+result, content differs | Triage via iterative sampling |

## Known Cosmetic Differences (Always Ignore)

1. **Parameter ordering** - prod and dev return Parameters in different order
2. **Diagnostics parameter** - completely different trace formats (by design)
3. **JSON whitespace** - prod pretty-prints, dev uses compact JSON
4. **Content-Type** - `application/fhir+json` vs `application/json; charset=utf-8`
5. **metadata responses** - different CapabilityStatements expected

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

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of **tolerance objects** in `tolerances.js`. The comparison engine (`compare.js`) iterates this list for each record.

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

- `comparison.ndjson` - Raw paired responses
- `compare.js` - Comparison engine (pipeline + priority assignment)
- `tolerances.js` - Tolerance definitions (skip, normalize, metadata)
- `tolerances-v1/` - Archived full tolerance set from batch 1
- `results/summary.json` - Latest comparison stats
- `results/deltas/*.ndjson` - Categorized differences
- `results/<priority>-analyzed.txt` - One-line triage ledger per sampled record
- `results/<priority>-detailed-reports.md` - Full analysis reports per record
- `next-record.py` - Sequential record sampler for triage
- `triage-loop.sh` - Automated triage control loop
- `triage-prompt.md` - Canonical triage agent prompt
- `stream-filter.py` - Claude stream-json output filter
- `dump-bugs.sh`, `dump-bugs-html.py` - Bug report generators
