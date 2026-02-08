#!/usr/bin/env bash
set -euo pipefail

# Convert a requests.ndjson file into a comparison.ndjson file by sending
# each request to both prod and dev servers and capturing responses.
#
# Usage: ./engine/requests-to-comparison.sh <requests.ndjson> <output.ndjson>

if [[ $# -lt 2 ]]; then
  echo "Usage: $0 <requests.ndjson> <output.ndjson>"
  exit 1
fi

INPUT="$1"
OUTPUT="$2"
PROD="https://tx.fhir.org"
DEV="https://tx-dev.fhir.org"
ACCEPT="Accept: application/fhir+json"

> "$OUTPUT"

TOTAL=$(wc -l < "$INPUT")
COUNT=0

while IFS= read -r line; do
  COUNT=$((COUNT + 1))

  METHOD=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['method'])")
  URL=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin)['url'])")
  REQBODY=$(echo "$line" | python3 -c "import sys,json; print(json.load(sys.stdin).get('requestBody',''))")

  TMPDIR=$(mktemp -d)
  trap "rm -rf $TMPDIR" EXIT

  if [[ "$METHOD" == "POST" && -n "$REQBODY" ]]; then
    curl -s -H "$ACCEPT" -H "Content-Type: application/fhir+json" \
      -X POST -d "$REQBODY" "${PROD}${URL}" -o "$TMPDIR/prod" -w '%{http_code} %{size_download} %{content_type}' > "$TMPDIR/prod_meta" 2>/dev/null &
    PID_PROD=$!
    curl -s -H "$ACCEPT" -H "Content-Type: application/fhir+json" \
      -X POST -d "$REQBODY" "${DEV}${URL}" -o "$TMPDIR/dev" -w '%{http_code} %{size_download} %{content_type}' > "$TMPDIR/dev_meta" 2>/dev/null &
    PID_DEV=$!
  else
    curl -s -H "$ACCEPT" "${PROD}${URL}" -o "$TMPDIR/prod" -w '%{http_code} %{size_download} %{content_type}' > "$TMPDIR/prod_meta" 2>/dev/null &
    PID_PROD=$!
    curl -s -H "$ACCEPT" "${DEV}${URL}" -o "$TMPDIR/dev" -w '%{http_code} %{size_download} %{content_type}' > "$TMPDIR/dev_meta" 2>/dev/null &
    PID_DEV=$!
  fi

  wait $PID_PROD $PID_DEV 2>/dev/null || true

  python3 -c "
import json, hashlib, uuid, sys, os
from datetime import datetime, timezone

prod_meta = open('$TMPDIR/prod_meta').read().strip().split(' ', 2)
dev_meta = open('$TMPDIR/dev_meta').read().strip().split(' ', 2)

prod_body = open('$TMPDIR/prod', 'rb').read()
dev_body = open('$TMPDIR/dev', 'rb').read()

prod_hash = hashlib.md5(prod_body).hexdigest()
dev_hash = hashlib.md5(dev_body).hexdigest()

rec = {
    'ts': datetime.now(timezone.utc).isoformat(),
    'id': str(uuid.uuid4()),
    'method': '$METHOD',
    'url': '$URL',
    'match': prod_hash == dev_hash,
    'prod': {
        'status': int(prod_meta[0]) if prod_meta[0].isdigit() else 0,
        'contentType': prod_meta[2] if len(prod_meta) > 2 else '',
        'size': int(prod_meta[1]) if len(prod_meta) > 1 and prod_meta[1].isdigit() else 0,
        'hash': prod_hash
    },
    'dev': {
        'status': int(dev_meta[0]) if dev_meta[0].isdigit() else 0,
        'contentType': dev_meta[2] if len(dev_meta) > 2 else '',
        'size': int(dev_meta[1]) if len(dev_meta) > 1 and dev_meta[1].isdigit() else 0,
        'hash': dev_hash
    },
    'prodBody': prod_body.decode('utf-8', errors='replace'),
    'devBody': dev_body.decode('utf-8', errors='replace')
}

reqbody = '''$REQBODY'''
if reqbody:
    rec['requestBody'] = reqbody

print(json.dumps(rec))
" >> "$OUTPUT"

  rm -rf "$TMPDIR"
  trap - EXIT

  if (( COUNT % 10 == 0 )); then
    echo "  [$COUNT/$TOTAL] requests completed" >&2
  fi
done < "$INPUT"

MATCH=$(python3 -c "
import json
m=nm=0
for line in open('$OUTPUT'):
    d=json.loads(line)
    if d['match']: m+=1
    else: nm+=1
print(f'{m} match, {nm} mismatch out of {m+nm} total')
")
echo "Done: $MATCH" >&2
