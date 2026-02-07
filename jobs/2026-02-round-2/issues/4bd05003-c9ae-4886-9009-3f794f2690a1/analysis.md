# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: 44d6f07
**Tolerance**: expand-displayLanguage-region-truncated

## What differs

After normalization, the only remaining difference is the `displayLanguage` expansion parameter value:
- Prod: `"fr-FR"` (matches the request)
- Dev: `"fr"` (region subtag stripped)

The request specified `displayLanguage=fr-FR`. Prod echoes this value back exactly in `expansion.parameter`. Dev truncates it to just `"fr"`, dropping the `-FR` region subtag. The actual expansion content (78 LOINC codes with identical display text) is the same on both sides.

## Category: `temp-tolerance`

This is a real difference, not cosmetic. `fr-FR` and `fr` are distinct BCP-47 language tags. The server should echo back the language tag as requested. Dev is modifying the value before returning it. While the functional impact on this particular expansion is minimal (display text is identical), the echoed parameter is objectively wrong.

## Tolerance

Tolerance `expand-displayLanguage-region-truncated` normalizes the `displayLanguage` expansion parameter to the prod value when both prod and dev have the parameter but with differing values. This canonicalizes dev's truncated tag to match prod.

- Records eliminated: 2 (from 3527 to 3525)
- Both eliminated records are POST /r4/ValueSet/$expand with `displayLanguage=fr-FR`
- Validation: both records have identical expansion content (same codes, same displays), differing only in the echoed displayLanguage parameter value
