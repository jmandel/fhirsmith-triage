#!/usr/bin/env python3
"""Generate a single-file HTML bug report from git-bug tx-compare issues."""

import json
import os
import re
import subprocess
import sys
from html import escape
from datetime import datetime


def run_git_bug():
    """Fetch all tx-compare bugs from git-bug, including full comment bodies."""
    # Get bug list
    result = subprocess.run(
        ["git-bug", "bug", "-l", "tx-compare", "-f", "json"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error running git-bug list: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    bug_list = json.loads(result.stdout)

    # List JSON has comments as a count, not bodies — need show per bug
    bugs = []
    for bug_summary in bug_list:
        hid = bug_summary["human_id"]
        detail = subprocess.run(
            ["git-bug", "bug", "show", hid, "-f", "json"],
            capture_output=True, text=True
        )
        if detail.returncode != 0:
            print(f"Warning: could not fetch bug {hid}: {detail.stderr}", file=sys.stderr)
            continue
        bugs.append(json.loads(detail.stdout))

    return bugs


def classify_priority(bug):
    """Determine the priority group for a bug."""
    labels = [l.lower() for l in bug.get("labels", [])]

    for p in ["p0", "p1", "p2", "p3", "p4"]:
        if p in labels:
            return p.upper()

    # Check for temp tolerance pattern
    title = bug.get("title", "").lower()
    body = ""
    comments = bug.get("comments", [])
    if isinstance(comments, list) and len(comments) > 0:
        body = comments[0].get("message", "").lower()

    if "tolerance" in title or "tolerance" in body or "temporary" in title or "temporary" in body:
        return "Temp Tolerances"

    return "Other"


def markdown_to_html(text):
    """Convert a subset of Markdown to HTML. No external dependencies."""
    if not text:
        return ""

    lines = text.split("\n")
    html_parts = []
    in_code_block = False
    code_block_lines = []
    code_lang = ""
    in_list = None  # 'ul' or 'ol'
    list_lines = []

    def flush_list():
        nonlocal in_list, list_lines
        if not list_lines:
            return
        tag = in_list
        items = "".join(f"<li>{inline_format(l)}</li>" for l in list_lines)
        html_parts.append(f"<{tag}>{items}</{tag}>")
        list_lines = []
        in_list = None

    def inline_format(s):
        """Handle inline markdown: bold, inline code, links."""
        # Inline code (must come first to protect content inside backticks)
        parts = []
        segments = s.split("`")
        for i, seg in enumerate(segments):
            if i % 2 == 1:
                parts.append(f"<code>{escape(seg)}</code>")
            else:
                parts.append(format_non_code(seg))
        return "".join(parts)

    def format_non_code(s):
        """Format bold, italic, links in non-code text."""
        # Bold: **text** or __text__
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'__(.+?)__', r'<strong>\1</strong>', s)
        # Italic: *text* or _text_ (but not inside words for _)
        s = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'<em>\1</em>', s)
        s = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'<em>\1</em>', s)
        # Links: [text](url)
        s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank">\1</a>', s)
        return s

    i = 0
    while i < len(lines):
        line = lines[i]

        # Code block toggle
        if line.strip().startswith("```"):
            if in_code_block:
                code_content = escape("\n".join(code_block_lines))
                lang_attr = f' class="lang-{escape(code_lang)}"' if code_lang else ""
                html_parts.append(f"<pre><code{lang_attr}>{code_content}</code></pre>")
                code_block_lines = []
                code_lang = ""
                in_code_block = False
            else:
                flush_list()
                in_code_block = True
                code_lang = line.strip()[3:].strip()
            i += 1
            continue

        if in_code_block:
            code_block_lines.append(line)
            i += 1
            continue

        stripped = line.strip()

        # Blank line
        if not stripped:
            flush_list()
            i += 1
            continue

        # Headers
        header_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if header_match:
            flush_list()
            level = len(header_match.group(1))
            content = inline_format(escape(header_match.group(2)))
            html_parts.append(f"<h{level}>{content}</h{level}>")
            i += 1
            continue

        # Unordered list
        ul_match = re.match(r'^[-*+]\s+(.+)$', stripped)
        if ul_match:
            if in_list == "ol":
                flush_list()
            in_list = "ul"
            list_lines.append(escape(ul_match.group(1)))
            i += 1
            continue

        # Ordered list
        ol_match = re.match(r'^\d+[.)]\s+(.+)$', stripped)
        if ol_match:
            if in_list == "ul":
                flush_list()
            in_list = "ol"
            list_lines.append(escape(ol_match.group(1)))
            i += 1
            continue

        # Horizontal rule
        if re.match(r'^[-*_]{3,}\s*$', stripped):
            flush_list()
            html_parts.append("<hr>")
            i += 1
            continue

        # Paragraph: collect consecutive non-blank, non-special lines
        flush_list()
        para_lines = [stripped]
        i += 1
        while i < len(lines):
            nxt = lines[i].strip()
            if not nxt:
                break
            if nxt.startswith("```") or nxt.startswith("#") or re.match(r'^[-*+]\s+', nxt) or re.match(r'^\d+[.)]\s+', nxt):
                break
            para_lines.append(nxt)
            i += 1
        para_html = "<br>\n".join(inline_format(escape(l)) for l in para_lines)
        html_parts.append(f"<p>{para_html}</p>")

    # Flush remaining state
    flush_list()
    if in_code_block:
        code_content = escape("\n".join(code_block_lines))
        html_parts.append(f"<pre><code>{code_content}</code></pre>")

    return "\n".join(html_parts)


def build_bug_data(bugs):
    """Build the data structure for the HTML page."""
    priority_order = ["P0", "P1", "P2", "P3", "P4", "Temp Tolerances", "Other"]
    grouped = {p: [] for p in priority_order}

    for bug in bugs:
        priority = classify_priority(bug)
        comments = bug.get("comments", [])
        body_md = ""
        if isinstance(comments, list) and len(comments) > 0:
            body_md = comments[0].get("message", "")

        body_html = markdown_to_html(body_md)

        create_time = bug.get("create_time", {}).get("time", "")
        # Parse to a friendlier display
        date_display = create_time
        try:
            dt = datetime.fromisoformat(create_time)
            date_display = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            pass

        entry = {
            "id": bug.get("human_id", ""),
            "title": bug.get("title", ""),
            "status": bug.get("status", "open"),
            "labels": bug.get("labels", []),
            "priority": priority,
            "author": bug.get("author", {}).get("name", "Unknown"),
            "date": date_display,
            "date_iso": create_time,
            "body_md": body_md,
            "body_html": body_html,
        }
        grouped[priority].append(entry)

    # Sort each group: open first, then by date descending
    for p in priority_order:
        grouped[p].sort(key=lambda b: (0 if b["status"] == "open" else 1, b.get("date_iso", "")), reverse=False)
        # Actually: open first (0 < 1), then by date descending within status
        grouped[p].sort(key=lambda b: (0 if b["status"] == "open" else 1, ""), reverse=False)

    all_bugs = []
    for p in priority_order:
        all_bugs.extend(grouped[p])

    return all_bugs, priority_order


def generate_html(bugs, priority_order):
    """Generate the full HTML page."""
    total = len(bugs)
    open_count = sum(1 for b in bugs if b["status"] == "open")
    closed_count = total - open_count

    priority_counts = {}
    for p in priority_order:
        priority_counts[p] = sum(1 for b in bugs if b["priority"] == p)

    # Prepare bug data for embedding as JSON (without body_html rendered server-side,
    # we still embed it so JS can use it)
    bugs_json = json.dumps(bugs, ensure_ascii=False)

    stats = json.dumps({
        "total": total,
        "open": open_count,
        "closed": closed_count,
        "priorities": priority_counts,
    }, ensure_ascii=False)

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>FHIRsmith tx-compare Bug Report</title>
<style>
:root {{
  --bg: #ffffff;
  --bg-surface: #f6f8fa;
  --bg-card: #ffffff;
  --border: #d1d9e0;
  --border-light: #e8ecf0;
  --text: #1f2328;
  --text-secondary: #59636e;
  --text-muted: #818b98;
  --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
  --shadow-hover: 0 4px 12px rgba(0,0,0,0.1), 0 2px 4px rgba(0,0,0,0.06);
  --radius: 8px;
  --radius-sm: 6px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans", Helvetica, Arial, sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;

  --pill-p0-bg: #fee2e2; --pill-p0-fg: #991b1b; --pill-p0-border: #fca5a5;
  --pill-p1-bg: #ffedd5; --pill-p1-fg: #9a3412; --pill-p1-border: #fdba74;
  --pill-p2-bg: #fef3c7; --pill-p2-fg: #92400e; --pill-p2-border: #fcd34d;
  --pill-p3-bg: #dbeafe; --pill-p3-fg: #1e40af; --pill-p3-border: #93c5fd;
  --pill-p4-bg: #f1f5f9; --pill-p4-fg: #475569; --pill-p4-border: #cbd5e1;
  --pill-temp-bg: #f3e8ff; --pill-temp-fg: #6b21a8; --pill-temp-border: #c4b5fd;
  --pill-tx-bg: #ccfbf1; --pill-tx-fg: #115e59; --pill-tx-border: #5eead4;
  --pill-other-bg: #f3f4f6; --pill-other-fg: #4b5563; --pill-other-border: #d1d5db;

  --status-open-bg: #dcfce7; --status-open-fg: #166534; --status-open-border: #86efac;
  --status-closed-bg: #f3f4f6; --status-closed-fg: #6b7280; --status-closed-border: #d1d5db;
}}

@media (prefers-color-scheme: dark) {{
  :root {{
    --bg: #0d1117;
    --bg-surface: #161b22;
    --bg-card: #1c2128;
    --border: #30363d;
    --border-light: #21262d;
    --text: #e6edf3;
    --text-secondary: #8b949e;
    --text-muted: #6e7681;
    --shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
    --shadow-hover: 0 4px 12px rgba(0,0,0,0.4), 0 2px 4px rgba(0,0,0,0.3);

    --pill-p0-bg: #3b1318; --pill-p0-fg: #fca5a5; --pill-p0-border: #7f1d1d;
    --pill-p1-bg: #3b1f0b; --pill-p1-fg: #fdba74; --pill-p1-border: #7c2d12;
    --pill-p2-bg: #3b2f0b; --pill-p2-fg: #fcd34d; --pill-p2-border: #78350f;
    --pill-p3-bg: #172554; --pill-p3-fg: #93c5fd; --pill-p3-border: #1e3a5f;
    --pill-p4-bg: #1e293b; --pill-p4-fg: #94a3b8; --pill-p4-border: #334155;
    --pill-temp-bg: #2e1065; --pill-temp-fg: #c4b5fd; --pill-temp-border: #3b0764;
    --pill-tx-bg: #042f2e; --pill-tx-fg: #5eead4; --pill-tx-border: #134e4a;
    --pill-other-bg: #1f2937; --pill-other-fg: #9ca3af; --pill-other-border: #374151;

    --status-open-bg: #052e16; --status-open-fg: #86efac; --status-open-border: #14532d;
    --status-closed-bg: #1f2937; --status-closed-fg: #9ca3af; --status-closed-border: #374151;
  }}
}}

*, *::before, *::after {{ box-sizing: border-box; }}

body {{
  font-family: var(--font);
  background: var(--bg);
  color: var(--text);
  margin: 0;
  padding: 0;
  line-height: 1.6;
}}

.container {{
  max-width: 960px;
  margin: 0 auto;
  padding: 24px 16px;
}}

h1 {{
  font-size: 24px;
  font-weight: 700;
  margin: 0 0 4px 0;
}}

.subtitle {{
  color: var(--text-muted);
  font-size: 14px;
  margin: 0 0 24px 0;
}}

/* Stats bar */
.stats-bar {{
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  padding: 16px;
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
}}

.stat {{
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-secondary);
  padding: 4px 10px;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border-light);
}}

.stat-value {{
  font-weight: 700;
  color: var(--text);
  font-size: 15px;
}}

.stat-divider {{
  width: 1px;
  height: 24px;
  background: var(--border);
  margin: 0 4px;
}}

/* Search and filter bar */
.filter-bar {{
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
}}

.search-box {{
  flex: 1;
  min-width: 240px;
  padding: 8px 12px;
  font-size: 14px;
  font-family: var(--font);
  background: var(--bg-card);
  color: var(--text);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}}

.search-box:focus {{
  border-color: #3b82f6;
  box-shadow: 0 0 0 3px rgba(59,130,246,0.15);
}}

.search-box::placeholder {{
  color: var(--text-muted);
}}

.filter-pills {{
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}}

.filter-pill {{
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  transition: opacity 0.15s, transform 0.1s;
  border: 1px solid;
}}

.filter-pill:hover {{
  transform: translateY(-1px);
}}

.filter-pill.dimmed {{
  opacity: 0.35;
}}

.filter-pill .count {{
  font-weight: 400;
  opacity: 0.8;
}}

/* Priority group headers */
.group-header {{
  font-size: 16px;
  font-weight: 700;
  margin: 28px 0 12px 0;
  padding-bottom: 8px;
  border-bottom: 2px solid var(--border-light);
  display: flex;
  align-items: center;
  gap: 8px;
}}

.group-header .group-count {{
  font-size: 12px;
  font-weight: 500;
  color: var(--text-muted);
  background: var(--bg-surface);
  padding: 2px 8px;
  border-radius: 999px;
}}

.group-header.hidden {{
  display: none;
}}

/* Bug cards */
.bug-card {{
  background: var(--bg-card);
  border: 1px solid var(--border-light);
  border-radius: var(--radius);
  margin-bottom: 8px;
  box-shadow: var(--shadow);
  transition: box-shadow 0.15s, border-color 0.15s;
  overflow: hidden;
}}

.bug-card:hover {{
  box-shadow: var(--shadow-hover);
  border-color: var(--border);
}}

.bug-card.hidden {{
  display: none;
}}

.bug-header {{
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 12px 16px;
  cursor: pointer;
  user-select: none;
}}

.bug-header:hover {{
  background: var(--bg-surface);
}}

.bug-expand-icon {{
  flex-shrink: 0;
  width: 18px;
  height: 18px;
  margin-top: 2px;
  color: var(--text-muted);
  transition: transform 0.2s;
}}

.bug-card.expanded .bug-expand-icon {{
  transform: rotate(90deg);
}}

.bug-info {{
  flex: 1;
  min-width: 0;
}}

.bug-title {{
  font-size: 14px;
  font-weight: 600;
  line-height: 1.4;
  word-break: break-word;
}}

.bug-meta {{
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}}

.pill {{
  display: inline-flex;
  align-items: center;
  padding: 1px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 999px;
  border: 1px solid;
  white-space: nowrap;
}}

.pill-status-open {{
  background: var(--status-open-bg);
  color: var(--status-open-fg);
  border-color: var(--status-open-border);
}}

.pill-status-closed {{
  background: var(--status-closed-bg);
  color: var(--status-closed-fg);
  border-color: var(--status-closed-border);
}}

.pill-p0 {{ background: var(--pill-p0-bg); color: var(--pill-p0-fg); border-color: var(--pill-p0-border); }}
.pill-p1 {{ background: var(--pill-p1-bg); color: var(--pill-p1-fg); border-color: var(--pill-p1-border); }}
.pill-p2 {{ background: var(--pill-p2-bg); color: var(--pill-p2-fg); border-color: var(--pill-p2-border); }}
.pill-p3 {{ background: var(--pill-p3-bg); color: var(--pill-p3-fg); border-color: var(--pill-p3-border); }}
.pill-p4 {{ background: var(--pill-p4-bg); color: var(--pill-p4-fg); border-color: var(--pill-p4-border); }}
.pill-temp {{ background: var(--pill-temp-bg); color: var(--pill-temp-fg); border-color: var(--pill-temp-border); }}
.pill-tx-compare {{ background: var(--pill-tx-bg); color: var(--pill-tx-fg); border-color: var(--pill-tx-border); }}
.pill-other {{ background: var(--pill-other-bg); color: var(--pill-other-fg); border-color: var(--pill-other-border); }}

.bug-id {{
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}}

.bug-date {{
  font-size: 11px;
  color: var(--text-muted);
}}

.bug-body {{
  display: none;
  padding: 0 16px 16px 44px;
  border-top: 1px solid var(--border-light);
}}

.bug-card.expanded .bug-body {{
  display: block;
}}

/* Markdown rendered content */
.bug-body h1, .bug-body h2, .bug-body h3,
.bug-body h4, .bug-body h5, .bug-body h6 {{
  margin: 16px 0 8px 0;
  font-weight: 700;
  line-height: 1.3;
}}

.bug-body h1 {{ font-size: 18px; }}
.bug-body h2 {{ font-size: 16px; }}
.bug-body h3 {{ font-size: 14px; }}
.bug-body h4, .bug-body h5, .bug-body h6 {{ font-size: 13px; }}

.bug-body p {{
  margin: 8px 0;
  font-size: 13px;
  line-height: 1.65;
}}

.bug-body ul, .bug-body ol {{
  margin: 8px 0;
  padding-left: 24px;
  font-size: 13px;
}}

.bug-body li {{
  margin: 4px 0;
  line-height: 1.55;
}}

.bug-body code {{
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--bg-surface);
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid var(--border-light);
}}

.bug-body pre {{
  background: var(--bg-surface);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  padding: 12px 16px;
  overflow-x: auto;
  margin: 12px 0;
}}

.bug-body pre code {{
  background: none;
  border: none;
  padding: 0;
  font-size: 12px;
  line-height: 1.5;
}}

.bug-body hr {{
  border: none;
  border-top: 1px solid var(--border-light);
  margin: 16px 0;
}}

.bug-body strong {{
  font-weight: 700;
}}

.bug-body em {{
  font-style: italic;
}}

.bug-body a {{
  color: #3b82f6;
  text-decoration: none;
}}

.bug-body a:hover {{
  text-decoration: underline;
}}

.no-results {{
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
  font-size: 14px;
}}

.no-results.hidden {{
  display: none;
}}

/* Status filter buttons */
.status-filters {{
  display: flex;
  gap: 4px;
  margin-left: auto;
}}

.status-btn {{
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 600;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid var(--border);
  background: var(--bg-card);
  color: var(--text-secondary);
  font-family: var(--font);
  transition: background 0.15s, color 0.15s;
}}

.status-btn:hover {{
  background: var(--bg-surface);
}}

.status-btn.active {{
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
}}

@media (max-width: 640px) {{
  .container {{ padding: 16px 12px; }}
  .stats-bar {{ padding: 12px; gap: 6px; }}
  .stat-divider {{ display: none; }}
  .filter-bar {{ flex-direction: column; }}
  .search-box {{ min-width: 100%; }}
  .bug-body {{ padding: 0 12px 12px 12px; }}
  .bug-header {{ padding: 10px 12px; }}
  .status-filters {{ margin-left: 0; }}
}}
</style>
</head>
<body>
<div class="container">
  <h1>FHIRsmith tx-compare Bugs</h1>
  <p class="subtitle">Generated from git-bug &middot; <span id="gen-time"></span></p>

  <div class="stats-bar" id="stats-bar"></div>

  <div class="filter-bar">
    <input type="text" class="search-box" id="search" placeholder="Search bugs by title or body..." autocomplete="off">
    <div class="filter-pills" id="priority-filters"></div>
    <div class="status-filters" id="status-filters">
      <button class="status-btn expand-toggle" id="expand-all-btn" onclick="toggleExpandAll()">Expand all</button>
      <button class="status-btn active" data-status="all">All</button>
      <button class="status-btn" data-status="open">Open</button>
      <button class="status-btn" data-status="closed">Closed</button>
    </div>
  </div>

  <div id="bug-list"></div>
  <div class="no-results hidden" id="no-results">No bugs match your filters.</div>
</div>

<script>
const BUGS = {bugs_json};
const STATS = {stats};
const PRIORITY_ORDER = {json.dumps(priority_order)};

const PILL_CLASS_MAP = {{
  "P0": "pill-p0", "P1": "pill-p1", "P2": "pill-p2",
  "P3": "pill-p3", "P4": "pill-p4",
  "Temp Tolerances": "pill-temp",
  "tx-compare": "pill-tx-compare"
}};

function pillClass(label) {{
  return PILL_CLASS_MAP[label] || "pill-other";
}}

function labelToPillClass(label) {{
  const upper = label.toUpperCase();
  if (PILL_CLASS_MAP[upper]) return PILL_CLASS_MAP[upper];
  if (PILL_CLASS_MAP[label]) return PILL_CLASS_MAP[label];
  if (label === "tx-compare") return "pill-tx-compare";
  return "pill-other";
}}

// Render generation time
document.getElementById("gen-time").textContent = new Date().toLocaleString();

// Render stats bar
(function() {{
  const bar = document.getElementById("stats-bar");
  let html = `<div class="stat"><span class="stat-value">${{STATS.total}}</span> total</div>`;
  html += `<div class="stat-divider"></div>`;
  html += `<div class="stat"><span class="stat-value" style="color:var(--status-open-fg)">${{STATS.open}}</span> open</div>`;
  html += `<div class="stat"><span class="stat-value">${{STATS.closed}}</span> closed</div>`;
  html += `<div class="stat-divider"></div>`;
  for (const p of PRIORITY_ORDER) {{
    const c = STATS.priorities[p] || 0;
    if (c > 0) {{
      html += `<div class="stat"><span class="stat-value">${{c}}</span> ${{p}}</div>`;
    }}
  }}
  bar.innerHTML = html;
}})();

// Build priority filter pills
(function() {{
  const container = document.getElementById("priority-filters");
  let html = "";
  for (const p of PRIORITY_ORDER) {{
    const c = STATS.priorities[p] || 0;
    if (c > 0) {{
      html += `<span class="filter-pill ${{pillClass(p)}}" data-priority="${{p}}">${{p}} <span class="count">${{c}}</span></span>`;
    }}
  }}
  container.innerHTML = html;
}})();

// State
let activePriorities = new Set();
let activeStatus = "all";
let searchQuery = "";

// Build bug cards grouped by priority
(function() {{
  const list = document.getElementById("bug-list");
  let html = "";

  for (const p of PRIORITY_ORDER) {{
    const groupBugs = BUGS.filter(b => b.priority === p);
    if (groupBugs.length === 0) continue;

    html += `<div class="group-header" data-group="${{p}}">${{p}} <span class="group-count">${{groupBugs.length}}</span></div>`;

    for (const bug of groupBugs) {{
      const statusClass = bug.status === "open" ? "pill-status-open" : "pill-status-closed";
      const labels = bug.labels.map(l => `<span class="pill ${{labelToPillClass(l)}}">${{l}}</span>`).join("");

      html += `<div class="bug-card" data-priority="${{bug.priority}}" data-status="${{bug.status}}" data-id="${{bug.id}}">
        <div class="bug-header" onclick="toggleBug(this)">
          <svg class="bug-expand-icon" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
          </svg>
          <div class="bug-info">
            <div class="bug-title">${{bug.title}}</div>
            <div class="bug-meta">
              <span class="pill ${{statusClass}}">${{bug.status}}</span>
              ${{labels}}
              <span class="bug-id">${{bug.id}}</span>
              <span class="bug-date">${{bug.date}}</span>
            </div>
          </div>
        </div>
        <div class="bug-body">${{bug.body_html}}</div>
      </div>`;
    }}
  }}

  list.innerHTML = html;
}})();

function toggleBug(header) {{
  header.parentElement.classList.toggle("expanded");
}}

let allExpanded = false;
function toggleExpandAll() {{
  allExpanded = !allExpanded;
  const cards = document.querySelectorAll(".bug-card:not(.hidden)");
  cards.forEach(c => c.classList.toggle("expanded", allExpanded));
  document.getElementById("expand-all-btn").textContent = allExpanded ? "Collapse all" : "Expand all";
}}

// Filtering logic
function applyFilters() {{
  const cards = document.querySelectorAll(".bug-card");
  const groups = document.querySelectorAll(".group-header");
  const query = searchQuery.toLowerCase();
  let visibleCount = 0;
  const visibleGroups = new Set();

  cards.forEach(card => {{
    const priority = card.dataset.priority;
    const status = card.dataset.status;
    const bugId = card.dataset.id;
    const bug = BUGS.find(b => b.id === bugId);

    let show = true;

    // Priority filter
    if (activePriorities.size > 0 && !activePriorities.has(priority)) {{
      show = false;
    }}

    // Status filter
    if (activeStatus !== "all" && status !== activeStatus) {{
      show = false;
    }}

    // Search filter
    if (query && show && bug) {{
      const searchable = (bug.title + " " + bug.body_md).toLowerCase();
      if (!searchable.includes(query)) {{
        show = false;
      }}
    }}

    card.classList.toggle("hidden", !show);
    if (show) {{
      visibleCount++;
      visibleGroups.add(priority);
    }}
  }});

  // Show/hide group headers
  groups.forEach(g => {{
    g.classList.toggle("hidden", !visibleGroups.has(g.dataset.group));
  }});

  document.getElementById("no-results").classList.toggle("hidden", visibleCount > 0);
}}

// Search
document.getElementById("search").addEventListener("input", function() {{
  searchQuery = this.value;
  applyFilters();
}});

// Priority filter pills
document.querySelectorAll(".filter-pill[data-priority]").forEach(pill => {{
  pill.addEventListener("click", function() {{
    const p = this.dataset.priority;
    if (activePriorities.has(p)) {{
      activePriorities.delete(p);
      this.classList.remove("dimmed");
    }} else {{
      // If clicking to add filter: dim all others, activate this one
      if (activePriorities.size === 0) {{
        // First click: activate only this one, dim the rest
        document.querySelectorAll(".filter-pill[data-priority]").forEach(pp => {{
          if (pp.dataset.priority !== p) pp.classList.add("dimmed");
        }});
        activePriorities.add(p);
      }} else {{
        // Subsequent click: toggle this one
        activePriorities.add(p);
        this.classList.remove("dimmed");
      }}
    }}

    // If nothing is active, un-dim everything
    if (activePriorities.size === 0) {{
      document.querySelectorAll(".filter-pill[data-priority]").forEach(pp => {{
        pp.classList.remove("dimmed");
      }});
    }}

    applyFilters();
  }});
}});

// Status filter buttons
document.querySelectorAll(".status-btn[data-status]").forEach(btn => {{
  btn.addEventListener("click", function() {{
    document.querySelectorAll(".status-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    activeStatus = this.dataset.status;
    applyFilters();
  }});
}});
</script>
</body>
</html>"""

    return html


def main():
    # Determine repo root so script works from anywhere
    repo_root = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True
    ).stdout.strip()

    if not repo_root:
        # Fallback
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    os.chdir(repo_root)

    print("Fetching bugs from git-bug...", file=sys.stderr)
    bugs = run_git_bug()
    print(f"Found {len(bugs)} bugs", file=sys.stderr)

    bug_data, priority_order = build_bug_data(bugs)
    html = generate_html(bug_data, priority_order)

    # Accept optional output path as CLI argument
    if len(sys.argv) > 1:
        out_path = sys.argv[1]
        os.makedirs(os.path.dirname(out_path), exist_ok=True)
    else:
        out_dir = os.path.join(repo_root, "scripts", "tx-compare", "results")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "bugs.html")

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
