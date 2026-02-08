#!/usr/bin/env bash
set -euo pipefail

# Run code coverage analysis by replaying comparison requests against an
# instrumented server.
#
# Usage:
#   ./engine/run-coverage.sh jobs/<job-name>
#
# Uses a lighter terminology config (fewer SNOMED editions) to fit in memory
# alongside V8 coverage instrumentation. The code paths are the same regardless
# of which editions are loaded.
#
# Prerequisites:
#   - Server dependencies installed (npm install in FHIRsmith root)
#   - c8 available (npx c8)
#
# Output:
#   - Coverage report in <job-dir>/coverage/

TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FHIRSMITH_DIR="$(cd "$TRIAGE_DIR/.." && pwd)"

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 <job-directory>"
  echo "Example: $0 jobs/2026-02-round-2"
  exit 1
fi

JOB_DIR="$TRIAGE_DIR/$1"
NDJSON="$JOB_DIR/comparison.ndjson"

if [[ ! -f "$NDJSON" ]]; then
  echo "Error: comparison.ndjson not found at $NDJSON"
  exit 1
fi

COVERAGE_DIR="$JOB_DIR/coverage"
mkdir -p "$COVERAGE_DIR"

PORT=3099  # Use a non-default port to avoid conflicts

echo "=== Code Coverage Analysis ==="
echo "  Job: $1"
echo "  Records: $(wc -l < "$NDJSON")"
echo "  Server: http://localhost:$PORT"
echo "  Output: $COVERAGE_DIR"
echo ""

# Use a lighter library config to avoid OOM (drops extra SNOMED editions)
ORIG_CONFIG="$FHIRSMITH_DIR/data/config.json"
BACKUP_CONFIG="$FHIRSMITH_DIR/data/config.json.bak"
COVERAGE_LIBRARY="$TRIAGE_DIR/engine/coverage-library.yml"

echo "1. Starting instrumented server on port $PORT..."
echo "   (using lighter library config for memory)"
cd "$FHIRSMITH_DIR"

# Swap in coverage config
cp "$ORIG_CONFIG" "$BACKUP_CONFIG"
python3 -c "
import json
with open('$ORIG_CONFIG') as f:
    cfg = json.load(f)
cfg['server']['port'] = $PORT
cfg['modules']['tx']['host'] = 'localhost:$PORT'
cfg['modules']['tx']['baseUrl'] = 'http://localhost:$PORT'
cfg['modules']['tx']['librarySource'] = 'triage/engine/coverage-library.yml'
with open('$ORIG_CONFIG', 'w') as f:
    json.dump(cfg, f, indent=2)
"

restore_config() {
  if [[ -f "$BACKUP_CONFIG" ]]; then
    mv "$BACKUP_CONFIG" "$ORIG_CONFIG"
  fi
  if kill -0 "$SERVER_PID" 2>/dev/null; then
    echo ""
    echo "Stopping server (PID $SERVER_PID)..."
    kill -INT "$SERVER_PID"
    wait "$SERVER_PID" 2>/dev/null || true
  fi
}

# V8 coverage: Node writes raw coverage to this dir on exit
export NODE_V8_COVERAGE="$COVERAGE_DIR/v8-raw"
mkdir -p "$NODE_V8_COVERAGE"

node server.js &
SERVER_PID=$!
trap restore_config EXIT

# Wait for server to be ready — terminology loading can take a couple minutes
echo "   Waiting for server to start..."
READY=0
for i in $(seq 1 300); do
  if curl -sf "http://localhost:$PORT/r4/metadata" >/dev/null 2>&1; then
    echo "   Server ready (${i}s)"
    READY=1
    break
  fi
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    echo "   Server process exited unexpectedly!"
    exit 1
  fi
  sleep 1
done

if [[ "$READY" -ne 1 ]]; then
  echo "   Server did not become ready within 300s"
  exit 1
fi

# Replay requests
echo ""
echo "2. Replaying comparison requests..."
node "$TRIAGE_DIR/engine/replay-for-coverage.js" "$NDJSON" \
  --base "http://localhost:$PORT" \
  --concurrency 20

echo ""
echo "3. Stopping server and collecting V8 coverage data..."
kill -INT "$SERVER_PID"
wait "$SERVER_PID" 2>/dev/null || true

# Restore config before running report
mv "$BACKUP_CONFIG" "$ORIG_CONFIG"

echo ""
echo "4. Generating coverage report..."
npx c8 report \
  --temp-directory "$NODE_V8_COVERAGE" \
  --report-dir "$COVERAGE_DIR" \
  --reporter html \
  --reporter text-summary \
  --src "$FHIRSMITH_DIR" \
  --include 'tx/**' \
  --exclude 'node_modules/**' \
  --exclude 'tx/data/**' \
  --exclude 'tx/tests/**'

echo ""
echo "=== Coverage report written to $COVERAGE_DIR ==="
echo "  Open $COVERAGE_DIR/index.html in a browser to view details."
