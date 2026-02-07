#!/usr/bin/env python3
"""Filter claude stream-json output to show readable progress."""
import sys
import json

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    try:
        msg = json.loads(line)
    except json.JSONDecodeError:
        continue
    t = msg.get("type")
    if t == "assistant" and "message" in msg:
        for block in msg["message"].get("content", []):
            if block.get("type") == "thinking":
                text = block.get("thinking", "")
                if text:
                    # Indent thinking to visually distinguish it
                    for tl in text.splitlines():
                        print(f"  💭 {tl}", flush=True)
            elif block.get("type") == "text":
                print(block["text"], flush=True)
            elif block.get("type") == "tool_use":
                name = block.get("name", "?")
                inp = block.get("input", {})
                if name == "Bash":
                    cmd = inp.get("command", "")
                    # Truncate long commands
                    if len(cmd) > 120:
                        cmd = cmd[:120] + "..."
                    print(f"  -> Bash: {cmd}", flush=True)
                elif name == "Read":
                    print(f"  -> Read: {inp.get('file_path', '?')}", flush=True)
                elif name == "Write":
                    print(f"  -> Write: {inp.get('file_path', '?')}", flush=True)
                elif name == "Edit":
                    print(f"  -> Edit: {inp.get('file_path', '?')}", flush=True)
                elif name in ("Grep", "Glob"):
                    print(f"  -> {name}: {inp.get('pattern', '?')}", flush=True)
                else:
                    print(f"  -> {name}()", flush=True)
    elif t == "result":
        cost = msg.get("cost_usd", "?")
        print(f"\n--- Result: cost=${cost} ---", flush=True)
