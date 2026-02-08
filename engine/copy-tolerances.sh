#!/usr/bin/env bash
set -euo pipefail

# Copy tolerances from one round to another, prefixing any bare bugIds
# with the source round name so the origin round is always recorded.
#
# Usage:
#   bash engine/copy-tolerances.sh <source-job> <dest-job>
#
# Example:
#   bash engine/copy-tolerances.sh jobs/2026-02-round-2 jobs/2026-02-round-3
#
# What this does:
#   1. Copies tolerances.js from source to dest
#   2. Any temp-tolerance bugId that doesn't already have a round prefix
#      (e.g., bugId: '9fd2328') gets prefixed with the source round name
#      (e.g., bugId: 'round-2-bug-id:9fd2328')
#   3. Existing prefixed bugIds (e.g., 'round-1-bug-id:e9c7e58') are untouched

TRIAGE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ $# -ne 2 ]]; then
  echo "Usage: $0 <source-job-dir> <dest-job-dir>"
  echo "Example: $0 jobs/2026-02-round-2 jobs/2026-02-round-3"
  exit 1
fi

SRC_DIR="$TRIAGE_DIR/$1"
DEST_DIR="$TRIAGE_DIR/$2"
SRC_FILE="$SRC_DIR/tolerances.js"
DEST_FILE="$DEST_DIR/tolerances.js"

if [[ ! -f "$SRC_FILE" ]]; then
  echo "Error: source tolerances not found: $SRC_FILE"
  exit 1
fi

if [[ ! -d "$DEST_DIR" ]]; then
  echo "Error: destination job directory not found: $DEST_DIR"
  echo "  Run start-triage.sh first to create the job directory."
  exit 1
fi

# Derive a round prefix from the source job name
# e.g., "2026-02-round-2" -> "round-2-bug-id"
SRC_JOB_NAME=$(basename "$SRC_DIR")
# Extract the round number/identifier from the job name
# Handles patterns like "2026-02-round-2" -> "round-2" and "round-1" -> "round-1"
ROUND_ID=$(echo "$SRC_JOB_NAME" | grep -oP 'round-\d+' || echo "$SRC_JOB_NAME")
PREFIX="${ROUND_ID}-bug-id"

echo "=== Copying tolerances ==="
echo "  From: $1/tolerances.js"
echo "  To:   $2/tolerances.js"
echo "  Prefix for bare bugIds: '$PREFIX:<id>'"
echo ""

# Use python to do the prefixing since it handles the JS string matching cleanly
python3 - "$SRC_FILE" "$DEST_FILE" "$PREFIX" << 'PYEOF'
import re
import sys

src_path, dest_path, prefix = sys.argv[1], sys.argv[2], sys.argv[3]

with open(src_path) as f:
    content = f.read()

# Match bugId: '<value>' where value does NOT already contain a round prefix
# The pattern: bugId: 'someHexId' (no hyphen-separated prefix like 'round-N-bug-id:')
# Already-prefixed: bugId: 'round-1-bug-id:e9c7e58'
# Bare (needs prefix): bugId: '9fd2328'
bare_bugid_re = re.compile(r"(bugId:\s*')([a-f0-9]{7})'")

count = 0
def add_prefix(m):
    global count
    count += 1
    return f"{m.group(1)}{prefix}:{m.group(2)}'"

content = bare_bugid_re.sub(add_prefix, content)

with open(dest_path, 'w') as f:
    f.write(content)

# Count tolerances for reporting
temp_count = len(re.findall(r"kind:\s*'temp-tolerance'", content))
equiv_count = len(re.findall(r"kind:\s*'equiv-autofix'", content))
total_bugids = len(re.findall(r"bugId:", content))

print(f"  Prefixed {count} bare bugIds with '{prefix}:'")
print(f"  Tolerances: {temp_count} temp-tolerance, {equiv_count} equiv-autofix")
print(f"  Total bugId references: {total_bugids}")
print(f"\nWrote {dest_path}")
PYEOF
