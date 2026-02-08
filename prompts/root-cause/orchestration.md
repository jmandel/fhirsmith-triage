# Root Cause Investigation — Orchestration

You are coordinating root cause investigation across all open bugs. Your job: screen each bug, skip config/data issues, and launch focused investigation agents for bugs that are likely code-level defects.

## Setup

1. List all open bugs:
   ```bash
   git-bug bug -s open -l tx-compare
   ```

2. Read the job directory's `tolerances.js` to have context on what each bug covers.

## For each bug

### Quick screen (you do this yourself — no subagent needed)

Read the bug: `git-bug bug show <BUG_ID>`

Classify based on the title, body, and labels:

**Config/data — skip with a label:**
- Version skew in loaded terminology (different SNOMED/LOINC/RxNorm editions)
- Missing CodeSystem or ValueSet definitions (dev returns 404 for things prod has)
- Edition-dependent content differences (display text differs because different data loaded)
- Transient or external service errors (timeouts, flaky upstream)

For these, label and move on:
```bash
git-bug bug label new <BUG_ID> "config-issue"
```

**Code-level — launch investigation agent:**
- Structurally different response shape (missing/extra fields, different nesting)
- Different message formatting, error wording, or display text construction
- Different operation logic (subsumption, filtering, parameter handling, status codes)
- Missing or extra FHIR extensions, properties, or designations

**Ambiguous** — if you can't tell from the bug description alone, launch an investigation agent anyway. Better to investigate and discover it's config than to skip a real code bug.

### Launch investigation

For each code-likely bug, launch a `claude` subprocess in the background:

```bash
claude -p --dangerously-skip-permissions --model opus \
  --output-format stream-json \
  "$(cat prompts/root-cause/investigation.md)

Bug ID: <BUG_ID>
Job directory: <job-dir>" \
  2>&1 | tee "<job-dir>/root-cause-logs/<BUG_ID>.log" | python3 engine/stream-filter.py &
```

Run at most **2 investigations in parallel** (adjustable if the user requests more or fewer). Wait for both to finish before launching the next batch.

## After all bugs are processed

Summarize results:
- How many bugs screened
- How many labeled `config-issue` (with one-line reasons)
- How many investigated as `code-defect` (with titles)
- How many labeled `needs-investigation` (unclear after deep look)
- Any bugs that were already labeled (skip these — don't re-investigate)

## Tips

- Check existing labels before processing: skip bugs already labeled `code-defect`, `config-issue`, or `needs-investigation`
- If a bug references a tolerance with `round-1-bug-id:` prefix in its bugId, that's fine — it means the tolerance was carried forward from a previous round
- Bugs labeled `reproduced` have been confirmed on live servers — these are higher priority for investigation
- Bugs labeled `not-reproduced` may have been fixed already — lower priority
