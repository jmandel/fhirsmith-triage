#!/usr/bin/env node
'use strict';

/**
 * Generate sampled "shadow replay" follow-up requests from version-skew records.
 *
 * Why this exists:
 * - `version-skew` can touch a large slice of traffic.
 * - Most of that is low-risk text/version normalization.
 * - The high-value subset is where `version-skew` matched, but the record is still
 *   non-OK after the *full* tolerance pipeline. That is where real findings are
 *   most likely to remain.
 *
 * Method:
 * 1) Read `comparison.ndjson`.
 * 2) Keep only records where tolerance id `version-skew` returns `normalize`.
 * 3) Categorize each record twice:
 *    - with full tolerances
 *    - with all tolerances except `version-skew`
 * 4) Place matched records into strata:
 *    - `highRiskStillNonOk`: still non-OK with full pipeline (priority)
 *    - `rescuedToOk`: only OK when `version-skew` runs
 *    - `noImpact`: OK even without `version-skew`
 * 5) Sample stratified by cluster (`op + system + signal source + final category`),
 *    with configurable target share for high-risk.
 * 6) For each sampled record, emit pinned follow-up requests for both prod and dev
 *    observed versions (up to `--max-followups-per-record`).
 *
 * Common-version mode:
 * - The script can probe support for candidate versions per system on prod/dev.
 * - It then builds a "common supported versions" set per system.
 * - A complete replay universe is generated from sampled records x common versions.
 * - Hydration policy selects which subset to actually run.
 *
 * Working decisions captured in this tool:
 * - Do not append enrichments into the original round dataset. Keep all generated
 *   requests/results in a separate output directory.
 * - Prefer `--version-policy common-only` so we replay only versions that both
 *   prod and dev actually accept for a given terminology system.
 * - If no common version exists for a sampled record's system, drop that record's
 *   generated follow-ups from replay (`droppedNoCommonSampledRecords` in summary).
 * - Use low-pressure replay defaults to avoid overloading endpoints:
 *   `--replay-concurrency 2` and `--replay-actor-delay-ms 500`.
 * - Preserve POST request fidelity by carrying the original `requestBody` into
 *   generated follow-ups.
 * - Enable "all matched" mode with `--sample-size 0` when exhaustive enrichment
 *   is desired (every record matched by `version-skew` is eligible).
 * - Separate "what could be run" from "what to run now":
 *   `followup-universe.ndjson` is complete candidate space, while
 *   `followup-requests.ndjson` is hydrated by policy.
 *
 * Important scope:
 * - This tool does NOT modify or append to the source dataset.
 * - It writes separate enrichment artifacts only.
 *
 * Outputs:
 * - `summary.json`: coverage, strata sizes, sampling outcomes
 * - `sampled-records.ndjson`: sampled source records with classification metadata
 * - `support-matrix.json`: per-system version support probe results
 * - `followup-universe.ndjson`: complete set of follow-ups that could be replayed
 * - `followup-requests.ndjson`: hydrated subset selected by policy (replay input)
 * - `followup-comparison.ndjson`: replay output in `comparison.ndjson` schema
 *   (written only with `--replay`)
 *
 * Usage:
 *   node engine/generate-version-skew-followups.js --job jobs/<round> [options]
 *
 * Common example (separate enrichment folder):
 *   node engine/generate-version-skew-followups.js \
 *     --job jobs/2026-02-round-2 \
 *     --out-dir jobs/2026-02-round-2/results/version-skew-followups-separate \
 *     --sample-size 300 \
 *     --high-risk-share 0.9 \
 *     --per-cluster 15
 *
 * Options:
 * - `--tolerance-ids <id,id,...>`: comma-separated tolerance IDs to treat as version-skew (default `version-skew`)
 * - `--out-dir <dir>`: output directory (default `<job>/results/version-skew-followups`)
 * - `--sample-size <n>`: total sampled records (default `200`; `0` means "use all matched")
 * - `--high-risk-share <0..1>`: fraction from high-risk stratum (default `0.85`)
 * - `--per-cluster <n>`: soft cap per cluster before top-up (default `12`)
 * - `--seed <n>`: RNG seed for deterministic sampling (default `1`)
 * - `--max-records <n>`: stop after scanning n input records (default all)
 * - `--max-seconds <n>`: stop after n seconds of scanning (default unlimited)
 * - `--max-followups-per-record <n>`: generated follow-ups per sampled record (default `2`)
 * - `--version-policy <mode>`: `common-only` or `prod-dev-pair` (default `common-only`)
 * - `--probe-support`: probe candidate system versions against prod/dev (default enabled for `common-only`)
 * - `--probe-concurrency <n>`: concurrent support probes (default `4`)
 * - `--probe-timeout-seconds <n>`: timeout per support probe request (default `20`)
 * - `--hydrate-policy <mode>`: `full`, `random`, `cover-system-version`, `cover-system-params`, `cover-system-version-params`, `cover-cluster` (default `full`)
 * - `--hydrate-size <n>`: target hydrated request count for non-`full` policies (default `0` => all available)
 * - `--param-signature-mode <mode>`: `names`, `filter-values`, `all-values` (default `names`)
 *   - `names`: signature includes unique param/filter names only
 *   - `filter-values`: value-sensitive params include normalized values
 *   - `all-values`: every param includes normalized value
 * - `--replay`: after generation, execute follow-ups and emit comparison.ndjson-style output
 * - `--prod-base <url>`: prod replay base URL (default `https://tx.fhir.org`)
 * - `--dev-base <url>`: dev replay base URL (default `https://tx-dev.fhir.org`)
 * - `--replay-concurrency <n>`: concurrent replay workers (default `2`)
 * - `--replay-timeout-seconds <n>`: timeout per HTTP request (default `30`)
 * - `--replay-output <name>`: replay output filename in out-dir (default `followup-comparison.ndjson`)
 * - `--replay-actor-delay-ms <n>`: delay between requests per worker (default `500`)
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const crypto = require('crypto');

function getArg(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : def;
}

function getInt(flag, def) {
  const raw = getArg(flag, null);
  if (raw === null) return def;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : def;
}

function getFloat(flag, def) {
  const raw = getArg(flag, null);
  if (raw === null) return def;
  const n = Number.parseFloat(raw);
  return Number.isFinite(n) ? n : def;
}

function hasFlag(flag) {
  return process.argv.includes(flag);
}

const JOB_DIR = getArg('--job', null);
if (!JOB_DIR) {
  console.error('Usage: node engine/generate-version-skew-followups.js --job <job-directory> [options]');
  process.exit(1);
}

const jobDir = path.resolve(JOB_DIR);
const inputPath = path.join(jobDir, 'comparison.ndjson');
const outDir = path.resolve(getArg('--out-dir', path.join(jobDir, 'results', 'version-skew-followups')));
const sampleSize = Math.max(0, getInt('--sample-size', 200));
const highRiskShare = Math.max(0, Math.min(1, getFloat('--high-risk-share', 0.85)));
const perCluster = Math.max(0, getInt('--per-cluster', 12));
const seed = getInt('--seed', 1) >>> 0;
const maxRecords = Math.max(0, getInt('--max-records', 0));
const maxSeconds = Math.max(0, getInt('--max-seconds', 0));
const maxFollowupsPerRecord = Math.max(0, getInt('--max-followups-per-record', 2));
const versionPolicy = getArg('--version-policy', 'common-only');
const probeSupport = hasFlag('--probe-support') || versionPolicy === 'common-only';
const probeConcurrency = Math.max(1, getInt('--probe-concurrency', 4));
const probeTimeoutSeconds = Math.max(1, getInt('--probe-timeout-seconds', 20));
const hydratePolicy = getArg('--hydrate-policy', 'full');
const hydrateSize = Math.max(0, getInt('--hydrate-size', 0));
const paramSignatureMode = getArg('--param-signature-mode', 'names');
const replayEnabled = hasFlag('--replay');
const prodBase = getArg('--prod-base', 'https://tx.fhir.org');
const devBase = getArg('--dev-base', 'https://tx-dev.fhir.org');
const replayConcurrency = Math.max(1, getInt('--replay-concurrency', 2));
const replayTimeoutSeconds = Math.max(1, getInt('--replay-timeout-seconds', 30));
const replayOutputName = getArg('--replay-output', 'followup-comparison.ndjson');
const replayActorDelayMs = Math.max(0, getInt('--replay-actor-delay-ms', 500));
const sampleAllMatched = sampleSize === 0;

const validParamSignatureModes = new Set(['names', 'filter-values', 'all-values']);
if (!validParamSignatureModes.has(paramSignatureMode)) {
  console.error(`Invalid --param-signature-mode '${paramSignatureMode}'. Expected one of: names, filter-values, all-values.`);
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`comparison.ndjson not found: ${inputPath}`);
  process.exit(1);
}

const { tolerances, getParamValue } = require(path.join(jobDir, 'tolerances'));
const toleranceIdsRaw = getArg('--tolerance-ids', 'version-skew');
const versionSkewIds = new Set(toleranceIdsRaw.split(',').map(s => s.trim()).filter(Boolean));
const versionSkewTolerances = tolerances.filter(t => versionSkewIds.has(t.id));
if (versionSkewTolerances.length === 0) {
  console.error(`No tolerances found matching ids [${[...versionSkewIds].join(', ')}] in ${path.join(jobDir, 'tolerances.js')}`);
  process.exit(1);
}
console.error(`Using ${versionSkewTolerances.length} version-skew tolerance(s): ${versionSkewTolerances.map(t => t.id).join(', ')}`);
const tolerancesNoVersionSkew = tolerances.filter(t => !versionSkewIds.has(t.id));

function mulberry32(a) {
  return function rng() {
    let t = a += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rng = mulberry32(seed);

function pickRandomInt(maxExclusive) {
  return Math.floor(rng() * maxExclusive);
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = pickRandomInt(i + 1);
    const t = arr[i];
    arr[i] = arr[j];
    arr[j] = t;
  }
}

function deepClone(obj) {
  return obj === undefined ? undefined : JSON.parse(JSON.stringify(obj));
}

function sortKeysDeep(obj) {
  if (obj === null || obj === undefined || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortKeysDeep);
  const sorted = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortKeysDeep(obj[key]);
  }
  return sorted;
}

function deepEqual(a, b) {
  return JSON.stringify(sortKeysDeep(a)) === JSON.stringify(sortKeysDeep(b));
}

function getOperation(url) {
  const base = (url || '').split('?')[0];
  if (base.includes('$validate-code')) return 'validate-code';
  if (base.includes('$batch-validate-code')) return 'batch-validate-code';
  if (base.includes('$expand')) return 'expand';
  if (base.includes('$lookup')) return 'lookup';
  if (base.includes('$subsumes')) return 'subsumes';
  if (base.includes('$translate')) return 'translate';
  if (base.includes('/metadata')) return 'metadata';
  if (base.match(/\/(CodeSystem|ValueSet|ConceptMap)(\/|$)/)) return 'read';
  return 'other';
}

function findParameterDiffs(prod, dev) {
  const diffs = [];
  const prodParams = new Map((prod?.parameter || []).map(p => [p.name, p]));
  const devParams = new Map((dev?.parameter || []).map(p => [p.name, p]));

  for (const [name, param] of prodParams) {
    if (!devParams.has(name)) diffs.push({ type: 'missing-in-dev', param: name });
    else if (!deepEqual(param, devParams.get(name))) diffs.push({ type: 'value-differs', param: name });
  }
  for (const name of devParams.keys()) {
    if (!prodParams.has(name)) diffs.push({ type: 'extra-in-dev', param: name });
  }
  return diffs;
}

function parseBody(bodyText) {
  try {
    return bodyText ? JSON.parse(bodyText) : null;
  } catch {
    return null;
  }
}

function runTolerancePipeline(record, toleranceList) {
  const ctx = {
    record,
    prod: parseBody(record.prodBody),
    dev: parseBody(record.devBody),
  };

  const applied = [];
  for (const t of toleranceList) {
    let action = null;
    try {
      action = t.match(ctx);
    } catch {
      action = null;
    }

    if (action === 'skip') {
      applied.push({ id: t.id, kind: t.kind || 'unknown', action: 'skip', changed: false });
      return { skippedBy: t.id, prod: ctx.prod, dev: ctx.dev, applied };
    }

    if (action === 'normalize' && ctx.prod && ctx.dev && typeof t.normalize === 'function') {
      const before = JSON.stringify(ctx.prod) + JSON.stringify(ctx.dev);
      let result;
      try {
        result = t.normalize(ctx);
      } catch {
        result = { prod: ctx.prod, dev: ctx.dev };
      }
      ctx.prod = result?.prod;
      ctx.dev = result?.dev;
      const after = JSON.stringify(ctx.prod) + JSON.stringify(ctx.dev);
      applied.push({ id: t.id, kind: t.kind || 'unknown', action: 'normalize', changed: before !== after });
    }
  }

  return { skippedBy: null, prod: ctx.prod, dev: ctx.dev, applied };
}

function categorize(record, runResult) {
  if (runResult.skippedBy) {
    return { category: 'SKIP', skippedBy: runResult.skippedBy, op: getOperation(record.url) };
  }

  const prodStatus = record?.prod?.status;
  const devStatus = record?.dev?.status;
  const op = getOperation(record.url);
  const prod = runResult.prod;
  const dev = runResult.dev;

  if (prodStatus !== devStatus) {
    if (devStatus === 500) {
      if (prodStatus === 200) return { category: 'dev-crash-on-valid', op };
      return { category: 'dev-crash-on-error', op, prodStatus, devStatus };
    }
    if (prodStatus === 200 && devStatus === 404) return { category: 'missing-resource', op };
    return { category: 'status-mismatch', op, prodStatus, devStatus };
  }

  if (!prod || !dev) return { category: 'parse-error', op };

  const prodResult = getParamValue(prod, 'result');
  const devResult = getParamValue(dev, 'result');
  if (prodResult !== undefined && devResult !== undefined && prodResult !== devResult) {
    return {
      category: 'result-disagrees',
      op,
      prodResult,
      devResult,
      system: getParamValue(prod, 'system') || getParamValue(dev, 'system'),
      code: getParamValue(prod, 'code') || getParamValue(dev, 'code'),
    };
  }

  if (deepEqual(prod, dev)) return { category: 'OK', op };
  return { category: 'content-differs', op, diffs: findParameterDiffs(prod, dev) };
}

function extractVersionPairs(record, prod, dev) {
  const pairs = [];

  function addPair(source, system, prodVersion, devVersion) {
    if (!system || !prodVersion || !devVersion || prodVersion === devVersion) return;
    pairs.push({ source, system, prodVersion, devVersion });
  }

  function mapByBase(list) {
    const out = new Map();
    for (const raw of list) {
      if (typeof raw !== 'string' || !raw.includes('|')) continue;
      const idx = raw.lastIndexOf('|');
      const base = raw.slice(0, idx);
      const version = raw.slice(idx + 1);
      out.set(base, version);
    }
    return out;
  }

  const prodExpansion = prod?.expansion || {};
  const devExpansion = dev?.expansion || {};
  const prodParams = prodExpansion.parameter || [];
  const devParams = devExpansion.parameter || [];

  const prodUcs = mapByBase(prodParams.filter(p => p?.name === 'used-codesystem').map(p => p.valueUri));
  const devUcs = mapByBase(devParams.filter(p => p?.name === 'used-codesystem').map(p => p.valueUri));
  for (const [system, pVer] of prodUcs.entries()) {
    addPair('used-codesystem', system, pVer, devUcs.get(system));
  }

  const prodUvs = mapByBase(prodParams.filter(p => p?.name === 'used-valueset').map(p => p.valueUri));
  const devUvs = mapByBase(devParams.filter(p => p?.name === 'used-valueset').map(p => p.valueUri));
  for (const [system, pVer] of prodUvs.entries()) {
    addPair('used-valueset', system, pVer, devUvs.get(system));
  }

  const prodSystem = getParamValue(prod, 'system');
  const devSystem = getParamValue(dev, 'system');
  const prodVersion = getParamValue(prod, 'version');
  const devVersion = getParamValue(dev, 'version');
  if (prodSystem && prodSystem === devSystem) {
    addPair('parameter.version', prodSystem, prodVersion, devVersion);
  }

  const prodContains = Array.isArray(prodExpansion.contains) ? prodExpansion.contains : [];
  const devContains = Array.isArray(devExpansion.contains) ? devExpansion.contains : [];
  if (prodContains.length > 0 && devContains.length > 0) {
    const prodBySystem = new Map();
    const devBySystem = new Map();

    for (const c of prodContains) {
      if (!c?.system || !c?.version) continue;
      const bucket = prodBySystem.get(c.system) || new Map();
      bucket.set(c.version, (bucket.get(c.version) || 0) + 1);
      prodBySystem.set(c.system, bucket);
    }
    for (const c of devContains) {
      if (!c?.system || !c?.version) continue;
      const bucket = devBySystem.get(c.system) || new Map();
      bucket.set(c.version, (bucket.get(c.version) || 0) + 1);
      devBySystem.set(c.system, bucket);
    }

    const allSystems = new Set([...prodBySystem.keys(), ...devBySystem.keys()]);
    for (const system of allSystems) {
      const pEntries = [...(prodBySystem.get(system) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
      const dEntries = [...(devBySystem.get(system) || new Map()).entries()].sort((a, b) => b[1] - a[1]);
      const pVer = pEntries[0]?.[0];
      const dVer = dEntries[0]?.[0];
      addPair('contains.version-dominant', system, pVer, dVer);
    }
  }

  const deduped = [];
  const seen = new Set();
  for (const pair of pairs) {
    const key = `${pair.source}|${pair.system}|${pair.prodVersion}|${pair.devVersion}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(pair);
  }
  return deduped;
}

function choosePrimaryPair(pairs) {
  if (!pairs.length) return null;
  const weight = {
    'parameter.version': 0,
    'used-codesystem': 1,
    'used-valueset': 2,
    'contains.version-dominant': 3,
  };
  const sorted = [...pairs].sort((a, b) => (weight[a.source] ?? 99) - (weight[b.source] ?? 99));
  return sorted[0];
}

function withPinnedUrl(url, paramName, paramValue) {
  if (!url) return url;
  const [base, query] = url.split('?');
  const params = new URLSearchParams(query || '');
  params.set(paramName, paramValue);
  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

function setOrAddParameter(body, name, valueKey, value) {
  const next = deepClone(body) || { resourceType: 'Parameters', parameter: [] };
  if (!Array.isArray(next.parameter)) next.parameter = [];
  let found = false;
  next.parameter = next.parameter.map(p => {
    if ((p?.name || '').toLowerCase() !== name.toLowerCase()) return p;
    found = true;
    const clone = { ...p };
    for (const k of Object.keys(clone)) {
      if (k.startsWith('value')) delete clone[k];
    }
    clone[valueKey] = value;
    return clone;
  });
  if (!found) {
    next.parameter.push({ name, [valueKey]: value });
  }
  return next;
}

function makePinnedFollowupForVersion(record, pair, targetVersion, pinLabel) {
  const method = (record.method || 'GET').toUpperCase();
  const follow = {
    sourceRecordId: record.id,
    pinTarget: pinLabel || 'custom',
    pinSource: pair.source,
    pinSystem: pair.system,
    pinVersion: targetVersion,
    method,
    url: record.url,
  };

  let pinParam = 'system-version';
  let pinValue = `${pair.system}|${targetVersion}`;
  let bodyValueKey = 'valueCanonical';
  let bodyValue = pinValue;

  if (pair.source === 'used-valueset') {
    pinParam = 'valuesetversion';
    pinValue = targetVersion;
    bodyValueKey = 'valueString';
    bodyValue = targetVersion;
  }

  if (method === 'GET') {
    follow.url = withPinnedUrl(record.url, pinParam, pinValue);
    return follow;
  }

  if (method === 'POST' && record.requestBody) {
    const parsed = parseBody(record.requestBody);
    if (parsed) {
      const patched = setOrAddParameter(parsed, pinParam, bodyValueKey, bodyValue);
      follow.requestBody = JSON.stringify(patched);
      return follow;
    }
  }

  follow.url = withPinnedUrl(record.url, pinParam, pinValue);
  if (record.requestBody) follow.requestBody = record.requestBody;
  return follow;
}

function makePinnedFollowupPair(record, pair, target) {
  const targetVersion = target === 'prod' ? pair.prodVersion : pair.devVersion;
  return makePinnedFollowupForVersion(record, pair, targetVersion, target);
}

function stratifiedSample(candidates, want, clusterLimit) {
  if (want <= 0 || candidates.length === 0) return [];
  if (want >= candidates.length) return [...candidates];

  const byCluster = new Map();
  for (const c of candidates) {
    const bucket = byCluster.get(c.clusterKey) || [];
    bucket.push(c);
    byCluster.set(c.clusterKey, bucket);
  }

  const clusters = [...byCluster.keys()];
  shuffleInPlace(clusters);
  for (const key of clusters) {
    shuffleInPlace(byCluster.get(key));
  }

  const picks = [];
  const usedByCluster = new Map();
  let clusterCursor = 0;

  while (picks.length < want) {
    let progressed = false;
    for (let i = 0; i < clusters.length && picks.length < want; i += 1) {
      const idx = (clusterCursor + i) % clusters.length;
      const key = clusters[idx];
      const bucket = byCluster.get(key);
      const used = usedByCluster.get(key) || 0;
      if (!bucket || bucket.length === 0) continue;
      if (clusterLimit > 0 && used >= clusterLimit) continue;
      picks.push(bucket.pop());
      usedByCluster.set(key, used + 1);
      progressed = true;
    }
    clusterCursor = (clusterCursor + 1) % Math.max(clusters.length, 1);
    if (!progressed) break;
  }

  // If cluster caps prevented filling the target, top up from leftovers.
  if (picks.length < want) {
    const leftovers = [];
    for (const bucket of byCluster.values()) leftovers.push(...bucket);
    shuffleInPlace(leftovers);
    for (const item of leftovers) {
      if (picks.length >= want) break;
      picks.push(item);
    }
  }

  return picks;
}

function extractDiagnosticText(bodyText) {
  if (!bodyText) return '';
  try {
    const body = JSON.parse(bodyText);
    if (body?.resourceType === 'OperationOutcome') {
      const issue = body.issue?.[0];
      return issue?.details?.text || issue?.diagnostics || '';
    }
    if (body?.resourceType === 'Parameters' || Array.isArray(body?.parameter)) {
      const messageParam = (body.parameter || []).find(p => p?.name === 'message');
      if (messageParam) {
        return messageParam.valueString || messageParam.valueCode || messageParam.valueUri || '';
      }
      const issuesParam = (body.parameter || []).find(p => p?.name === 'issues');
      const issue = issuesParam?.resource?.issue?.[0];
      return issue?.details?.text || issue?.diagnostics || '';
    }
  } catch {
    return '';
  }
  return '';
}

const versionPinParamNames = new Set([
  'system-version',
  'check-system-version',
  'force-system-version',
  'valuesetversion',
  'version',
]);

function isValueSensitiveParam(name) {
  return /(^|[-_])(filter|property|designation|count|offset|context|date|displaylanguage|include|exclude|active|abstract)/i.test(name);
}

function normalizeSignatureValue(value) {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value.trim().toLowerCase();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(sortKeysDeep(value)).toLowerCase();
  } catch {
    return String(value).toLowerCase();
  }
}

function getParameterValue(param) {
  if (!param || typeof param !== 'object') return '';
  for (const [k, v] of Object.entries(param)) {
    if (k.startsWith('value')) return v;
  }
  if (Array.isArray(param.part) && param.part.length > 0) {
    return param.part.map(p => ({ name: p?.name || '', value: getParameterValue(p) }));
  }
  if (param.resource) return { resourceType: param.resource.resourceType || 'Resource' };
  return '';
}

function requestToken(name, value, mode) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return null;
  if (versionPinParamNames.has(n)) return null;
  if (mode === 'names') return n;
  if (mode === 'all-values') return `${n}=${normalizeSignatureValue(value)}`;
  if (mode === 'filter-values' && isValueSensitiveParam(n)) {
    return `${n}=${normalizeSignatureValue(value)}`;
  }
  return n;
}

function requestParamSignature(record, mode) {
  const tokens = new Set();
  const url = record?.url || '';
  const qIndex = url.indexOf('?');
  const query = qIndex >= 0 ? url.slice(qIndex + 1) : '';
  const params = new URLSearchParams(query);
  for (const [name, value] of params.entries()) {
    const tok = requestToken(name, value, mode);
    if (tok) tokens.add(tok);
  }

  const body = parseBody(record?.requestBody);
  if (body && Array.isArray(body.parameter)) {
    for (const p of body.parameter) {
      const tok = requestToken(p?.name, getParameterValue(p), mode);
      if (tok) tokens.add(tok);
    }
  }

  const sorted = [...tokens].sort();
  return sorted.length ? sorted.join('&') : '(none)';
}

function classifyVersionSupport(response) {
  const status = response?.status || 0;
  if (status === 200) return { state: 'supported', reason: 'status-200' };

  const msg = extractDiagnosticText(response?.body || '').toLowerCase();
  if (status === 404 || status === 422) {
    return { state: 'unsupported', reason: `status-${status}` };
  }
  if (msg.includes('valid versions') ||
      msg.includes('could not be found') ||
      msg.includes('unknown_codesystem_version') ||
      msg.includes('unknown version') ||
      msg.includes('version') && msg.includes('not found')) {
    return { state: 'unsupported', reason: 'version-not-supported' };
  }
  if (status === 0) return { state: 'unknown', reason: 'network-error' };
  return { state: 'unknown', reason: `status-${status}` };
}

async function buildSupportMatrix(sampled, options) {
  const {
    prodBaseUrl,
    devBaseUrl,
    concurrency,
    timeoutSeconds,
  } = options;

  const systems = new Map();
  for (const s of sampled) {
    if (!s?.primaryPair?.system) continue;
    const system = s.primaryPair.system;
    const slot = systems.get(system) || {
      system,
      representativeRecord: s,
      representativePair: s.primaryPair,
      candidateVersions: new Set(),
    };
    for (const pair of (s.pairs || [])) {
      if (pair?.system !== system) continue;
      if (pair.prodVersion) slot.candidateVersions.add(pair.prodVersion);
      if (pair.devVersion) slot.candidateVersions.add(pair.devVersion);
    }
    if (slot.candidateVersions.size === 0) {
      if (s.primaryPair.prodVersion) slot.candidateVersions.add(s.primaryPair.prodVersion);
      if (s.primaryPair.devVersion) slot.candidateVersions.add(s.primaryPair.devVersion);
    }
    systems.set(system, slot);
  }

  const probes = [];
  for (const slot of systems.values()) {
    for (const version of slot.candidateVersions) {
      probes.push({
        system: slot.system,
        version,
        representativeRecord: slot.representativeRecord,
        representativePair: slot.representativePair,
      });
    }
  }

  const index = { value: 0 };
  const results = [];
  const timeoutMs = timeoutSeconds * 1000;

  async function worker() {
    while (true) {
      const i = index.value;
      index.value += 1;
      if (i >= probes.length) return;
      const probe = probes[i];
      const req = makePinnedFollowupForVersion(
        probe.representativeRecord,
        probe.representativePair,
        probe.version,
        'probe'
      );

      const [prodRes, devRes] = await Promise.all([
        fetchOne(prodBaseUrl, req, timeoutMs),
        fetchOne(devBaseUrl, req, timeoutMs),
      ]);
      const prodClass = classifyVersionSupport(prodRes);
      const devClass = classifyVersionSupport(devRes);

      results.push({
        system: probe.system,
        version: probe.version,
        representative: {
          recordId: probe.representativeRecord.id,
          method: req.method,
          url: req.url,
        },
        prod: {
          status: prodRes.status,
          support: prodClass.state,
          reason: prodClass.reason,
        },
        dev: {
          status: devRes.status,
          support: devClass.state,
          reason: devClass.reason,
        },
        common: prodClass.state === 'supported' && devClass.state === 'supported',
      });
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, Math.max(probes.length, 1)); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);

  const bySystem = {};
  for (const row of results) {
    bySystem[row.system] = bySystem[row.system] || {
      candidates: [],
      commonVersions: [],
      prodSupported: [],
      devSupported: [],
      rows: [],
    };
    bySystem[row.system].rows.push(row);
  }

  for (const [system, bucket] of Object.entries(bySystem)) {
    const uniqCandidates = new Set();
    const common = new Set();
    const prodSupported = new Set();
    const devSupported = new Set();
    for (const row of bucket.rows) {
      uniqCandidates.add(row.version);
      if (row.common) common.add(row.version);
      if (row.prod.support === 'supported') prodSupported.add(row.version);
      if (row.dev.support === 'supported') devSupported.add(row.version);
    }
    bucket.candidates = [...uniqCandidates];
    bucket.commonVersions = [...common];
    bucket.prodSupported = [...prodSupported];
    bucket.devSupported = [...devSupported];
  }

  return {
    probeCount: probes.length,
    systems: bySystem,
    rows: results.sort((a, b) =>
      a.system.localeCompare(b.system) || String(a.version).localeCompare(String(b.version))
    ),
  };
}

function hydrateUniverse(universe, policy, targetSize) {
  if (policy === 'full') return [...universe];

  if (policy === 'random') {
    const arr = [...universe];
    shuffleInPlace(arr);
    if (targetSize <= 0 || targetSize >= arr.length) return arr;
    return arr.slice(0, targetSize);
  }

  let keyFn = null;
  if (policy === 'cover-system-version') {
    keyFn = r => `${r.meta?.pinSystem || ''}|${r.meta?.pinVersion || ''}`;
  } else if (policy === 'cover-system-params') {
    keyFn = r => `${r.meta?.pinSystem || ''}|${r.meta?.paramSignature || '(none)'}`;
  } else if (policy === 'cover-system-version-params') {
    keyFn = r => `${r.meta?.pinSystem || ''}|${r.meta?.pinVersion || ''}|${r.meta?.paramSignature || '(none)'}`;
  } else if (policy === 'cover-cluster') {
    keyFn = r => `${r.meta?.clusterKey || ''}|${r.meta?.pinSystem || ''}|${r.meta?.pinVersion || ''}`;
  } else {
    const arr = [...universe];
    shuffleInPlace(arr);
    if (targetSize <= 0 || targetSize >= arr.length) return arr;
    return arr.slice(0, targetSize);
  }

  const shuffled = [...universe];
  shuffleInPlace(shuffled);
  const covered = [];
  const seen = new Set();
  const rest = [];
  for (const req of shuffled) {
    const key = keyFn(req);
    if (!seen.has(key)) {
      seen.add(key);
      covered.push(req);
    } else {
      rest.push(req);
    }
  }

  if (targetSize <= 0) return covered;
  if (targetSize <= covered.length) {
    shuffleInPlace(covered);
    return covered.slice(0, targetSize);
  }

  const out = [...covered];
  shuffleInPlace(rest);
  for (const req of rest) {
    if (out.length >= targetSize) break;
    out.push(req);
  }
  return out;
}

function md5Hex(text) {
  return crypto.createHash('md5').update(text || '', 'utf8').digest('hex');
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchOne(base, request, timeoutMs) {
  const target = new URL(request.url, base).toString();
  const method = (request.method || 'GET').toUpperCase();
  const headers = { Accept: 'application/fhir+json' };
  const init = { method, headers };

  if (method === 'POST' && request.requestBody) {
    headers['Content-Type'] = 'application/fhir+json';
    init.body = request.requestBody;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  try {
    const res = await fetch(target, init);
    const body = await res.text();
    const contentType = res.headers.get('content-type') || '';
    return {
      status: res.status,
      contentType,
      size: Buffer.byteLength(body, 'utf8'),
      hash: md5Hex(body),
      body,
    };
  } catch {
    return {
      status: 0,
      contentType: '',
      size: 0,
      hash: md5Hex(''),
      body: '',
    };
  } finally {
    clearTimeout(timer);
  }
}

async function replayFollowupsToComparison(followups, outputPath, options) {
  const {
    prodBaseUrl,
    devBaseUrl,
    concurrency,
    timeoutSeconds,
    actorDelayMs,
  } = options;
  const timeoutMs = timeoutSeconds * 1000;
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  const stream = fs.createWriteStream(outputPath);

  let index = 0;
  let completed = 0;
  const total = followups.length;
  const statusCounts = {};

  async function worker() {
    while (true) {
      const i = index;
      index += 1;
      if (i >= total) return;

      const req = followups[i];
      const [prodRes, devRes] = await Promise.all([
        fetchOne(prodBaseUrl, req, timeoutMs),
        fetchOne(devBaseUrl, req, timeoutMs),
      ]);

      statusCounts[`prod:${prodRes.status}`] = (statusCounts[`prod:${prodRes.status}`] || 0) + 1;
      statusCounts[`dev:${devRes.status}`] = (statusCounts[`dev:${devRes.status}`] || 0) + 1;

      const rec = {
        ts: new Date().toISOString(),
        id: req.id,
        method: req.method,
        url: req.url,
        match: prodRes.hash === devRes.hash,
        prod: {
          status: prodRes.status,
          contentType: prodRes.contentType,
          size: prodRes.size,
          hash: prodRes.hash,
        },
        dev: {
          status: devRes.status,
          contentType: devRes.contentType,
          size: devRes.size,
          hash: devRes.hash,
        },
        prodBody: prodRes.body,
        devBody: devRes.body,
        ...(req.requestBody ? { requestBody: req.requestBody } : {}),
      };

      if (!stream.write(JSON.stringify(rec) + '\n')) {
        await new Promise(resolve => stream.once('drain', resolve));
      }

      completed += 1;
      if (completed % 10 === 0 || completed === total) {
        console.log(`  replayed ${completed}/${total}`);
      }

      if (actorDelayMs > 0) {
        await sleep(actorDelayMs);
      }
    }
  }

  const workers = [];
  for (let i = 0; i < Math.min(concurrency, Math.max(total, 1)); i += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  await new Promise(resolve => stream.end(resolve));
  return { total, statusCounts };
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true });

  const startedAt = Date.now();
  const maxMillis = maxSeconds > 0 ? maxSeconds * 1000 : 0;

  const stats = {
    scanned: 0,
    versionSkewMatched: 0,
    strata: {
      highRiskStillNonOk: 0,
      rescuedToOk: 0,
      noImpact: 0,
      skippedByOther: 0,
    },
    categoriesWithVersionSkew: {},
    categoriesWithoutVersionSkew: {},
  };

  const highRisk = [];
  const rescued = [];
  const noImpact = [];

  const rl = readline.createInterface({
    input: fs.createReadStream(inputPath),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (!line.trim()) continue;
    if (maxRecords > 0 && stats.scanned >= maxRecords) break;
    stats.scanned += 1;
    if (maxMillis > 0 && (Date.now() - startedAt) > maxMillis) break;

    let record;
    try {
      record = JSON.parse(line);
    } catch {
      continue;
    }

    const rawProd = parseBody(record.prodBody);
    const rawDev = parseBody(record.devBody);
    if (!rawProd || !rawDev) continue;

    let vsAction = null;
    for (const vst of versionSkewTolerances) {
      try {
        const action = vst.match({ record, prod: deepClone(rawProd), dev: deepClone(rawDev) });
        if (action === 'normalize') { vsAction = 'normalize'; break; }
      } catch { /* skip */ }
    }
    if (vsAction !== 'normalize') continue;

    stats.versionSkewMatched += 1;

    const fullRun = runTolerancePipeline(record, tolerances);
    const fullCmp = categorize(record, fullRun);
    const noVsRun = runTolerancePipeline(record, tolerancesNoVersionSkew);
    const noVsCmp = categorize(record, noVsRun);

    stats.categoriesWithVersionSkew[fullCmp.category] = (stats.categoriesWithVersionSkew[fullCmp.category] || 0) + 1;
    stats.categoriesWithoutVersionSkew[noVsCmp.category] = (stats.categoriesWithoutVersionSkew[noVsCmp.category] || 0) + 1;

    const vsApplied = fullRun.applied.find(a => versionSkewIds.has(a.id) && a.action === 'normalize');
    const pairs = extractVersionPairs(record, rawProd, rawDev);
    const primaryPair = choosePrimaryPair(pairs);

    const item = {
      id: record.id,
      method: record.method,
      url: record.url,
      requestBody: record.requestBody,
      op: getOperation(record.url),
      withVersionSkew: fullCmp.category,
      withoutVersionSkew: noVsCmp.category,
      versionSkewChanged: !!vsApplied?.changed,
      primaryPair,
      pairCount: pairs.length,
      pairs,
      paramSignature: requestParamSignature(record, paramSignatureMode),
      clusterKey: `${getOperation(record.url)}|${primaryPair?.system || 'unknown'}|${primaryPair?.source || 'none'}|${fullCmp.category}`,
      note: '',
    };

    if (fullCmp.category === 'SKIP') {
      stats.strata.skippedByOther += 1;
      continue;
    }

    if (fullCmp.category !== 'OK') {
      item.note = 'version-skew matched but final comparison still non-OK after full pipeline';
      highRisk.push(item);
      stats.strata.highRiskStillNonOk += 1;
      continue;
    }

    if (noVsCmp.category !== 'OK') {
      item.note = 'version-skew appears required to rescue record to OK';
      rescued.push(item);
      stats.strata.rescuedToOk += 1;
    } else {
      item.note = 'already OK even without version-skew';
      noImpact.push(item);
      stats.strata.noImpact += 1;
    }
  }

  let sampledHigh = [];
  let sampledRescued = [];
  let sampledNoImpact = [];
  let sampled = [];
  if (sampleAllMatched) {
    sampledHigh = [...highRisk];
    sampledRescued = [...rescued];
    sampledNoImpact = [...noImpact];
    sampled = [...sampledHigh, ...sampledRescued, ...sampledNoImpact];
  } else {
    const highTarget = Math.min(highRisk.length, Math.round(sampleSize * highRiskShare));
    const restTarget = Math.max(0, sampleSize - highTarget);
    const rescuedTarget = Math.min(rescued.length, restTarget);
    const noImpactTarget = Math.max(0, restTarget - rescuedTarget);
    sampledHigh = stratifiedSample(highRisk, highTarget, perCluster);
    sampledRescued = stratifiedSample(rescued, rescuedTarget, perCluster);
    sampledNoImpact = stratifiedSample(noImpact, noImpactTarget, perCluster);
    sampled = [...sampledHigh, ...sampledRescued, ...sampledNoImpact];
  }
  shuffleInPlace(sampled);

  let supportMatrix = {
    probeCount: 0,
    systems: {},
    rows: [],
  };

  if (versionPolicy === 'common-only' && probeSupport) {
    console.log(`Probing support matrix (systems from sampled records)...`);
    supportMatrix = await buildSupportMatrix(sampled, {
      prodBaseUrl: prodBase,
      devBaseUrl: devBase,
      concurrency: probeConcurrency,
      timeoutSeconds: probeTimeoutSeconds,
    });
    console.log(`Support probes completed: ${supportMatrix.probeCount}`);
  }

  const universe = [];
  let droppedNoCommon = 0;

  for (const s of sampled) {
    if (!s.primaryPair) continue;
    let versions = [];

    if (versionPolicy === 'common-only') {
      const sys = supportMatrix.systems[s.primaryPair.system];
      versions = [...(sys?.commonVersions || [])];
      versions.sort((a, b) => String(a).localeCompare(String(b)));
      if (maxFollowupsPerRecord > 0) versions = versions.slice(0, maxFollowupsPerRecord);
    } else {
      versions = [s.primaryPair.prodVersion, s.primaryPair.devVersion].filter(Boolean);
      versions = [...new Set(versions)];
      if (maxFollowupsPerRecord > 0) versions = versions.slice(0, maxFollowupsPerRecord);
    }

    if (versions.length === 0) {
      droppedNoCommon += 1;
      continue;
    }

    let idx = 0;
    for (const ver of versions) {
      const pinLabel = versionPolicy === 'common-only' ? 'common' : 'pair';
      const v = makePinnedFollowupForVersion(s, s.primaryPair, ver, pinLabel);
      universe.push({
        id: `${s.id}:pin:${pinLabel}:${md5Hex(String(ver)).slice(0, 8)}:${idx}`,
        method: v.method,
        url: v.url,
        ...(v.requestBody ? { requestBody: v.requestBody } : {}),
        meta: {
          sourceRecordId: v.sourceRecordId,
          pinTarget: v.pinTarget,
          pinSource: v.pinSource,
          pinSystem: v.pinSystem,
          pinVersion: v.pinVersion,
          clusterKey: s.clusterKey,
          withVersionSkew: s.withVersionSkew,
          withoutVersionSkew: s.withoutVersionSkew,
          versionPolicy,
          paramSignature: s.paramSignature,
        },
      });
      idx += 1;
    }
  }

  const followups = hydrateUniverse(universe, hydratePolicy, hydrateSize);

  const summary = {
    jobDir,
    scanned: stats.scanned,
    sampleConfig: {
      sampleSize,
      sampleAllMatched,
      highRiskShare,
      perCluster,
      seed,
      maxRecords,
      maxSeconds,
      maxFollowupsPerRecord,
      versionPolicy,
      probeSupport,
      probeConcurrency,
      probeTimeoutSeconds,
      hydratePolicy,
      hydrateSize,
      paramSignatureMode,
      replayEnabled,
      prodBase,
      devBase,
      replayConcurrency,
      replayTimeoutSeconds,
      replayOutputName,
      replayActorDelayMs,
    },
    stats,
    poolSizes: {
      highRisk: highRisk.length,
      rescued: rescued.length,
      noImpact: noImpact.length,
    },
    sampledCounts: {
      highRisk: sampledHigh.length,
      rescued: sampledRescued.length,
      noImpact: sampledNoImpact.length,
      total: sampled.length,
    },
    support: {
      probeCount: supportMatrix.probeCount,
      systemsProbed: Object.keys(supportMatrix.systems || {}).length,
      droppedNoCommonSampledRecords: droppedNoCommon,
    },
    universeGenerated: universe.length,
    hydratedFollowups: followups.length,
  };

  const summaryPath = path.join(outDir, 'summary.json');
  const sampledPath = path.join(outDir, 'sampled-records.ndjson');
  const supportPath = path.join(outDir, 'support-matrix.json');
  const universePath = path.join(outDir, 'followup-universe.ndjson');
  const followupsPath = path.join(outDir, 'followup-requests.ndjson');

  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
  fs.writeFileSync(sampledPath, sampled.map(s => JSON.stringify(s)).join('\n') + (sampled.length ? '\n' : ''));
  fs.writeFileSync(supportPath, JSON.stringify(supportMatrix, null, 2) + '\n');
  fs.writeFileSync(universePath, universe.map(f => JSON.stringify(f)).join('\n') + (universe.length ? '\n' : ''));
  fs.writeFileSync(followupsPath, followups.map(f => JSON.stringify(f)).join('\n') + (followups.length ? '\n' : ''));

  console.log(`Wrote: ${summaryPath}`);
  console.log(`Wrote: ${sampledPath}`);
  console.log(`Wrote: ${supportPath}`);
  console.log(`Wrote: ${universePath}`);
  console.log(`Wrote: ${followupsPath}`);
  console.log(`Scanned ${stats.scanned} records, version-skew matched ${stats.versionSkewMatched}`);
  console.log(`Sampled ${sampled.length} records; universe ${universe.length}; hydrated ${followups.length} follow-up requests`);

  if (replayEnabled) {
    const replayOutputPath = path.join(outDir, replayOutputName);
    console.log(`Replaying follow-ups to comparison output: ${replayOutputPath}`);
    console.log(`  prod=${prodBase} dev=${devBase} concurrency=${replayConcurrency} timeout=${replayTimeoutSeconds}s actorDelay=${replayActorDelayMs}ms`);
    const replayResult = await replayFollowupsToComparison(followups, replayOutputPath, {
      prodBaseUrl: prodBase,
      devBaseUrl: devBase,
      concurrency: replayConcurrency,
      timeoutSeconds: replayTimeoutSeconds,
      actorDelayMs: replayActorDelayMs,
    });
    summary.replay = {
      enabled: true,
      outputPath: replayOutputPath,
      totalReplayed: replayResult.total,
      statusCounts: replayResult.statusCounts,
    };
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
    console.log(`Wrote: ${replayOutputPath}`);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
