# Plan: Parallel Triage Agents

## Problem

The current triage loop processes one record at a time. Each round takes 3-5 minutes (mostly Claude analysis time). With thousands of delta records, this is slow. We want 2-3 agents working in parallel.

## Key Challenges

1. **Record selection races** — two agents could pick the same record
2. **tolerances.js merge conflicts** — agents editing the same file
3. **compare.js reruns** — agents overwriting each other's deltas.ndjson
4. **Tolerance interactions** — two individually-valid tolerances might combine to mask real differences
5. **comparison.ndjson** — 785MB gitignored file needed by all agents

## Design: Worktrees + Serialized Merge

### Architecture

```
triage/                              # main worktree (orchestrator)
  jobs/<job>/
    comparison.ndjson                # 785MB, gitignored, shared via symlink
    tolerances.js                    # canonical copy, loads from tolerances.d/
    tolerances.js                    # canonical copy, agents edit directly
    results/deltas/deltas.ndjson     # canonical, regenerated at merge time
    issues/                          # issue dir existence = claimed

../triage-agent-1/                   # worktree on branch agent-1
  jobs/<job>/
    comparison.ndjson                # symlink -> main's copy
    tolerances.js                    # own copy (via git branch)
    tolerances.js                    # own copy, agent appends new tolerances
    results/deltas/                  # own compare.js output
    issues/<uuid>/                   # workspace for assigned record

../triage-agent-2/                   # same pattern on branch agent-2
```

### Shared state

- **comparison.ndjson** — symlinked into each worktree (read-only, 785MB)
- **git-bug refs** — naturally shared across worktrees (same repo). Agents file bugs directly; each works on different records so no write conflicts.

### Per-worktree state (own branch)

- **tolerances.js** — each agent's working copy
- **tolerances.js** — agent appends new tolerances (merged by orchestrator)
- **results/deltas/deltas.ndjson** — each agent's compare.js output
- **issues/<uuid>/** — analysis workspace

### Claim mechanism

Issue dir existence on main = claimed. The orchestrator runs `next-record.js` on main to pick records. Since `next-record.js` creates the issue dir, a subsequent call skips that record.

**Change to `next-record.js`**: skip records that have an issue dir (currently only skips records with `analysis.md`).

```js
// Before:
if (fs.existsSync(path.join(ISSUES_DIR, recordId, 'analysis.md'))) {
  analyzed++;
  continue;
}

// After:
const issueDir = path.join(ISSUES_DIR, recordId);
const hasAnalysis = fs.existsSync(path.join(issueDir, 'analysis.md'));
const claimed = fs.existsSync(issueDir);
if (hasAnalysis) analyzed++;
if (claimed) continue;
```

### Tolerance merging: edit-and-resolve

Agents edit `tolerances.js` directly, exactly as they do today. No structural changes needed.

The agent handles conflicts, not the orchestrator. Before the orchestrator merges, it tells the agent to rebase onto current main. The agent (Claude) resolves any conflicts in tolerances.js — it has full context about what it added and can do this intelligently. After rebase, the merge into main is a clean fast-forward.

Agent commit flow (all done by the Opus agent as part of its triage workflow):
1. Agent finishes analysis, edits tolerances.js, validates, files bugs
2. Agent commits to its branch
3. Agent rebases onto main, resolves any conflicts in tolerances.js
4. Agent updates main: `git push . HEAD:main` (with `receive.denyCurrentBranch=updateInstead`)
5. If the update fails (main moved because another agent landed first), agent rebases again and retries

The agent owns the entire rebase-resolve-update loop. The orchestrator never deals with conflicts or merging — it just waits for agents to finish and dispatches new records.

**No changes needed to**: tolerances.js structure, triage prompt, compare.js.

### Orchestrator flow

```
  ORCHESTRATOR (main worktree)

  1. Claim N records (next-record.js x N)
  2. Commit claims to main
  3. Reset agent branches to main
  4. Launch N Claude agents in parallel

  Loop:
    5. Wait for ANY agent to finish
    6. Merge agent branch into main
    7. Rerun compare.js on main (validate combined)
    8. Commit merged result
    9. Claim next record, dispatch to freed agent
    10. Repeat until no records remain
```

### Handling tolerance interactions

Each agent validates its tolerance in isolation (in its own worktree). At merge time, the orchestrator reruns compare.js on main with ALL tolerances combined. If the combined elimination count diverges significantly from the sum of individual eliminations, the orchestrator flags it for review.

In practice, tolerances are narrowly scoped (specific operations, systems, URL patterns) and rarely interact. The merge-time validation is a safety net, not a frequent intervention point.

### Agent lifecycle

For each agent, one cycle looks like:

1. Orchestrator claims a record on main (next-record.js creates issue dir)
2. Orchestrator resets agent's branch to current main (`git branch -f agent-N main`)
3. Agent's worktree updates to new branch head
4. Comparison.ndjson symlink ensured
5. Claude runs in the agent's worktree with the triage prompt
6. Claude does full analysis: reads files, searches patterns, writes tolerance to `tolerances.js`, runs compare.js, validates, files git-bug, writes analysis.md
7. Claude commits to its branch, rebases onto main, resolves any conflicts, updates main ref
8. Orchestrator detects main moved forward, reruns compare.js to validate combined tolerances
9. Agent is available for next record

## Scripts

### `prompts/setup-parallel.sh`

```bash
#!/usr/bin/env bash
set -euo pipefail

TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JOB_REL="$1"                    # e.g. jobs/2026-02-round-2
NUM_AGENTS="${2:-2}"
JOB_DIR="$TRIAGE_DIR/$JOB_REL"

cd "$TRIAGE_DIR"

for i in $(seq 1 "$NUM_AGENTS"); do
  BRANCH="agent-$i"
  WORKTREE="$TRIAGE_DIR/../triage-agent-$i"

  # Clean up any existing worktree/branch
  git worktree remove "$WORKTREE" 2>/dev/null || true
  git branch -D "$BRANCH" 2>/dev/null || true

  # Create worktree on a new branch from main
  git worktree add "$WORKTREE" -b "$BRANCH"

  # Symlink gitignored files
  ln -sf "$JOB_DIR/comparison.ndjson" "$WORKTREE/$JOB_REL/comparison.ndjson"

  echo "Created worktree: $WORKTREE (branch: $BRANCH)"
done

# Allow agents to update main from their worktrees
git config receive.denyCurrentBranch updateInstead

echo "Setup complete. $NUM_AGENTS agent worktrees ready."
```

### `prompts/parallel-triage.sh`

```bash
#!/usr/bin/env bash
set -uo pipefail

TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
JOB_REL="$1"                    # e.g. jobs/2026-02-round-2
NUM_AGENTS="${2:-2}"
JOB_DIR="$TRIAGE_DIR/$JOB_REL"
ERROR_LOG="$JOB_DIR/triage-errors.log"
ROUND=0

cd "$TRIAGE_DIR"

# --- helpers ---

claim_record() {
  # Pick next unclaimed record on main, commit the issue dir as a claim
  local output
  output=$(node engine/next-record.js --job "$JOB_REL" 2>&1) || return 1
  local issue_dir=$(echo "$output" | grep '^Issue dir:' | sed 's/^Issue dir: //')
  local record_id=$(echo "$output" | grep '^Record ID:' | sed 's/^Record ID: //')

  git add -A
  git commit -m "Claim record $record_id" --quiet

  echo "$record_id:$issue_dir"
}

dispatch_agent() {
  local agent_num=$1
  local record_id=$2
  local issue_dir=$3
  local worktree="$TRIAGE_DIR/../triage-agent-$agent_num"
  local branch="agent-$agent_num"

  # Reset agent branch to current main (gets claim + all prior tolerances)
  git branch -f "$branch" main
  git -C "$worktree" checkout -f "$branch"
  git -C "$worktree" reset --hard "$branch"

  # Ensure comparison.ndjson symlink exists
  ln -sf "$JOB_DIR/comparison.ndjson" "$worktree/$JOB_REL/comparison.ndjson"

  # Launch Claude agent in the worktree
  ROUND=$((ROUND + 1))
  echo "$(date -Is) agent-$agent_num round $ROUND: $record_id" | tee -a "$ERROR_LOG"

  ( cd "$worktree" && timeout 1200 claude -p --dangerously-skip-permissions --model opus \
      "$(cat prompts/triage-prompt.md)

Job directory: $JOB_REL. Issue directory: $issue_dir" \
      > "$JOB_DIR/triage-logs/agent-${agent_num}-round-$(printf '%04d' $ROUND).log" 2>&1
  ) &

  echo $!  # return PID
}

on_agent_done() {
  local agent_num=$1
  local branch="agent-$agent_num"

  cd "$TRIAGE_DIR"

  # Agent already rebased and updated main. Just reset our working tree.
  git reset --hard main

  # Rerun compare.js on main with combined tolerances
  node engine/compare.js --job "$JOB_REL" 2>&1 | tail -5

  # Commit updated results
  git add -A
  git commit -m "Triage: validate combined tolerances after agent-$agent_num" --quiet 2>/dev/null || true

  echo "$(date -Is) agent-$agent_num landed, deltas: $(wc -l < "$JOB_DIR/results/deltas/deltas.ndjson")" \
    | tee -a "$ERROR_LOG"
}

# --- main loop ---

declare -A PIDS      # agent_num -> PID
declare -A RECORDS   # agent_num -> record_id

mkdir -p "$JOB_DIR/triage-logs"

# Initial dispatch: claim N records on main, send to agents
for i in $(seq 1 "$NUM_AGENTS"); do
  claim_output=$(claim_record) || { echo "No more records"; break; }
  record_id="${claim_output%%:*}"
  issue_dir="${claim_output#*:}"

  pid=$(dispatch_agent "$i" "$record_id" "$issue_dir")
  PIDS[$i]=$pid
  RECORDS[$i]=$record_id
done

# Wait for agents to land on main, then redispatch
while [ ${#PIDS[@]} -gt 0 ]; do
  # Wait for any child to finish
  wait -n ${PIDS[@]} 2>/dev/null || true

  # Find which agent(s) finished
  for i in $(seq 1 "$NUM_AGENTS"); do
    pid="${PIDS[$i]:-}"
    [ -z "$pid" ] && continue
    kill -0 "$pid" 2>/dev/null && continue

    # Agent finished — sync orchestrator and validate
    on_agent_done "$i"
    unset PIDS[$i]

    # Dispatch next record to this agent
    claim_output=$(claim_record) || continue
    record_id="${claim_output%%:*}"
    issue_dir="${claim_output#*:}"

    pid=$(dispatch_agent "$i" "$record_id" "$issue_dir")
    PIDS[$i]=$pid
    RECORDS[$i]=$record_id
  done
done

echo "=== Parallel triage complete ==="
```

## Failure handling

- **Agent timeout**: Wrapped in `timeout 1200`. If it times out, the agent's branch may have partial work. The orchestrator skips the merge and moves on. The record stays claimed but unanalyzed.
- **Agent crash**: Same as timeout — no analysis.md written, record stays claimed. A cleanup pass could detect claimed-but-unanalyzed records and re-queue them.
- **Merge conflict**: The agent (Opus) rebases onto main, resolves conflicts, and updates main itself. It has full context about what it added. If the main update fails (race), it rebases again. Non-tolerance conflicts are rare (agents write to separate issue dirs).

## What doesn't change

- The triage prompt is entirely unchanged — agents edit tolerances.js exactly as before
- compare.js is unchanged
- tolerances.js structure is unchanged
- git-bug usage is unchanged (agents file bugs directly, shared refs)
- repro-request.md is unchanged (repro agents are already independent)

## Expected throughput

- Current: ~5 min/round sequential = ~12 records/hour
- With 3 agents: ~5 min analysis parallelized, agents land on main independently = ~36 records/hour (3x)
- The rebase-push is fast (~seconds). Races are resolved by the agent retrying, not the orchestrator

## Validated by synthetic test

The core git mechanics were tested in an isolated temp repo (2 worktrees, parallel appends to a shared file):

- **`receive.denyCurrentBranch=updateInstead` works** — main worktree files update on disk immediately after `git push . HEAD:main`
- **`git push . HEAD:main` only accepts fast-forwards** — agents cannot overwrite each other; a non-rebased push is rejected with `non-fast-forward`
- **Rebase surfaces conflicts cleanly** — standard conflict markers when both agents append to the same file at the same location
- **After conflict resolution + push, main has both additions** — linear history, no merge commits
- **Race condition is safe** — if main moves between rebase and push, push fails and agent can retry

## Remaining work

### 1. Triage prompt: add rebase-and-land step

Add a new **Step 7** to `prompts/triage-prompt.md` after the current Step 6 (write analysis.md):

```markdown
## Step 7: Land your changes on main

After committing your work to your branch, land it on main:

1. Run `git rebase main` to rebase your branch onto the current main
2. If there are conflicts (typically in `tolerances.js` because another agent landed while you worked):
   - Open the conflicting file and keep BOTH additions (yours and the other agent's)
   - `git add` the resolved file and `git rebase --continue`
3. Run `git push . HEAD:main` to update main with your rebased commits
4. If the push fails with "non-fast-forward" (another agent landed between your rebase and push):
   - Run `git rebase main` again to incorporate the new changes
   - Resolve any new conflicts the same way (keep both additions)
   - Retry `git push . HEAD:main`
5. Repeat until the push succeeds (rarely more than one retry)
```

This step is only relevant in the parallel workflow. For the single-agent `triage-loop.sh`, the loop itself handles committing to main, so this step is a no-op. The prompt could conditionally include it, or just always include it (rebasing onto main when already on main is harmless).

### 2. Failed agent recovery

If an agent times out or crashes, it leaves a claimed record (issue dir exists) with no `analysis.md`. The orchestrator needs to detect and handle this.

**Detection**: After an agent process exits with non-zero or timeout:
```bash
if [ ! -f "$issue_dir/analysis.md" ]; then
  echo "$(date -Is) agent-$i failed on $record_id, unclaiming" | tee -a "$ERROR_LOG"
  # Remove the issue dir so next-record.js will pick it up again
  rm -rf "$issue_dir"
  git add -A && git commit -m "Unclaim failed record $record_id" --quiet
fi
```

**In the orchestrator's main loop**, after detecting an agent finished:
```bash
# Check agent exit code
wait "$pid"
exit_code=$?

if [ "$exit_code" -ne 0 ] || [ ! -f "${ISSUE_DIRS[$i]}/analysis.md" ]; then
  # Agent failed — unclaim the record so it can be retried
  rm -rf "${ISSUE_DIRS[$i]}"
  cd "$TRIAGE_DIR"
  git add -A && git commit -m "Unclaim failed record ${RECORDS[$i]}" --quiet
fi
```

This puts the record back in the pool for another agent (or retry). The agent's partial work (if any) is discarded.

**Optional**: Track failure count per record to avoid infinite retry loops. If a record fails 3 times, mark it with a `failed-analysis.md` and skip it.

### 3. Tolerance interaction detection

When the orchestrator detects that main has moved (an agent landed), it should rerun compare.js and check whether the combined tolerance set produces unexpected results.

**After each agent lands on main**, the orchestrator:
```bash
# Sync orchestrator working tree
git reset --hard main

# Rerun compare.js with all combined tolerances
OLD_DELTAS=$(wc -l < "$JOB_DIR/results/deltas/deltas.ndjson")
node engine/compare.js --job "$JOB_REL" 2>&1 | tail -3
NEW_DELTAS=$(wc -l < "$JOB_DIR/results/deltas/deltas.ndjson")

ELIMINATED=$((OLD_DELTAS - NEW_DELTAS))
echo "$(date -Is) agent-$i landed: $OLD_DELTAS -> $NEW_DELTAS deltas ($ELIMINATED eliminated)" | tee -a "$ERROR_LOG"

# Sanity check: agent reported eliminating N records in its analysis.
# If the combined elimination is significantly MORE than expected,
# two tolerances may be interacting.
# For now, just log it — human reviews if the numbers look off.
if [ "$ELIMINATED" -gt "$((EXPECTED * 2))" ]; then
  echo "$(date -Is) WARNING: agent-$i eliminated $ELIMINATED records (expected ~$EXPECTED)" | tee -a "$ERROR_LOG"
fi

git add -A
git commit -m "Rerun compare.js after agent-$i landed ($NEW_DELTAS deltas)" --quiet 2>/dev/null || true
```

**Where does `EXPECTED` come from?** The agent writes `Records-Impacted: N` in its bug report and in `analysis.md`. The orchestrator could parse this from the analysis file:
```bash
EXPECTED=$(grep -oP 'Records-Impacted:\s*\K\d+' "$issue_dir/analysis.md" 2>/dev/null || echo 0)
```

If `ELIMINATED` is much larger than `EXPECTED`, it means the agent's tolerance combined with other tolerances to eliminate records beyond what the agent validated in isolation. This is the interaction effect we're watching for. In practice this should be rare, and logging is sufficient — a human can review the flagged rounds.
