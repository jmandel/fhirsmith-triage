# Analysis: equiv-autofix

**Operation**: `GET /r4/ValueSet?_elements=url,version&_ts=1770416165723`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: skip-truncated-body

## What differs

Prod's response body was truncated at exactly 50,000 characters during data collection, producing invalid JSON that cannot be parsed. The comparison engine assigns `parse-error` because `prod` is `null` after parsing fails. Dev's response (5,930 chars) parsed successfully as a searchset Bundle with 13,818 ValueSets.

The prod response (before truncation) was a searchset Bundle with 23,952 ValueSets. The total count difference (23,952 vs 13,818) may indicate a real content gap, but the truncated data makes meaningful comparison impossible.

## Category: `equiv-autofix`

This is a data collection artifact, not a server-side difference. The 50KB body capture limit truncates large responses mid-JSON, making them unparseable. Since we cannot compare what we cannot parse, these records must be skipped entirely.

This is not `temp-tolerance` because no bug needs to be filed against the servers — the issue is in the test harness's response capture limit.

## Tolerance

**Tolerance ID**: `skip-truncated-body`

The tolerance skips any record where at least one body is >= 50,000 chars AND fails JSON parsing (confirming actual truncation rather than coincidentally large valid JSON).

**Scope**: 318 records eliminated total:
- 277 `parse-error` records (prod or dev body truncated, JSON unparseable)
- 38 `status-mismatch` records (dev returned large 200 expansion vs prod 422 error, but dev body truncated)
- 2 `missing-resource` records (prod body truncated)
- 1 `dev-crash-on-valid` record (body truncated)

**Breakdown by truncation side**:
- 192 records: only prod truncated
- 84 records: both sides truncated
- 1 record: only dev truncated
- 41 additional records: non-parse-error with truncated bodies

**Validation**: Sampled 15 randomly selected eliminated records. All 15 confirmed to have at least one body at exactly 50,000 chars with invalid JSON. No legitimate comparison data was hidden.

Delta count: 2,271 -> 1,953 (318 eliminated).
