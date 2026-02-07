# Triage Agent Instructions

Read `AGENTS.md` for background on the data format, FHIR operations, priority classification, what counts as a real difference, tolerance pipeline, and git-bug conventions.

**Reference materials**: `reference/` contains FHIR R4 spec content that may help you understand expected behavior and field meanings. See `reference/INDEX.md` for a directory. Key resources:
- `reference/operations/` — operation specs ($validate-code, $expand, $lookup, etc.) with parameter definitions, plus formal OperationDefinition JSON
- `reference/resources/` — resource definitions (Parameters, OperationOutcome, ValueSet, CodeSystem, etc.)
- `reference/terminology-guidance/` — code system usage guides (SNOMED, LOINC, UCUM, RxNorm, NDC, BCP-47) with system URIs, version formats, and expected behaviors

Consult these when you need to understand what a field means, what parameters an operation should return, or how a specific code system works in FHIR.

**Your job: analyze ONE record from the prepared issue directory.**

The issue directory path is provided when this prompt is invoked (e.g., "Issue directory: /path/to/issues/<md5>").

## Step 1: Read the issue directory

The issue directory has been pre-prepared with these files:

- `record.json` — Full delta record (pretty-printed)
- `prod-raw.json` / `dev-raw.json` — Parsed response bodies (before tolerance pipeline)
- `prod-normalized.json` / `dev-normalized.json` — After tolerance pipeline (canonical key ordering)
- `applied-tolerances.txt` — Which tolerances were applied during normalization

**Start by comparing `prod-normalized.json` vs `dev-normalized.json`.** These show the differences that remain after existing tolerances. If they're identical, the existing pipeline already handles this record and you should note that in your analysis.

Then read the raw files to understand the full picture and confirm the normalization is correct.

## Step 2: Deeply inspect the record

- Read `record.json` for the operation URL, method, statuses, and comparison metadata
- Understand the operation (expand, validate-code, lookup, read, etc.)
- Identify exactly what differs between prod and dev in the normalized output
- Check `applied-tolerances.txt` to understand what was already normalized away

## Step 3: Find the broadest pattern

Before categorizing this as a one-off, search the full dataset for the same pattern:

1. **Search the full dataset**: `grep '<distinctive-string>' <job-dir>/results/deltas/deltas.ndjson | wc -l`
2. **Identify request properties that predict this difference**:
   - System URI (e.g., all UCUM codes, all SNOMED codes)
   - Operation type ($validate-code, $expand, $lookup)
   - FHIR version prefix (/r4/, /r5/)
   - Specific ValueSet or CodeSystem
3. **Write the broadest match** that covers the root cause without false positives
4. **Validate broadly**: sample across the matched records, not just the one you're triaging

Don't file one-off bugs for things that are part of a bigger pattern. If you see 3 records with the same root cause, they're one bug, not three.

## Step 4: Categorize the difference

Use these exact category labels:

- **`equiv-autofix`**: Truly equivalent, automation-detectable. The responses mean the same thing but differ in a way a normalization heuristic can detect. Examples: JSON key ordering, null vs absent for empty optional fields, server-generated UUIDs/timestamps. **NOT** version differences, display text differences, or anything reflecting different data/behavior. See "What Counts as a Real Difference" in AGENTS.md.
- **`temp-tolerance`**: A real, meaningful difference — NOT actually equivalent — but one that follows a recognizable pattern likely affecting many records. File a `git-bug` with `tx-compare` label, then write a tolerance with `bugId`.
- **`equiv-manual`**: Obviously equivalent, no clear automation. Same meaning but too nuanced/context-dependent for a simple rule.
- **`ambiguous`**: Not sure if the difference matters. Needs human review.
- **`real-diff`**: Obviously different in a meaningful way. A potential bug or configuration issue. File a `git-bug` with `tx-compare` label.

### Filing bug reports

When filing a `git-bug`, describe what you **observed**, not what you think the code is doing. You haven't read the codebase — don't speculate on root causes.

A good bug report includes:

1. **What differs**: The factual difference between prod and dev responses. Be specific — "dev returns `inactive: true` with `version: 2021-11-01`, prod omits both parameters" not "dev has extra parameters."
2. **How widespread**: How many records show this pattern, and what request properties predict it (system URI, operation type, FHIR version, etc.). Include the grep/search you used to find this.
3. **What the tolerance covers**: The tolerance ID, what it matches, and how many records it eliminates. This tells the person fixing the bug how to validate their fix.
4. **A representative record ID**: At least one, so a reader can `grep -n '<ID>' comparison.ndjson` to reproduce.

Do **not** include:
- Speculation about what code path causes the difference
- Guesses about which module or function is responsible
- Suggested fixes

Always add the `tx-compare` label. Use priority labels (`P0`, `P1`, etc.) matching the record's comparison priority.

```bash
git-bug bug new -t "Title" -m "Description" --non-interactive
git-bug bug label new <BUG_ID> "tx-compare"
git-bug bug label new <BUG_ID> "P6"
```

## Step 5: Always write a tolerance

**Every record gets a tolerance.** A tolerance is a record of judgment — "I looked at this and decided X." Without a tolerance, the record will surface again in the next triage pass.

This applies to ALL categories:

- **`equiv-autofix`**: Write a `normalize` tolerance that canonicalizes the difference away.
- **`temp-tolerance`**: File a git-bug first, then write a tolerance with `bugId`.
- **`real-diff`**: File a git-bug, then write a `temp-tolerance` that matches by URL + method (or other specific identifiers) to prevent re-triaging the same record.
- **`equiv-manual`**: Write a tolerance. If the pattern is too complex for a general rule, write one scoped to this specific record (match by record URL/method or other unique properties).
- **`ambiguous`**: Write a `temp-tolerance` with a `bugId` explaining the ambiguity, scoped narrowly.

### Canonical normalization over stripping

When two values differ (like display text), prefer normalizing to a canonical value rather than stripping the field entirely:

- Pick the longer string, or pick prod's value, or pick whichever is "more correct"
- Replace BOTH sides with the canonical value
- This way, if display was the only diff, the record matches OK
- If there were OTHER diffs, they still surface because the non-display fields still differ

Stripping is appropriate when BOTH values are wrong or irrelevant (like diagnostics trace output).

**Example — instead of:**
```js
normalize(ctx) {
  return both(ctx, body => stripParams(body, 'display'));
}
```

**Prefer:**
```js
normalize(ctx) {
  const prodDisplay = getParamValue(ctx.prod, 'display');
  const devDisplay = getParamValue(ctx.dev, 'display');
  if (prodDisplay !== devDisplay) {
    const canonical = prodDisplay && prodDisplay.length >= (devDisplay||'').length
      ? prodDisplay : devDisplay;
    function setDisplay(body) {
      if (!body?.parameter) return body;
      return { ...body, parameter: body.parameter.map(p =>
        p.name === 'display' ? { ...p, valueString: canonical } : p
      )};
    }
    return both(ctx, setDisplay);
  }
  return { prod: ctx.prod, dev: ctx.dev };
}
```

### Tolerance development loop

See "Tolerance Pipeline" in AGENTS.md for the full tolerance object shape, ctx documentation, and phase ordering.

a. Read the job's `tolerances.js` to understand the existing pipeline.

b. Add a new tolerance object in the correct phase.

c. Archive the current delta file:
   ```
   cp <job-dir>/results/deltas/deltas.ndjson <job-dir>/results/deltas/deltas.$(date +%Y%m%d-%H%M%S).ndjson
   ```

d. Rerun comparison:
   ```
   node engine/compare.js --job <job-dir>
   ```

e. Compare old and new delta file line counts.

f. **Validate**: Randomly sample at least 10 eliminated records. For each, verify the elimination was legitimate — the differences match the pattern you're targeting and **nothing else is being hidden**.

g. If ANY sampled elimination looks inappropriate, restore the archived delta file, revert your heuristic changes, rework the logic, and repeat from step (b).

h. Loop until all 10+ sampled eliminations pass validation.

## Step 6: Record analysis

Write `analysis.md` in the issue directory. Its existence signals "analyzed" to the record picker.

Format:

```markdown
# Analysis: <category-label>

**Operation**: `<METHOD> <URL>`
**Priority**: <priority>
**Status**: prod=<status> dev=<status>
**Bug**: <bug ID if applicable, or "none">
**Tolerance**: <tolerance ID>

## What differs

<Describe the specific differences found in the normalized output...>

## Category: `<category-label>`

<Why this category was chosen...>

## Tolerance

<What tolerance was written, how many records it affects, validation results>
```

You may also create arbitrary scratch files in the issue directory (e.g., `notes.txt`, `pattern-search.md`) for your working notes.
