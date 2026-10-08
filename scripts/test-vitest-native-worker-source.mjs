#!/usr/bin/env node
// Independent source contract oracle. No worker, registry, socket or container.
// Documentary state examples prove report semantics, never native qualification.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const source = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const driver = path.join(source, 'scripts/test-vitest-native-worker.mjs');
const categories = ['install', 'update', 'dedupe'];
const scenarios = [
  'readonly', 'data-only', 'concurrency', 'delegation', 'term', 'int', 'kill',
  'partial', 'tamper', 'redirection', 'replacement', 'script-suppression',
  'hook-suppression', 'preload-suppression',
];
// Keep this oracle independent from issuer and driver constants.
const expected = [
  ...categories.flatMap(category => ['original', 'derived'].map(runtimeIdentity => ({
    id: `baseline:${runtimeIdentity}:${category}`, kind: 'baseline',
    runtimeIdentity, category, scenario: null,
  }))),
  ...categories.flatMap(category => scenarios.map(scenario => ({
    id: `lifecycle:derived:${category}:${scenario}`, kind: 'lifecycle',
    runtimeIdentity: 'derived', category, scenario,
  }))),
];
assert.equal(expected.filter(slot => slot.kind === 'baseline').length, 6);
assert.equal(expected.filter(slot => slot.kind === 'lifecycle').length, 42);
const root = await fs.mkdtemp(path.join(tmpdir(), 'native-worker-source-'));
const env = { PATH: '/usr/bin:/bin', HOME: root, LANG: 'C', TZ: 'UTC' };
function invoke(args) {
  const result = spawnSync(process.execPath, [driver, ...args], {
    cwd: source, env, encoding: 'utf8', timeout: 5_000, maxBuffer: 65_536,
  });
  assert.ifError(result.error);
  assert.equal(result.signal, null, `Source CLI exceeded its bound: ${result.stderr}`);
  return result;
}
const sorted = slots => slots.toSorted((a, b) => a.id.localeCompare(b.id, 'en'));
try {
  const inventoryResult = invoke(['--inventory']);
  assert.equal(inventoryResult.status, 0,
    `Missing fixed native-worker inventory entry: ${inventoryResult.stderr}`);
  const inventory = JSON.parse(inventoryResult.stdout);
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.evidenceScope, 'source-inventory');
  assert.equal(inventory.completeness, false);
  assert.equal(inventory.productionEligible, false);
  assert.deepEqual(sorted(inventory.slots), sorted(expected));
  assert.equal(new Set(inventory.slots.map(slot => slot.id)).size, 48);
  assert.deepEqual(await fs.readdir(root), [], 'Inventory created runtime/output artifacts');

  for (const args of [
    ['--inventory', '--command', '/usr/bin/true'],
    ['--inventory', '--endpoint', 'https://example.invalid'],
    ['--inventory', '--environment', 'NODE_OPTIONS=--inspect'],
    ['--inventory', '--production-eligible'],
    ['--inventory', '--source-fixture'],
    ['--inventory', 'install'],
    ['--input', 'relative.json', '--input-sha256', '0'.repeat(64), '--output', root],
    ...["/tmp/output'quote", '/tmp/output;cmd', '/tmp/output$env', '/tmp/output:selector',
      '/tmp/output`command`', '/tmp/output\nline', '/tmp/../escape'].map(output =>
      ['--input', '/tmp/fixed-input.json', '--input-sha256', '0'.repeat(64), '--output', output]),
  ]) {
    const result = invoke(args);
    assert.notEqual(result.status, 0, `Accepted arbitrary/invalid launch selector: ${args.join(' ')}`);
    assert.equal(result.stdout, '', 'Rejected parser input emitted an inventory/success report');
    assert(result.stderr.length > 0 && result.stderr.length <= 65_536);
    assert.deepEqual(await fs.readdir(root), [], 'Rejected parser input created runtime/output artifacts');
  }

  const { safePath } = await import(pathToFileURL(path.join(source, 'scripts/vitest-native-worker/inputs.mjs')).href);
  const canonicalBase = '/opt/homebrew/Cellar/python@3.14/3.14.8/Frameworks/Python.framework/Versions/3.14/bin/python3.14';
  assert.equal(safePath(canonicalBase), canonicalBase);
  for (const rejected of ['/tmp/source@fixed', canonicalBase.replace('3.14.8', '3.14.9'), canonicalBase + ';command'])
    assert.throws(() => safePath(rejected), /path/i);
  const { parseWorkerArgs, summarizeQualification, qualificationExitCode } = await import(pathToFileURL(driver).href);
  assert.throws(() => parseWorkerArgs(['--input', '/tmp/fixed-input.json', '--input-sha256', '0'.repeat(64),
    '--output', '/tmp/source@fixed']), /path/i, 'Generic @ output path obtained a base-runtime exception');
  assert.equal(typeof summarizeQualification, 'function');
  assert.equal(typeof qualificationExitCode, 'function');
  const missing = summarizeQualification({ cases: [], evidenceScope: 'source-fixture' });
  assert.equal(missing.completeness, false);
  assert.equal(missing.productionEligible, false);
  assert.equal(missing.cases.length, 48);
  assert.deepEqual(missing.cases.map(record => record.id).toSorted(), expected.map(slot => slot.id).toSorted());
  assert(missing.cases.every(record => record.state === 'UNRUN'));
  assert.deepEqual(missing.missingSlots.toSorted(), expected.map(slot => slot.id).toSorted());
  assert.notEqual(qualificationExitCode(missing), 0);

  const original = { id: 'baseline:original:install', state: 'UNSUPPORTED',
    reason: 'Authentic stock phase evidence is unavailable', references: [],
    nativeOutcome: { exitCode: 0, signal: null } };
  const delegation = { id: 'lifecycle:derived:install:delegation', state: 'UNSUPPORTED',
    reason: 'unowned-delegation', references: [], nativeOutcome: { exitCode: 0, signal: null } };
  const terminated = { id: 'lifecycle:derived:install:term', state: 'UNSUPPORTED',
    reason: 'Documentary source state has no measured worker cleanup', references: [],
    nativeOutcome: { exitCode: 143, signal: 'SIGTERM' } };
  const inputs = [original, delegation, terminated];
  const before = structuredClone(inputs);
  const partial = summarizeQualification({ cases: inputs, evidenceScope: 'source-fixture' });
  assert.deepEqual(inputs, before, 'Report assembly mutated native observation inputs');
  for (const record of inputs) {
    const output = partial.cases.find(candidate => candidate.id === record.id);
    assert.equal(output.state, 'UNSUPPORTED');
    assert.deepEqual(output.nativeOutcome, record.nativeOutcome, 'Observer state rewrote native outcome');
  }
  assert.equal(partial.completeness, false);
  assert.equal(partial.productionEligible, false);
  assert.equal(partial.missingSlots.length, 48);
  assert.notEqual(qualificationExitCode(partial), 0);
  for (const unsupported of [original, delegation, terminated]) {
    assert.throws(() => summarizeQualification({
      cases: [{ ...unsupported, state: 'PASSED' }], evidenceScope: 'source-fixture',
    }), /source|unsupported|authentic|evidence|promotion/i);
  }
  assert.throws(() => summarizeQualification({ cases: [original, original], evidenceScope: 'source-fixture' }), /duplicate/i);
  assert.throws(() => summarizeQualification({ cases: [{ ...original, id: 'extra:install' }], evidenceScope: 'source-fixture' }), /unknown|inventory|slot/i);
  assert.throws(() => summarizeQualification({ cases: [{ ...original, state: 'SUCCESS' }], evidenceScope: 'source-fixture' }), /state/i);
  assert.throws(() => summarizeQualification({ cases: [], evidenceScope: 'production' }), /scope/i);
  assert.throws(() => qualificationExitCode({ ...partial, completeness: true, productionEligible: true }), /complete|eligible|promotion|scope/i);
  for (const nativeOutcome of [{ exitCode: 7, signal: null }, { exitCode: null, signal: 'SIGKILL' },
    { exitCode: 130, signal: 'SIGINT' }]) {
    const observed = summarizeQualification({ cases: [{ ...original, state: 'FAILED', nativeOutcome }], evidenceScope: 'source-fixture' });
    assert.deepEqual(observed.cases.find(record => record.id === original.id).nativeOutcome, nativeOutcome);
    assert.equal(qualificationExitCode(observed), 1);
  }
  for (const overrides of [{ runtimeIdentity: 'derived' }, { category: 'dedupe' }, { kind: 'lifecycle' },
    { scenario: 'term' }, { credential: 'forbidden' }, { arbitraryMetadata: 'ignored would be unsafe' }]) {
    assert.throws(() => summarizeQualification({ cases: [{ ...original, ...overrides }], evidenceScope: 'source-fixture' }),
      /unknown|override|canonical|field/i);
  }
  assert.throws(() => summarizeQualification({ cases: [{ ...original,
    references: [{ path: '../escaped.json', sha256: '0'.repeat(64) }] }], evidenceScope: 'source-fixture' }), /relative|path/i);
  assert.throws(() => summarizeQualification({ cases: [{ ...original,
    references: [{ path: 'raw/proof.json', sha256: '0'.repeat(64), productionEligible: true }] }], evidenceScope: 'source-fixture' }), /reference/i);
  const oversized = expected.map(slot => ({ id: slot.id, state: 'UNSUPPORTED', reason: 'Bounded individual records',
    references: Array.from({ length: 32 }, (_, index) => ({ path: `raw/${index}-${'a'.repeat(100)}`, sha256: '0'.repeat(64) })) }));
  const oversizedBefore = structuredClone(oversized);
  assert.throws(() => summarizeQualification({ cases: oversized, evidenceScope: 'source-fixture' }), /summary.*budget/i);
  assert.deepEqual(oversized, oversizedBefore);


  const { concurrentSourceFailure } = await import(pathToFileURL(path.join(source, 'scripts/vitest-native-worker/collection.mjs')).href);
  const successPeer = { result: { exitCode: 0, signal: null }, nativeOutcome: { exitCode: 0, signal: null }, observerFailure: null, markerExecutions: [] };
  assert.equal(concurrentSourceFailure([successPeer, successPeer]), false);
  for (const failure of [{ result: { exitCode: 7, signal: null } }, { result: { exitCode: null, signal: 'SIGTERM' } },
    { nativeOutcome: { exitCode: 9, signal: null } }, { nativeOutcome: { exitCode: null, signal: 'SIGKILL' } },
    { observerFailure: 'incomplete receipt' }, { markerExecutions: ['script-executed'] }]) {
    const peers = [structuredClone(successPeer), { ...structuredClone(successPeer), ...failure }];
    const beforePeers = structuredClone(peers);
    assert.equal(Boolean(concurrentSourceFailure(peers)), true, 'Successful baseline masked an actual concurrency peer failure');
    assert.deepEqual(peers, beforePeers);
  }
  assert.equal(concurrentSourceFailure([successPeer]), true);

  console.log(JSON.stringify({ state: 'PASSED', evidenceScope: 'source-contract',
    baselineSlots: 6, lifecycleSlots: 42, completeness: false, productionEligible: false,
    linuxProcessProof: false, nativeWorkerLaunched: false }));
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
