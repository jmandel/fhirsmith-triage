#!/usr/bin/env python3
"""Pick the next un-analyzed record from a priority delta file.

Reads the delta file sequentially and returns the first record whose
MD5 hash is not already in the analyzed file. Exits 1 if all records
have been analyzed.

Usage:
    python3 next-record.py --priority P6
    python3 next-record.py --input results/deltas/p6.ndjson --analyzed results/p6-analyzed.txt
"""
import sys
import argparse
import hashlib
import json
import os

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))


def main():
    parser = argparse.ArgumentParser(description="Pick next un-analyzed triage record")
    parser.add_argument("--priority", help="Priority level (e.g. P6). Derives file paths automatically.")
    parser.add_argument("--input", help="Path to delta NDJSON file (overrides --priority)")
    parser.add_argument("--analyzed", help="Path to analyzed ledger file (overrides --priority)")
    args = parser.parse_args()

    if args.input and args.analyzed:
        delta_file = args.input
        analyzed_file = args.analyzed
    elif args.priority:
        tag = args.priority.lower()
        delta_file = os.path.join(SCRIPT_DIR, f"results/deltas/{tag}.ndjson")
        analyzed_file = os.path.join(SCRIPT_DIR, f"results/{tag}-analyzed.txt")
    else:
        parser.error("Provide either --priority or both --input and --analyzed")

    if not os.path.exists(delta_file):
        print(f"Delta file not found: {delta_file}", file=sys.stderr)
        sys.exit(1)

    # Load analyzed hashes
    analyzed = set()
    if os.path.exists(analyzed_file):
        with open(analyzed_file) as f:
            for line in f:
                line = line.strip()
                if line:
                    analyzed.add(line.split(":")[0].strip())

    # Read delta file sequentially, find first un-analyzed
    total = 0
    with open(delta_file) as f:
        for lineno_0, line in enumerate(f):
            raw = line.strip()
            if not raw:
                continue
            total += 1
            md5 = hashlib.md5(raw.encode()).hexdigest()
            if md5 not in analyzed:
                rec = json.loads(raw)
                record_id = rec.get("id", "?")
                # Count remaining (including this one)
                remaining = total - len(analyzed)
                # Count rest of file
                for rest_line in f:
                    if rest_line.strip():
                        total += 1
                remaining = total - len(analyzed)

                print(f"Record: {lineno_0 + 1}/{total} ({len(analyzed)} analyzed, {remaining} remaining)")
                print(f"MD5: {md5}")
                print(f"Record ID: {record_id}")
                print(f"URL: {rec.get('url', '?')}")
                print(f"Method: {rec.get('method', '?')}")
                print(f"Prod status: {rec.get('prodStatus', rec.get('prod', {}).get('status', '?'))}")
                print(f"Dev status: {rec.get('devStatus', rec.get('dev', {}).get('status', '?'))}")
                print(f"Lookup: grep -n '{record_id}' comparison.ndjson")
                print(f"---RECORD---")
                print(raw)
                sys.exit(0)

    if total == 0:
        print(f"Delta file is empty: {delta_file}", file=sys.stderr)
    else:
        print(f"All {total} records have been analyzed!", file=sys.stderr)
    sys.exit(1)


if __name__ == "__main__":
    main()
