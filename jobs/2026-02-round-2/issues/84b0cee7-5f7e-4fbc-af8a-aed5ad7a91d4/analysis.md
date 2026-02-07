# Analysis: temp-tolerance

**Operation**: `POST /r5/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: b6d19d8
**Tolerance**: cc-validate-code-missing-known-coding-params

## What differs

When `CodeSystem/$validate-code` is called with a `codeableConcept` containing multiple codings — one from an unknown CodeSystem and one from a known CodeSystem — and `result=false`:

**Prod** validates the known coding and returns:
- `system` (e.g. `http://loinc.org`)
- `code` (e.g. `72106-8`)
- `version` (e.g. `2.81`)
- `display` (e.g. `Total score [MMSE]`)
- Full OperationOutcome issues including both the UNKNOWN_CODESYSTEM error and any additional issues for the known coding (e.g. invalid-display)

**Dev** only reports the unknown system error and omits:
- `system`, `code`, `version`, `display` parameters entirely
- Any additional OperationOutcome issues beyond the UNKNOWN_CODESYSTEM error

In this specific record, the codeableConcept has a LOINC coding (`72106-8`) and a smartypower coding (`SP-QUICKSTOP`). Prod returns 2 issues (unknown system + invalid display for the LOINC code), dev returns 1 (unknown system only). The message was already normalized by the `message-concat-missing-issues` tolerance.

## Category: `temp-tolerance`

This is a real, meaningful difference in validation behavior. Dev is providing incomplete validation output — it stops at the first unknown system error and doesn't continue validating the known coding. The `system`, `code`, `version`, `display` parameters are specified output parameters of `$validate-code` and carry terminology content (the validated code's details). This is not cosmetic.

## Tolerance

Tolerance `cc-validate-code-missing-known-coding-params` matches validate-code records with:
- `result=false` on both sides
- `x-caused-by-unknown-system` present
- `codeableConcept` present
- Prod has `system` param, dev doesn't

Normalizes by adding prod's `system`, `code`, `version`, `display` params to dev and canonicalizing dev's issues to match prod's.

**Impact**: Eliminates 5 records (3923 → 3918 deltas).

**Validation**: All 5 eliminated records confirmed to match the exact pattern — all are CodeSystem/$validate-code with codeableConcept containing one unknown and one known coding. 2 records involve LOINC + smartypower (with extra invalid-display issue), 3 involve SNOMED + essilorluxottica (single issue). No unintended records affected.
