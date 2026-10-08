// Actual immutable source fixtures plus prelaunch input/CLI boundaries. No operational proof.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { controllerInventory, preflightOriginalObserver } from './vitest-native-worker/original-observer-inputs.mjs';
import { runOriginalObserver } from './vitest-native-worker/original-observer.mjs';
import { originalLocations } from './vitest-native-worker/original-observer-source.mjs';
import { parseOriginalObserverArgs } from './test-vitest-native-original-observer.mjs';
const exec = promisify(execFile);
const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--archives', '--pnpm-root', '--node-archive'].includes(key) && value && !options[key], 'Unknown or duplicate test argument');
  options[key] = value;
}
assert(options['--archives'] && options['--pnpm-root'], 'Existing --archives and --pnpm-root required');
assert.equal(process.versions.node, '24.18.0');
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'q2b1a-observer-fixture-')));
const cli = fileURLToPath(new URL('./test-vitest-native-original-observer.mjs', import.meta.url));
const node = await fs.realpath(process.execPath);
const nodePin = hash(await fs.readFile(node));
const pnpmRoot = await fs.realpath(options['--pnpm-root']);
const pnpmArchive = path.join(await fs.realpath(options['--archives']), 'pnpm-11.17.0.tgz');
const bundle = path.join(pnpmRoot, 'dist/pnpm.mjs');
const pinsBefore = { node: nodePin, archive: hash(await fs.readFile(pnpmArchive)), bundle: hash(await fs.readFile(bundle)) };
const controllerFiles = await controllerInventory();
const input = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture',
  node: { path: node, sha256: nodePin, version: process.versions.node, v8: process.versions.v8,
    archive: options['--node-archive'] ?? null }, pnpm: { archive: pnpmArchive, root: pnpmRoot }, controllerFiles, fixtureRecipe: 'empty-v1' };
const results = { evidenceScope: 'source-fixture', qualificationContractRevision: 2, completeness: false,
  productionEligible: false, root, preflight: [], cli: [], recipes: [], cleanup: [] };
let counter = 0;
async function writeInput(document, mode = 0o444) {
  const bytes = Buffer.from(JSON.stringify(document) + '\n'); const filename = path.join(root, `input-${counter++}.json`);
  await fs.writeFile(filename, bytes, { flag: 'wx', mode }); return { filename, pin: hash(bytes) };
}
async function absent(filename) {
  try { await fs.lstat(filename); return false; } catch (error) { if (error.code === 'ENOENT') return true; throw error; }
}
async function negative(name, document = input, output = path.join(root, `unused-${counter}`), mode = 0o444) {
  const selected = await writeInput(document, mode);
  const existed = !await absent(output);
  await assert.rejects(async () => {
    const unexpected = await preflightOriginalObserver(selected.filename, selected.pin, output); await unexpected.close();
  }, undefined, `${name} accepted invalid input/output`);
  if (!existed) assert(await absent(output), `${name} mutated output before rejection`);
  results.preflight.push(name);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function empty(pid) { try { process.kill(-pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } }
async function cleanup(report) {
  for (const item of report.cases) for (const child of [item.original, item.derived]) {
    if (!empty(child.nativePid)) process.kill(-child.nativePid, 'SIGKILL');
    const end = Date.now() + 3000;
    while (!empty(child.nativePid) && Date.now() < end) await delay(20);
    const retired = empty(child.nativePid); results.cleanup.push({ category: item.category, pid: child.nativePid, empty: retired });
    assert(retired, 'Test finally could not retire its own process group');
  }
}
const abort = new AbortController(); const deadline = setTimeout(() => abort.abort(), 180_000);
try {
  for (const [name, change] of [
    ['missing-revision', x => { delete x.qualificationContractRevision; }],
    ['unknown-revision', x => { x.qualificationContractRevision = 3; }],
    ['string-revision', x => { x.qualificationContractRevision = '2'; }],
    ['operational-promotion', x => { x.evidenceScope = 'release-owner'; }],
    ['arbitrary-command', x => { x.command = 'touch'; }],
    ['arbitrary-endpoint', x => { x.endpoint = 'ws://127.0.0.1:9229/forbidden'; }],
    ['arbitrary-environment', x => { x.env = { NODE_OPTIONS: '--inspect' }; }],
    ['unknown-recipe', x => { x.fixtureRecipe = 'caller-command'; }],
    ['runtime-pin', x => { x.node.sha256 = '0'.repeat(64); }],
    ['runtime-version', x => { x.node.version = '24.21.0'; }],
    ['v8-version', x => { x.node.v8 = 'unknown'; }],
    ['controller-pin', x => { x.controllerFiles[0].sha256 = '0'.repeat(64); }],
    ['controller-missing', x => { x.controllerFiles.pop(); }],
    ['controller-order', x => { x.controllerFiles.reverse(); }],
    ['controller-extra-key', x => { x.controllerFiles[0].command = 'forbidden'; }],
  ]) { const changed = structuredClone(input); change(changed); await negative(name, changed); }
  await negative('writable-input', input, path.join(root, 'writable-unused'), 0o644);
  const existing = path.join(root, 'existing'); await fs.mkdir(existing); await fs.writeFile(path.join(existing, 'sentinel'), 'preserve');
  await negative('existing-output', input, existing); assert.equal(await fs.readFile(path.join(existing, 'sentinel'), 'utf8'), 'preserve');
  await negative('relative-output', input, 'relative-output');
  await negative('dotdot-output', input, `${root}/escape/../escaped`);
  await negative('protected-output-overlap', input, path.join(pnpmRoot, 'forbidden-observer-output'));
  const linked = path.join(root, 'linked'); await fs.symlink(root, linked);
  await negative('symlink-output-parent', input, path.join(linked, 'new-output'));
  const selected = await writeInput(input); const linkedInput = path.join(root, 'linked-input.json');
  await fs.symlink(selected.filename, linkedInput);
  await assert.rejects(() => preflightOriginalObserver(linkedInput, selected.pin, path.join(root, 'linked-input-output')));
  assert(await absent(path.join(root, 'linked-input-output'))); results.preflight.push('symlink-input');
  const wrongRoot = path.join(root, 'incomplete-pnpm'); await fs.mkdir(wrongRoot, { mode: 0o555 });
  await negative('incomplete-original-distribution', { ...input, pnpm: { ...input.pnpm, root: wrongRoot } });
  const changedSource = Buffer.from(await fs.readFile(bundle)); changedSource[100] ^= 1;
  assert.throws(() => originalLocations(changedSource, 'dedupe'), /source|bytes/i); results.preflight.push('unknown-original-source');
  for (const args of [[], ['--help'], ['--command', 'install'], ['--endpoint', 'ws://127.0.0.1:1/x'],
    ['--input', selected.filename, '--input', selected.filename, '--input-sha256', selected.pin, '--output', path.join(root, 'cli-unused')]]) {
    assert.throws(() => parseOriginalObserverArgs(args));
    let failure;
    try { await exec(node, [cli, ...args], { timeout: 10_000, maxBuffer: 4096 }); } catch (error) { failure = error; }
    assert(failure && failure.code === 1, 'Invalid actual CLI invocation did not fail with exit1');
    assert.equal(failure.stdout, ''); assert.equal(failure.stderr, 'Unsupported bounded original-observer input or execution\n');
    results.cli.push({ args, exitCode: failure.code });
  }
  assert(await absent(path.join(root, 'cli-unused')));
  // A genuine generic output error must reject, rather than become unsupported.
  await assert.rejects(() => runOriginalObserver(selected.filename, selected.pin, existing), /already exists/);
  results.preflight.push('generic-error-is-not-unsupported');
  for (const fixtureRecipe of ['empty-v1', 'offline-miss-v1']) {
    const chosen = await writeInput({ ...input, fixtureRecipe });
    const output = path.join(root, fixtureRecipe);
    const report = await runOriginalObserver(chosen.filename, chosen.pin, output, { signal: abort.signal });
    results.recipes.push({ fixtureRecipe, output, state: report.state, cases: report.cases.map(item => ({ category: item.category,
      originalState: item.original.report.state, missingClaims: item.original.report.missingClaims,
      originalOutcome: item.original.nativeFacts.outcome, derivedOutcome: item.derived.nativeFacts.outcome,
      intervention: item.original.nativeFacts.observerIntervention, actualScriptAuthenticated: item.original.actualScriptAuthenticated,
      equivalent: item.equivalent })) });
    try {
      assert(!abort.signal.aborted, 'Fixture suite exceeded its own execution deadline');
      assert.equal(report.evidenceScope, 'source-fixture'); assert.equal(report.qualificationContractRevision, 2);
      assert.equal(report.completeness, false); assert.equal(report.productionEligible, false);
      assert.equal(report.node.kernelExecutableIdentityObserved, false);
      assert(!JSON.stringify(report).includes('"PASSED"')); assert((await fs.stat(path.join(output, 'summary.json'))).size <= 65_536);
      assert.deepEqual(report.cases.map(item => item.category), ['install', 'update', 'dedupe']);
      for (const item of report.cases) {
        const original = item.original; const observed = original.report;
        assert.equal(original.actualScriptAuthenticated, true, 'Actual original script bytes were not authenticated');
        assert.deepEqual(observed.nativeOutcome, original.nativeFacts.outcome);
        assert.equal(item.derived.debuggerEnabled, false);
        assert.equal(original.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
        assert.equal(item.derived.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
        assert.equal(original.nativeFacts.cleanup.independentAllDescendantsObserved, false);
        if (observed.state === 'supported') {
          assert.deepEqual(observed.observedPhases, ['launch', 'pre-call-pause', 'handler-entry', 'handler-settlement', 'native-terminal']);
          assert.equal(original.nativeFacts.observerIntervention, 'none');
          assert.equal(observed.events.find(event => event.phase === 'handler-settlement').settlement, 'resolved');
          assert(item.equivalent, 'Supported source fixture differs from its actual derived comparison');
        } else {
          assert(observed.missingClaims.length || observed.events.some(event => event.phase === 'observer-failure'));
          if (original.nativeFacts.observerIntervention !== 'none') {
            assert.equal(item.equivalent, false); assert(observed.events.some(event => event.phase === 'observer-failure'));
          }
        }
        if (fixtureRecipe === 'offline-miss-v1' && original.nativeFacts.outcome?.exitCode !== null && original.nativeFacts.outcome.exitCode !== 0)
          assert(!observed.observedPhases.includes('handler-settlement'), 'Native error exit was substituted for observed successful settlement');
      }
      if (fixtureRecipe === 'offline-miss-v1') assert(report.cases.some(item => item.derived.nativeFacts.outcome?.exitCode > 0),
        'Offline miss fixture did not exercise an actual native failure');
    } finally { await cleanup(report); }
  }
  assert.deepEqual(await controllerInventory(), controllerFiles, 'Tests changed authenticated controller source');
  assert.deepEqual({ node: hash(await fs.readFile(node)), archive: hash(await fs.readFile(pnpmArchive)), bundle: hash(await fs.readFile(bundle)) },
    pinsBefore, 'Original assets changed during the fixture suite');
  results.state = 'PASSED';
} catch (error) { results.state = 'FAILED'; results.failure = { name: error.name, message: error.message }; process.exitCode = 1; }
finally {
  clearTimeout(deadline);
  await fs.writeFile(path.join(root, 'test-result.json'), JSON.stringify(results, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ state: results.state, evidenceScope: 'source-fixture', completeness: false, productionEligible: false,
    root, preflightCases: results.preflight.length, actualCliCases: results.cli.length, actualRecipes: results.recipes.length,
    failure: results.failure ?? null }));
}
