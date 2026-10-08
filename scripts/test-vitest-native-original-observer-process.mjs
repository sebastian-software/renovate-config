// Test-owned source lifecycle regressions; never operational descendant evidence.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { ownedNativeProcess, processGroupFailureMetadata } from './vitest-native-worker/original-observer-process.mjs';
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
assert(['owned-group', 'early-cancel', 'native-before-endpoint', 'lifetime-timeout', 'output-bound', 'group-failure-diagnostic', 'post-term-terminal-sequencing'].includes(selectedCase), 'Unknown fixed lifecycle case');
assert.equal(process.versions.node, '24.18.0');
const root = await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(), 'q2b1a-process-')));
const results = { evidenceScope: 'source-fixture', qualificationContractRevision: 2,
  completeness: false, productionEligible: false, selectedCase, root, cleanup: [] };
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function testGroupFailure(error, pid, caller, site, signal) {
  results.testOwnedProcessGroupFailure ??= { caller, site, signal, ownedPid: pid, targetPid: -pid,
    errorCode: typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null,
    stage: results.syntheticProgress?.at(-1)?.stage ?? null };
}
const empty = pid => {
  try { process.kill(-pid, 0); return false; }
  catch (error) { if (error.code === 'ESRCH') return true;
    testGroupFailure(error, pid, 'test.empty', 'groupEmpty', 0); throw error; }
};
async function waitOwnExit(exited, end) {
  let timer;
  try {
    await Promise.race([exited, new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Regression own leader exit exceeded cleanup bound')),
        Math.max(0, end - Date.now()));
    })]);
  } finally { clearTimeout(timer); }
}
function directStopExit(native, observed) {
  // This fixed child has no Inspector endpoint or cancellation. Direct stop
  // leaves its endpoint pending until the helper's actual exit handler rejects it.
  return native.endpoint.then(() => { throw new Error('Fixed child unexpectedly exposed an Inspector endpoint'); }, error => {
    assert(error instanceof UnsupportedObservation && error.reason === 'disconnect',
      'Fixed direct-stop child endpoint did not identify actual native exit');
    observed();
  });
}
async function reap(pid, exited = null) {
  const end = Date.now() + 3000;
  if (!empty(pid)) {
    try { process.kill(-pid, 'SIGKILL'); }
    catch (error) { testGroupFailure(error, pid, 'test.reap', 'signalGroup', 'SIGKILL'); throw error; }
  }
  if (exited) await waitOwnExit(exited, end);
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
  if (selectedCase === 'post-term-terminal-sequencing') {
    results.failureInjectionScope = 'synthetic-post-term-pre-exit-process-kill';
    const native = await ownedNativeProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root,
      { PATH: path.dirname(process.execPath), HOME: root }, undefined, { role: 'original', category: 'install' });
    const sequencing = { ownedPid: native.pid, termSent: false, exitObserved: false, calls: [] };
    results.sequencing = sequencing;
    const exited = directStopExit(native, () => { sequencing.exitObserved = true; });
    const kill = process.kill;
    const sentinel = Object.assign(new Error('Synthetic post-TERM pre-exit process-group probe'), { code: 'EPERM' });
    try {
      process.kill = (pid, signal) => {
        if (pid !== -native.pid) return kill.call(process, pid, signal);
        sequencing.calls.push({ targetPid: pid, signal, exitObserved: sequencing.exitObserved });
        if (signal === 0 && sequencing.termSent && !sequencing.exitObserved) throw sentinel;
        const result = kill.call(process, pid, signal);
        if (signal === 'SIGTERM') sequencing.termSent = true;
        return result;
      };
      try { await native.stop('cancelled'); }
      catch (error) {
        sequencing.stopFailure = { sameSentinel: error === sentinel, errorCode: error.code ?? null,
          processGroupFailure: processGroupFailureMetadata(error) };
        throw error;
      }
      assert(sequencing.termSent && sequencing.exitObserved,
        'Owned leader exit must be observed before post-TERM group retirement probes');
      assert(sequencing.calls.some(call => call.signal === 0 && call.exitObserved),
        'Leader exit cannot substitute for the actual group retirement probe');
      results.finished = await native.finish();
      assert.deepEqual(results.finished.outcome, { exitCode: null, signal: 'SIGTERM' });
      assert.equal(results.finished.cleanup.ownedProcessGroupEmpty, true);
      assert.equal(results.finished.observerIntervention, 'cancelled');
      assert.equal(sentinel.code, 'EPERM');
    } finally {
      process.kill = kill;
      await waitOwnExit(exited, Date.now() + 3000);
      await reap(native.pid, exited);
    }
  } else if (selectedCase === 'group-failure-diagnostic') {
    // Synthetic parent-side EPERM isolates diagnostic behavior. It does not
    // measure host permissions or replace the five real lifecycle gates.
    results.failureInjectionScope = 'synthetic-parent-process-kill';
    results.processGroupFailures = []; results.syntheticProgress = [];
    assert.equal(processGroupFailureMetadata(new Error('unrelated')), null);
    for (const [site, nativeSignal, role, category, caller] of [
      ['groupEmpty', 0, 'original', 'install', 'ownedNativeProcess.stop'],
      ['signalGroup', 'SIGTERM', 'derived', 'update', 'observeOriginal:unsupported'],
    ]) {
      const native = await ownedNativeProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], root,
        { PATH: path.dirname(process.execPath), HOME: root }, undefined, { role, category });
      const progress = { ownedPid: native.pid, stage: 'injected-stop' }; results.syntheticProgress.push(progress);
      const exited = directStopExit(native, () => {});
      const kill = process.kill; const calls = [];
      const failure = Object.assign(new Error('Synthetic process-group permission failure'), { code: 'EPERM' });
      try {
        process.kill = (pid, signal) => {
          if (pid === -native.pid) {
            calls.push([pid, signal]);
            if (signal === nativeSignal) throw failure;
          }
          return kill.call(process, pid, signal);
        };
        await assert.rejects(native.stop('cancelled', caller), error => error === failure,
          'Process-group failure must preserve the exact original error');
        process.kill = kill;
        assert.deepEqual(calls, site === 'groupEmpty' ? [[-native.pid, 0]] :
          [[-native.pid, 0], [-native.pid, 'SIGTERM']], 'Diagnostic collection changed process.kill arguments');
        assert.equal(failure.code, 'EPERM');
        assert.deepEqual(Object.keys(failure), ['code'], 'Diagnostic collection mutated the original error');
        const metadata = processGroupFailureMetadata(failure);
        const identity = metadata.processIdentity;
        assert(Object.isFrozen(identity), 'Process identity must remain a fixed failure snapshot');
        if (identity.state === 'observed') {
          assert(['I', 'R', 'S', 'T', 'U', 'Z'].includes(identity.processState),
            'Observed process state must be normalized');
          assert.deepEqual(identity, { state: 'observed', reason: null, pid: native.pid,
            processGroupId: native.pid, uidMatchesObserver: true, processState: identity.processState },
          'Measured live child PID, process group, or observer UID did not match');
        } else {
          assert.equal(identity.state, 'unavailable');
          assert(['missing-pid', 'absent', 'timeout', 'command-error', 'unparseable'].includes(identity.reason),
            'Unavailable process identity must retain a fixed reason');
          assert.deepEqual(identity, { state: 'unavailable', reason: identity.reason, pid: null,
            processGroupId: null, uidMatchesObserver: null, processState: null },
          'Unavailable process identity must not infer measurements from detached spawn');
        }
        assert.deepEqual(metadata, { caller, site, signal: nativeSignal, role, category, errorCode: 'EPERM',
          ownedPid: native.pid, targetPid: -native.pid, actualProcessGroupId: identity.processGroupId,
          spawnDetached: true, processIdentity: identity,
          terminal: null, intervention: 'none', endpointSeen: false, waitingSeen: false,
          groupSignalled: false, reason: 'cancelled' });
        assert(Object.isFrozen(metadata), 'Failure metadata must remain a fixed snapshot');
        results.processGroupFailures.push({ failureInjectionScope: results.failureInjectionScope, ...metadata });
        progress.stage = 'verify-live-group';
        assert(!empty(native.pid), 'EPERM was mistaken for confirmed group retirement');
        assert.equal(native.intervention, 'none', 'Failed signalling forged an intervention');
        progress.stage = 'real-reap';
        await reap(native.pid, exited);
        progress.stage = 'await-exit';
        await exited;
        progress.stage = 'verify-finish';
        await assert.rejects(native.finish(), error => error === failure,
          'Finalization must retain cleanup failure instead of reporting successful cleanup');
        assert.strictEqual(processGroupFailureMetadata(failure), metadata,
          'Finalization replaced the first failure diagnostic');
      } finally {
        process.kill = kill;
        progress.stage = 'finally-reap';
        await reap(native.pid, exited);
      }
    }
  } else if (selectedCase === 'owned-group') {
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
  results.state = 'FAILED'; results.failure = { name: error.name, message: error.message,
    errorCode: error.code ?? null, processGroupFailure: processGroupFailureMetadata(error),
    testOwnedProcessGroupFailure: results.testOwnedProcessGroupFailure ?? null };
  process.exitCode = 1;
} finally {
  await fs.writeFile(path.join(root, 'test-result.json'), JSON.stringify(results, null, 2) + '\n', { flag: 'wx', mode: 0o444 });
  console.log(JSON.stringify({ state: results.state, selectedCase, evidenceScope: results.evidenceScope,
    completeness: false, productionEligible: false, root, failure: results.failure ?? null }));
}
