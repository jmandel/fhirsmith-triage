# Analysis: temp-tolerance

**Operation**: `GET /r4/ValueSet/$expand?url=http:%2F%2Fhl7.org%2Ffhir%2FValueSet%2Fconsent-policy&_format=json`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 6edc96c (Dev loads different versions of HL7 terminology CodeSystems)
**Tolerance**: expand-hl7-terminology-version-skew-content

## What differs

Dev returns 27 codes in the expansion, prod returns 26. Dev includes one extra code `ch-epr` ("CH EPR Consent") from `http://terminology.hl7.org/CodeSystem/consentpolicycodes` that prod does not include. All 26 codes in prod's expansion are also present in dev's expansion with identical display text.

The root cause is that dev loads version `3.0.1` of the `consentpolicycodes` CodeSystem while prod loads version `4.0.1`. The raw `used-codesystem` parameter confirms this (already normalized away by the `expand-used-codesystem-version-skew` tolerance). Version 3.0.1 apparently includes the `ch-epr` code that was removed in 4.0.1.

## Category: `temp-tolerance`

This is a real, meaningful difference — the expansion returns different content due to a different CodeSystem version being loaded. This is not equivalent (the code sets genuinely differ). It's tied to existing bug 6edc96c which already documents the HL7 terminology CodeSystem version skew between prod and dev.

## Tolerance

Tolerance `expand-hl7-terminology-version-skew-content` normalizes $expand responses by intersecting the code sets from prod and dev, keeping only codes present in both sides, and adjusting the total accordingly. It matches when:
- The operation is $expand on a ValueSet
- Both sides return 200
- At least one `used-codesystem` parameter references `terminology.hl7.org/CodeSystem/`
- There are extra/missing codes between the two sides
- Dev didn't completely fail to expand (dev contains > 1 when prod has > 5)

The tolerance eliminates 7 records, all for the consent-policy ValueSet. The broader pattern (163 records) also includes observation-category (130), patient-contactrelationship (5), TribalEntityUS (3), and security-labels (18), but those records have additional differences beyond just the code set (e.g., extra contact metadata, warning parameters) that keep them in the delta for other tolerances to handle.

Validation: all 7 eliminated records are identical — consent-policy $expand where dev has extra `ch-epr` code. No false positives.
