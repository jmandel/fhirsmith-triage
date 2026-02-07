# Analysis: `temp-tolerance`

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b36a12b
**Tolerance**: unknown-version-no-versions-known

## What differs

Both servers agree `result=false` — the code `M119.5` in `https://fhir.nhs.uk/CodeSystem/England-GenomicTestDirectory` version `9` cannot be validated. However, the error details differ:

1. **Message text**: Prod says "Valid versions: 0.1.0" (listing the actual known versions). Dev says "No versions of this code system are known" — which is factually incorrect since dev does know version 0.1.0 (40 other records for this code system validate successfully).

2. **`x-caused-by-unknown-system`**: Prod includes the version suffix (`...England-GenomicTestDirectory|9`), dev omits it (`...England-GenomicTestDirectory`).

3. **OperationOutcome message-id**: Prod uses `UNKNOWN_CODESYSTEM_VERSION`, dev uses `UNKNOWN_CODESYSTEM_VERSION_NONE`. (Already handled by existing `strip-oo-message-id-extension` tolerance.)

4. **OperationOutcome details.text**: Same message text difference as #1.

## Category: `temp-tolerance`

This is a real, meaningful difference — not cosmetic. Dev's error message is factually wrong: it claims no versions are known, but version 0.1.0 is loaded and working. This suggests a code path issue where dev fails to look up available versions when the requested version is not found. Filed as bug b36a12b.

## Tolerance

Tolerance `unknown-version-no-versions-known` normalizes the message text, `x-caused-by-unknown-system` value, and OperationOutcome details text to prod's values (the more informative/correct ones).

- **Matched by**: Both result=false, prod message contains "Valid versions:", dev message contains "No versions of this code system are known"
- **Records eliminated**: 50 (all `England-GenomicTestDirectory` with requested versions 7 or 9)
- **Validation**: 10/10 sampled eliminations verified correct — all follow the exact same pattern with no hidden differences
