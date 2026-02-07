# TX-Compare Triage Methods

A detailed methodology for triaging differences between a production FHIR terminology server (tx.fhir.org) and a development implementation (FHIRsmith), using LLM-powered agents for systematic analysis, bug filing, and iterative tolerance development.

## Table of Contents

1. [Overview](#overview)
2. [Comparison Infrastructure](#comparison-infrastructure)
3. [Phase 1: Initial Parallel Triage](#phase-1-initial-parallel-triage)
4. [Phase 2: Coverage Validation](#phase-2-coverage-validation)
5. [Phase 3: Iterative P6 Sampling](#phase-3-iterative-p6-sampling)
6. [Appendix: Subagent Prompts](#appendix-subagent-prompts)

---

## Overview

### The Problem

We have 7,245 paired HTTP request/response records comparing a production FHIR terminology server against a development implementation. The comparison engine categorizes differences by priority, but the raw output needs human-level judgment to:

- Identify distinct bug patterns within each priority level
- File actionable bug reports
- Distinguish real bugs from cosmetic/equivalent differences
- Develop new comparison heuristics to reduce noise

### The Approach

We use a multi-phase, agent-driven triage process:

1. **Parallel priority triage**: Launch independent agents for each priority level (P0-P4) to analyze patterns and file bugs
2. **Coverage validation**: Launch audit agents to verify every record is accounted for by a filed bug
3. **Iterative P6 sampling**: For the large P6 bucket (3,647 records), use a sample-analyze-improve loop that develops new comparison heuristics

### Key Design Decisions

- **Parallel agents for independent work**: Priority levels are independent, so agents analyze them concurrently
- **Coverage audits as a quality gate**: A separate agent verifies that filed bugs account for 100% of records -- no orphans
- **MD5 hashing for stable record identity**: Since comparison reruns change record IDs, we hash the raw NDJSON line to create a stable identifier that survives reruns
- **Iterative tolerance development with validation**: New heuristics are validated by sampling eliminated records to catch false positives

---

## Comparison Infrastructure

### Stage 1: Data Collection

The input file `comparison.ndjson` (7,245 records, ~225MB) is produced by a reverse proxy that sits between clients and both the production and development servers. For each incoming request, the proxy:

1. Forwards the request to both prod (tx.fhir.org, Java) and dev (FHIRsmith, Node.js)
2. Captures both responses (status, headers, body)
3. Writes a paired record to `comparison.ndjson`

Each line in the file is a JSON object:

```json
{
  "ts": "ISO timestamp",
  "id": "UUID",
  "method": "POST",
  "url": "/r4/ValueSet/$expand?params",
  "match": false,
  "prod": {"status": 200, "contentType": "application/fhir+json", "size": 1894, "hash": "..."},
  "dev": {"status": 200, "contentType": "application/json; charset=utf-8", "size": 1181, "hash": "..."},
  "prodBody": "JSON string of FHIR response",
  "devBody": "JSON string of FHIR response"
}
```

Note: No request bodies are stored. POST requests have `url` with trailing `?` (no query params). GET requests have params in the URL.

The requests cover the core FHIR terminology operations:

| Operation | Records | Description |
|-----------|---------|-------------|
| `$validate-code` | 3,761 | Check if a code is valid in a CodeSystem/ValueSet |
| `$expand` | 1,292 | Expand a ValueSet to list all codes |
| `read` | 867 | Direct CodeSystem/ValueSet resource reads |
| `metadata` | 780 | CapabilityStatement (server description) |
| `$lookup` | 157 | Look up a code's properties |
| `$batch-validate-code` | 14 | Batch validation |

### Stage 2: Comparison Engine (compare.js)

The comparison engine reads `comparison.ndjson`, applies normalization and tolerance rules, categorizes each record by priority, and writes results to delta files.

```
comparison.ndjson (7,245 records)
         │
         ▼
┌─────────────────────┐
│  shouldSkip()       │──► skipped (1,143 records)
│  tolerance rules    │    metadata, root page, static assets
└─────────────────────┘
         │ not skipped
         ▼
┌─────────────────────┐
│  compareRecord()    │
│  1. Check status    │──► P0/P2/P3/P4 (status mismatches)
│  2. Parse bodies    │
│  3. Normalize       │
│  4. Check result    │──► P1 (boolean disagrees)
│  5. Deep compare    │──► OK (match) or P6 (content differs)
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  Output writers     │
│  results/           │
│    summary.json     │
│    deltas/          │
│      p0.ndjson      │  (17 records)
│      p1.ndjson      │  (246 records)
│      p2.ndjson      │  (186 records)
│      p3.ndjson      │  (10 records)
│      p4.ndjson      │  (350 records)
│      p6.ndjson      │  (3,156 records after heuristics)
└─────────────────────┘
```

#### Priority Assignment Logic

The `compareRecord()` function first runs the tolerance pipeline, then assigns priorities:

```
parse prod/dev bodies
for each tolerance (in order):
    action = tolerance.match(ctx)
    if 'skip'      → skip record entirely
    if 'normalize' → apply tolerance.normalize(ctx) to transform bodies

if prodStatus !== devStatus:
    if devStatus === 500:
        if prodStatus === 200  → P0 (dev crashes on valid request)
        else                   → P2 (dev crashes on bad input)
    if prodStatus === 200 && devStatus === 404 → P3 (missing resource)
    else                       → P4 (status mismatch)

if same status:
    if result boolean disagrees → P1 (validation logic bug)
    if deepEqual after normalization → OK
    else → P6 (content differs)
```

#### Tolerance Pipeline (tolerances.js)

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of tolerance objects in `scripts/tx-compare/tolerances.js`.

Each tolerance is a self-contained object:

```js
{
  id: 'strip-ucum-display',
  description: 'UCUM display text differs (code symbol vs print name). 220 P6 records.',
  kind: 'temp-tolerance',        // or 'equiv-autofix'
  bugId: '94d94ac',              // only for temp-tolerance
  match({ record, prod, dev }) { // → 'skip' | 'normalize' | null
    // ...
  },
  normalize({ prod, dev }) {     // → { prod, dev }
    // ...
  },
}
```

**Tolerance kinds:**

- **`equiv-autofix`**: Non-substantive difference. The two responses are semantically equivalent; the tolerance corrects for cosmetic/structural noise. Permanent.
- **`temp-tolerance`**: A real, meaningful difference being suppressed for triage efficiency. Each has a `bugId` linking to a git-bug issue. NOT equivalent — these are known bug patterns we stop re-triaging until fixed.

**Context object (`ctx`)** passed to `match()` and `normalize()`:

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

**Tolerance ordering** (applied sequentially; ordering matters):

| Phase | Purpose | Examples |
|-------|---------|---------|
| A: Skip | Drop entire records | URL patterns, XML responses, truncated bodies |
| B: Structural | Clean up structure before content transforms | Issue location/expression cleanup, extension sorting |
| C: Content | Strip or transform specific fields | Strip diagnostics/version/message params, normalize issue text, strip display text |
| D: Sort | Stable ordering after all transforms | Sort parameters by name, issues by severity, expansion contains by system\|code |
| E: Bundle | Bundle-level normalization | Strip metadata from empty searchset Bundles |

New tolerances are added through the [P6 iterative sampling process](#phase-3-iterative-p6-sampling). Each tolerance includes comments documenting the specific test case that motivated it.

#### Running the Comparison

```bash
node scripts/tx-compare/compare.js --input comparison.ndjson --out scripts/tx-compare/results
```

This takes ~30 seconds to process all 7,245 records and writes `summary.json` plus per-priority delta files to the output directory.

#### Delta File Format

Each delta file (`p0.ndjson`, `p1.ndjson`, etc.) contains one JSON object per line with the comparison result attached:

```json
{
  "id": "7598431b-1c90-409c-b8f2-2be8358e8be3",
  "url": "/r4/ValueSet/$expand",
  "method": "POST",
  "prodStatus": 200,
  "devStatus": 500,
  "comparison": {
    "priority": "P0",
    "reason": "dev-crash-on-valid",
    "op": "expand"
  },
  "prodBody": "{...escaped JSON of prod response...}",
  "devBody": "{...escaped JSON of dev response...}"
}
```

The `comparison` object varies by priority:
- **P0/P2**: `{ priority, reason, op }`
- **P1**: `{ priority, reason, op, prodResult, devResult, system, code }`
- **P3**: `{ priority, reason, op }`
- **P4**: `{ priority, reason, op, prodStatus, devStatus }`
- **P6**: `{ priority, reason, op, diffs }` where `diffs` lists parameter-level differences

These delta files are what the triage agents consume. The `prodBody` and `devBody` fields contain the raw response bodies for deep inspection.

---

## Phase 1: Initial Parallel Triage

### Strategy

Each priority level is independent, so we launch parallel agents to analyze them concurrently. Each agent:

1. Reads its priority's NDJSON delta file
2. Groups records by error pattern / root cause
3. Files git-bug reports for each distinct pattern
4. Labels bugs with `tx-compare` and the priority level

### Agent Architecture

```
Main orchestrator
  ├── P0 agent  ──► p0.ndjson (17 records)  ──► 3 bugs filed
  ├── P1 agent  ──► p1.ndjson (246 records) ──► 8 bugs filed
  └── P2-P4 agent ──► p2/p3/p4.ndjson (546 records) ──► 7 bugs filed
```

P2-P4 were combined into a single agent since P3 was small (10 records) and P2/P4 shared some error patterns.

### Results Summary

#### P0: Dev Crashes on Valid Requests (17 records, 3 bugs)

| Bug | Records | Error |
|-----|---------|-------|
| `exp.addParamUri is not a function` | 15 | Expansion builder missing method |
| `vs.expansion.parameter is not iterable` | 1 | Null guard missing on parameter iteration |
| `No Match for undefined\|undefined` | 1 | Missing code/system extracted as JS `undefined` |

#### P1: Result Boolean Disagrees (246 records, 8 bugs)

| Bug | Records | Pattern |
|-----|---------|---------|
| HCPCS codes: prod=false, dev=true | 110 | HCPCS loaded on dev but not prod |
| ValueSet property filters ignored | 54 | LOINC/SNOMED filters show as `()` in dev |
| CPT codes not found in dev | 45 | CPT loaded but codes inaccessible |
| Missing code → literal `"undefined"` | 14 | JS undefined coercion |
| Missing SNOMED US Edition versions | 11 | 3 specific versions missing |
| RxNorm not loaded in dev | 9 | No versions available |
| BCP47 `en-us` case sensitivity | 2 | Dev accepts lowercase, prod rejects |
| Display name mismatch severity | 1 | Error vs warning for wrong display |

#### P2: Dev Crashes on Bad Input (186 records, 3 bugs)

| Bug | Records | Error |
|-----|---------|-------|
| `contentMode()` function body leaked | 178 | Method called without `()` |
| `exp.addParamUri is not a function` | 4 | Same as P0 but in error paths |
| `TerminologyError is not a constructor` | 4 | Missing import/export |

#### P3: Missing Resources (10 records, 1 bug)

4 resources missing from dev: DICOM AcquisitionModality ValueSet, NUCC provider taxonomy, LOINC answer list LL379-9, CodeSystem SOP.

#### P4: Wrong Error Codes (350 records, 3 bugs)

| Bug | Records | Pattern |
|-----|---------|---------|
| 404 instead of 422 for unknown CodeSystem | 296 | Same error message, wrong status |
| 200 instead of 422 for too-large expansions | 50 | Missing size/grammar guards |
| 400 instead of 422 for unknown ValueSet | 4 | Minor status code difference |

### Subagent Prompts

See [Appendix: Subagent Prompts](#p0-triage-agent) for the full prompts used.

---

## Phase 2: Coverage Validation

### Strategy

After filing bugs, we launch separate audit agents to verify that every record in each delta file is accounted for by exactly one filed bug. This catches:

- Patterns the triage agent missed
- Records that don't fit any filed bug
- Incorrect record counts in bug descriptions

### Agent Architecture

```
Main orchestrator
  ├── P1 coverage audit  ──► verify 246 records against 8 bugs
  └── P2-P4 coverage audit ──► verify 546 records against 7 bugs
```

### Audit Process

Each audit agent:

1. Lists all git-bug issues for the relevant priority labels
2. Reads each bug's description to understand its pattern
3. Parses every record in the delta file
4. Classifies each record into a bug using the pattern descriptions
5. Reports: records per bug, expected vs actual counts, any orphaned records

### Results

Both audits returned **100% coverage** with exact count matches:

- P1: 246/246 records covered by 8 bugs, 0 orphaned
- P2-P4: 546/546 records covered by 7 bugs, 0 orphaned

---

## Phase 3: Iterative P6 Sampling

### The Challenge

P6 contains 3,647 records -- too many for a single agent to analyze exhaustively. Many are likely cosmetic differences that could be eliminated by better comparison heuristics. We need a process that:

- Samples records one at a time for deep inspection
- Categorizes each as equivalent or meaningfully different
- Develops new heuristics for automatable equivalences
- Validates heuristics don't create false positives
- Tracks progress across multiple agent runs

### The MD5 Hashing Scheme

Since comparison reruns regenerate the delta files with new record IDs, we can't use record IDs as stable identifiers. Instead, we compute the MD5 hash of the raw NDJSON line. This hash:

- Is stable across reruns (same input → same hash) as long as the underlying record hasn't changed
- Uniquely identifies a record's content
- Allows tracking which records have been analyzed even after reruns add/remove other records

### Category Labels

Each analyzed record is assigned one of four categories:

| Label | Meaning | Action |
|-------|---------|--------|
| `equiv-autofix` | Obviously equivalent, automation-detectable | Add tolerance to `tolerances.js` with `kind: 'equiv-autofix'` |
| `temp-tolerance` | Real difference, recognizable pattern | File git-bug, add tolerance with `kind: 'temp-tolerance'` + `bugId` |
| `equiv-manual` | Obviously equivalent, no clear automation | Note and move on |
| `ambiguous` | Unclear if difference matters | Flag for human review |
| `real-diff` | Meaningfully different | Investigate as potential bug |

### The Analysis File

`scripts/tx-compare/results/p6-analyzed.txt` serves as the triage ledger, with one line per analyzed record:

```
a1b2c3d4e5f6: equiv-autofix null vs absent extension array in OperationOutcome
f7e8d9c0b1a2: real-diff dev missing 3 concepts in ValueSet expansion
d4c3b2a1f0e9: equiv-manual display text capitalization difference
```

### The `equiv-autofix` Loop

When a record is categorized as `equiv-autofix` or `temp-tolerance`, the agent enters an iterative development loop:

```
┌─────────────────────────────────────────────────┐
│  1. Read tolerances.js to understand existing    │
│     tolerance pipeline                           │
│  2. Add new tolerance object to tolerances.js    │
│     with match() and normalize() functions,      │
│     citing the specific test case                │
│  3. Archive current p6:                          │
│     cp p6.ndjson p6.YYYYMMDD-HHMMSS.ndjson      │
│  4. Rerun comparison                             │
│  5. Count eliminated records                     │
│  6. Sample ≥10 eliminated records                │
│  7. Validate each is legitimately equivalent     │
│     ┌─ All valid? ──► Done, tolerance accepted   │
│     └─ Any invalid? ──► Restore archive,         │
│        revert changes, rework tolerance,         │
│        loop back to step 2                       │
└─────────────────────────────────────────────────┘
```

### Running Multiple Rounds

The sampling agent is designed to be run repeatedly. Each run:

1. Picks a random line from p6.ndjson
2. Hashes it and checks against p6-analyzed.txt
3. If already analyzed, picks another (repeat until fresh)
4. Analyzes, categorizes, and records

This can be parallelized (multiple agents sampling simultaneously) as long as they coordinate through p6-analyzed.txt. Over time, the P6 count shrinks as `equiv-autofix` heuristics eliminate records, and the analysis file builds up a complete triage of the remaining differences.

---

## Appendix: Subagent Prompts

### P0 Triage Agent

```
Analyze all P0 crash records from scripts/tx-compare/results/deltas/p0.ndjson.

These are cases where prod returned HTTP 200 but dev returned HTTP 500
(dev crashes on valid requests). For each record:

1. Parse the devBody to extract the error message
2. Parse the prodBody to understand what a successful response looks like
3. Group records by distinct error pattern

For each distinct crash pattern, file a git-bug with:
- Title describing the crash
- Body with: error message, occurrence count, example IDs, what prod
  returns vs what dev returns, likely root cause analysis

Use: git-bug bug new -t "title" -m "body" --non-interactive
Then: git-bug bug label new <id> tx-compare && git-bug bug label new <id> P0
```

### P1 Triage Agent

```
Analyze all P1 result-disagreement records from
scripts/tx-compare/results/deltas/p1.ndjson.

These are cases where both prod and dev returned HTTP 200 but disagreed
on the result boolean (one says valid, the other says invalid). For each
record:

1. Parse prodBody and devBody to extract result, message, and diagnostics
2. Identify the code system, code, and ValueSet involved
3. Understand WHY they disagree (different code system versions? missing
   data? different filter evaluation?)

Group by root cause pattern and file git-bugs with labels tx-compare
and P1.
```

### P2-P4 Triage Agent

```
Analyze P2, P3, and P4 delta files:
- scripts/tx-compare/results/deltas/p2.ndjson (dev crashes on bad input)
- scripts/tx-compare/results/deltas/p3.ndjson (missing resources)
- scripts/tx-compare/results/deltas/p4.ndjson (wrong error codes)

For each priority level:
1. Parse all records
2. Group by error pattern / root cause
3. File git-bugs with appropriate labels (tx-compare + P2/P3/P4)

Include: error messages, occurrence counts, example IDs, prod vs dev
behavior, likely root cause analysis.
```

### Coverage Validation Agent

```
Verify that the bugs filed for [priority] fully cover all records in the
delta file.

1. List all git-bug issues with label [priority]
2. Read each bug's description to understand what pattern it covers
3. Parse every record in the delta file
4. Classify each record into a bug based on the pattern descriptions
5. Report:
   - Records per bug (expected vs actual)
   - Any orphaned records not covered by any bug
   - Whether new bugs need to be filed
```

### P6 Sample-and-Analyze Agent

The full P6 triage prompt is maintained in [`scripts/tx-compare/P6-triage.md`](P6-triage.md). It is the canonical, up-to-date version and is referenced directly by the runner loop. See that file for the complete instructions.

### P6 Runner Loop

The P6 triage process is automated via `scripts/tx-compare/p6-loop.sh`, a bash loop that repeatedly invokes `claude` in headless mode to triage one P6 record per iteration:

```bash
./scripts/tx-compare/p6-loop.sh
```

The loop:
- Runs `claude -p --dangerously-skip-permissions --model opus` each round, passing the P6-triage.md prompt
- Logs each round to `scripts/tx-compare/results/p6-triage-logs/round-NNNN.log`
- Prints P6 count and analyzed count at the start of each round
- Stops on Ctrl-C or when P6 file reaches 0 records
- Uses a lock file to prevent concurrent instances

---

## Bug Tracking

All bugs are filed using `git-bug` with the user "Claude (AI Assistant)". Each bug is labeled with:

- `tx-compare` (common label for all comparison-derived bugs)
- Priority label (`P0`, `P1`, `P2`, `P3`, `P4`, or `P6`)

### Listing Bugs

```bash
git-bug bug ls                    # all bugs
git-bug bug ls --label P0         # by priority
git-bug bug ls --label tx-compare # all comparison bugs
git-bug bug show <id>             # full details
```

### Bug Report Format

Each bug includes:
- **Title**: Concise description of the crash/error/difference
- **Body**: Error message, occurrence count, example record IDs, prod vs dev behavior comparison, likely root cause analysis
- **Labels**: Priority level + `tx-compare`
