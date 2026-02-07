# Analysis: equiv-autofix

**Operation**: `POST /r4/ValueSet/$expand`
**Category**: content-differs
**Status**: prod=200 dev=200
**Bug**: none
**Tolerance**: expand-extension-child-order

## What differs

The `ValueSet.expansion.extension` element contains an R5 backport extension (`extension-ValueSet.expansion.property`) with child sub-extensions. Prod orders the child extensions as `["uri", "code"]` while dev orders them as `["code", "uri"]`. The same set of child extensions is present in both — only the array element ordering differs.

After existing tolerances normalize away transient metadata (identifier, timestamp), empty id, and includeDefinition param, this extension child ordering is the **only** remaining difference for 11 of the 15 affected records. The other 4 records have additional content differences beyond this ordering issue.

## Category: `equiv-autofix`

Extension child element ordering within a complex FHIR extension has no semantic meaning. Extensions are identified by URL, and FHIR does not assign meaning to the order of sub-extension elements within a complex extension. This is analogous to JSON key ordering — a serialization artifact with no terminology significance. Both implementations carry identical information.

## Tolerance

Added `expand-extension-child-order` tolerance (kind: `equiv-autofix`) that sorts child extension arrays within `expansion.extension` by URL. This normalizes both prod and dev to the same canonical order.

- **Records affected**: 15 records match the tolerance (all POST /r4/ValueSet/$expand with R5 backport expansion.property extensions)
- **Records eliminated**: 11 records removed from deltas (the ones where ext ordering was the only diff)
- **Delta count**: 890 → 879
- **Validation**: All 11 eliminated records verified — totals match, code sets match, display text matches, no other content differences hidden
