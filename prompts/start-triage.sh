#!/usr/bin/env bash
set -euo pipefail

# Start a new triage job from a clean state.
#
# Usage:
#   ./prompts/start-triage.sh <job-name> <comparison-ndjson>
#
# Example:
#   ./prompts/start-triage.sh 2026-02-round-1 /path/to/comparison.ndjson
#
# This will:
#   1. Dump existing git-bugs to the most recent previous job's bugs/ dir
#   2. Create jobs/<job-name>/
#   3. Copy baseline tolerances into the job dir
#   4. Copy (or symlink) comparison.ndjson into the job dir
#   5. Wipe all git-bugs
#   6. Run compare.js to produce fresh deltas.ndjson
#   7. Commit the clean starting state

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

# 1. Dump existing git-bugs to the most recent previous job
PREV_JOB=$(ls -dt "$TRIAGE_DIR"/jobs/*/ 2>/dev/null | head -1 || true)
if [[ -n "$PREV_JOB" ]]; then
  BUG_COUNT=$(git-bug bug 2>/dev/null | wc -l || echo 0)
  if [[ "$BUG_COUNT" -gt 0 ]]; then
    BUGS_DIR="$PREV_JOB/bugs"
    echo "1. Dumping $BUG_COUNT bugs to $(basename "$PREV_JOB")/bugs/..."
    mkdir -p "$BUGS_DIR"
    bash engine/dump-bugs.sh "$BUGS_DIR/bugs.md"
    python3 engine/dump-bugs-html.py "$BUGS_DIR/bugs.html"
    git-bug bug -l tx-compare -f json > "$BUGS_DIR/bugs.json" 2>/dev/null || true
  else
    echo "1. No existing bugs to dump."
  fi
else
  echo "1. No previous job found, skipping bug dump."
fi

# 2. Create job directory
echo "2. Creating jobs/$JOB_NAME/..."
mkdir -p "$JOB_DIR"

# 3. Copy baseline tolerances
echo "3. Copying baseline tolerances..."
cp baseline/tolerances.js "$JOB_DIR/tolerances.js"

# 4. Copy comparison data
if [[ $# -ge 2 ]]; then
  INPUT_FILE="$2"
  echo "4. Copying comparison data from $INPUT_FILE..."
  cp "$INPUT_FILE" "$JOB_DIR/comparison.ndjson"
elif [[ -f "$TRIAGE_DIR/comparison.ndjson" ]]; then
  echo "4. Copying comparison data from existing comparison.ndjson..."
  cp "$TRIAGE_DIR/comparison.ndjson" "$JOB_DIR/comparison.ndjson"
else
  echo "Error: no comparison.ndjson provided and none found at triage root."
  exit 1
fi

# 5. Wipe git-bugs
echo "5. Wiping git-bugs..."
git-bug wipe

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
