// Actual immutable source fixtures plus prelaunch input/CLI boundaries. No operational proof.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { validateOriginalLifecycleDiagnostics } from './vitest-native-worker/original-observer-contract.mjs';
import { controllerInventory, preflightOriginalObserver } from './vitest-native-worker/original-observer-inputs.mjs';
import { runOriginalObserver } from './vitest-native-worker/original-observer.mjs';
import { processGroupFailureMetadata } from './vitest-native-worker/original-observer-process.mjs';
import { originalLocations } from './vitest-native-worker/original-observer-source.mjs';
import { parseOriginalObserverArgs } from './test-vitest-native-original-observer.mjs';
const exec = promisify(execFile);
const options = {}; let sourceSelectionOnly = false;
for (let i = 2; i < process.argv.length;) {
  if (process.argv[i] === '--source-selection-only') {
    assert(!sourceSelectionOnly, 'Duplicate source-selection-only argument');
    sourceSelectionOnly = true; i++; continue;
  }
  const key = process.argv[i]; const value = process.argv[i + 1];
  assert(['--archives', '--pnpm-root', '--node-archive'].includes(key) && value && !options[key], 'Unknown or duplicate test argument');
  options[key] = value; i += 2;
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
  productionEligible: false, root, sourceSelection: [], sourceAuthentication: [], preflight: [], cli: [], recipes: [], cleanup: [] };
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
// This exercises the actual authenticated source selector. It is not an Inspector measurement.
function assertSourceSelection(bytes) {
  const source = bytes.toString('utf8');
  const position = offset => {
    assert(offset >= 0, 'Expected source anchor missing');
    const before = source.slice(0, offset);
    return { lineNumber: before.split('\n').length - 1, columnNumber: offset - before.lastIndexOf('\n') - 1 };
  };
  const expected = [
    ['install', 'handler5', 'async function handler5(opts3, _params, commands2) {',
      '\nasync function dryRunInstall(', '  const include = {', '{', '  await installDeps(installDepsOptions, []);'],
    ['update', 'handler13', 'async function handler13(opts3, params = [], commands2) {',
      '\nasync function interactiveUpdate(', '  return update(params, opts3, rebuildHandler);', 'update', null],
    ['dedupe', 'handler6', 'async function handler6(opts3, _params, commands2) {',
      '\n}\nvar commandNames6, recursiveByDefault2;', '  const include = {', '{', null],
  ];
  for (const [category, handlerName, signature, endAnchor, anchor, token, awaitAnchor] of expected) {
    assert.equal(source.split(signature).length, 2, `${category}: handler signature must be unique`);
    const start = source.indexOf(signature); const end = source.indexOf(endAnchor, start);
    assert(end > start, `${category}: handler body end missing`);
    const body = source.slice(start, end);
    assert.equal(body.split(anchor).length, 2, `${category}: own body anchor must be unique`);
    const offset = start + body.indexOf(anchor) + anchor.indexOf(token);
    const selected = originalLocations(bytes, category);
    assert.deepEqual(selected.entry, position(offset), `${category}: selected entry is not the fixed own-body ${token} token`);
    assert.equal(selected.handlerName, handlerName);
    assert.deepEqual(selected.functionLocation, position(start + 'async '.length));
    assert.equal(selected.scriptSha256, pinsBefore.bundle);
    if (awaitAnchor) {
      const firstAwait = body.indexOf('await ');
      assert(firstAwait >= 0 && body.indexOf(awaitAnchor) < firstAwait && offset < start + firstAwait,
        `${category}: entry must precede its first await`);
    }
    if (category === 'update') assert(!body.slice(0, offset - start).includes('await '),
      'update: fixed normal-path return call must precede any await');
    results.sourceSelection.push({ category, handlerName, entry: selected.entry, anchor,
      evidenceScope: 'authenticated-source-selection', inspectorFeasibilityMeasured: false });
  }
  assert.throws(() => originalLocations(bytes, 'unknown'), /category/i);
  // Mutated inputs reach byte authentication, not the private anchor parser. These cases must
  // never be reported as missing/duplicate/cross-handler parser coverage or runtime feasibility.
  const install = 'async function handler5(opts3, _params, commands2) {';
  const start = source.indexOf(install); const ownAnchor = source.indexOf('  const include = {', start);
  const updateCall = '  return update(params, opts3, rebuildHandler);';
  for (const [name, altered] of [
    ['missing-install-anchor-bytes', source.slice(0, ownAnchor) + source.slice(ownAnchor).replace('const include = {', 'const changed = {')],
    ['duplicate-install-anchor-bytes', source.slice(0, ownAnchor) + '  const include = { };\n' + source.slice(ownAnchor)],
    ['cross-handler-update-anchor-bytes', source.replace(updateCall, '  return interactiveUpdate(params, opts3, rebuildHandler);')],
    ['wrong-original-script-bytes', source + '\n// unknown original source\n'],
  ]) {
    assert.notEqual(hash(Buffer.from(altered)), pinsBefore.bundle, `${name}: mutation did not alter authenticated bytes`);
    for (const category of ['install', 'update', 'dedupe'])
      assert.throws(() => originalLocations(Buffer.from(altered), category), /script bytes/i, `${name}: accepted altered source`);
    results.sourceAuthentication.push(name);
  }
}
const abort = new AbortController(); const deadline = setTimeout(() => abort.abort(), 180_000);
try {
  const authenticatedInput = await writeInput(input);
  const authenticated = await preflightOriginalObserver(authenticatedInput.filename, authenticatedInput.pin,
    path.join(root, 'authenticated-unused'));
  try { assertSourceSelection(authenticated.originalBytes); await authenticated.unchanged(); }
  finally { await authenticated.close(); }
  assert(await absent(path.join(root, 'authenticated-unused')), 'Source selection created a native output');
  if (!sourceSelectionOnly) {
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
        for (const [role, envelope] of [['original', item.original], ['derived', item.derived]]) {
          const diagnostic = envelope.lifecycleDiagnostics;
          validateOriginalLifecycleDiagnostics(diagnostic, { requireAvailable: true,
            correlation: { recipe: fixtureRecipe, category: item.category, role,
              launch: ['install', 'update', 'dedupe'].indexOf(item.category) * 2 + (role === 'derived' ? 1 : 0) } });
          const events = diagnostic.events;
          assert(events.some(event => event.event === 'native-launch'));
          assert(events.some(event => event.event === 'native-group-empty'));
          const exit = events.findIndex(event => event.event === 'native-exit');
          const close = events.findIndex(event => event.event === 'native-stream-close');
          assert(exit >= 0 && close > exit, 'Real leader exit and stream close must remain separately recorded');
          assert.deepEqual({ exitCode: events[exit].exitCode, signal: events[exit].signal }, envelope.nativeFacts.outcome);
          assert(!diagnostic.missingObservations.includes('native-exit') && !diagnostic.missingObservations.includes('native-stream-close'));
          if (role === 'original') {
            assert(events.some(event => event.event === 'script-authenticated'));
            const cue = events.findIndex(event => event.event === 'native-shutdown-cue');
            const receipt = events.findIndex(event => event.event === 'controller-receipt' && event.site === 'shutdown-cue');
            assert.equal(cue >= 0, envelope.nativeFacts.debuggerDetachRequired);
            assert.equal(diagnostic.missingObservations.includes('shutdown-cue'), cue < 0);
            assert.equal(diagnostic.missingObservations.includes('controller-shutdown-receipt'), receipt < 0);
            if (receipt >= 0) assert(cue >= 0 && receipt > cue, 'Controller receipt must follow the actual cue callback');
            assert(events.some(event => event.event === 'protocol-close-request'));
            const socketClose = events.findIndex(event => event.event === 'protocol-socket-close');
            assert.equal(diagnostic.missingObservations.includes('protocol-socket-close'), socketClose < 0);
          } else assert(!events.some(event => event.event.startsWith('protocol-') || event.event.startsWith('command-')));
          assert(!JSON.stringify(diagnostic).includes('ws://') && !JSON.stringify(diagnostic).includes('file://'));
        }

        assert.equal(original.actualScriptAuthenticated, true, 'Actual original script bytes were not authenticated');
        assert.deepEqual(observed.nativeOutcome, original.nativeFacts.outcome);
        assert.equal(item.derived.debuggerEnabled, false);
        assert.equal(original.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
        assert.equal(item.derived.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
        assert.equal(original.nativeFacts.cleanup.independentAllDescendantsObserved, false);
        if (observed.state === 'supported') {
          assert.deepEqual(observed.observedPhases, ['launch', 'pre-call-pause', 'handler-entry', 'handler-settlement', 'native-terminal']);
          const selectedLocation = originalLocations(await fs.readFile(bundle), item.category);
          assert.deepEqual(observed.events.find(event => event.phase === 'handler-entry').location,
            { scriptSha256: selectedLocation.scriptSha256, ...selectedLocation.entry, functionName: selectedLocation.handlerName },
            'Supported entry differs from the exact authenticated handler location');
          assert.deepEqual(original.nativeFacts.outcome, { exitCode: 0, signal: null },
            'Supported successful settlement did not retain natural native exit0');
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
      if (fixtureRecipe === 'empty-v1') {
        const dedupe = report.cases.find(item => item.category === 'dedupe');
        assert.equal(dedupe.original.report.state, 'supported', 'Established dedupe entry/success evidence regressed');
        assert.deepEqual(dedupe.original.nativeFacts.outcome, { exitCode: 0, signal: null });
        assert(dedupe.equivalent, 'Established dedupe original/derived equivalence regressed');
      }
      if (fixtureRecipe === 'offline-miss-v1') {
        const dedupe = report.cases.find(item => item.category === 'dedupe');
        assert.equal(dedupe.original.report.state, 'incomplete', 'Established offline dedupe entry regressed');
        assert.deepEqual(dedupe.original.report.observedPhases, ['launch', 'pre-call-pause', 'handler-entry', 'native-terminal']);
        assert.deepEqual(dedupe.original.report.missingClaims, ['handler-settlement']);
        assert.deepEqual(dedupe.original.nativeFacts.outcome, { exitCode: 1, signal: null });
        assert.equal(dedupe.original.nativeFacts.observerIntervention, 'none');
        assert(dedupe.equivalent, 'Established offline dedupe original/derived equivalence regressed');
      }
      if (fixtureRecipe === 'offline-miss-v1') assert(report.cases.some(item => item.derived.nativeFacts.outcome?.exitCode > 0),
        'Offline miss fixture did not exercise an actual native failure');
    } finally { await cleanup(report); }
  }
  }
  assert.deepEqual(await controllerInventory(), controllerFiles, 'Tests changed authenticated controller source');
  assert.deepEqual({ node: hash(await fs.readFile(node)), archive: hash(await fs.readFile(pnpmArchive)), bundle: hash(await fs.readFile(bundle)) },
    pinsBefore, 'Original assets changed during the fixture suite');
  results.state = 'PASSED';
} catch (error) { results.state = 'FAILED'; results.failure = { name: error.name, message: error.message,
  errorCode: typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null,
  processGroup: processGroupFailureMetadata(error) }; process.exitCode = 1; }
finally {
  clearTimeout(deadline);
  await fs.writeFile(path.join(root, 'test-result.json'), JSON.stringify(results, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ state: results.state, evidenceScope: 'source-fixture', completeness: false, productionEligible: false,
    root, sourceSelectionCases: results.sourceSelection.length, sourceAuthenticationCases: results.sourceAuthentication.length,
    inspectorFeasibilityMeasured: results.recipes.length > 0, preflightCases: results.preflight.length, actualCliCases: results.cli.length, actualRecipes: results.recipes.length,
    failure: results.failure ?? null }));
}
