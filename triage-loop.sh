#!/usr/bin/env bash
set -uo pipefail

# Generalized triage loop. Processes records sequentially for a given priority.
#
# Usage:
#   ./triage-loop.sh P6          # Triage P6 records
#   ./triage-loop.sh P4          # Triage P4 records
#   ./triage-loop.sh             # Triage all priorities (P0, P1, P2, P3, P4, P6)

TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$TRIAGE_DIR/results/triage-logs"
ERROR_LOG="$TRIAGE_DIR/results/triage-errors.log"

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

# Determine which priorities to process
if [[ $# -gt 0 ]]; then
  PRIORITIES=("$@")
else
  PRIORITIES=(P0 P1 P2 P3 P4 P6)
fi

for PRIORITY in "${PRIORITIES[@]}"; do
  TAG=$(echo "$PRIORITY" | tr '[:upper:]' '[:lower:]')
  DELTA_FILE="$TRIAGE_DIR/results/deltas/${TAG}.ndjson"

  if [[ ! -f "$DELTA_FILE" ]]; then
    echo "No delta file for $PRIORITY ($DELTA_FILE), skipping."
    continue
  fi

  TOTAL=$(wc -l < "$DELTA_FILE")
  if [[ "$TOTAL" -eq 0 ]]; then
    echo "No records for $PRIORITY, skipping."
    continue
  fi

  echo "=== Starting triage for $PRIORITY ($TOTAL records) ==="

  # Continue from highest existing round log for this priority
  ROUND=$(ls "$LOG_DIR"/${TAG}-round-*.log 2>/dev/null | sed "s/.*${TAG}-round-0*//" | sed 's/\.log//' | sort -n | tail -1)
  ROUND=${ROUND:-0}

  while true; do
    ROUND=$((ROUND + 1))

    # Check if there are un-analyzed records left
    SAMPLE_OUTPUT=$(python3 "$TRIAGE_DIR/next-record.py" --priority "$PRIORITY" 2>&1)
    SAMPLE_EXIT=$?

    if [[ "$SAMPLE_EXIT" -ne 0 ]]; then
      echo "$(date -Is) $PRIORITY: All records analyzed. Moving on." | tee -a "$ERROR_LOG"
      break
    fi

    # Extract counts from the sample output for logging
    COUNTS_LINE=$(echo "$SAMPLE_OUTPUT" | head -1)
    echo "$(date -Is) $PRIORITY round $ROUND: $COUNTS_LINE" | tee -a "$ERROR_LOG"

    OUT_LOG="$LOG_DIR/${TAG}-round-$(printf '%04d' $ROUND).log"

    cd "$TRIAGE_DIR"
    set +o pipefail
    timeout 1200 claude -p --dangerously-skip-permissions --model opus \
      --output-format stream-json \
      "Read and follow the instructions in triage-prompt.md exactly. Triage priority: $PRIORITY" \
      2>&1 | tee "$OUT_LOG" | python3 "$TRIAGE_DIR/stream-filter.py"
    CLAUDE_EXIT=${PIPESTATUS[0]}
    set -o pipefail

    if [[ "$CLAUDE_EXIT" -eq 124 ]]; then
      echo "$(date -Is) $PRIORITY round $ROUND timed out after 20 minutes" | tee -a "$ERROR_LOG"
    fi

    echo "$(date -Is) $PRIORITY round $ROUND finished, exit=$CLAUDE_EXIT" >> "$ERROR_LOG"

    # Commit any changes from this round
    cd "$TRIAGE_DIR"
    if ! git diff --quiet 2>/dev/null || ! git diff --cached --quiet 2>/dev/null; then
      git add -A
      git commit -m "$(cat <<EOF
$PRIORITY triage round $ROUND

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
      echo "$(date -Is) $PRIORITY round $ROUND committed" >> "$ERROR_LOG"
    fi

    # Exit on Ctrl-C
    if [[ "$CLAUDE_EXIT" -eq 130 ]]; then
      echo "User interrupted, exiting."
      exit 0
    fi

    # Pause between rounds
    sleep 10
  done
done

echo "=== Triage complete ==="
