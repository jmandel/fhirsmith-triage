# Agent Context: FHIRsmith tx.fhir.org Comparison Testing

## What This Is

FHIRsmith is a Node.js reimplementation of the tx.fhir.org FHIR terminology server (originally Java).
We compare responses from **prod** (tx.fhir.org Java) vs **dev** (FHIRsmith Node.js) to find bugs.

## Data Format

Both `comparison.ndjson` (input) and `results/deltas/deltas.ndjson` (output) use the same record schema:

```json
{
  "id": "UUID (stable across reruns)",
  "method": "POST",
  "url": "/r4/Operation/$name?params",
  "prod": {"status": 200, "contentType": "application/fhir+json", "size": 1894, "hash": "..."},
  "dev": {"status": 200, "contentType": "application/json; charset=utf-8", "size": 1181, "hash": "..."},
  "prodBody": "JSON string of FHIR response",
  "devBody": "JSON string of FHIR response",
  "requestBody": "JSON string of request body (when available)",
  "comparison": {"priority": "P6", "reason": "content-differs", "op": "validate-code"}
}
```

**HTTP status codes** are at `record.prod.status` and `record.dev.status` (nested inside the `prod`/`dev` objects). This is the same schema that tolerance `match()` and `normalize()` functions receive in `ctx.record`.

The `comparison` field is added by the comparison engine — it's absent in `comparison.ndjson` but present in `deltas.ndjson`. The `comparison.ndjson` input also has `ts`, `match` fields not carried to deltas.

POST requests have `url` with trailing `?` (no query params).
GET requests (like $lookup) have params in the URL.

The comparison engine writes all non-OK/non-SKIP records to `results/deltas/deltas.ndjson`. Filtering by priority is done at read time, not write time.

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

## What Counts as a Real Difference

This is a **terminology server**. Any difference in terminology-related content is meaningful. This includes:
- **Version/edition differences**: Which SNOMED/LOINC/etc edition is loaded
- **Code validity**: Whether a code is found, not found, active, inactive
- **Display text**: The human-readable name for a code
- **Properties**: Code properties, designations, parent/child relationships
- **Expansion contents**: Which codes appear in a ValueSet expansion
- **Validation messages**: Error text, warnings, informational messages

**FHIR conformance matters too.** FHIR requires that strings, if present, are non-empty, and arrays, if present, are non-empty. So `id: ""` vs absent is NOT cosmetic — the empty string is invalid FHIR and represents a real bug. Similarly, `entry: []` (empty array present) is invalid FHIR.

Things that are safe to normalize away are differences with no impact on terminology results AND no conformance violations:
- JSON key ordering within the same object
- `null` vs absent for optional fields that carry no information (e.g. `location: [null]` vs absent) — note: this is different from empty string `""` which is invalid
- Server-generated transient metadata (UUIDs, timestamps, pagination links) unrelated to terminology content
- Server software version identifiers, implementation-specific metadata

When in doubt, treat a difference as potentially meaningful.

## Priority Classification

The comparison engine assigns each record a priority based on status codes and content:

| Priority | Condition | What it means | Typical action |
|----------|-----------|---------------|----------------|
| P0 | prod=200, dev=500 | Dev crashes on a valid request | File bug — find the crash, add null guard / fix method |
| P1 | Both 200, `result` boolean disagrees | Core terminology operation gives wrong answer | Investigate — likely logic bug, wrong edition, missing data |
| P2 | prod=4xx, dev=500 | Dev crashes on bad input (should return error gracefully) | File bug — error handling path crashes |
| P3 | prod=200, dev=404 | Resource exists in prod but missing from dev | Data/config gap — load missing resource |
| P4 | Status codes differ (not P0/P2/P3) | Both know it's an error, disagree on HTTP code | Fix status code selection logic |
| P6 | Same status, same result, content differs | Catch-all after normalization | Could be cosmetic, version skew, or subtle bug — needs triage |

P0-P4 are usually straightforward: group records by error pattern, file bugs. P6 is the hard bucket — a mix of noise, real bugs, and ambiguous differences that requires iterative tolerance development.

For **P0-P4**, the primary goal is grouping records by error pattern and filing bugs. Normalizations are less common since the differences are usually clear bugs (crashes, missing resources, wrong status codes).

For **P6**, focus on whether each difference is cosmetic or substantive, and develop tolerances to clear recognizable patterns.

## Known Cosmetic Differences (Always Ignore)

These are handled by permanent `equiv-autofix` tolerances:

1. **Parameter ordering** - prod and dev return Parameters in different order
2. **Diagnostics parameter** - completely different trace formats (by design)
3. **JSON whitespace/key order** - prod pretty-prints, dev uses compact JSON
4. **Content-Type** - `application/fhir+json` vs `application/json; charset=utf-8`
5. **metadata responses** - different CapabilityStatements expected
6. **Expansion metadata** - timestamps, identifiers, includeDefinition defaults
7. **OperationOutcome extensions** - server-generated message IDs, extension ordering
8. **Empty searchset Bundles** - server-generated id, meta, link fields

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
- The comparison record ID so a reader can `grep -n '<ID>' <job-dir>/comparison.ndjson`
- The operation and URL
- What prod returned vs what dev returned
- Why this is a real bug (not cosmetic)

## Tolerance Pipeline

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of **tolerance objects** in the job's `tolerances.js`. The comparison engine (`engine/compare.js`) iterates this list for each record.

### Tolerance kinds

- **`equiv-autofix`**: Non-substantive difference. The two responses are semantically equivalent; the tolerance corrects for cosmetic/structural noise (JSON key order, server UUIDs, parameter ordering). Permanent — survives across data batches.
- **`temp-tolerance`**: A real, meaningful difference being suppressed for triage efficiency. Each has a `bugId` linking to a git-bug issue. NOT equivalent — these are known patterns we stop re-triaging until the bug is fixed. Cleared between batches.

### How tolerances work

Each tolerance has a `match(ctx)` function that returns one of:
- `'skip'` — drop the entire record from comparison
- `'normalize'` — apply the tolerance's `normalize(ctx)` function to transform the parsed response bodies
- `null` — this tolerance doesn't apply to this record

The `ctx` object passed to both functions:
```js
{
  record: {                   // full NDJSON record (see Data Format above)
    url, method,              // request info
    prod: { status, ... },    // prod response metadata — status is record.prod.status
    dev:  { status, ... },    // dev response metadata — status is record.dev.status
    prodBody, devBody,        // raw response body strings
    requestBody,              // raw request body (when available)
    comparison: { priority, reason, op },  // only in deltas, not in comparison.ndjson
  },
  prod: object | null,        // parsed prodBody (JSON object)
  dev:  object | null,        // parsed devBody (JSON object)
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
  tags: ['normalize', 'display-text'],  // optional descriptive metadata
  match({ record, prod, dev }) {
    // return 'skip', 'normalize', or null
  },
  normalize({ prod, dev, record }) {    // only needed if match can return 'normalize'
    // return { prod, dev } with transformed bodies
  },
}
```

Tolerances are applied sequentially — ordering matters. General guidelines:
- Place skip tolerances first (they short-circuit the pipeline)
- Place normalizations after skips, ordered so earlier transforms don't interfere with later ones
- Scope tolerances as narrowly as possible — match only the request/response patterns you've actually observed

Tolerances support an optional `tags` array for descriptive metadata. Tags are freeform strings that describe what the tolerance does — they have no effect on execution. Examples: `['skip', 'non-fhir']`, `['normalize', 'message-format']`, `['sort']`, `['version-skew', 'v2-tables']`.

### Tolerance development loop

When developing a new tolerance (whether `equiv-autofix` or `temp-tolerance`):

1. Add the tolerance object to the job's `tolerances.js`
2. Archive the current delta file: `cp <job-dir>/results/deltas/deltas.ndjson <job-dir>/results/deltas/deltas.$(date +%Y%m%d-%H%M%S).ndjson`
3. Rerun comparison: `node engine/compare.js --job <job-dir>`
4. Compare old and new delta file line counts
5. **Validate**: randomly sample at least 10 eliminated records and verify each is legitimate — the differences match the pattern you're targeting and nothing else is being hidden
6. If any sampled elimination is inappropriate, restore the archive, revert, rework, and repeat

For `temp-tolerance`: file a `git-bug` first, then be extra judicious in validation since a too-broad heuristic could mask unrelated bugs.

## Record Identity

Issue directories are keyed by the record's `id` field (a UUID assigned during data collection), not by position in the delta file. This UUID is stable across comparison reruns — when tolerances change and the comparison is rerun, previously analyzed records are still recognized because their UUID hasn't changed. Issue directories live at `issues/<record-uuid>/`.

## File Locations

### Stable tools (`engine/`)
- `engine/compare.js` - Comparison engine (pipeline + priority assignment)
- `engine/next-record.js` - Sequential record picker, creates issue directories
- `engine/stream-filter.py` - Claude stream-json output filter
- `engine/dump-bugs.sh`, `engine/dump-bugs-html.py` - Bug report generators

### Prompts and orchestration (`prompts/`)
- `prompts/triage-prompt.md` - Triage agent prompt
- `prompts/triage-loop.sh` - Automated triage control loop
- `prompts/start-triage.sh` - Initialize a new triage round (reset to baseline)

### Reset checkpoint (`baseline/`)
- `baseline/tolerances.js` - Minimal starter tolerances (skips + diagnostics only). Use `start-triage.sh` to create a new job from this baseline.

### Reference materials (`reference/`)
- `reference/INDEX.md` - Directory of all reference files
- `reference/operations/` - FHIR operation specs and OperationDefinition JSON
- `reference/resources/` - FHIR resource definitions
- `reference/terminology-guidance/` - Code system usage guides (SNOMED, LOINC, etc.)

### Historical (`archive/`)
- `archive/tolerances-v1/` - Archived tolerance set from batch 1
- `archive/TRIAGE-METHODS.md` - Methodology writeup

### Per-job mutable state (`jobs/<job-name>/`)
Each triage round lives in its own job directory, created by `prompts/start-triage.sh`:
- `comparison.ndjson` - Raw paired responses (input data for this job)
- `tolerances.js` - Working tolerances (copied from baseline, built up during triage)
- `progress.ndjson` - Append-only log, one line per record pick: `{pickedAt, recordId, total, analyzed, remaining, priority}`
- `results/summary.json` - Comparison stats
- `results/deltas/deltas.ndjson` - All non-OK/non-SKIP records with priority in comparison metadata
- `issues/<record-uuid>/` - Per-record triage workspace:
  - `record.json` - Full delta record (pretty-printed)
  - `prod-raw.json` / `dev-raw.json` - Parsed response bodies
  - `prod-normalized.json` / `dev-normalized.json` - After tolerance pipeline
  - `applied-tolerances.txt` - Which tolerances were applied
  - `analysis.md` - Agent's analysis (existence = "analyzed")
- `triage-logs/` - Per-round log files from the triage loop
- `triage-errors.log` - Error/status log

## Every Record Gets a Tolerance

A tolerance is a record of judgment: "I looked at this and decided X." Every triaged record must result in a tolerance entry in `tolerances.js`, regardless of category. Without a tolerance, the record will surface again in the next triage pass.

- **equiv-autofix**: Normalize tolerance that canonicalizes the difference away
- **temp-tolerance**: Real difference linked to a git-bug, suppressed until the bug is fixed
- **real-diff / equiv-manual / ambiguous**: Write a temp-tolerance scoped to the specific record or pattern to prevent re-triaging

## Canonical Normalization

Prefer canonical normalization over stripping. When two values differ, normalize both sides to a canonical value (e.g., the longer display string, or prod's value) rather than removing the field entirely. This preserves the field for comparison of other dimensions. Only strip when both values are irrelevant (like diagnostics trace).
