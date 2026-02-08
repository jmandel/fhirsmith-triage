# Repro Request Generator

Your job: given a git-bug ID, generate a concrete HTTP request that demonstrates the bug by hitting the live servers, then edit the bug with the repro.

## Inputs

- **Bug ID**: provided when this prompt is invoked
- **Job directory**: provided when this prompt is invoked
- **Prod server**: `https://tx.fhir.org`
- **Dev server**: `https://tx-dev.fhir.org`

## Step 1: Understand the bug

1. Read the bug body: `git-bug bug show <BUG_ID>`
2. Extract the `Record-ID` from the bug body header
3. Read the issue directory files for that record:
   - `<job-dir>/issues/<record-id>/record.json` — the full delta record with URL, method, request body
   - `<job-dir>/issues/<record-id>/analysis.md` — the triage analysis
   - `<job-dir>/issues/<record-id>/prod-raw.json` / `dev-raw.json` — actual responses
4. Also find 2-3 other records affected by this bug. Search for the tolerance ID in the job's `tolerances.js` to understand the match pattern, then grep `deltas.ndjson` archives or `comparison.ndjson` for similar requests.

## Step 2: Construct a repro request

From the record data, reconstruct the HTTP request:
- **URL path**: from `record.url` (e.g., `/r4/CodeSystem/$validate-code?`)
- **Method**: from `record.method` (GET or POST)
- **Request body**: from `record.requestBody` (for POST requests)
- **Headers**: `Accept: application/fhir+json` and `Content-Type: application/fhir+json` for POST

Build a `curl` command that targets both servers. The repro must be **fully self-contained** — anyone should be able to copy-paste the commands and reproduce the bug without needing any external files. Inline the request body directly in the `-d` argument. If the request body is too large to inline (>10KB), write a short script (bash or python) that constructs and sends the request, with the payload embedded in the script itself.

For example:
```bash
# Prod
curl -s 'https://tx.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Accept: application/fhir+json' \
  -H 'Content-Type: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[...]}'

# Dev
curl -s 'https://tx-dev.fhir.org/r4/CodeSystem/$validate-code' \
  -H 'Accept: application/fhir+json' \
  -H 'Content-Type: application/fhir+json' \
  -d '{"resourceType":"Parameters","parameter":[...]}'
```

## Step 3: Test it

Run both curl commands and compare the responses. Verify that the difference you see matches the bug description. If the first record doesn't reproduce cleanly (e.g., server data has changed), try another record from the same bug.

If you can't reproduce after 3 attempts with different records, note what you tried and stop.

## Step 4: Edit the bug

If you have a working repro, edit the bug's first comment to add a `## Repro` section right after the metadata header block (after the `Record-ID:` line and blank line, before the rest of the body). Format:

```markdown
## Repro

```bash
# Prod
curl -s 'https://tx.fhir.org/...' ...

# Dev
curl -s 'https://tx-dev.fhir.org/...' ...
```

Prod returns `<key detail>`, dev returns `<key detail>`.
```

To edit the bug, first get the comment ID:
```bash
git-bug bug show <BUG_ID> -f json
```
The first comment's `id` field is what you need. Then:
```bash
git-bug bug comment edit <COMMENT_ID> -m "<new full body>" --non-interactive
```

**Important**: The `-m` value must be the COMPLETE new body (the edit replaces the entire comment). Preserve all existing content — just insert the `## Repro` section after the header.

## Step 5: Label the outcome

After editing the bug, add a label reflecting the repro result:

**Reproduced** — the live servers show the difference described in the bug:
```bash
git-bug bug label new <BUG_ID> "reproduced"
```

**Not reproduced** — the servers have converged and the bug is clearly no longer present. Close it:
```bash
git-bug bug label new <BUG_ID> "not-reproduced"
git-bug bug status close <BUG_ID>
```

**Repro inconclusive** — you tried but couldn't set up the right conditions (e.g., request body wasn't stored, server data has changed, complex preconditions). The bug may still be real — you just can't confirm it live. Do NOT close the bug:
```bash
git-bug bug label new <BUG_ID> "repro-inconclusive"
```
