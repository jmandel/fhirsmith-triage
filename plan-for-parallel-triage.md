  ---
  1. Tolerance loading from tolerances.d/

  Add to the end of tolerances.js:

  // Load per-issue tolerance files (for parallel triage)
  const _tolDir = path.join(__dirname, 'tolerances.d');
  if (fs.existsSync(_tolDir)) {
    for (const f of fs.readdirSync(_tolDir).sort()) {
      if (f.endsWith('.js'))
        tolerances.push(...require(path.join(_tolDir, f)));
    }
  }

  Each agent writes tolerances.d/<tolerance-id>.js:
  module.exports = [{
    id: 'loinc-answer-list-expand-404',
    description: '...',
    kind: 'temp-tolerance',
    bugId: 'e18fdef',
    match({ record }) {
      return record.comparison?.category === 'missing-resource'
        && record.url.includes('ValueSet/$expand') ? 'skip' : null;
    },
  }];

  This completely eliminates merge conflicts on tolerances — agents never edit the same file.

  2. Modified next-record.js — claim by issue dir

  // Change this:
  const analysisFile = path.join(ISSUES_DIR, recordId, 'analysis.md');
  if (fs.existsSync(analysisFile)) {
    analyzed++;
    continue;
  }

  // To this:
  const issueDir = path.join(ISSUES_DIR, recordId);
  const hasAnalysis = fs.existsSync(path.join(issueDir, 'analysis.md'));
  const claimed = fs.existsSync(issueDir);
  if (hasAnalysis) analyzed++;
  if (claimed) continue;  // skip both analyzed AND claimed-but-in-progress

  3. prompts/setup-parallel.sh

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

    # Create tolerances.d/ in the worktree
    mkdir -p "$WORKTREE/$JOB_REL/tolerances.d"

    echo "Created worktree: $WORKTREE (branch: $BRANCH)"
  done

  # Ensure tolerances.d/ exists on main too
  mkdir -p "$JOB_DIR/tolerances.d"
  echo "Setup complete. $NUM_AGENTS agent worktrees ready."

  4. prompts/parallel-triage.sh — orchestrator

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
    # In worktree, update to new branch head
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

  merge_agent() {
    local agent_num=$1
    local branch="agent-$agent_num"

    cd "$TRIAGE_DIR"

    # Merge agent's branch (new files in issues/ and tolerances.d/)
    git merge "$branch" --no-edit -m "Merge agent-$agent_num" --quiet || {
      echo "$(date -Is) CONFLICT merging agent-$agent_num — resolve manually" | tee -a "$ERROR_LOG"
      return 1
    }

    # Rerun compare.js on main with combined tolerances
    node engine/compare.js --job "$JOB_REL" 2>&1 | tail -5

    # Commit updated results
    git add -A
    git commit -m "Triage: validate combined tolerances after agent-$agent_num" --quiet 2>/dev/null || true

    echo "$(date -Is) agent-$agent_num merged, deltas: $(wc -l < "$JOB_DIR/results/deltas/deltas.ndjson")" \
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

  # Wait for agents, merge, redispatch
  while [ ${#PIDS[@]} -gt 0 ]; do
    # Wait for any child to finish
    wait -n ${PIDS[@]} 2>/dev/null || true

    # Find which agent(s) finished
    for i in $(seq 1 "$NUM_AGENTS"); do
      pid="${PIDS[$i]:-}"
      [ -z "$pid" ] && continue
      kill -0 "$pid" 2>/dev/null && continue

      # Agent finished — merge its work
      merge_agent "$i"
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

  5. Triage prompt change

  Add one line to Step 5:

  Write your new tolerance to <job-dir>/tolerances.d/<tolerance-id>.js as a module.exports = [{ ... }] array. Do NOT edit tolerances.js directly —
   it loads from tolerances.d/ automatically.

  ---
  What this gives you:
  - 2-3 agents analyzing records in parallel (the slow part)
  - No merge conflicts (separate files in tolerances.d/)
  - Claims via issue dir on main (no duplicate work)
  - Combined validation at merge time (catches tolerance interactions)
  - git-bug works naturally (shared refs)
  - comparison.ndjson shared via symlink (no 785MB duplication)

  Known rough edges to polish:
  - The git branch -f / reset --hard dance for resetting agent branches needs testing
  - If an agent fails mid-analysis, its claimed record has no analysis.md — needs a cleanup/retry mechanism
  - The merge-time compare.js validation could be smarter about detecting interaction effects (compare elimination counts)

  Want to refine any of these pieces, or shall I start implementing?

