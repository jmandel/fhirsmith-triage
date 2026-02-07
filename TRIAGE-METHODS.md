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

1. **Run comparison**: `node compare.js --input comparison.ndjson --out results` categorizes records by priority
2. **Iterative triage**: For each priority, process records sequentially — analyze, categorize, develop tolerances, file bugs
3. **Tolerance development**: When a recognizable pattern is found, write a tolerance to clear it from future triage

### Key Design Decisions

- **Sequential processing**: Records are processed in order from each delta file, not randomly sampled
- **Generalized loop**: A single `triage-loop.sh` handles all priority levels, not just P6
- **MD5 hashing for stable record identity**: Since comparison reruns change record IDs, we hash the raw NDJSON line to create a stable identifier that survives reruns
- **Iterative tolerance development with validation**: New heuristics are validated by sampling eliminated records to catch false positives
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

### Comparison Engine (compare.js)

The comparison engine reads `comparison.ndjson`, applies the tolerance pipeline, categorizes each record by priority, and writes results to delta files.

```
comparison.ndjson
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
┌─────────────────────┐
│  Output writers     │
│  results/           │
│    summary.json     │
│    deltas/          │
│      p0..p6.ndjson  │
└─────────────────────┘
```

#### Tolerance Pipeline (tolerances.js)

All comparison logic — skipping irrelevant records, normalizing cosmetic differences, suppressing known bugs — is expressed as an ordered list of tolerance objects in `tolerances.js`.

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
node compare.js --input comparison.ndjson --out results
```

---

## Triage Process

### Running the Triage Loop

```bash
# Triage a single priority
./triage-loop.sh P6

# Triage all priorities sequentially
./triage-loop.sh
```

The loop:
- Calls `next-record.py --priority <P>` to get the next un-analyzed record
- Invokes `claude -p --dangerously-skip-permissions --model opus` with `triage-prompt.md`
- Logs each round to `results/triage-logs/<priority>-round-NNNN.log`
- Commits changes after each round
- Stops when all records for a priority are analyzed, then moves to the next
- Uses a lock file to prevent concurrent instances

### Record Selection

`next-record.py` reads the delta file sequentially (top to bottom) and returns the first record whose MD5 hash is not in the analyzed file. No randomization — deterministic ordering for reproducibility.

### Category Labels

Each analyzed record is assigned one of five categories:

| Label | Meaning | Action |
|-------|---------|--------|
| `equiv-autofix` | Equivalent, automatable | Add tolerance with `kind: 'equiv-autofix'` |
| `temp-tolerance` | Real difference, common pattern | File git-bug, add tolerance with `kind: 'temp-tolerance'` + `bugId` |
| `equiv-manual` | Equivalent, not automatable | Note and move on |
| `ambiguous` | Unclear | Flag for human review |
| `real-diff` | Meaningfully different | File git-bug |

### The Tolerance Development Loop

When a record is categorized as `equiv-autofix` or `temp-tolerance`, the agent enters an iterative development loop:

```
1. Read tolerances.js
2. Add new tolerance object
3. Archive current delta file
4. Rerun comparison
5. Count eliminated records
6. Sample ≥10 eliminated records
7. Validate each is legitimate
   ├─ All valid? → Done
   └─ Any invalid? → Restore, rework, repeat
```

### Analysis Files

- **`results/<priority>-analyzed.txt`**: One-line triage ledger per analyzed record
  ```
  a1b2c3d4e5f6: equiv-autofix null vs absent extension array
  f7e8d9c0b1a2: real-diff (bug:abc1234) dev missing concepts
  ```

- **`results/<priority>-detailed-reports.md`**: Full analysis reports with reasoning

### Archived Tolerances

`tolerances-v1/` contains the full tolerance set from batch 1 (both equiv-autofix and temp-tolerance entries). The active `tolerances.js` starts each batch with only the permanent equiv-autofix tolerances.

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

12 permanent equiv-autofix tolerances survived into the base set. 12 temp-tolerances were developed for batch-1-specific bug patterns (archived in `tolerances-v1/`).

### Bug Tracking

All bugs filed using `git-bug` with `tx-compare` label and priority labels.
