#!/usr/bin/env bash
# Dump all tx-compare bugs to a clean markdown file
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT="${1:-$SCRIPT_DIR/results/bugs.md}"

# Collect all tx-compare bug IDs
ALL_IDS=$(git-bug bug 2>&1 | awk '{print $1}')
TX_IDS=()
for id in $ALL_IDS; do
  if git-bug bug show "$id" 2>&1 | grep -q "^labels:.*tx-compare"; then
    TX_IDS+=("$id")
  fi
done

python3 - "${TX_IDS[@]}" "$OUT" << 'PYEOF'
import subprocess, sys, re

ids = sys.argv[1:-1]
out_path = sys.argv[-1]

bugs = []
for bug_id in ids:
    show = subprocess.run(["git-bug", "bug", "show", bug_id],
                          capture_output=True, text=True).stdout
    lines = show.strip().split("\n")

    # First line: ID [status] Title
    m = re.match(r'(\S+)\s+\[(\w+)\]\s+(.*)', lines[0])
    title = m.group(3) if m else lines[0]
    status = m.group(2) if m else "?"

    # Labels
    labels = []
    for l in lines:
        if l.startswith("labels:"):
            labels = [x.strip() for x in l.replace("labels:", "").split(",") if x.strip()]

    # Body: everything after the "  <hash> #0 ..." line
    body_lines = []
    in_body = False
    for l in lines:
        if in_body:
            body_lines.append(l[2:] if l.startswith("  ") else l)
        elif re.match(r'  [a-f0-9]{7} #0', l):
            in_body = True

    body = "\n".join(body_lines).strip()

    # Determine priority from labels
    priority = None
    for p in ["P0", "P1", "P2", "P3", "P4", "P6"]:
        if p in labels:
            priority = p
            break

    # Check if it's a temp-tolerance bug
    is_temp = "temporary" in body.lower() or "temp-tolerance" in body.lower() or "tolerance" in title.lower()
    if not priority and is_temp:
        priority = "temp"

    bugs.append({
        "id": bug_id[:7],
        "title": title,
        "status": status,
        "labels": labels,
        "body": body,
        "priority": priority or "other",
    })

# Group
groups = {
    "P0": ("P0 -- Dev crashes on valid input", []),
    "P1": ("P1 -- Result boolean disagrees", []),
    "P2": ("P2 -- Dev crashes on bad input", []),
    "P3": ("P3 -- Missing resources", []),
    "P4": ("P4 -- Status code mismatch", []),
    "P6": ("P6 -- Content differences", []),
    "temp": ("Temporary tolerances (real bugs, suppressed for triage)", []),
    "other": ("Other", []),
}
for b in bugs:
    groups[b["priority"]][1].append(b)

with open(out_path, "w") as f:
    f.write("# tx-compare Bug Report\n\n")
    total = len(bugs)
    open_count = sum(1 for b in bugs if b["status"] == "open")
    closed_count = total - open_count
    f.write(f"_{total} bugs ({open_count} open, {closed_count} closed)_\n\n")

    # Summary table
    f.write("| Priority | Count | Description |\n")
    f.write("|----------|-------|-------------|\n")
    for key in ["P0", "P1", "P2", "P3", "P4", "P6", "temp"]:
        heading, items = groups[key]
        if items:
            f.write(f"| {key.upper()} | {len(items)} | {heading.split(' -- ', 1)[-1] if ' -- ' in heading else heading} |\n")
    f.write("\n---\n\n")

    for key in ["P0", "P1", "P2", "P3", "P4", "P6", "temp", "other"]:
        heading, items = groups[key]
        if not items:
            continue
        f.write(f"## {heading}\n\n")
        for b in items:
            status_mark = "x" if b["status"] == "closed" else " "
            f.write(f"### [{status_mark}] `{b['id']}` {b['title']}\n\n")
            # Demote any headings in body (## -> ####, # -> ###) to avoid clashing
            body = b["body"]
            body = re.sub(r'^#{1,3} ', lambda m: '#' * (len(m.group()) + 2), body, flags=re.MULTILINE)
            f.write(f"{body}\n\n---\n\n")

print(f"Wrote {total} bugs to {out_path}")
PYEOF
