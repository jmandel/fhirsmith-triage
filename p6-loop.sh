#!/usr/bin/env bash
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ANALYZED="$SCRIPT_DIR/results/p6-analyzed.txt"
P6_FILE="$SCRIPT_DIR/results/deltas/p6.ndjson"
LOG_DIR="$SCRIPT_DIR/results/p6-triage-logs"
ERROR_LOG="$SCRIPT_DIR/results/p6-triage-errors.log"

mkdir -p "$LOG_DIR"

# Prevent multiple instances
LOCKFILE="$ROOT/.p6-triage.lock"
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
  P6_COUNT=$(wc -l < "$P6_FILE")
  ANALYZED_COUNT=0
  if [[ -f "$ANALYZED" ]]; then
    ANALYZED_COUNT=$(wc -l < "$ANALYZED")
  fi

  echo "$(date -Is) Round $ROUND: $P6_COUNT P6 records, $ANALYZED_COUNT analyzed so far" | tee -a "$ERROR_LOG"

  if [[ "$P6_COUNT" -eq 0 ]]; then
    echo "No P6 records remaining. Done!"
    break
  fi

  OUT_LOG="$LOG_DIR/round-$(printf '%04d' $ROUND).log"

  cd "$ROOT"
  set +o pipefail
  timeout 1200 claude -p --dangerously-skip-permissions --model opus \
    --output-format stream-json \
    "Read and follow the instructions in scripts/tx-compare/P6-triage.md exactly." \
    2>&1 | tee "$OUT_LOG" | python3 "$SCRIPT_DIR/stream-filter.py"
  CLAUDE_EXIT=${PIPESTATUS[0]}
  set -o pipefail

  if [[ "$CLAUDE_EXIT" -eq 124 ]]; then
    echo "$(date -Is) Round $ROUND timed out after 20 minutes" | tee -a "$ERROR_LOG"
  fi

  echo "$(date -Is) Round $ROUND finished, exit=$CLAUDE_EXIT" >> "$ERROR_LOG"

  # Commit any changes from this round
  cd "$ROOT"
  if ! git diff --quiet scripts/ 2>/dev/null || ! git diff --cached --quiet scripts/ 2>/dev/null; then
    git add scripts/tx-compare/
    git commit -m "$(cat <<EOF
P6 triage round $ROUND

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
    echo "$(date -Is) Round $ROUND committed" >> "$ERROR_LOG"
  fi

  # Exit on Ctrl-C
  if [[ "$CLAUDE_EXIT" -eq 130 ]]; then
    echo "User interrupted, exiting."
    break
  fi

  # Pause between rounds to avoid hammering APIs on repeated failures
  sleep 10
done
