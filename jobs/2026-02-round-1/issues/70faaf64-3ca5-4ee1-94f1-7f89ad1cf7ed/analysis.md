# Analysis: temp-tolerance

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: e5a78af
**Tolerance**: expand-iso3166-extra-reserved-codes

## What differs

Both servers successfully expand a ValueSet containing `urn:iso:std:iso:3166` codes, but prod returns 291 codes while dev returns 249. The 42 extra codes in prod are ISO 3166-1 reserved and user-assigned codes:

- **AA** (User-assigned)
- **QM through QZ** (15 User-assigned codes)
- **XA through XJ, XL through XZ** (24 codes: mostly User-assigned, plus XK=Kosovo, XX=Unknown, XZ=International Waters)
- **ZZ** (Unknown or Invalid Territory)

Dev returns only the 249 standard assigned country codes. Both servers use `urn:iso:std:iso:3166|2018` as the code system version.

Additionally, 6 display text differences exist between the shared codes (e.g., prod has "Eland Islands" vs dev's "Åland Islands" for code AX, prod has "Ctte d'Ivoire" vs dev's "Côte d'Ivoire" for CI) — these are already handled by the existing `expand-display-text-differs` tolerance.

## Category: `temp-tolerance`

This is a real, meaningful difference in code system content — the two servers load different sets of ISO 3166 codes. Prod's version appears to include reserved/user-assigned code ranges that are part of the ISO 3166 standard but represent placeholder entries. This reflects a difference in how the two implementations source or filter their ISO 3166 code system data. It is not a cosmetic difference — clients querying for all country codes would get different result sets.

## Tolerance

Tolerance `expand-iso3166-extra-reserved-codes` matches expand responses where both sides include `urn:iso:std:iso:3166` codes and prod has more codes than dev. It normalizes by filtering prod's `expansion.contains` to only include codes present in dev's response and sets both totals to dev's count.

- **Records eliminated**: 7 (from 461 to 454 deltas)
- **Validation**: All 7 eliminated records show the identical pattern (42 extra prod codes, all user-assigned/reserved, dev codes are a strict subset of prod codes)
- **No false positives**: No new records appeared, no unrelated differences hidden
