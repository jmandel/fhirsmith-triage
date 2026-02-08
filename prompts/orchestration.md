# Triage + Repro Orchestration

Instructions for running the automated triage loop with parallel repro agents. This is designed to be managed by a human or a coordinating Claude Code session.

## Overview

Two concurrent workstreams run in parallel:

1. **Triage loop** — an automated shell script that picks unanalyzed delta records one at a time, invokes a Claude agent to analyze each, writes tolerances, files git-bugs, and commits after each round.
2. **Repro agents** — launched on-demand as new bugs are filed. Each agent takes one bug, reconstructs the HTTP request from comparison data, tests it against live servers, and edits the bug with a `## Repro` section.

## Prerequisites

- A triage job already initialized via `prompts/start-triage.sh`
- `git-bug` configured with a user
- Access to `https://tx.fhir.org` (prod) and `https://tx-dev.fhir.org` (dev)

## Step 1: Start the triage loop

Check for and remove any stale lockfile:

```bash
cat .triage.lock 2>/dev/null && kill -0 $(cat .triage.lock) 2>/dev/null && echo "Running" || rm -f .triage.lock
```

Start the loop as a background process:

```bash
bash prompts/triage-loop.sh jobs/<job-name>
```

Monitor progress via:
- `tail -f jobs/<job-name>/triage-errors.log` — round-by-round status with timestamps and delta counts
- `wc -l jobs/<job-name>/results/deltas/deltas.ndjson` — current delta count

## Step 2: Monitor and launch repro agents

### Option A: Round-commit watcher (recommended for coordinating sessions)

Set up a background watcher that blocks until the next triage round commits, then reports any bugs needing repro:

```bash
LOG=jobs/<job-name>/triage-errors.log
SEEN=$(grep -c "committed" "$LOG" 2>/dev/null || echo 0)
while true; do
  sleep 5
  COUNT=$(grep -c "committed" "$LOG" 2>/dev/null || echo 0)
  if [ "$COUNT" -gt "$SEEN" ]; then
    echo "=== Round committed (#$COUNT) ==="
    tail -3 "$LOG"
    echo ""
    echo "=== Bugs needing repro ==="
    for bug_id in $(git-bug bug 2>/dev/null | grep "open" | awk '{print $1}'); do
      has_label=$(git-bug bug show "$bug_id" | grep -c "reproduced\|repro-inconclusive\|not-reproduced" || true)
      if [ "$has_label" -eq 0 ]; then
        echo "NEEDS REPRO: $bug_id  $(git-bug bug 2>/dev/null | grep $bug_id)"
      fi
    done
    echo "=== Done ==="
    break
  fi
done
```

Run this as a background Bash task. When a round commits, the task completes and notifies you. Launch repro agents for any listed bugs, then set up a new watcher (updating `SEEN` to the current commit count). This avoids manual polling.

### Option B: Manual polling

Periodically check for open bugs that lack a repro label:

```bash
for bug_id in $(git-bug bug | grep "open" | awk '{print $1}'); do
  has_label=$(git-bug bug show "$bug_id" | grep -c "reproduced\|repro-inconclusive\|not-reproduced" || true)
  if [ "$has_label" -eq 0 ]; then
    echo "NEEDS REPRO: $bug_id  $(git-bug bug | grep $bug_id)"
  fi
done
```

### Launching repro agents

For each bug needing repro, use the Task tool with `subagent_type: "general-purpose"`, `model: "opus"`, and `run_in_background: true`. Include the full repro-request.md contents and the bug ID/job directory in the prompt. Launch one agent per bug — do NOT launch duplicate agents for the same bug via different methods.

## Step 3: Label completed repros

The repro-request.md prompt instructs agents to add labels themselves (Step 5 of that prompt). If agents were launched before that instruction was added, manually backfill:

```bash
# For bugs with ## Repro section but no label:
git-bug bug label new <BUG_ID> "reproduced"
```

## Repro outcome labels

| Label | Meaning | Action |
|-------|---------|--------|
| `reproduced` | Confirmed live on servers | Bug stays open |
| `not-reproduced` | Servers have converged, bug no longer present | Close the bug |
| `repro-inconclusive` | Couldn't set up conditions (missing request body, custom CodeSystem no longer loaded, inline ValueSet via tx-resource) | Bug stays open |

## Step 4: Regenerate reports

After repro agents complete, regenerate the HTML bug report:

```bash
python3 engine/dump-bugs-html.py jobs/<job-name>/bugs/bugs.html --job jobs/<job-name>
bash engine/dump-bugs.sh jobs/<job-name>/bugs/bugs.md
git-bug bug -l tx-compare -f json > jobs/<job-name>/bugs/bugs.json
```

## Cadence

The triage loop runs ~3-5 minutes per round. Each round may:
- Add to an existing bug's tolerance (no new bug filed)
- File a new bug with a new tolerance

Repro agents take ~1-3 minutes each. They complete faster than the triage loop files new bugs, so launching a batch after every few triage rounds keeps up easily.

A typical session:
1. Start triage loop
2. Wait for 5-10 rounds to accumulate bugs
3. Launch repro agents for all unlabeled bugs
4. Repeat steps 2-3 until triage loop completes or you stop it
5. Final report regeneration

## Stopping

The triage loop exits when all delta records are analyzed. To stop early:
- `Ctrl-C` the background process
- Or `kill $(cat .triage.lock)`

The loop commits after each round, so stopping mid-session loses no work.
