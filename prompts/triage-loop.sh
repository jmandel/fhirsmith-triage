#!/usr/bin/env bash
set -uo pipefail

# Triage loop. Processes records sequentially from a job's deltas.ndjson.
#
# Usage:
#   ./prompts/triage-loop.sh jobs/<job-name>

# Resolve triage root (parent of prompts/)
TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <job-directory>"
  echo "Example: $0 jobs/2026-02-round-1"
  exit 1
fi

JOB_DIR="$TRIAGE_DIR/$1"
if [[ ! -d "$JOB_DIR" ]]; then
  echo "Error: job directory not found: $JOB_DIR"
  exit 1
fi

LOG_DIR="$JOB_DIR/triage-logs"
ERROR_LOG="$JOB_DIR/triage-errors.log"

mkdir -p "$LOG_DIR"

# Prevent multiple instances
LOCKFILE="$TRIAGE_DIR/.triage.lock"
if [ -f "$LOCKFILE" ]; then
  OTHER_PID=$(cat "$LOCKFILE")
  if kill -0 "$OTHER_PID" 2>/dev/null; then
    echo "Another loop is running (PID $OTHER_PID). Exiting."
    exit 1
  fi
fi
echo $$ > "$LOCKFILE"
cleanup() { rm -f "$LOCKFILE"; }
trap cleanup EXIT

# Continue from highest existing round log
ROUND=$(ls "$LOG_DIR"/round-*.log 2>/dev/null | sed 's/.*round-0*//' | sed 's/\.log//' | sort -n | tail -1)
ROUND=${ROUND:-0}

while true; do
  ROUND=$((ROUND + 1))

  # Pick next un-analyzed record (creates issue dir)
  PICKER_OUTPUT=$(node "$TRIAGE_DIR/engine/next-record.js" --job "$1" 2>&1)
  PICKER_EXIT=$?

  if [[ "$PICKER_EXIT" -ne 0 ]]; then
    echo "$(date -Is) All records analyzed. Done." | tee -a "$ERROR_LOG"
    break
  fi

  # Extract counts and issue dir from picker output
  COUNTS_LINE=$(echo "$PICKER_OUTPUT" | head -1)
  ISSUE_DIR=$(echo "$PICKER_OUTPUT" | grep '^Issue dir:' | sed 's/^Issue dir: //')
  echo "$(date -Is) round $ROUND: $COUNTS_LINE (dir: $ISSUE_DIR)" | tee -a "$ERROR_LOG"

  OUT_LOG="$LOG_DIR/round-$(printf '%04d' $ROUND).log"

  cd "$TRIAGE_DIR"
  set +o pipefail
  timeout 1200 claude -p --dangerously-skip-permissions --model opus \
    --output-format stream-json \
    "$(cat prompts/triage-prompt.md)

Job directory: $1. Issue directory: $ISSUE_DIR" \
    2>&1 | tee "$OUT_LOG" | python3 "$TRIAGE_DIR/engine/stream-filter.py"
  CLAUDE_EXIT=${PIPESTATUS[0]}
  set -o pipefail

  if [[ "$CLAUDE_EXIT" -eq 124 ]]; then
    echo "$(date -Is) round $ROUND timed out after 20 minutes" | tee -a "$ERROR_LOG"
  fi

  echo "$(date -Is) round $ROUND finished, exit=$CLAUDE_EXIT" >> "$ERROR_LOG"

  # Commit any changes from this round
  cd "$TRIAGE_DIR"
  if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
    git add -A
    git commit -m "$(cat <<EOF
Triage round $ROUND ($1)

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
    echo "$(date -Is) round $ROUND committed" >> "$ERROR_LOG"

    # Label any new bugs (without a round: label) with current round
    JOB_NAME=$(basename "$JOB_DIR")
    ROUND_LABEL="round:$JOB_NAME"
    while IFS= read -r line; do
      BUG_HID=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['human_id'])")
      BUG_LABELS=$(echo "$line" | python3 -c "import json,sys; print(' '.join(json.load(sys.stdin).get('labels',[])))")
      if ! echo "$BUG_LABELS" | grep -q "round:"; then
        git-bug bug label new "$BUG_HID" "$ROUND_LABEL" 2>/dev/null || true
      fi
    done < <(git-bug bug -f json 2>/dev/null | python3 -c "import json,sys; [print(json.dumps(b)) for b in json.load(sys.stdin)]")

    # Dump bugs snapshot after each round
    BUGS_DIR="$JOB_DIR/bugs"
    mkdir -p "$BUGS_DIR"
    BUG_COUNT=$(git-bug bug 2>/dev/null | wc -l || echo 0)
    if [[ "$BUG_COUNT" -gt 0 ]]; then
      bash "$TRIAGE_DIR/engine/dump-bugs.sh" "$BUGS_DIR/bugs.md" 2>/dev/null
      python3 "$TRIAGE_DIR/engine/dump-bugs-html.py" "$BUGS_DIR/bugs.html" --job "$JOB_DIR" 2>/dev/null
      git-bug bug -l tx-compare -f json > "$BUGS_DIR/bugs.json" 2>/dev/null || true
    fi
  fi

  # Exit on Ctrl-C
  if [[ "$CLAUDE_EXIT" -eq 130 ]]; then
    echo "User interrupted, exiting."
    exit 0
  fi

  # Pause between rounds
  sleep 3
done

echo "=== Triage complete ==="
