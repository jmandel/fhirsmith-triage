#!/usr/bin/env node
// Parse gh-issues.md and file each issue to HealthIntersections/FHIRsmith
const { execSync } = require('child_process');
const fs = require('fs');

const md = fs.readFileSync(__dirname + '/gh-issues.md', 'utf8');
const repo = 'HealthIntersections/FHIRsmith';

// Split into issues by "## Issue N:" headers
const issueBlocks = md.split(/^## Issue \d+: /m).slice(1);

const issues = issueBlocks.map(block => {
  const lines = block.split('\n');
  const title = lines[0].trim();

  // Find body: skip the Labels and Affects lines, take everything from Description/### onward
  let bodyLines = [];
  let started = false;
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip Labels and Affects metadata lines
    if (line.startsWith('**Labels**:') || line.startsWith('**Affects**:')) continue;
    // Skip blank lines before content starts
    if (!started && line.trim() === '') continue;

    started = true;

    // Stop at the next issue separator
    if (line === '---') break;

    bodyLines.push(line);
  }

  // Reformat to match existing issue style:
  // ### Description -> ## Bug
  // ### Reproduction -> ## Repro
  // ### FHIR spec reference -> ## Spec reference
  let body = bodyLines.join('\n')
    .replace(/^### Description\n/m, '## Bug\n')
    .replace(/^### Reproduction\n/m, '## Repro\n')
    .replace(/^### FHIR spec reference\n/m, '## Spec reference\n')
    .trim();

  // Remove trailing --- if present
  body = body.replace(/\n---\s*$/, '').trim();

  return { title, body };
});

console.log(`Found ${issues.length} issues to file.\n`);

const created = [];
for (let i = 0; i < issues.length; i++) {
  const { title, body } = issues[i];
  console.log(`[${i + 1}/${issues.length}] Filing: ${title.substring(0, 80)}...`);

  try {
    const result = execSync(
      `gh issue create -R ${repo} --title "${title.replace(/"/g, '\\"')}" --body-file -`,
      { input: body, encoding: 'utf8', timeout: 30000 }
    );
    const url = result.trim();
    created.push({ i: i + 1, title, url });
    console.log(`  -> ${url}`);
  } catch (err) {
    console.error(`  FAILED: ${err.message}`);
    created.push({ i: i + 1, title, url: 'FAILED' });
  }
}

console.log(`\nDone! ${created.filter(c => c.url !== 'FAILED').length}/${issues.length} issues created.`);
console.log('\nCreated issues:');
created.forEach(c => {
  console.log(`  ${c.i}. ${c.url}  ${c.title.substring(0, 70)}`);
});
