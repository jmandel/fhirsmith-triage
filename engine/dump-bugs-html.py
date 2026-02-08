#!/usr/bin/env python3
"""Generate a single-file HTML bug report from git-bug tx-compare issues.

Parses Records-Impacted from bug body headers to show impact counts.
Optionally reads job summary.json for pipeline overview stats.

Usage:
  python3 engine/dump-bugs-html.py <output-path> [--job <job-dir>]
"""

import json
import os
import re
import subprocess
import sys
from html import escape
from datetime import datetime


def run_git_bug():
    """Fetch all tx-compare bugs from git-bug, including full comment bodies."""
    result = subprocess.run(
        ["git-bug", "bug", "-l", "tx-compare", "-f", "json"],
        capture_output=True, text=True
    )
    if result.returncode != 0:
        print(f"Error running git-bug list: {result.stderr}", file=sys.stderr)
        sys.exit(1)

    bug_list = json.loads(result.stdout)

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
        """Handle inline markdown: bold, inline code, links.
        Expects RAW text (not pre-escaped). Escapes internally.
        Links are extracted first so that backtick-containing link text
        like [`file.js#L10`](url) is handled correctly."""
        # First pass: extract markdown links (which may contain backticks)
        link_re = re.compile(r'\[([^\]]+)\]\(([^)]+)\)')
        link_placeholder = []
        def replace_link(m):
            idx = len(link_placeholder)
            link_text = m.group(1)
            link_url = m.group(2)
            # Render backtick-wrapped text inside link as <code>
            inner = re.sub(r'`([^`]+)`', lambda cm: f'<code>{escape(cm.group(1))}</code>',
                           escape(link_text) if '`' not in link_text else link_text)
            if '`' in link_text:
                # Re-escape non-code parts only
                parts = []
                for j, seg in enumerate(link_text.split('`')):
                    if j % 2 == 1:
                        parts.append(f'<code>{escape(seg)}</code>')
                    else:
                        parts.append(escape(seg))
                inner = ''.join(parts)
            link_placeholder.append(f'<a href="{escape(link_url)}" target="_blank">{inner}</a>')
            return f'\x00LINK{idx}\x00'
        s = link_re.sub(replace_link, s)

        # Second pass: handle backtick code spans and other inline formatting
        parts = []
        segments = s.split("`")
        for i, seg in enumerate(segments):
            if i % 2 == 1:
                parts.append(f"<code>{escape(seg)}</code>")
            else:
                parts.append(format_non_code(escape(seg)))
        result = "".join(parts)

        # Restore link placeholders
        for idx, link_html in enumerate(link_placeholder):
            result = result.replace(f'\x00LINK{idx}\x00', link_html)
        return result

    def format_non_code(s):
        """Format bold, italic, links in non-code text."""
        s = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', s)
        s = re.sub(r'__(.+?)__', r'<strong>\1</strong>', s)
        s = re.sub(r'(?<!\w)\*(.+?)\*(?!\w)', r'<em>\1</em>', s)
        s = re.sub(r'(?<!\w)_(.+?)_(?!\w)', r'<em>\1</em>', s)
        # Markdown links (already handled in first pass, but keep as fallback)
        s = re.sub(r'\[([^\]]+)\]\(([^)]+)\)', r'<a href="\2" target="_blank">\1</a>', s)
        # Auto-link bare URLs not already inside an href
        s = re.sub(r'(?<!href=")(?<!">)(https?://[^\s<>\)]+)', r'<a href="\1" target="_blank">\1</a>', s)
        return s

    i = 0
    while i < len(lines):
        line = lines[i]

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

        if not stripped:
            flush_list()
            i += 1
            continue

        header_match = re.match(r'^(#{1,6})\s+(.+)$', stripped)
        if header_match:
            flush_list()
            level = len(header_match.group(1))
            content = inline_format(header_match.group(2))
            html_parts.append(f"<h{level}>{content}</h{level}>")
            i += 1
            continue

        ul_match = re.match(r'^[-*+]\s+(.+)$', stripped)
        if ul_match:
            if in_list == "ol":
                flush_list()
            in_list = "ul"
            list_lines.append(ul_match.group(1))
            i += 1
            continue

        ol_match = re.match(r'^\d+[.)]\s+(.+)$', stripped)
        if ol_match:
            if in_list == "ul":
                flush_list()
            in_list = "ol"
            list_lines.append(ol_match.group(1))
            i += 1
            continue

        if re.match(r'^[-*_]{3,}\s*$', stripped):
            flush_list()
            html_parts.append("<hr>")
            i += 1
            continue

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
        para_html = "<br>\n".join(inline_format(l) for l in para_lines)
        html_parts.append(f"<p>{para_html}</p>")

    flush_list()
    if in_code_block:
        code_content = escape("\n".join(code_block_lines))
        html_parts.append(f"<pre><code>{code_content}</code></pre>")

    return "\n".join(html_parts)


def read_job_stats(job_dir):
    """Read pipeline stats from a job's summary.json."""
    summary_path = os.path.join(job_dir, "results", "summary.json")

    if not os.path.exists(summary_path):
        return None

    with open(summary_path) as f:
        summary = json.load(f)

    ok = summary.get("okBreakdown", {})
    skip_by_kind = summary.get("skippedByKind", {})
    categories = summary.get("categories", {})
    deltas = sum(v for k, v in categories.items() if k != "OK")

    return {
        "total": summary.get("totalRecords", 0),
        "matchedPerfectly": ok.get("strict", 0),
        "matchedEquiv": ok.get("equiv-autofix", 0) + skip_by_kind.get("equiv-autofix", 0),
        "knownIssues": ok.get("temp-tolerance", 0) + skip_by_kind.get("temp-tolerance", 0),
        "untriaged": deltas,
    }


def build_bug_data(bugs):
    """Build the data structure for the HTML page."""
    bug_data = []

    for bug in bugs:
        comments = bug.get("comments", [])
        body_md = ""
        if isinstance(comments, list) and len(comments) > 0:
            body_md = comments[0].get("message", "")

        body_html = markdown_to_html(body_md)

        create_time = bug.get("create_time", {}).get("time", "")
        edit_time = bug.get("edit_time", {}).get("time", "")
        # Prefer edit_time (last update) for display and sorting
        display_time = edit_time or create_time
        date_display = display_time
        try:
            dt = datetime.fromisoformat(display_time)
            date_display = dt.strftime("%Y-%m-%d %H:%M")
        except (ValueError, TypeError):
            pass

        hid = bug.get("human_id", "")
        labels = bug.get("labels", [])

        # Extract impact from bug body header (Records-Impacted: N)
        impact = None
        impact_match = re.search(r'^Records-Impacted:\s*(\d+)', body_md, re.MULTILINE)
        if impact_match:
            impact = int(impact_match.group(1))

        entry = {
            "id": hid,
            "title": bug.get("title", ""),
            "status": bug.get("status", "open"),
            "labels": labels,
            "author": bug.get("author", {}).get("name", "Unknown"),
            "date": date_display,
            "date_iso": display_time,
            "body_md": body_md,
            "body_html": body_html,
            "impact": impact,  # null if unknown
        }
        bug_data.append(entry)

    # Default sort: open first, then by impact (highest first), then by date
    bug_data.sort(key=lambda b: (
        0 if b["status"] == "open" else 1,
        -(b["impact"] or 0),
        b.get("date_iso", ""),
    ))

    return bug_data


def generate_html(bugs, job_stats=None):
    """Generate the full HTML page."""
    total = len(bugs)
    open_count = sum(1 for b in bugs if b["status"] == "open")
    closed_count = total - open_count

    # Collect all unique labels and their counts
    label_counts = {}
    for b in bugs:
        for l in b["labels"]:
            label_counts[l] = label_counts.get(l, 0) + 1
    # Sort labels: most common first
    sorted_labels = sorted(label_counts.keys(), key=lambda l: -label_counts[l])

    bugs_json = json.dumps(bugs, ensure_ascii=False)

    stats = json.dumps({
        "total": total,
        "open": open_count,
        "closed": closed_count,
        "labels": label_counts,
        "sortedLabels": sorted_labels,
        "job": job_stats,
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

  --pill-tx-bg: #ccfbf1; --pill-tx-fg: #115e59; --pill-tx-border: #5eead4;
  --pill-default-bg: #f3f4f6; --pill-default-fg: #4b5563; --pill-default-border: #d1d5db;

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

    --pill-tx-bg: #042f2e; --pill-tx-fg: #5eead4; --pill-tx-border: #134e4a;
    --pill-default-bg: #1f2937; --pill-default-fg: #9ca3af; --pill-default-border: #374151;

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

.filter-bar {{
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-bottom: 20px;
  align-items: center;
}}

.search-box {{
  flex: 1;
  min-width: 200px;
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
  border: 1px solid var(--pill-default-border);
  background: var(--pill-default-bg);
  color: var(--pill-default-fg);
}}

.filter-pill[data-label="tx-compare"] {{
  background: var(--pill-tx-bg);
  color: var(--pill-tx-fg);
  border-color: var(--pill-tx-border);
}}

.filter-pill:hover {{
  transform: translateY(-1px);
}}

.filter-pill.active {{
  box-shadow: 0 0 0 2px var(--text);
}}

.filter-pill.dimmed {{
  opacity: 0.35;
}}

.filter-pill .count {{
  font-weight: 400;
  opacity: 0.8;
}}

.controls {{
  display: flex;
  gap: 4px;
  margin-left: auto;
  flex-wrap: wrap;
}}

.ctrl-btn {{
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

.ctrl-btn:hover {{
  background: var(--bg-surface);
}}

.ctrl-btn.active {{
  background: var(--text);
  color: var(--bg);
  border-color: var(--text);
}}

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

.pill-label {{
  background: var(--pill-default-bg);
  color: var(--pill-default-fg);
  border-color: var(--pill-default-border);
}}

.pill-label[data-label="tx-compare"] {{
  background: var(--pill-tx-bg);
  color: var(--pill-tx-fg);
  border-color: var(--pill-tx-border);
}}

.pill-impact {{
  background: #fef3c7;
  color: #92400e;
  border-color: #fcd34d;
  font-family: var(--font-mono);
  font-size: 10px;
}}

@media (prefers-color-scheme: dark) {{
  .pill-impact {{
    background: #3b2f0b;
    color: #fcd34d;
    border-color: #78350f;
  }}
}}

.bug-id {{
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}}

.copy-btn {{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  padding: 0;
  border: 1px solid var(--border-light);
  border-radius: 4px;
  background: var(--bg-card);
  color: var(--text-muted);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s;
}}

.copy-btn:hover {{
  background: var(--bg-surface);
  color: var(--text-secondary);
  border-color: var(--border);
}}

.copy-btn.copied {{
  color: var(--status-open-fg);
  border-color: var(--status-open-border);
  background: var(--status-open-bg);
  animation: copy-flash 0.3s ease-out;
}}

@keyframes copy-flash {{
  0% {{ transform: scale(1.3); }}
  100% {{ transform: scale(1); }}
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

.bug-body strong {{ font-weight: 700; }}
.bug-body em {{ font-style: italic; }}
.bug-body a {{ color: #3b82f6; text-decoration: none; }}
.bug-body a:hover {{ text-decoration: underline; }}

.no-results {{
  text-align: center;
  padding: 48px 16px;
  color: var(--text-muted);
  font-size: 14px;
}}

.no-results.hidden {{
  display: none;
}}

.pipeline-bar {{
  display: flex;
  gap: 0;
  margin-bottom: 12px;
  border-radius: var(--radius);
  overflow: hidden;
  border: 1px solid var(--border-light);
  font-size: 12px;
  line-height: 1.3;
}}

.pipeline-bar:empty {{
  display: none;
}}

.pipeline-seg {{
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 10px 8px;
  min-width: 0;
  text-align: center;
}}

.pipeline-seg .seg-value {{
  font-weight: 700;
  font-size: 16px;
  font-family: var(--font-mono);
}}

.pipeline-seg .seg-label {{
  font-size: 10px;
  opacity: 0.8;
  margin-top: 2px;
}}

.seg-perfect {{ background: #dcfce7; color: #166534; }}
.seg-equiv {{ background: #dbeafe; color: #1e40af; }}
.seg-known {{ background: #fef3c7; color: #92400e; }}
.seg-untriaged {{ background: #fee2e2; color: #991b1b; }}

@media (prefers-color-scheme: dark) {{
  .seg-perfect {{ background: #052e16; color: #86efac; }}
  .seg-equiv {{ background: #172554; color: #93c5fd; }}
  .seg-known {{ background: #3b2f0b; color: #fcd34d; }}
  .seg-untriaged {{ background: #450a0a; color: #fca5a5; }}
}}

@media (max-width: 640px) {{
  .container {{ padding: 16px 12px; }}
  .stats-bar {{ padding: 12px; gap: 6px; }}
  .stat-divider {{ display: none; }}
  .filter-bar {{ flex-direction: column; }}
  .search-box {{ min-width: 100%; }}
  .bug-body {{ padding: 0 12px 12px 12px; }}
  .bug-header {{ padding: 10px 12px; }}
  .controls {{ margin-left: 0; }}
  .pipeline-bar {{ font-size: 10px; }}
  .pipeline-seg .seg-value {{ font-size: 13px; }}
}}
</style>
</head>
<body>
<div class="container">
  <h1>FHIRsmith tx-compare Bugs</h1>
  <p class="subtitle">Generated from git-bug &middot; <span id="gen-time"></span></p>

  <div class="pipeline-bar" id="pipeline-bar"></div>
  <div class="stats-bar" id="stats-bar"></div>

  <div class="filter-bar">
    <input type="text" class="search-box" id="search" placeholder="Search bugs by title or body..." autocomplete="off">
    <div class="filter-pills" id="label-filters"></div>
    <div class="controls">
      <button class="ctrl-btn" id="expand-all-btn" onclick="toggleExpandAll()">Expand all</button>
      <span class="stat-divider"></span>
      <button class="ctrl-btn active" data-status="all">All</button>
      <button class="ctrl-btn" data-status="open">Open</button>
      <button class="ctrl-btn" data-status="closed">Closed</button>
      <span class="stat-divider"></span>
      <button class="ctrl-btn sort-btn active" data-sort="impact">Impact</button>
      <button class="ctrl-btn sort-btn" data-sort="date">Date</button>
      <button class="ctrl-btn sort-btn" data-sort="title">Title</button>
    </div>
  </div>

  <div id="bug-list"></div>
  <div class="no-results hidden" id="no-results">No bugs match your filters.</div>
</div>

<script>
const BUGS = {bugs_json};
const STATS = {stats};

document.getElementById("gen-time").textContent = new Date().toLocaleString();

// Pipeline overview bar
(function() {{
  const job = STATS.job;
  if (!job) return;
  const bar = document.getElementById("pipeline-bar");
  const segs = [
    {{ value: job.matchedPerfectly, label: "matched perfectly", cls: "seg-perfect" }},
    {{ value: job.matchedEquiv, label: "considered equivalent by Claude", cls: "seg-equiv" }},
    {{ value: job.knownIssues, label: "considered mismatches by Claude; bugs listed below", cls: "seg-known" }},
    {{ value: job.untriaged, label: "untriaged", cls: "seg-untriaged" }},
  ];
  const total = job.total;
  let html = "";
  for (const s of segs) {{
    if (s.value === 0) continue;
    const pct = (s.value / total * 100);
    html += `<div class="pipeline-seg ${{s.cls}}" style="flex:${{s.value}}">
      <span class="seg-value">${{s.value.toLocaleString()}}</span>
      <span class="seg-label">${{s.label}}</span>
    </div>`;
  }}
  bar.innerHTML = html;
}})();

// Stats bar
(function() {{
  const bar = document.getElementById("stats-bar");
  let html = `<div class="stat"><span class="stat-value">${{STATS.total}}</span> bugs total</div>`;
  html += `<div class="stat-divider"></div>`;
  html += `<div class="stat"><span class="stat-value" style="color:var(--status-open-fg)">${{STATS.open}}</span> open</div>`;
  html += `<div class="stat"><span class="stat-value">${{STATS.closed}}</span> closed</div>`;
  bar.innerHTML = html;
}})();

// Label filter pills
(function() {{
  const container = document.getElementById("label-filters");
  let html = "";
  for (const label of STATS.sortedLabels) {{
    const c = STATS.labels[label] || 0;
    html += `<span class="filter-pill" data-label="${{label}}">${{label}} <span class="count">${{c}}</span></span>`;
  }}
  container.innerHTML = html;
}})();

// State
let activeLabels = new Set();
let activeStatus = "all";
let searchQuery = "";
let currentSort = "impact";

function renderBugList() {{
  const list = document.getElementById("bug-list");
  // Sort bugs
  const sorted = [...BUGS];
  if (currentSort === "impact") {{
    sorted.sort((a, b) => (b.impact || 0) - (a.impact || 0) || a.title.localeCompare(b.title));
  }} else if (currentSort === "date") {{
    sorted.sort((a, b) => (b.date_iso || "").localeCompare(a.date_iso || ""));
  }} else if (currentSort === "title") {{
    sorted.sort((a, b) => a.title.localeCompare(b.title));
  }}

  let html = "";
  for (const bug of sorted) {{
    const statusClass = bug.status === "open" ? "pill-status-open" : "pill-status-closed";
    const labels = bug.labels.map(l => `<span class="pill pill-label" data-label="${{l}}">${{l}}</span>`).join("");
    const impactPill = bug.impact ? `<span class="pill pill-impact">${{bug.impact.toLocaleString()}} records</span>` : "";

    html += `<div class="bug-card" data-status="${{bug.status}}" data-id="${{bug.id}}" data-labels="${{bug.labels.join(",")}}" data-impact="${{bug.impact || 0}}">
      <div class="bug-header" onclick="toggleBug(this)">
        <svg class="bug-expand-icon" viewBox="0 0 16 16" fill="currentColor">
          <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"/>
        </svg>
        <div class="bug-info">
          <div class="bug-title">${{bug.title}}</div>
          <div class="bug-meta">
            <button class="copy-btn" title="Copy title and ID" onclick="event.stopPropagation(); copyBug(this, '${{bug.id}}')">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor"><path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25Z"/><path d="M5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25Z"/></svg>
            </button>
            <span class="pill ${{statusClass}}">${{bug.status}}</span>
            ${{labels}}
            ${{impactPill}}
            <span class="bug-id">${{bug.id}}</span>
            <span class="bug-date">updated ${{bug.date}}</span>
          </div>
        </div>
      </div>
      <div class="bug-body">${{bug.body_html}}</div>
    </div>`;
  }}

  list.innerHTML = html;
  applyFilters();
}}

function toggleBug(header) {{
  header.parentElement.classList.toggle("expanded");
}}

function copyBug(btn, bugId) {{
  const bug = BUGS.find(b => b.id === bugId);
  if (!bug) return;
  const text = bug.title + " (" + bugId + ")";
  navigator.clipboard.writeText(text).then(() => {{
    btn.classList.add("copied");
    setTimeout(() => btn.classList.remove("copied"), 1500);
  }});
}}

let allExpanded = false;
function toggleExpandAll() {{
  allExpanded = !allExpanded;
  const cards = document.querySelectorAll(".bug-card:not(.hidden)");
  cards.forEach(c => c.classList.toggle("expanded", allExpanded));
  document.getElementById("expand-all-btn").textContent = allExpanded ? "Collapse all" : "Expand all";
}}

function applyFilters() {{
  const cards = document.querySelectorAll(".bug-card");
  const query = searchQuery.toLowerCase();
  let visibleCount = 0;

  cards.forEach(card => {{
    const status = card.dataset.status;
    const cardLabels = card.dataset.labels ? card.dataset.labels.split(",") : [];
    const bugId = card.dataset.id;
    const bug = BUGS.find(b => b.id === bugId);

    let show = true;

    // Label filter: card must have at least one of the active labels
    if (activeLabels.size > 0) {{
      if (!cardLabels.some(l => activeLabels.has(l))) {{
        show = false;
      }}
    }}

    if (activeStatus !== "all" && status !== activeStatus) {{
      show = false;
    }}

    if (query && show && bug) {{
      const searchable = (bug.title + " " + bug.body_md + " " + bug.labels.join(" ")).toLowerCase();
      if (!searchable.includes(query)) {{
        show = false;
      }}
    }}

    card.classList.toggle("hidden", !show);
    if (show) visibleCount++;
  }});

  document.getElementById("no-results").classList.toggle("hidden", visibleCount > 0);
}}

// Search
document.getElementById("search").addEventListener("input", function() {{
  searchQuery = this.value;
  applyFilters();
}});

// Label filter pills — derive all visuals from activeLabels set
function updatePillVisuals() {{
  document.querySelectorAll(".filter-pill[data-label]").forEach(pill => {{
    const label = pill.dataset.label;
    if (activeLabels.size === 0) {{
      pill.classList.remove("dimmed", "active");
    }} else if (activeLabels.has(label)) {{
      pill.classList.remove("dimmed");
      pill.classList.add("active");
    }} else {{
      pill.classList.add("dimmed");
      pill.classList.remove("active");
    }}
  }});
}}

document.querySelectorAll(".filter-pill[data-label]").forEach(pill => {{
  pill.addEventListener("click", function() {{
    const label = this.dataset.label;
    if (activeLabels.has(label)) {{
      activeLabels.delete(label);
    }} else {{
      activeLabels.add(label);
    }}
    updatePillVisuals();
    applyFilters();
  }});
}});

// Status filter buttons
document.querySelectorAll(".ctrl-btn[data-status]").forEach(btn => {{
  btn.addEventListener("click", function() {{
    document.querySelectorAll(".ctrl-btn[data-status]").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    activeStatus = this.dataset.status;
    applyFilters();
  }});
}});

// Sort buttons
document.querySelectorAll(".sort-btn").forEach(btn => {{
  btn.addEventListener("click", function() {{
    document.querySelectorAll(".sort-btn").forEach(b => b.classList.remove("active"));
    this.classList.add("active");
    currentSort = this.dataset.sort;
    renderBugList();
  }});
}});

// Initial render
renderBugList();
</script>
</body>
</html>"""

    return html


def main():
    repo_root = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        capture_output=True, text=True
    ).stdout.strip()

    if not repo_root:
        repo_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

    os.chdir(repo_root)

    # Parse args
    out_path = None
    job_dir = None
    args = sys.argv[1:]
    i = 0
    while i < len(args):
        if args[i] == "--job" and i + 1 < len(args):
            job_dir = args[i + 1]
            i += 2
        elif not args[i].startswith("-"):
            out_path = args[i]
            i += 1
        else:
            i += 1

    if not out_path:
        out_dir = os.path.join(repo_root, "scripts", "tx-compare", "results")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, "bugs.html")
    else:
        os.makedirs(os.path.dirname(out_path), exist_ok=True)

    print("Fetching bugs from git-bug...", file=sys.stderr)
    bugs = run_git_bug()
    print(f"Found {len(bugs)} bugs", file=sys.stderr)

    job_stats = None
    if job_dir:
        job_stats = read_job_stats(job_dir)

    bug_data = build_bug_data(bugs)
    html = generate_html(bug_data, job_stats)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(html)

    print(f"Wrote {out_path}", file=sys.stderr)


if __name__ == "__main__":
    main()
