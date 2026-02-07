# Analysis: `temp-tolerance`

**Operation**: `POST /r4/ValueSet/$validate-code?`
**Priority**: P6
**Status**: prod=200 dev=200
**Bug**: e09cff6
**Tolerance**: bcp47-display-format

## What differs

For BCP-47 language code `en-US` (system `urn:ietf:bcp:47`), the display text format differs:

- **prod**: `"English (United States)"`
- **dev**: `"English (Region=United States)"`

All other parameters agree: `result: true`, `system: urn:ietf:bcp:47`, `code: en-US`. The only difference after diagnostics stripping and parameter sorting is the display value.

Dev includes an explicit subtag label `"Region="` in the display text, which is non-standard. The IANA/BCP-47 convention is to show the region name without a prefix label (as prod does).

## Category: `temp-tolerance`

This is a real, meaningful difference in display text — not equivalent. Display text is terminology content and differences matter per AGENTS.md guidelines. The dev implementation formats BCP-47 display names with explicit subtag labels (`Region=`) that prod does not use. This affects how language codes are presented to users.

## Tolerance

Tolerance `bcp47-display-format` matches `$validate-code` responses where `system=urn:ietf:bcp:47` and display values differ. It normalizes both sides to prod's display value (canonical normalization).

- **Records eliminated**: 7 (3075 -> 3068 deltas)
- **All 7 validated**: Every eliminated record has the exact same pattern — only the display parameter differs, with prod="English (United States)" and dev="English (Region=United States)". No other differences are hidden.
- **3 BCP-47 records remain in deltas**: 2 P1 records (case-sensitivity: `en-us` fails on prod, passes on dev) and 1 expand record (transient metadata diffs) — correctly not matched by this tolerance.
