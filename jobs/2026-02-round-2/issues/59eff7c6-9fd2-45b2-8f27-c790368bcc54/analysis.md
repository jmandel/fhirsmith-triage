# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$validate-code?url=http:%2F%2Fcts.nlm.nih.gov%2Ffhir%2FValueSet%2F2.16.840.1.114222.4.11.1066&code=1223P0106X&_format=json&system=http:%2F%2Fnucc.org%2Fprovider-taxonomy`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: a9cf20c
**Tolerance**: oo-missing-location-field

## What differs

After normalization, the only remaining difference is that prod includes the deprecated `location` field on OperationOutcome issues while dev omits it. Both sides agree on `expression`, and in prod `location` always has the exact same value as `expression`.

Specifically, prod returns:
```json
{
  "severity": "error",
  "code": "not-found",
  "details": { ... },
  "location": ["system"],
  "expression": ["system"]
}
```

Dev returns the same issue without `location`:
```json
{
  "severity": "error",
  "code": "not-found",
  "details": { ... },
  "expression": ["system"]
}
```

In FHIR R4, `location` (0..*) is deprecated in favor of `expression`, but it is still a defined field. Prod populates both; dev omits `location`.

## Category: `temp-tolerance`

This is a real difference — dev is missing a field that prod provides. While `location` is deprecated, it's still part of the FHIR R4 spec and clients may depend on it. The information is redundant (always equals `expression`), but its absence is a conformance gap. Filed as bug a9cf20c.

## Tolerance

Tolerance `oo-missing-location-field` normalizes by stripping `location` from prod's OO issues when dev lacks it and `location` equals `expression`. This is safe because the field is purely redundant with `expression`.

**Impact**: 3019 delta records have this pattern (all validate-code). Of those, 2555 records were fully eliminated from deltas (the location difference was their only remaining difference). The remaining 464 records still have other differences but the location diff is now normalized away.

**Validation**: Sampled 12 eliminated records — all confirmed as validate-code/content-differs where the sole remaining difference was the missing `location` field, with `location` always equal to `expression` in prod.
