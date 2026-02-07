# Triage Agent Instructions

Read `AGENTS.md` for background on the data format, FHIR operations, priority classification, what counts as a real difference, tolerance pipeline, and git-bug conventions.

**Your job: analyze ONE record from the specified priority level.**

The priority level is provided as context when this prompt is invoked (e.g., "Triage priority: P6").

## Step 1: Pick the next un-analyzed record

```
python3 next-record.py --priority <PRIORITY>
```

This outputs a summary (MD5 hash, URL, method, statuses) followed by `---RECORD---` and the full JSON line. The MD5 hash is the stable identifier you'll use in Step 5.

## Step 2: Deeply inspect the record

- Parse the JSON record, then parse prodBody and devBody
- Compare them field by field
- Understand the operation (expand, validate-code, lookup, read, etc.)
- Identify exactly what differs between prod and dev

## Step 3: Categorize the difference

Use these exact category labels:

- **`equiv-autofix`**: Truly equivalent, automation-detectable. The responses mean the same thing but differ in a way a normalization heuristic can detect. Examples: JSON key ordering, null vs absent for empty optional fields, server-generated UUIDs/timestamps. **NOT** version differences, display text differences, or anything reflecting different data/behavior. See "What Counts as a Real Difference" in AGENTS.md.
- **`temp-tolerance`**: A real, meaningful difference — NOT actually equivalent — but one that follows a recognizable pattern likely affecting many records. When you spot one of these, explore the dataset to estimate how widespread it is. If it's a common pattern, write a temporary tolerance to clear the whole class at once (see Step 4) so we stop re-triaging it. The tolerance must have `kind: 'temp-tolerance'` and a `bugId` in `tolerances.js`. Always file a `git-bug` with `tx-compare` label for the pattern, including the count of affected records.
- **`equiv-manual`**: Obviously equivalent, no clear automation. Same meaning but too nuanced/context-dependent for a simple rule.
- **`ambiguous`**: Not sure if the difference matters. Needs human review.
- **`real-diff`**: Obviously different in a meaningful way. A potential bug or configuration issue. File a `git-bug` with `tx-compare` label, including at least one **Record ID** so a reader can reproduce it with `grep -n '<ID>' comparison.ndjson`.

## Step 4: If `equiv-autofix` or `temp-tolerance`, implement and validate a new tolerance

See "Tolerance Pipeline" and "Tolerance development loop" in AGENTS.md for the full tolerance object shape, ctx documentation, and phase ordering.

For `temp-tolerance`, file a `git-bug` before writing the tolerance. The bug description should include: what the difference is, how widespread it is (count of affected records), at least one Record ID, and the tolerance ID. Be extra judicious in validation — verify each sampled record's *only* difference is the pattern you're targeting.

Follow the development loop from AGENTS.md:

a. Read `tolerances.js` to understand the existing pipeline.

b. Add a new tolerance object in the correct phase.

c. Archive the current delta file:
   ```
   cp results/deltas/<priority>.ndjson results/deltas/<priority>.$(date +%Y%m%d-%H%M%S).ndjson
   ```

d. Rerun comparison:
   ```
   node compare.js --input comparison.ndjson --out results
   ```

e. Compare old and new delta file line counts.

f. **Validate**: Randomly sample at least 10 eliminated records. For each, verify the elimination was legitimate — the differences match the pattern you're targeting and **nothing else is being hidden**.

g. If ANY sampled elimination looks inappropriate, restore the archived delta file, revert your heuristic changes, rework the logic, and repeat from step (b).

h. Loop until all 10+ sampled eliminations pass validation.

## Step 5: Record analysis

Append to `results/<priority>-analyzed.txt` (e.g., `results/p6-analyzed.txt`):
```
<md5hash>: <category-label> <brief description of what was found>
```

Examples:
```
a1b2c3d4e5f6: equiv-autofix null vs absent extension array in OperationOutcome
f7e8d9c0b1a2: real-diff (bug:abc1234) dev missing 3 concepts in ValueSet expansion
d4c3b2a1f0e9: real-diff (bug:def5678) SNOMED version differs (20250201 vs 20240201)
b5a4c3d2e1f0: temp-tolerance (bug:a151f3c, 238 records) ValueSet.id is empty string in dev
```

## Step 6: Detailed report

Append to `results/<priority>-detailed-reports.md`:

```
---

### `<md5hash>` — <category-label>

**Operation**: `<METHOD> <URL>` — <brief description of what was requested>
**Status**: <HTTP statuses and high-level result comparison>

#### What differs

<Describe the specific differences. Use tables, bullet lists, or inline code as appropriate.>

#### Category: `<category-label>`

<1-2 sentences explaining why you chose this category.>

#### Heuristic

<If equiv-autofix or temp-tolerance: what you implemented, how many records eliminated, validation results. If real-diff or ambiguous: "No heuristic implemented." If temp-tolerance, include the bug ID.>
```
