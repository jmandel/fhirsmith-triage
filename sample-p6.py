#!/usr/bin/env python3
"""Pick a random un-analyzed P6 record. Outputs summary, line number, MD5, and the full JSON."""
import sys
import random
import hashlib
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
P6_FILE = os.path.join(SCRIPT_DIR, "results/deltas/p6.ndjson")
ANALYZED_FILE = os.path.join(SCRIPT_DIR, "results/p6-analyzed.txt")

# Load analyzed hashes
analyzed = set()
if os.path.exists(ANALYZED_FILE):
    with open(ANALYZED_FILE) as f:
        for line in f:
            line = line.strip()
            if line:
                analyzed.add(line.split(":")[0].strip())

# Load all P6 lines with their line numbers
with open(P6_FILE) as f:
    lines = [(i + 1, line) for i, line in enumerate(f)]

total = len(lines)
remaining = 0

# Shuffle and find first un-analyzed
random.shuffle(lines)
for lineno, line in lines:
    raw = line.strip()
    if not raw:
        continue
    md5 = hashlib.md5(raw.encode()).hexdigest()
    if md5 not in analyzed:
        remaining += 1

# Reset and find one
random.shuffle(lines)
for lineno, line in lines:
    raw = line.strip()
    if not raw:
        continue
    md5 = hashlib.md5(raw.encode()).hexdigest()
    if md5 not in analyzed:
        rec = json.loads(raw)
        record_id = rec.get('id', '?')
        print(f"Line: {lineno}/{total} ({len(analyzed)} analyzed, ~{remaining} remaining)")
        print(f"MD5: {md5}")
        print(f"Record ID: {record_id}")
        print(f"URL: {rec.get('url', '?')}")
        print(f"Method: {rec.get('method', '?')}")
        print(f"Prod status: {rec.get('prodStatus', '?')}")
        print(f"Dev status: {rec.get('devStatus', '?')}")
        print(f"Lookup: grep -n '{record_id}' comparison.ndjson")
        print(f"---RECORD---")
        print(raw)
        sys.exit(0)

print("All records have been analyzed!", file=sys.stderr)
sys.exit(1)
