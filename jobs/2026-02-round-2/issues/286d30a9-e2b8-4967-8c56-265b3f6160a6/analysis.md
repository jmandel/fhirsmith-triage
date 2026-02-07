# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: status-mismatch
**Status**: prod=500 dev=200
**Bug**: e02b03e
**Tolerance**: skip-prod-hgvs-timeout

## What differs

Prod returns HTTP 500 with an OperationOutcome: "Error parsing HGVS response: Read timed out." This is a transient failure — prod timed out calling an external HGVS validation service during data collection.

Dev returns HTTP 200 with a proper Parameters response: `result=false`, indicating the code `BRCA1:c.3143delG p.(Gly1048ValfsTer14)` is unknown in CodeSystem `http://varnomen.hgvs.org` version `2.0`. Dev also returns an informational issue noting the HGVS expression has both `c.` and `p.` descriptions, which is invalid per HGVS standards.

The normalized outputs cannot be meaningfully compared because prod never completed the operation — the prod response is an error OperationOutcome, while dev's response is a valid validate-code Parameters result.

## Category: `temp-tolerance`

This is a data collection artifact, not a dev bug. Prod experienced transient timeouts reaching the external HGVS validation service during the data collection run. The 62 affected records all share the same pattern: HGVS system, $validate-code, prod=500 with "Read timed out" in the error message, dev=200 with a proper response.

There are 124 total HGVS records in the dataset — the other 62 did not timeout and have prod=200, dev=200 (handled by the existing `hgvs-extra-syntax-issue` tolerance and the normal comparison pipeline).

Since the comparison data is unreliable (prod didn't actually process the request), these records should be skipped and recollected in a future data collection run.

## Tolerance

Tolerance `skip-prod-hgvs-timeout` skips any record where `prod.status === 500` and the prod body contains "Read timed out". This is scoped broadly enough to catch any external service timeout on the prod side (not just HGVS), since a timeout response cannot be meaningfully compared regardless of the code system.

- Records eliminated: 62 (all 62 "Read timed out" records in deltas)
- Delta count: 3737 -> 3675
- Validation: 10 randomly sampled eliminated records all confirmed: prod=500, dev=200, hasTimeout=true, system=http://varnomen.hgvs.org, category=status-mismatch
- No "Read timed out" records remain in the new deltas
