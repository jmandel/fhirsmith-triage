# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http%3A%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fiso3166-1-2&system-version=urn:iso:std:iso:3166|2020&count=1000`
**Category**: missing-resource
**Status**: prod=200 dev=404
**Bug**: 2f5929e
**Tolerance**: expand-iso3166-unknown-version-fallback

## What differs

Request asks to $expand ValueSet/iso3166-1-2 with `system-version=urn:iso:std:iso:3166|2020` (ISO 3166 version 2020).

**Prod (200)**: Successfully expands the ValueSet with 249 country codes. Falls back to the available version 2018 (reported via `used-codesystem` parameter as `urn:iso:std:iso:3166|2018`), while echoing the requested `system-version` as `urn:iso:std:iso:3166|2020`.

**Dev (404)**: Returns an OperationOutcome with error: "A definition for CodeSystem 'urn:iso:std:iso:3166' version '2020' could not be found, so the value set cannot be expanded. Valid versions: 2018 or 20210120". Message ID: `UNKNOWN_CODESYSTEM_VERSION_EXP`.

The core difference: prod gracefully handles the unknown code system version by falling back to the closest available version and succeeding, while dev rejects the request outright with a 404.

## Category: `temp-tolerance`

This is a real, meaningful difference — not equivalent. The servers behave completely differently: one returns a successful expansion with data, the other returns an error. This represents a behavioral difference in how unknown code system versions are handled in $expand operations. Filed as bug 2f5929e.

This is conceptually related to bug 1bc5e64 (dev not resolving versions prod resolves in validate-code) but manifests differently in $expand where the outcome diverges completely (200+data vs 404+error).

## Tolerance

Tolerance `expand-iso3166-unknown-version-fallback` skips $expand records targeting iso3166-1-2 with a system-version parameter for ISO 3166 where prod=200 and dev=404. Eliminates 1 record (the only missing-resource record in the entire delta set). Delta count went from 5 to 4.
