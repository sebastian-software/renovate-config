// Test-owned source lifecycle regressions; never operational descendant evidence.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { ownedNativeProcess } from './vitest-native-worker/original-observer-process.mjs';
import { controllerInventory } from './vitest-native-worker/original-observer-inputs.mjs';
import { runOriginalObserver } from './vitest-native-worker/original-observer.mjs';
import { UnsupportedObservation } from './vitest-native-worker/original-observer-contract.mjs';

const options = {};
for (let i = 2; i < process.argv.length; i += 2) {
  const name = process.argv[i]; const value = process.argv[i + 1];
  assert(['--case', '--archives', '--pnpm-root', '--node-archive'].includes(name) && value && !options[name], 'Unknown or duplicate test selector');
  options[name] = value;
}
const selectedCase = options['--case'] ?? 'owned-group';
assert(['owned-group', 'early-cancel', 'native-before-endpoint', 'lifetime-timeout', 'output-bound'].includes(selectedCase), 'Unknown fixed lifecycle case');
assert.equal(process.versions.node, '24.18.0');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'q2b1a-process-')));
const results = { evidenceScope: 'source-fixture', qualificationContractRevision: 2,
  completeness: false, productionEligible: false, selectedCase, root, cleanup: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const empty = pid => { try { process.kill(-pid, 0); return false; } catch (error) { if (error.code === 'ESRCH') return true; throw error; } };
async function reap(pid) {
  if (!empty(pid)) process.kill(-pid, 'SIGKILL');
  const end = Date.now() + 3000;
  while (!empty(pid) && Date.now() < end) await delay(25);
  const retired = empty(pid); results.cleanup.push({ ownedGroup: pid, empty: retired });
  assert(retired, 'Regression finally cleanup did not retire its own process group');
}
async function waitFile(filename) {
  const end = Date.now() + 3000;
  while (Date.now() < end) {
    try { return await fs.readFile(filename, 'utf8'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    await delay(20);
  }
  throw Error('Fixed child did not acknowledge readiness');
}
try {
  if (selectedCase === 'owned-group') {
    const ready = path.join(root, 'child-ready');
    // Code is fixed trusted test data. The child stays in this leader's own group,
    // acknowledges its TERM handler, and detaches stdio before leader exit.
    const childCode = `process.on('SIGTERM',()=>{});require('node:fs').writeFileSync(process.argv[1],String(process.pid));setInterval(()=>{},1000)`;
    const leaderCode = `const {spawn}=require('node:child_process');const fs=require('node:fs');spawn(process.execPath,['-e',${JSON.stringify(childCode)},process.argv[1]],{stdio:'ignore',detached:false});const t=setInterval(()=>{if(fs.existsSync(process.argv[1])){clearInterval(t);process.exit(0)}},10)`;
    const native = await ownedNativeProcess(process.execPath, ['-e', leaderCode, ready], root,
      { PATH: path.dirname(process.execPath), HOME: root }, undefined);
    try {
      results.childPid = Number(await waitFile(ready));
      const terminal = await native.closed; results.leaderTerminal = terminal;
      assert.deepEqual(terminal.outcome, { exitCode: 0, signal: null });
      assert(!empty(native.pid), 'Fixture failed to retain its acknowledged child after leader exit');
      await native.stop('cancelled');
      results.finished = await native.finish();
      assert.equal(results.finished.cleanup.ownedProcessGroupEmpty, true,
        'stop after leader exit must retire the surviving own-group child');
      assert(empty(native.pid), 'A summary flag cannot replace actual group retirement');
      await native.stop('cancelled');
      assert.deepEqual(await native.finish(), results.finished, 'Repeated finalization changed native facts');
      assert.equal(results.finished.observerIntervention, 'none', 'Child retirement rewrote natural leader completion');
      assert.equal(results.finished.cleanup.ownedGroupSignalled, true);
    } finally { await reap(native.pid); }
  } else if (selectedCase === 'native-before-endpoint') {
    const native = await ownedNativeProcess(process.execPath, ['-e', 'process.exit(7)'], root,
      { PATH: path.dirname(process.execPath), HOME: root }, undefined);
    try {
      const failure = await native.endpoint.then(() => null, error => error);
      results.finished = await native.finish();
      assert.deepEqual(results.finished.outcome, { exitCode: 7, signal: null });
      assert(failure instanceof UnsupportedObservation,
        'Known native-before-endpoint disconnect must be a reportable observation failure');
      assert.equal(failure.reason, 'disconnect');
    } finally { await reap(native.pid); }
  } else if (['lifetime-timeout', 'output-bound'].includes(selectedCase)) {
    const code = selectedCase === 'output-bound' ? 'process.stdout.write(Buffer.alloc(262144,120));setInterval(()=>{},1000)' : 'setInterval(()=>{},1000)';
    const native = await ownedNativeProcess(process.execPath, ['-e', code], root,
      { PATH: path.dirname(process.execPath), HOME: root }, undefined);
    try {
      const failure = await native.endpoint.then(() => null, error => error);
      results.finished = await native.finish();
      assert(failure instanceof UnsupportedObservation, 'Expected bounded process fault became a generic execution error');
      const reason = selectedCase === 'output-bound' ? 'bounds' : 'timeout';
      assert.equal(failure.reason, reason); assert.equal(results.finished.observerIntervention, reason);
      assert(results.finished.outcome, 'Bounded cancellation discarded the actual terminal');
      assert.equal(results.finished.cleanup.ownedProcessGroupEmpty, true);
      if (selectedCase === 'output-bound') assert(results.finished.outputBytes > 131072);
    } finally { await reap(native.pid); }
  } else {
    assert(options['--archives'] && options['--pnpm-root'], 'Early-cancel requires existing --archives and --pnpm-root');
    const input = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture',
      node: { path: await fs.realpath(process.execPath), sha256: createHash('sha256').update(await fs.readFile(process.execPath)).digest('hex'),
        version: process.versions.node, v8: process.versions.v8, archive: options['--node-archive'] ?? null },
      pnpm: { archive: path.join(await fs.realpath(options['--archives']), 'pnpm-11.17.0.tgz'), root: await fs.realpath(options['--pnpm-root']) },
      controllerFiles: await controllerInventory(), fixtureRecipe: 'empty-v1' };
    const bytes = Buffer.from(JSON.stringify(input) + '\n'); const inputFile = path.join(root, 'input.json');
    await fs.writeFile(inputFile, bytes, { mode: 0o444, flag: 'wx' });
    const abort = new AbortController(); abort.abort();
    // A genuine unexpected implementation error must fail this call/test. It is
    // never an expected rejection or a successful unsupported observation.
    const report = await runOriginalObserver(inputFile, createHash('sha256').update(bytes).digest('hex'),
      path.join(root, 'observation'), { signal: abort.signal });
    results.report = report;
    try {
    assert.equal(report.state, 'unsupported');
    for (const item of report.cases) {
      const observation = item.original;
      assert.equal(observation.report.state, 'unsupported');
      assert(observation.report.events.some(event => event.phase === 'observer-failure' && event.reason === 'cancelled'));
      assert(observation.report.missingClaims.includes('handler-entry'));
      assert(observation.report.missingClaims.includes('handler-settlement'));
      assert(observation.nativeFacts.outcome, 'Early cancellation lost its independently retained terminal');
      assert.equal(observation.nativeFacts.observerIntervention, 'cancelled');
      assert.equal(observation.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
      assert.equal(item.derived.nativeFacts.cleanup.ownedProcessGroupEmpty, true);
      assert.equal(report.productionEligible, false);
      assert.deepEqual(observation.report.nativeOutcome, observation.nativeFacts.outcome);
      assert.equal(observation.report.events[0].phase, 'launch');
    }
    } finally {
      for (const item of report.cases) { await reap(item.original.nativePid); await reap(item.derived.nativePid); }
    }
  }
  results.state = 'PASSED';
} catch (error) {
  results.state = 'FAILED'; results.failure = { name: error.name, message: error.message };
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(root, 'test-result.json'), JSON.stringify(results, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ state: results.state, selectedCase, evidenceScope: results.evidenceScope,
    completeness: false, productionEligible: false, root, failure: results.failure ?? null }));
}
