# Root Cause Investigation — Orchestration

You are coordinating root cause investigation across all open bugs. Your job: screen each bug, skip config/data issues, launch focused investigation agents for code-likely bugs, and **review the quality of each investigation before moving on**.

## Setup

1. List all open bugs:
   ```bash
   git-bug bug -s open -l tx-compare
   ```

2. Read the job directory's `tolerances.js` to have context on what each bug covers.

3. Create the log directory:
   ```bash
   mkdir -p <job-dir>/root-cause-logs
   ```

## For each bug

### Quick screen (you do this yourself — no subagent needed)

Read the bug: `git-bug bug show <BUG_ID>`

Skip bugs already labeled `code-defect`, `config-issue`, or `needs-investigation`.

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

**Ambiguous** — if you can't tell from the bug description alone, launch an investigation agent. Better to investigate and discover it's config than to skip a real code bug.

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

### Review each investigation

After each investigation completes, **read the log and check the bug** before moving on:

1. **Read the log**: `<job-dir>/root-cause-logs/<BUG_ID>.log`
2. **Read the updated bug**: `git-bug bug show <BUG_ID>` — check for the `## Root Cause` section
3. **Assess quality** against these criteria:

   **Good investigation** (move on):
   - Has a clear classification (code-defect, config-issue, or needs-investigation)
   - For code-defects: includes 2-5 GitHub permalink(s) to specific lines in both codebases
   - Links point to relevant code (not random files or overly broad ranges)
   - Explanation is concise and a developer could act on it
   - The `## Root Cause` section was actually written to the bug

   **Poor investigation** (flag for manual review):
   - No `## Root Cause` section written to the bug
   - Says "code-defect" but has no GitHub links or only links to one codebase
   - Links are to generic entry points (e.g., top of tx.js) rather than the specific divergence
   - Explanation is vague ("the implementations differ") without showing where
   - Classified as `needs-investigation` without explaining what was tried
   - Agent got stuck, errored out, or produced no useful output

4. **Record your assessment**: For each investigated bug, note:
   - Bug ID and title
   - Classification the agent assigned
   - Whether the investigation was good or poor quality
   - If poor: what's missing (no links, wrong classification, vague, etc.)

Do NOT re-run poor investigations automatically. Collect them for the summary so the user can decide how to handle them.

## After all bugs are processed

Present a summary table:

```
## Results

### Config/data issues (skipped)
- <BUG_ID>: <one-line reason>
- ...

### Code-level defects (investigated)
- <BUG_ID>: <title> — <quality: good/poor> <if poor: what's missing>
- ...

### Already labeled (skipped)
- <BUG_ID>: <existing label>
- ...

### Needs attention
- <list any poor-quality investigations that need manual follow-up>
```

## Tips

- Bugs labeled `reproduced` have been confirmed on live servers — higher priority
- Bugs labeled `not-reproduced` may have been fixed — lower priority
- If a bug references `round-1-bug-id:` prefix in its tolerance bugId, that just means the tolerance was carried forward from a previous round
