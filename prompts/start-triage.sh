#!/usr/bin/env bash
set -euo pipefail

# Start a new triage job. Bugs persist across rounds (never wiped).
#
# Usage:
#   ./prompts/start-triage.sh <job-name> <comparison-ndjson>
#
# Example:
#   ./prompts/start-triage.sh 2026-02-round-1 /path/to/comparison.ndjson
#
# This will:
#   1. Label any unlabeled bugs with previous round name (round:<prev-job>)
#   2. Snapshot all git-bugs to the most recent previous job's bugs/ dir
#   3. Create jobs/<job-name>/
#   4. Copy baseline tolerances into the job dir
#   5. Copy (or symlink) comparison.ndjson into the job dir
#   6. Run compare.js to produce fresh deltas.ndjson
#   7. Commit the clean starting state
#
# Bugs are NEVER cleared between rounds. Each bug gets a round: label
# indicating which round created it. Bug reports include all rounds
# but the HTML report defaults to filtering by the current round.

# Resolve triage root (parent of prompts/)
TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <job-name> [comparison-ndjson]"
  echo "Example: $0 2026-02-round-1 /path/to/comparison.ndjson"
  echo ""
  echo "If comparison-ndjson is omitted, jobs/<job-name>/comparison.ndjson must already exist."
  exit 1
fi

JOB_NAME="$1"
JOB_DIR="$TRIAGE_DIR/jobs/$JOB_NAME"

cd "$TRIAGE_DIR"

if [[ -d "$JOB_DIR" ]]; then
  echo "Error: job directory already exists: $JOB_DIR"
  exit 1
fi

echo "=== Starting triage job: $JOB_NAME ==="
echo "  Directory: jobs/$JOB_NAME"
echo ""

# 1. Label unlabeled bugs with previous round name (before dumping, so dump captures labels)
PREV_JOB=$(ls -dt "$TRIAGE_DIR"/jobs/*/ 2>/dev/null | head -1 || true)
if [[ -n "$PREV_JOB" ]]; then
  PREV_JOB_NAME=$(basename "$PREV_JOB")
  ROUND_LABEL="round:$PREV_JOB_NAME"
  echo "1. Labeling unlabeled bugs with $ROUND_LABEL..."
  LABELED=0
  while IFS= read -r line; do
    BUG_HID=$(echo "$line" | python3 -c "import json,sys; print(json.load(sys.stdin)['human_id'])")
    BUG_LABELS=$(echo "$line" | python3 -c "import json,sys; print(' '.join(json.load(sys.stdin).get('labels',[])))")
    if ! echo "$BUG_LABELS" | grep -q "round:"; then
      git-bug bug label new "$BUG_HID" "$ROUND_LABEL"
      LABELED=$((LABELED + 1))
    fi
  done < <(git-bug bug -f json 2>/dev/null | python3 -c "import json,sys; [print(json.dumps(b)) for b in json.load(sys.stdin)]")
  echo "   Labeled $LABELED bugs with $ROUND_LABEL"
else
  echo "1. No previous job found, skipping bug labeling."
fi

# 2. Snapshot all git-bugs to the most recent previous job
if [[ -n "$PREV_JOB" ]]; then
  BUG_COUNT=$(git-bug bug 2>/dev/null | wc -l || echo 0)
  if [[ "$BUG_COUNT" -gt 0 ]]; then
    BUGS_DIR="$PREV_JOB/bugs"
    echo "2. Snapshotting $BUG_COUNT bugs to $(basename "$PREV_JOB")/bugs/..."
    mkdir -p "$BUGS_DIR"
    bash engine/dump-bugs.sh "$BUGS_DIR/bugs.md"
    python3 engine/dump-bugs-html.py "$BUGS_DIR/bugs.html" --job "$PREV_JOB"
    git-bug bug -l tx-compare -f json > "$BUGS_DIR/bugs.json" 2>/dev/null || true
  else
    echo "2. No existing bugs to snapshot."
  fi
else
  echo "2. No previous job found, skipping bug snapshot."
fi

# 3. Create job directory
echo "3. Creating jobs/$JOB_NAME/..."
mkdir -p "$JOB_DIR"

# 4. Copy baseline tolerances
echo "4. Copying baseline tolerances..."
cp baseline/tolerances.js "$JOB_DIR/tolerances.js"

# 5. Copy comparison data
if [[ $# -ge 2 ]]; then
  INPUT_FILE="$2"
  echo "5. Copying comparison data from $INPUT_FILE..."
  cp "$INPUT_FILE" "$JOB_DIR/comparison.ndjson"
elif [[ -f "$TRIAGE_DIR/comparison.ndjson" ]]; then
  echo "5. Copying comparison data from existing comparison.ndjson..."
  cp "$TRIAGE_DIR/comparison.ndjson" "$JOB_DIR/comparison.ndjson"
else
  echo "Error: no comparison.ndjson provided and none found at triage root."
  exit 1
fi

# 6. Run compare.js
echo "6. Running compare.js..."
node engine/compare.js --job "jobs/$JOB_NAME"

echo ""
echo "7. Committing clean starting state..."
git add -A
git commit -m "$(cat <<EOF
Start triage job $JOB_NAME

Reset tolerances to baseline, fresh comparison run.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"

echo ""
echo "=== Ready for triage ==="
echo "  Job: jobs/$JOB_NAME"
echo "  Tolerances: baseline ($(grep -c "^  {" "$JOB_DIR/tolerances.js") tolerances)"
DELTA_COUNT=$(wc -l < "$JOB_DIR/results/deltas/deltas.ndjson")
echo "  Delta records: $DELTA_COUNT"
echo ""
echo "Run ./prompts/triage-loop.sh jobs/$JOB_NAME to start automated triage."
