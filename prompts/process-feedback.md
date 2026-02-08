# Processing External Feedback into Tolerances

When an expert (e.g., Grahame Grieve — "GG") reviews bug reports from a completed round and provides verdicts, those verdicts need to be incorporated into the **next round's** tolerances. This guide covers the full process.

## Overview

The feedback loop is:

1. Round N runs triage, produces bugs report (`bugs/bugs.md`)
2. Expert reviews the bugs report and gives verdicts on specific issues
3. Agent maps each verdict back to its Round N bug, tolerance, and tolerance ID
4. Agent applies the verdict to Round N+1's copy of that tolerance

## Input: What Feedback Looks Like

Feedback is typically informal — a list of bug titles with short verdicts:

```
BCP-47 case-sensitive validation: dev accepts 'en-us'...
  → "fixed"

SNOMED inactive display message lists extra synonyms...
  → "dev is correct"

POST -code: dev missing code/system/display params...
  → "expected early in the file because the dev server
     doesn't have the same cache as production at start of run"

CodeSystem/-code with multi-coding CodeableConcept...
  → "not sure what to make of this, but I'm not sure I care"

Resource read: prod omits text.div when text.status=generated...
  → "dev is correct but I found a bug testing this anyway, which I fixed"
```

## Step 1: Map Feedback to Round N Bugs and Tolerances

For each piece of feedback, find the corresponding bug and tolerance in the **source round** (the round whose bugs report was reviewed).

### Where to look

- **Bugs report**: `jobs/<round-N>/bugs/bugs.md` — find the bug by title match
- **Bug details include**: bug ID (git-bug short hash), tolerance ID, record IDs, record count
- **Tolerances**: `jobs/<round-N>/tolerances.js` — search by tolerance ID from the bug report

### What to extract for each feedback item

| Field | Where to find it | Example |
|-------|------------------|---------|
| Bug title | bugs.md section header | "BCP-47 case-sensitive validation..." |
| Bug ID | bugs.md `bugId` field (git-bug short hash) | `85d0977` |
| Tolerance ID | bugs.md Tolerance-ID field | `bcp47-case-sensitive-validation` |
| Related tolerances | bugs.md body / tolerance description | `validate-code-undefined-system-result-disagrees` (sibling) |

### Watch for related/sibling tolerances

Some bugs have multiple tolerances covering different manifestations of the same root cause. The bug report body often mentions these. When a verdict applies to one, consider whether it logically applies to siblings too.

Example: Grahame's "cache warmup" verdict on `530eeb3` (3 records, `validate-code-undefined-system-missing-params`) also applies to `19283df` (89 records, `validate-code-undefined-system-result-disagrees`) since both are the same "undefined system" artifact — one where result disagrees, one where result agrees but params differ.

## Step 2: Classify the Verdict

Each verdict falls into one of these categories:

### "Fixed" — Bug was real, now resolved

The expert confirms the difference was a real bug and has been fixed on the server.

**Action on Round N+1 tolerance**: Leave as `temp-tolerance`. If the fix is deployed:
- The records may no longer appear in Round N+1 data (fix eliminates the difference)
- Or the records may now agree (tolerance won't match, goes to OK naturally)
- Either way the tolerance becomes inert — no harm in keeping it

**Why not remove it?** Safer to let it prove itself inert. If the fix isn't fully deployed, the tolerance still catches the pattern. You can clean up confirmed-inert tolerances in a later pass.

### "Dev is correct" / "Don't care" / "Won't fix" — Not a dev bug

The expert says the difference is acceptable: dev is right, prod is wrong, the difference is arbitrary, or nobody cares.

**Action on Round N+1 tolerance**: Reclassify from `temp-tolerance` to `equiv-autofix` with adjudication metadata.

### "Test artifact" — Not a real server difference

The difference is caused by the comparison infrastructure itself (cache warmup, request ordering, data collection timing), not by actual server behavior.

**Action on Round N+1 tolerance**: Same as "dev is correct" — reclassify to `equiv-autofix` with adjudication. The difference isn't meaningful regardless of which server is "right."

## Step 3: Apply Changes to Round N+1 Tolerances

Find each tolerance by ID in `jobs/<round-N+1>/tolerances.js` and apply the appropriate edit.

### For "dev is correct" / "don't care" / "test artifact" verdicts

Change three things on the tolerance object:

1. **`kind`**: `'temp-tolerance'` → `'equiv-autofix'`
2. **Remove `bugId`**: No longer tracking as a bug
3. **Add `adjudication`**: Array of adjudicator tags, e.g. `['gg']`

#### Before:
```js
{
  id: 'some-tolerance-id',
  description: 'Old description treating this as a bug...',
  kind: 'temp-tolerance',
  bugId: 'abc1234',
  tags: [...],
  match(...) { ... },
  normalize(...) { ... },
}
```

#### After:
```js
{
  id: 'some-tolerance-id',
  description: 'Updated description noting the adjudication verdict and reasoning...',
  kind: 'equiv-autofix',
  adjudication: ['gg'],
  tags: [...],
  match(...) { ... },
  normalize(...) { ... },
}
```

### Description update guidelines

Update the description to reflect the verdict. Keep it concise. Patterns:

- **Dev is correct**: `"... Dev is correct (GG adjudicated). ..."`
- **Don't care**: `"... Which X to report is arbitrary (GG adjudicated: \"not sure I care\"). ..."`
- **Test artifact**: `"... Expected test artifact — [reason] (GG adjudicated). Not a real server bug."`

### For "fixed" verdicts

Leave the tolerance unchanged in Round N+1. It will either:
- Match nothing (fix eliminated the pattern) → harmless inert tolerance
- Still match (fix not deployed to comparison endpoint) → still needed

### Don't touch `match()` or `normalize()` logic

The adjudication changes only metadata (`kind`, `bugId`/`adjudication`, `description`). The matching and normalization logic stays identical — it was already correct for identifying the pattern; we're just reclassifying what the pattern means.

## Step 4: Verify

After making edits, spot-check:

```bash
# Confirm all adjudicated tolerances have the right kind
grep -A1 "adjudication.*'gg'" jobs/<round-N+1>/tolerances.js
# Should show kind: 'equiv-autofix' on the line before each match

# Confirm no adjudicated tolerance still has a bugId
grep -B5 "adjudication.*'gg'" jobs/<round-N+1>/tolerances.js | grep bugId
# Should return nothing
```

Optionally, rerun comparison to confirm the tolerances still function:
```bash
node engine/compare.js --job jobs/<round-N+1>
```

The `summary.json` stats will shift: records previously counted under `temp-tolerance` in `skippedByKind` or `okBreakdown` will now appear under `equiv-autofix`. Total counts should be unchanged.

## The `adjudication` Field

### Schema

```js
adjudication: ['gg']  // array of adjudicator tags
```

- **Type**: Array of strings
- **Purpose**: Records who adjudicated this tolerance and why it's considered equivalent rather than a bug
- **Convention**: Short tag per adjudicator (e.g., `'gg'` for Grahame Grieve)
- **Engine impact**: None currently — the comparison engine ignores this field. It's pure metadata for human/agent consumption and future HTML report generation.

### Why an array?

Multiple adjudicators may weigh in across rounds. A tolerance might get `['gg']` in round 2 and later be confirmed by another reviewer, becoming `['gg', 'other']`.

### Who sets this field

Only a human-initiated feedback incorporation process sets `adjudication`. Triage agents **never** add `adjudication` on their own — it requires external expert input. This is what distinguishes `equiv-autofix` tolerances written by agents (cosmetic normalizations the agent can judge independently) from `equiv-autofix` tolerances with `adjudication` (differences the agent flagged as potential bugs, but an expert overruled).

## Gotchas

### 1. Don't confuse Round N and Round N+1

- Read bugs/feedback from Round N's `bugs/bugs.md`
- Apply changes to Round N+1's `tolerances.js`
- Round N's tolerances are a historical snapshot — don't edit them

### 2. Sibling tolerances share verdicts

One bug report may describe a root cause with multiple tolerance manifestations. A verdict on one usually applies to all siblings. The bug report body and tolerance descriptions often cross-reference each other — look for "same root cause as bug X" or "related to tolerance Y."

### 3. "Fixed" doesn't mean "remove"

Resist the urge to delete tolerances for fixed bugs. Leave them as `temp-tolerance`. They'll be inert if the fix is deployed, and still protective if it isn't. Clean up later once confirmed.

### 4. Skip vs normalize tolerances both get reclassified the same way

Whether the tolerance uses `skip` (drops the record entirely) or `normalize` (transforms both sides to match), the reclassification process is identical: change `kind`, swap `bugId` for `adjudication`, update description.

### 5. The engine handles `equiv-autofix` for both skip and normalize

- **Skip** tolerances: engine logs `kind` in `summary.skippedByKind` — changing from `temp-tolerance` to `equiv-autofix` just moves the count between buckets
- **Normalize** tolerances: engine uses `kind` for `summary.okBreakdown` escalation — `temp-tolerance` trumps `equiv-autofix`, so reclassifying reduces the "suppressed real bugs" count and increases the "equivalent" count

### 6. Round N+1 may have new tolerances the agent added

The feedback only covers Round N bugs. Round N+1's `tolerances.js` may have additional tolerances added during its own triage. Don't touch those — only modify tolerances that correspond to Round N feedback items.
