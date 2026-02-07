# TX-Compare Triage Methods

A detailed methodology for triaging differences between a production FHIR terminology server (tx.fhir.org) and a development implementation (FHIRsmith), using LLM-powered agents for systematic analysis, bug filing, and iterative tolerance development.

## Table of Contents

1. [Overview](#overview)
2. [Comparison Infrastructure](#comparison-infrastructure)
3. [Triage Process](#triage-process)
4. [Appendix: Batch 1 Results](#appendix-batch-1-results)

---

## Overview

### The Problem

We have paired HTTP request/response records comparing a production FHIR terminology server against a development implementation. The comparison engine categorizes differences by priority, but the raw output needs human-level judgment to:

- Identify distinct bug patterns within each priority level
- File actionable bug reports
- Distinguish real bugs from cosmetic/equivalent differences
- Develop new comparison heuristics to reduce noise

### The Approach

We use an agent-driven triage process:

1. **Start a job**: `./prompts/start-triage.sh <job-name> [comparison.ndjson]` creates a job directory with baseline tolerances and runs the initial comparison
2. **Iterative triage**: Process records sequentially — analyze, categorize, develop tolerances, file bugs
3. **Tolerance development**: When a recognizable pattern is found, write a tolerance to clear it from future triage

### Key Design Decisions

- **Job-directory isolation**: Each triage round lives in `jobs/<job-name>/` with its own comparison data, tolerances, results, and issue workspaces
- **Sequential processing**: Records are processed in order from the delta file, not randomly sampled
- **Single unified delta file**: All non-OK/non-SKIP records go to one `deltas.ndjson` with priority embedded in each record's comparison metadata
- **Issue directories**: Each record gets a workspace at `issues/<md5>/` with pre-prepared files (raw, normalized, applied tolerances)
- **MD5 hashing for stable record identity**: Since comparison reruns change record positions, we hash the raw NDJSON line to create a stable identifier that survives reruns
- **Iterative tolerance development with validation**: New heuristics are validated by sampling eliminated records to catch false positives
- **Minimal baseline**: New jobs start from `baseline/tolerances.js` (only inarguably correct tolerances), not from the previous round's accumulated set
- **Bug archival**: When starting a new job, existing git-bugs are dumped (JSON + MD + HTML) to the previous job's `bugs/` dir before wiping
- **Separate triage repo**: The triage toolkit lives in its own git repo, independent of the FHIRsmith source

---

## Comparison Infrastructure

### Data Collection

The input file `comparison.ndjson` is produced by a reverse proxy that sits between clients and both the production and development servers. For each incoming request, the proxy:

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
  "devBody": "JSON string of FHIR response",
  "requestBody": "JSON string of request body (when available)"
}
```

### Comparison Engine (engine/compare.js)

The comparison engine reads the job's `comparison.ndjson`, applies the tolerance pipeline, categorizes each record by priority, and writes all non-OK/non-SKIP records to a single delta file.

```
jobs/<job-name>/comparison.ndjson
         │
         ▼
┌─────────────────────┐
│  Tolerance pipeline  │
│  (tolerances.js)     │
│  Skip / Normalize    │
└─────────────────────┘
         │
         ▼
┌─────────────────────┐
│  compareRecord()    │
│  1. Check status    │──► P0/P2/P3/P4 (status mismatches)
│  2. Parse bodies    │
│  3. Check result    │──► P1 (boolean disagrees)
│  4. Deep compare    │──► OK (match) or P6 (content differs)
└─────────────────────┘
         │
         ▼
┌─────────────────────────────────┐
│  Output                         │
│  jobs/<job-name>/results/       │
│    summary.json                 │
│    deltas/deltas.ndjson         │
│    (all priorities in one file) │
└─────────────────────────────────┘
```

#### Tolerance Pipeline (tolerances.js)

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of tolerance objects in the job's `tolerances.js`.

Each tolerance is a self-contained object:

```js
{
  id: 'my-tolerance',
  description: 'What it does and why',
  kind: 'equiv-autofix',        // or 'temp-tolerance'
  bugId: 'abc1234',              // only for temp-tolerance
  match({ record, prod, dev }) { // → 'skip' | 'normalize' | null
    // ...
  },
  normalize({ prod, dev }) {     // → { prod, dev }
    // ...
  },
}
```

**Tolerance kinds:**

- **`equiv-autofix`**: Non-substantive difference. Permanent.
- **`temp-tolerance`**: Real difference suppressed for triage efficiency. Has a `bugId` linking to a git-bug issue.

**Tolerance ordering** (applied sequentially; ordering matters):

| Phase | Purpose | Examples |
|-------|---------|---------|
| A: Skip | Drop entire records | URL patterns, XML responses |
| B: Structural | Clean up structure before content transforms | Extension sorting, coding order |
| C: Content | Strip or transform specific fields | Strip diagnostics, expansion metadata |
| D: Sort | Stable ordering after all transforms | Sort parameters, issues, expansion contains |
| E: Bundle | Bundle-level normalization | Empty searchset Bundles |

#### Running the Comparison

```bash
node engine/compare.js --job jobs/<job-name>
```

---

## Triage Process

### Starting a New Job

```bash
# Start a new triage job (dumps bugs from previous job, wipes git-bug, resets tolerances)
./prompts/start-triage.sh 2026-02-round-1 /path/to/comparison.ndjson
```

This creates `jobs/2026-02-round-1/` with baseline tolerances, copies the comparison data, and runs the initial comparison.

### Running the Triage Loop

```bash
./prompts/triage-loop.sh jobs/2026-02-round-1
```

The loop:
- Calls `engine/next-record.js --job <job-dir>` to get the next un-analyzed record and prepare its issue directory
- Invokes `claude -p --dangerously-skip-permissions --model opus` with the triage prompt
- Logs each round to `<job-dir>/triage-logs/round-NNNN.log`
- Commits changes after each round
- Stops when all records are analyzed
- Uses a lock file to prevent concurrent instances

### Record Selection

`engine/next-record.js` reads the delta file sequentially (top to bottom) and returns the first record whose MD5 hash doesn't have an `analysis.md` in its issue directory. No randomization — deterministic ordering for reproducibility.

For each selected record, it creates a prepared issue directory at `<job-dir>/issues/<md5>/` containing:
- `record.json` — Full delta record (pretty-printed)
- `prod-raw.json` / `dev-raw.json` — Parsed response bodies
- `prod-normalized.json` / `dev-normalized.json` — After tolerance pipeline
- `applied-tolerances.txt` — Which tolerances were applied

### Category Labels

Each analyzed record is assigned one of five categories:

| Label | Meaning | Action |
|-------|---------|--------|
| `equiv-autofix` | Equivalent, automatable | Add tolerance with `kind: 'equiv-autofix'` |
| `temp-tolerance` | Real difference, common pattern | File git-bug, add tolerance with `kind: 'temp-tolerance'` + `bugId` |
| `equiv-manual` | Equivalent, not automatable | Write a narrowly-scoped tolerance |
| `ambiguous` | Unclear | Write a temp-tolerance, flag for human review |
| `real-diff` | Meaningfully different | File git-bug, write a temp-tolerance to prevent re-triaging |

**Every record gets a tolerance.** A tolerance is a record of judgment — without one, the record surfaces again in the next triage pass.

### The Tolerance Development Loop

When a record is categorized as `equiv-autofix` or `temp-tolerance`, the agent enters an iterative development loop:

```
1. Read the job's tolerances.js
2. Add new tolerance object
3. Archive current delta file
4. Rerun comparison (node engine/compare.js --job <job-dir>)
5. Count eliminated records
6. Sample ≥10 eliminated records
7. Validate each is legitimate
   ├─ All valid? → Done
   └─ Any invalid? → Restore, rework, repeat
```

### Analysis Files

Each record's analysis lives in its issue directory (`<job-dir>/issues/<md5>/`):

- **`analysis.md`** — The agent's analysis. Its existence signals "analyzed" to the record picker.

  Format:
  ```markdown
  # Analysis: <category-label>

  **MD5**: `<md5hash>`
  **Operation**: `<METHOD> <URL>`
  **Priority**: <priority>
  **Bug**: <bug ID or "none">
  **Tolerance**: <tolerance ID>

  ## What differs
  ...

  ## Category: `<category-label>`
  ...

  ## Tolerance
  ...
  ```

- Arbitrary scratch files (`notes.txt`, `pattern-search.md`, etc.) for working notes

### Archived Tolerances and Bug Reports

`archive/tolerances-v1/` contains the full tolerance set from batch 1 (both equiv-autofix and temp-tolerance entries). When starting a new job, `baseline/tolerances.js` provides only the minimal inarguably-correct tolerances.

Bug reports are archived to `<job-dir>/bugs/` (as JSON, Markdown, and HTML) when starting a new job.

---

## Appendix: Batch 1 Results

Batch 1 processed 7,245 records from tx.fhir.org comparison testing. Results:

### Priority Summary

| Priority | Records | Description |
|----------|---------|-------------|
| SKIP | 1,143 | metadata, root page, static assets, XML |
| OK | 4,557 | Match after normalization |
| P0 | 16 | Dev crashes on valid requests (3 bugs) |
| P1 | 246 | Result boolean disagrees (8 bugs) |
| P2 | 186 | Dev crashes on bad input (3 bugs) |
| P3 | 8 | Missing resources (1 bug) |
| P4 | 573 | Status code mismatches (3 bugs) |
| P6 | 516 | Content differs after triage (down from 3,647) |

### Tolerances Developed

12 permanent equiv-autofix tolerances survived into the base set. 12 temp-tolerances were developed for batch-1-specific bug patterns (archived in `archive/tolerances-v1/`).

### Bug Tracking

All bugs filed using `git-bug` with `tx-compare` label and priority labels.
