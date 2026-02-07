# Analysis: `temp-tolerance`

**Operation**: `POST /r4/CodeSystem/$validate-code?`
**Category**: result-disagrees
**Status**: prod=200 dev=200
**Bug**: f559b53
**Tolerance**: cpt-validate-code-result-disagrees

## What differs

Prod validates CPT code 99214 as valid (`result: true`) with display text "Office or other outpatient visit for the evaluation and management of an established patient..." and version "2023". Dev rejects the same code (`result: false`) with error "Unknown code '99214' in the CodeSystem 'http://www.ama-assn.org/go/cpt' version '2023'".

Both servers reference the same CodeSystem URI and version (2023), so the CodeSystem is loaded in dev but many codes are missing or not being found during lookup. Dev's diagnostics confirm it finds the CodeSystem (`CodeSystem found: http://www.ama-assn.org/go/cpt|2023`) but then fails to locate the code within it.

This is not a cosmetic difference — it's a core validation failure. CPT 99214 is one of the most commonly used E&M codes.

## Pattern scope

45 result-disagrees records total across 17 distinct CPT codes (33206, 44211, 44401, 45346, 58545, 70551, 73722, 74263, 77061, 77081, 81528, 82274, 83036, 87624, 88175, 93978, 99214). All are prod=true/dev=false. 41 on CodeSystem/$validate-code, 4 on ValueSet/$validate-code.

There are an additional 79 CPT delta records in other categories (71 content-differs on $expand, 8 status-mismatch on $expand) that likely share the same root cause but are separate patterns.

## Category: `temp-tolerance`

This is a real, meaningful difference — dev fails to validate codes that prod correctly recognizes. Filed as bug f559b53. The tolerance skips these records to prevent re-triaging until the underlying CPT data/lookup issue is fixed.

## Tolerance

Tolerance `cpt-validate-code-result-disagrees` matches validate-code records where system is `http://www.ama-assn.org/go/cpt` and prod returns `result: true` while dev returns `result: false`. Skips the entire record since the result disagreement makes normalization meaningless.

- Eliminated 45 records (683 -> 638 deltas)
- Validated 10 random samples: all legitimate (correct system, correct result direction, correct category)
- No false positives — tolerance only matches CPT system with specific result polarity
