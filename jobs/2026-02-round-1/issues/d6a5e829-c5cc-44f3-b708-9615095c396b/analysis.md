# Analysis: temp-tolerance

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 79fe417 (related to f559b53)
**Tolerance**: cpt-validate-code-unknown-vs-invalid-display

## What differs

Both servers return `result: false` for CPT code 99235, but for entirely different reasons:

- **Prod**: Finds code 99235 in CPT 2023. Returns `version: "2023"`, `display` (the correct display text), and error "Wrong Display Name 'Observation or inpatient hospital care for problems of moderate severity'" with issue code `invalid-display`. The code exists but the submitted display text is wrong.
- **Dev**: Cannot find code 99235 at all. Returns "Unknown code '99235' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'" with issue code `invalid-code`. No `version` or `display` parameters returned.

Specific parameter differences after normalization:
1. `display` — present in prod (correct display text), missing in dev
2. `version` — present in prod ("2023"), missing in dev
3. `message` — prod: "Wrong Display Name..." / dev: "Unknown code..."
4. `issues` — prod: severity=error, code=invalid, details.coding=invalid-display / dev: severity=error, code=code-invalid, details.coding=invalid-code

## Category: `temp-tolerance`

This is a real, meaningful difference. Dev's CPT CodeSystem is missing codes that prod has. This is the same root cause as bug f559b53 (dev fails to recognize valid CPT codes) but manifests differently here because the input display text happened to be wrong, causing both servers to return `result=false` — prod because the display is wrong, dev because it can't find the code at all.

The existing `cpt-validate-code-result-disagrees` tolerance only handles the case where `prodResult=true && devResult=false`. This case requires a separate tolerance because both sides agree on `result=false`.

## Tolerance

Tolerance ID: `cpt-validate-code-unknown-vs-invalid-display`
Kind: `temp-tolerance` (skip)
Bug: 79fe417

Matches CPT validate-code records where both return `result=false`, prod has `invalid-display` issue, and dev has `invalid-code` issue. Eliminates 4 records (all CPT code 99235 on POST /r4/CodeSystem/$validate-code). Validated all 4 eliminated records — each matches the expected pattern exactly.

Delta count: 43 -> 39 (4 eliminated).
