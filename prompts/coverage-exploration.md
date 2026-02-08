# Coverage Gap Exploration — Base Prompt

You are investigating a FHIR R4 terminology server (FHIRsmith) that was translated from
Pascal to JavaScript. Your mission: **find the queries that exercise untested code paths**,
then run those queries against both the production server and the dev server to compare
behavior.

## Servers

- **Production** (Pascal, reference): `https://tx.fhir.org/r4`
- **Dev** (JavaScript, being validated): `https://tx-dev.fhir.org/r4`

Both servers implement the same FHIR terminology operations. Differences in responses may
indicate translation bugs.

**Important:** The dev server is already running — do NOT attempt to start, stop, or restart
any server. Just send requests to the URLs above using `curl`.

Always include `-H 'Accept: application/fhir+json'` in your curl requests to get JSON
responses (production returns HTML without it).

## Your approach

You are a relentless, curious investigator. For each coverage gap:

1. **Read the source code.** Open the uncovered files. Read the uncovered functions line by
   line. Understand what inputs reach them and what conditions trigger the uncovered branches.
   Trace backwards from the uncovered code to the HTTP route handler to understand exactly
   what request shape is needed.

2. **Read the FHIR specification.** Use WebFetch to read the relevant pages on
   hl7.org/fhir/R4. Understand the full parameter space for each operation. The spec often
   describes optional parameters, edge cases, and error conditions that real-world traffic
   rarely exercises — those are exactly the queries you need.

3. **Hypothesize.** Based on the source code and the spec, form specific hypotheses:
   "If I send a $translate request with `source` but not `system`, it will hit the fallback
   path on line 342." Write these down.

4. **Test against production first.** Use `curl` (via Bash) to send your hypothesized
   requests to tx.fhir.org. Verify you get meaningful responses (not just 400 errors).
   Examine the response carefully — does it use the parameters you sent? Does it exercise
   the code path you targeted?

5. **Then test against dev.** Send the same request to the dev server. Compare the responses.
   Note any differences — they may indicate translation bugs.

6. **Iterate ruthlessly.** Each response teaches you something. If a parameter was ignored,
   try a different value. If you got an error, read the error and adjust. If the response
   was identical between prod and dev, that's still valuable — you've confirmed that code
   path works. Move to the next uncovered branch.

## Output format

Produce a file at `triage/prompts/coverage-gaps/generated/<area-name>-requests.ndjson` where
each line is a JSON object:

```json
{"method": "GET", "url": "/r4/...", "description": "Tests $translate with source ValueSet URL"}
{"method": "POST", "url": "/r4/...", "requestBody": "{...}", "description": "Tests ECL refinement in $expand"}
```

For POST requests, `requestBody` should be the full JSON body as a string.

Also produce a companion markdown file `<area-name>-findings.md` documenting:
- Which code paths you targeted and why
- What you found when comparing prod vs dev
- Any suspected translation bugs
- Which paths you could NOT exercise and why

## What makes a good test query

- It targets a **specific uncovered function or branch** — you can trace from the HTTP
  request through the route handler to the uncovered line.
- It uses **real terminology codes** that exist in the loaded code systems (SNOMED CT,
  LOINC, RxNorm, ICD-10, HL7 v3 code systems, UCUM, etc.).
- It exercises **parameter combinations** the main test traffic misses — optional parameters,
  edge cases, error conditions, unusual but valid inputs.
- It is a **valid FHIR request** that a real client might send (not a malformed fuzzing input).

## What NOT to do

- Don't generate requests that exercise data-loading/import code (database creation,
  upsert, batch loading, cleanup). Only target code that runs during HTTP request handling.
- Don't guess at codes — look them up in the FHIR spec or use well-known codes.
- Don't stop after a handful of queries. Aim for 30-50 queries per area, systematically
  covering each uncovered function and branch.
- Don't just vary one parameter — combine parameters in ways that trigger different
  code paths (e.g., `$translate` with vs without `source`, with vs without `target`).

## Useful FHIR spec pages

- CodeSystem operations: https://hl7.org/fhir/R4/codesystem-operations.html
- ValueSet operations: https://hl7.org/fhir/R4/valueset-operations.html
- ConceptMap operations: https://hl7.org/fhir/R4/conceptmap-operations.html
- SNOMED CT in FHIR: https://hl7.org/fhir/R4/snomedct.html
- Terminology service: https://hl7.org/fhir/R4/terminology-service.html
