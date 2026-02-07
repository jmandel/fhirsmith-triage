# P6 Triage Agent Instructions

You are triaging P6 content differences from a FHIR terminology server comparison test. The goal is to achieve **identical behavior** between the production (tx.fhir.org) and development (FHIRsmith) servers.

**Your job: analyze ONE randomly-sampled P6 record.**

## Important: What counts as a real difference

This is a **terminology server**. Any difference in terminology-related content is meaningful and must be tracked as `real-diff`. This includes:
- **Version/edition differences**: Which SNOMED/LOINC/etc edition is loaded
- **Code validity**: Whether a code is found, not found, active, inactive
- **Display text**: The human-readable name for a code
- **Properties**: Code properties, designations, parent/child relationships
- **Expansion contents**: Which codes appear in a ValueSet expansion
- **Validation messages**: Error text, warnings, informational messages
- **Anything else about the terminology content or behavior**

**FHIR conformance matters too.** FHIR requires that strings, if present, are non-empty, and arrays, if present, are non-empty. So `id: ""` vs absent is NOT cosmetic — the empty string is invalid FHIR and represents a real bug in the server producing it. Similarly, `entry: []` (empty array present) is invalid FHIR. These should be `real-diff`, not `equiv-autofix`.

Things that are safe to normalize away (`equiv-autofix`) are differences that have no impact on terminology results AND don't represent conformance violations. Examples we've seen so far:
- JSON key ordering within the same object
- `null` vs absent for optional fields that carry no information (e.g. `location: [null]` vs absent) — note: this is different from empty string `""` which is invalid
- Server-generated transient metadata (UUIDs, timestamps, pagination links) unrelated to terminology content
- Server software version identifiers, implementation-specific metadata

Use your judgment for novel patterns, but when in doubt categorize as `ambiguous` rather than `equiv-autofix`.

## Step 1: Pick a random un-analyzed record

Run:
```
python3 scripts/tx-compare/sample-p6.py
```

This outputs a summary (MD5 hash, URL, method, statuses) followed by `---RECORD---` and the full JSON line. The MD5 hash is the stable identifier you'll use in Step 5.

## Step 2: Deeply inspect the record

- Parse the JSON record, then parse prodBody and devBody
- Compare them field by field
- Understand the operation (expand, validate-code, lookup, read, etc.)
- Identify exactly what differs between prod and dev

## Step 3: Categorize the difference

Use these exact category labels for consistency:

- **`equiv-autofix`**: Truly equivalent, automation-detectable. The responses mean the same thing but differ in a way a normalization heuristic can detect. Examples: JSON key ordering, null vs absent for empty optional fields, server-generated UUIDs/timestamps. **NOT** version differences, display text differences, or anything reflecting different data/behavior.
- **`temp-tolerance`**: A real, meaningful difference — NOT actually equivalent — but one that follows a recognizable pattern likely affecting many records. When you spot one of these, explore the P6 dataset to estimate how widespread it is. If it's a common pattern, write a temporary tolerance to clear the whole class at once (see Step 4) so we stop re-triaging it. The tolerance must have `kind: 'temp-tolerance'` and a `bugId` in `tolerances.js` so we know these are real bugs being suppressed for triage efficiency, not true equivalences. Always file a `git-bug` with `tx-compare` label for the pattern, including the count of affected records.
- **`equiv-manual`**: Obviously equivalent, no clear automation. Same meaning but too nuanced/context-dependent for a simple rule.
- **`ambiguous`**: Not sure if the difference matters. Needs human review.
- **`real-diff`**: Obviously different in a meaningful way. A potential bug or configuration issue that should be investigated. File a `git-bug` with `tx-compare` label, including at least one **Record ID** so a reader can reproduce it with `grep -n '<ID>' comparison.ndjson`.

## Step 4: If `equiv-autofix` or `temp-tolerance`, implement and validate a new heuristic

The workflow is the same for both — the only differences are:
- For `temp-tolerance`: file a `git-bug` first, then add the `tx-compare` label:
  ```
  git-bug bug new --non-interactive -t "Title" -m "Description"
  git-bug bug label new <BUG_ID> tx-compare
  ```
  The bug description should include: what the difference is, how widespread it is (count of affected records), at least one **Record ID** (the UUID `id` field from comparison.ndjson) so a reader can reproduce it with `grep -n '<ID>' comparison.ndjson`, and that a tolerance was written to suppress it for triage. Include the tolerance ID.
- For `temp-tolerance`: be **extra judicious** in validation — since these are real differences, a too-broad heuristic could mask unrelated bugs. Verify each sampled record's *only* difference is the pattern you're targeting.
- Scope tolerances as narrowly as possible — match only the request/response patterns you've actually observed. For example, if a display-text difference only appears for UCUM validate-code requests, don't write a tolerance that strips display for all systems.

This is an iterative loop:

a. Read `scripts/tx-compare/tolerances.js` to understand the existing tolerance pipeline. Each tolerance is a self-contained object with `match(ctx)` and `normalize(ctx)` functions.

b. Add a new tolerance object to the `tolerances` array in `tolerances.js`. Include:
   - `id`: a descriptive unique identifier
   - `description`: what the difference is and why it's safe to tolerate
   - `kind`: `'equiv-autofix'` or `'temp-tolerance'`
   - `bugId`: (temp-tolerance only) the git-bug ID
   - `match({ record, prod, dev })`: return `'skip'`, `'normalize'`, or `null`
   - `normalize({ prod, dev, record })`: return `{ prod, dev }` with transformed bodies

   Place the tolerance in the right phase of the array (see ordering comments in tolerances.js):
   - Phase A: skip tolerances
   - Phase B: structural cleanup (issue normalization, etc.)
   - Phase C: content-specific transforms (strip parameters, normalize text)
   - Phase D: sorting (parameter, issue, expansion ordering)
   - Phase E: bundle-level

   Template for `equiv-autofix`:
   ```js
   {
     id: 'my-tolerance',
     description: 'What it does and why it is safe',
     kind: 'equiv-autofix',
     match({ prod, dev }) {
       // return 'normalize' when this tolerance applies, null otherwise
     },
     normalize({ prod, dev }) {
       // return { prod, dev } with transformed bodies
     },
   },
   ```

   Template for `temp-tolerance`:
   ```js
   {
     id: 'my-tolerance',
     description: 'What the real difference is. N P6 records affected.',
     kind: 'temp-tolerance',
     bugId: 'abc1234',
     match({ prod }) {
       // return 'normalize' when this tolerance applies, null otherwise
     },
     normalize({ prod, dev }) {
       // return { prod, dev } with transformed bodies
     },
   },
   ```

c. Before rerunning, archive the current p6 file:
   ```
   cp scripts/tx-compare/results/deltas/p6.ndjson scripts/tx-compare/results/deltas/p6.$(date +%Y%m%d-%H%M%S).ndjson
   ```

d. Rerun comparison. Since only P6 records can be affected by normalization changes, you can rerun on the full input:
   ```
   node scripts/tx-compare/compare.js --input comparison.ndjson --out scripts/tx-compare/results
   ```

e. Compare old and new p6 file line counts to determine how many records were eliminated.

f. **Validate**: Randomly sample at least 10 of the eliminated records (diff the old vs new file to find them). For each, verify the elimination was legitimate — the differences match the pattern you're targeting and **nothing else is being hidden**.

g. If ANY sampled elimination looks inappropriate (masking a different problem, or catching records that don't match the intended pattern), restore the archived p6 file, revert your heuristic changes, rework the logic to be more specific, and repeat from step (b).

h. Loop until all 10+ sampled eliminations pass validation.

## Step 5: Record analysis

Append to `scripts/tx-compare/results/p6-analyzed.txt` a line in this format:
```
<md5hash>: <category-label> <brief description of what was found>
```

For example:
```
a1b2c3d4e5f6: equiv-autofix null vs absent extension array in OperationOutcome
f7e8d9c0b1a2: real-diff (bug:abc1234) dev missing 3 concepts in ValueSet expansion
d4c3b2a1f0e9: real-diff (bug:def5678) SNOMED version differs (20250201 vs 20240201)
b5a4c3d2e1f0: temp-tolerance (bug:a151f3c, 238 records) ValueSet.id is empty string in dev
```

## Step 6: Detailed report

Append a detailed report to `scripts/tx-compare/results/p6-detailed-reports.md`. Use this exact format (the `---` separator and heading structure matter for readability):

```
---

### `<md5hash>` — <category-label>

**Operation**: `<METHOD> <URL>` — <brief description of what was requested>
**Status**: <HTTP statuses and high-level result comparison>

#### What differs

<Describe the specific differences you found between prod and dev responses. Use tables, bullet lists, or inline code as appropriate to make the differences clear.>

#### Category: `<category-label>`

<1-2 sentences explaining why you chose this category.>

#### Heuristic

<If equiv-autofix or temp-tolerance: describe what you implemented, how many records it eliminated, and validation results. If real-diff or ambiguous: "No heuristic implemented." If temp-tolerance, include the bug ID.>
```

This file is the persistent record of your full analysis. The one-liner in `p6-analyzed.txt` is for quick scanning; this file is for understanding the reasoning.
