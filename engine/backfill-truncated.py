#!/usr/bin/env python3
"""
Backfill truncated response bodies in comparison NDJSON files.

Reads an input NDJSON file, identifies records where prodBody or devBody
are exactly 5,000,000 chars (truncation marker), re-fetches the response
from the live server, and writes the complete record to the output file.

Usage:
  python3 engine/backfill-truncated.py <input.ndjson> <output.ndjson> [--dry-run]

Servers:
  prod: https://tx.fhir.org
  dev:  https://tx-dev.fhir.org
"""

import json
import sys
import hashlib
import time
import urllib.request
import urllib.error

TRUNCATION_THRESHOLD = 5_000_000
PROD_BASE = "https://tx.fhir.org"
DEV_BASE = "https://tx-dev.fhir.org"
TIMEOUT = 60  # seconds per request

def fetch_response(base_url, record):
    """Re-fetch a response from the given server."""
    url = base_url + record["url"]
    method = record["method"]
    headers = {
        "Accept": "application/fhir+json",
    }

    req_body = None
    if method == "POST":
        headers["Content-Type"] = "application/fhir+json"
        rb = record.get("requestBody")
        if rb:
            req_body = rb.encode("utf-8")
        else:
            return None, "no requestBody stored for POST"

    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
            body = resp.read().decode("utf-8")
            status = resp.status
            content_type = resp.headers.get("Content-Type", "")
            return {
                "body": body,
                "status": status,
                "contentType": content_type,
                "size": len(body),
                "hash": hashlib.md5(body.encode("utf-8")).hexdigest(),
            }, None
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8")
        return {
            "body": body,
            "status": e.code,
            "contentType": e.headers.get("Content-Type", ""),
            "size": len(body),
            "hash": hashlib.md5(body.encode("utf-8")).hexdigest(),
        }, None
    except Exception as e:
        return None, str(e)


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2]
    dry_run = "--dry-run" in sys.argv

    # First pass: count truncated records
    total = 0
    prod_trunc = 0
    dev_trunc = 0
    req_trunc = 0

    with open(input_path) as f:
        for line in f:
            total += 1
            r = json.loads(line)
            if len(r.get("prodBody", "")) == TRUNCATION_THRESHOLD:
                prod_trunc += 1
            if len(r.get("devBody", "")) == TRUNCATION_THRESHOLD:
                dev_trunc += 1
            if len(r.get("requestBody", "")) == TRUNCATION_THRESHOLD:
                req_trunc += 1

    print(f"Total records: {total:,}")
    print(f"Truncated prodBody: {prod_trunc}")
    print(f"Truncated devBody: {dev_trunc}")
    print(f"Truncated requestBody: {req_trunc} (cannot backfill - inputs not reproducible)")
    print()

    if dry_run:
        print("Dry run - no changes made.")
        return

    # Second pass: copy records, backfilling truncated bodies
    backfilled_prod = 0
    backfilled_dev = 0
    failed = 0
    line_num = 0

    with open(input_path) as fin, open(output_path, "w") as fout:
        for line in fin:
            line_num += 1
            rec = json.loads(line)

            prod_is_trunc = len(rec.get("prodBody", "")) == TRUNCATION_THRESHOLD
            dev_is_trunc = len(rec.get("devBody", "")) == TRUNCATION_THRESHOLD

            if prod_is_trunc:
                print(f"[{line_num}/{total}] {rec['id']}: re-fetching prod {rec['method']} {rec['url'][:80]}...", end=" ", flush=True)
                result, err = fetch_response(PROD_BASE, rec)
                if result:
                    rec["prodBody"] = result["body"]
                    rec["prod"]["size"] = result["size"]
                    rec["prod"]["hash"] = result["hash"]
                    rec["prod"]["status"] = result["status"]
                    rec["prod"]["contentType"] = result["contentType"]
                    backfilled_prod += 1
                    print(f"OK ({result['size']:,} chars, status {result['status']})")
                else:
                    failed += 1
                    print(f"FAILED: {err}")
                time.sleep(0.5)  # be polite

            if dev_is_trunc:
                print(f"[{line_num}/{total}] {rec['id']}: re-fetching dev {rec['method']} {rec['url'][:80]}...", end=" ", flush=True)
                result, err = fetch_response(DEV_BASE, rec)
                if result:
                    rec["devBody"] = result["body"]
                    rec["dev"]["size"] = result["size"]
                    rec["dev"]["hash"] = result["hash"]
                    rec["dev"]["status"] = result["status"]
                    rec["dev"]["contentType"] = result["contentType"]
                    backfilled_dev += 1
                    print(f"OK ({result['size']:,} chars, status {result['status']})")
                else:
                    failed += 1
                    print(f"FAILED: {err}")
                time.sleep(0.5)

            fout.write(json.dumps(rec, separators=(",", ":")) + "\n")

    print()
    print(f"Done. Wrote {output_path}")
    print(f"  Backfilled prod: {backfilled_prod}/{prod_trunc}")
    print(f"  Backfilled dev: {backfilled_dev}/{dev_trunc}")
    print(f"  Failed: {failed}")


if __name__ == "__main__":
    main()
