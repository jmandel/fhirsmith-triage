# Analysis: equiv-autofix

**Operation**: `GET /r4/ValueSet/$expand?url=http%3A%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.113762.1.4.1021.24&incomplete-ok=true`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: expand-meta-lastUpdated

## What differs

The only remaining difference after existing tolerances is `meta.lastUpdated` on the ValueSet resource wrapper:
- Prod: `2025-08-19T20:07:33.000-04:00`
- Dev: `2024-04-29T09:35:47.000-04:00`

All terminology content is identical: same 6 codes in the expansion (ASKU, F, M, OTH, UNK, asked-declined), same display texts, same code system versions, same total count.

## Category: `equiv-autofix`

`meta.lastUpdated` on the ValueSet resource returned by `$expand` reflects when each server instance last loaded or updated the resource definition. This is server-generated transient metadata, not terminology content. The two responses are semantically equivalent — the expansion results are byte-for-byte identical after normalization of other transient fields (expansion.identifier, expansion.timestamp) that were already handled.

This is analogous to the existing `expand-metadata-identifier-timestamp` tolerance which already handles other server-generated transient metadata in expand responses.

## Tolerance

Tolerance `expand-meta-lastUpdated` normalizes `meta.lastUpdated` on ValueSet resources in $expand responses by setting both sides to prod's value (canonical normalization rather than stripping).

**Scope**: Matches any ValueSet $expand response where `meta.lastUpdated` differs between prod and dev.

**Records eliminated**: 3 (all the same ValueSet URL with identical expansion contents, differing only in lastUpdated). Validated all 3 — each has identical terminology content with only `meta.lastUpdated` differing.

Delta count: 55 -> 52.
