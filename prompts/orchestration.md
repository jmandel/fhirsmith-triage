# Triage + Repro Orchestration

Instructions for running the automated triage loop with parallel repro agents. This is designed to be managed by a coordinating Claude Code session.

## Overview

Two concurrent workstreams run in parallel:

1. **Triage loop** — a background shell script that picks unanalyzed delta records one at a time, invokes a Claude agent to analyze each, writes tolerances, files git-bugs, and commits after each round.
2. **Repro agents** — launched on-demand as new bugs are filed. Each agent takes one bug, reconstructs the HTTP request from comparison data, tests it against live servers, and edits the bug with a `## Repro` section.

The coordinating session starts the loop, runs a continuous background watcher, and launches repro agents as bugs appear.

## Prerequisites

- A triage job already initialized via `prompts/start-triage.sh`
- `git-bug` configured with a user
- Access to `https://tx.fhir.org` (prod) and `https://tx-dev.fhir.org` (dev)

## Step 1: Start the triage loop

Check for and remove any stale lockfile. The loop cleans up via `trap EXIT`, but this won't fire if the process was killed with SIGKILL (e.g., a background task from a terminated Claude Code session):

```bash
cat .triage.lock 2>/dev/null && kill -0 $(cat .triage.lock) 2>/dev/null && echo "Running" || rm -f .triage.lock
```

Start the loop as a background Bash task:

```bash
bash prompts/triage-loop.sh jobs/<job-name>
```

## Step 2: Start the commit watcher

Run a continuous background watcher that polls for open bugs needing repro:

```bash
while true; do
  sleep 30
  git-bug bug -l tx-compare -s open -f json 2>/dev/null | python3 -c "
import sys, json
bugs = json.load(sys.stdin)
for bug in bugs:
    labels = bug.get('labels', [])
    hid = bug.get('human_id', '')
    title = bug.get('title', '')
    skip = ['reproduced','no-repro-needed','not-reproduced','repro-inconclusive','wont-fix']
    if not any(l in labels for l in skip):
        print(f'{hid}|{title}')
" 2>/dev/null | while IFS='|' read -r hid title; do
    echo "$(date -Is) NEEDS REPRO: $hid $title"
  done
done
```

This runs as a background Bash task. When it emits output, the coordinating session gets a notification and should launch a repro agent. The watcher is continuous — no need to re-launch after each round.

**Important**: `git-bug bug -f json` outputs a **JSON array**, not newline-delimited JSON. Always parse with `json.load(sys.stdin)`, never line-by-line.

## Step 3: Launch repro agents

When the watcher reports bugs needing repro, launch one Bash agent per bug. Use `subagent_type: "Bash"`, `model: "opus"`, and `run_in_background: true`. Launch all pending bugs in parallel.

The prompt for each agent should include:
- The bug ID and job directory
- An instruction to read `prompts/repro-request.md` and follow its step-by-step workflow

The repro agents handle everything end-to-end: reading the bug, constructing curl commands, testing against live servers, editing the bug with a `## Repro` section, and labeling the outcome (`reproduced`, `not-reproduced`, or `repro-inconclusive`).

Do NOT launch duplicate agents for the same bug.

## Repro outcome labels

| Label | Meaning | Action |
|-------|---------|--------|
| `reproduced` | Confirmed live on servers | Bug stays open |
| `not-reproduced` | Servers have converged, bug no longer present | Close the bug |
| `repro-inconclusive` | Couldn't set up conditions (missing request body, custom CodeSystem no longer loaded, inline ValueSet via tx-resource) | Bug stays open |
| `no-repro-needed` | Not a code bug — e.g., version-skew (different terminology editions loaded on prod vs dev) | Bug stays open, also add `version-skew` and `wont-fix` |

The triage agent is responsible for adding `no-repro-needed` / `version-skew` / `wont-fix` at bug creation time (see triage-prompt.md). The watcher treats all of these as "handled" and won't flag them for repro.

## Step 4: Regenerate reports

After repro agents complete, regenerate the bug reports:

```bash
python3 engine/dump-bugs-html.py jobs/<job-name>/bugs/bugs.html --job jobs/<job-name>
bash engine/dump-bugs.sh jobs/<job-name>/bugs/bugs.md
git-bug bug -l tx-compare -f json > jobs/<job-name>/bugs/bugs.json
```

The triage loop also regenerates reports after each round, so this is mainly needed after repro agents finish (their edits don't trigger a loop commit).

## Cadence

The triage loop runs ~3-5 minutes per round. Each round may:
- Add to an existing bug's tolerance (no new bug filed)
- File a new bug with a new tolerance

Repro agents take ~1-2 minutes each. They complete faster than triage files new bugs, so launching a batch whenever the watcher reports new bugs keeps up easily.

## Stopping

The triage loop exits when all delta records are analyzed. To stop early:
- `Ctrl-C` the background process
- Or `kill $(cat .triage.lock)`

The loop commits after each round, so stopping mid-session loses no work.
