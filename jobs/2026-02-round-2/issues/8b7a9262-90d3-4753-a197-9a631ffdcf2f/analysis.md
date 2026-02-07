# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2Fus%2Fdavinci-pdex-plan-net%2FValueSet%2FPractitionerRoleVS&_format=json`
**Category**: status-mismatch
**Status**: prod=422 dev=404
**Bug**: 2337986
**Tolerance**: expand-valueset-not-found-status-mismatch

## What differs

When a ValueSet cannot be found for a `$expand` operation, the two servers disagree on both the HTTP status code and OperationOutcome structure:

- **Prod** (HTTP 422): Returns issue code `"unknown"` with `details.text`: "Unable to find value set for URL \"...\""
- **Dev** (HTTP 404): Returns issue code `"not-found"` with `diagnostics`: "ValueSet not found: ..."

Both communicate the same semantic meaning (the requested ValueSet doesn't exist), but the HTTP status code (422 vs 404) and the OperationOutcome issue code (`unknown` vs `not-found`) are meaningful behavioral differences.

The `text.div` narrative difference was already normalized away by the `read-resource-text-div-diff` tolerance.

## Category: `temp-tolerance`

This is a real behavioral difference, not a cosmetic one. HTTP status codes and issue codes are part of the FHIR API contract that clients depend on. The FHIR $expand spec doesn't mandate a specific HTTP status for this case, but the two implementations should agree. This pattern affects 714 records consistently (all `$expand` operations where prod says "Unable to find value set" with issue code `unknown`). The remaining 42 prod=422/dev=404 records have a different error pattern ("CodeSystem could not be found") and are excluded from this tolerance.

## Tolerance

**ID**: `expand-valueset-not-found-status-mismatch`
**Kind**: `temp-tolerance` with `bugId: '2337986'`
**Action**: Skip
**Match criteria**: `$expand` operations where prod=422, dev=404, prod issue code is `"unknown"` with "unable to find value set" in details.text, and dev issue code is `"not-found"` with "valueset not found" in diagnostics.
**Records eliminated**: 714 (from 7283 to 6569 deltas)
**Validation**: 10 randomly sampled eliminated records all confirmed the exact pattern — prod=422 code=unknown, dev=404 code=not-found, for various missing ValueSet URLs across different IGs (US Core, DaVinci, CH-VACD, Brazilian terminology, etc.).
