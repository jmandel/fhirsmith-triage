#!/usr/bin/env python3
"""Import archived bugs from a round's bugs.md + bugs.json back into git-bug.

Usage:
    python3 engine/import-bugs.py <bugs-dir> <round-label>

Example:
    python3 engine/import-bugs.py jobs/2026-02-round-1/bugs round:2026-02-round-1

Reads bugs.json for structured metadata (labels, status) and bugs.md for
the full body text. Creates each bug in git-bug with all original labels
plus the specified round label.
"""

import json
import re
import subprocess
import sys
import os


def parse_bugs_md(md_path):
    """Parse bugs.md to extract bug bodies keyed by human_id."""
    with open(md_path) as f:
        content = f.read()

    bugs = {}
    # Match bug headers: ### [ ] `id` title  or  ### [x] `id` title
    pattern = re.compile(
        r'^### \[[ x]\] `([a-f0-9]+)` .+?\n(.*?)(?=^### |\Z)',
        re.MULTILINE | re.DOTALL,
    )
    for m in pattern.finditer(content):
        human_id = m.group(1)
        body = m.group(2).strip()
        # Remove trailing --- separator
        body = re.sub(r'\n---\s*$', '', body)
        bugs[human_id] = body

    return bugs


def main():
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <bugs-dir> <round-label>")
        sys.exit(1)

    bugs_dir = sys.argv[1]
    round_label = sys.argv[2]

    json_path = os.path.join(bugs_dir, 'bugs.json')
    md_path = os.path.join(bugs_dir, 'bugs.md')

    with open(json_path) as f:
        bugs_json = json.load(f)

    bodies = parse_bugs_md(md_path)

    print(f"Found {len(bugs_json)} bugs in JSON, {len(bodies)} bodies in MD")

    created = 0
    errors = 0
    for bug in bugs_json:
        hid = bug['human_id']
        title = bug['title']
        labels = bug.get('labels', [])
        status = bug['status']
        body = bodies.get(hid, f"(No body found in archive for {hid})")

        # Prepend original ID as reference
        body = f"Original-Bug-ID: {hid}\n\n{body}"

        # Create the bug
        result = subprocess.run(
            ['git-bug', 'bug', 'new', '-t', title, '-F', '-', '--non-interactive'],
            input=body,
            capture_output=True,
            text=True,
        )
        if result.returncode != 0:
            print(f"  ERROR creating {hid}: {result.stderr.strip()}")
            errors += 1
            continue

        # Extract new bug ID from output
        new_id = result.stdout.strip()
        # git-bug new outputs something like "abc1234\tNew bug created"
        new_id = new_id.split()[0] if new_id else None
        if not new_id:
            print(f"  ERROR: no ID returned for {hid}")
            errors += 1
            continue

        print(f"  Created {new_id} (was {hid}): {title[:60]}")

        # Add all original labels + round label
        all_labels = list(labels) + [round_label]
        for label in all_labels:
            subprocess.run(
                ['git-bug', 'bug', 'label', 'new', new_id, label],
                capture_output=True,
                text=True,
            )

        # Close if it was closed
        if status == 'closed':
            subprocess.run(
                ['git-bug', 'bug', 'status', 'close', new_id],
                capture_output=True,
                text=True,
            )
            print(f"    Closed {new_id}")

        created += 1

    print(f"\nDone: {created} created, {errors} errors")


if __name__ == '__main__':
    main()
