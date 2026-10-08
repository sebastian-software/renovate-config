import { spawn, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { observerLimits as limits, UnsupportedObservation } from './original-observer-contract.mjs';
import { requireValue } from '../vitest-release/files.mjs';

// Failure-only context preserves the original thrown object without changing kill behavior.
const processGroupFailures = new WeakMap();
export function processGroupFailureMetadata(error) { return processGroupFailures.get(error) ?? null; }

// Read only the owned PID after a failed group operation; never infer group identity.
function failedProcessIdentity(pid) {
  const unavailable = reason => Object.freeze({ state: 'unavailable', reason, pid: null,
    processGroupId: null, uidMatchesObserver: null, processState: null });
  if (pid === null) return unavailable('missing-pid');
  try {
    const result = spawnSync('/bin/ps', ['-p', String(pid), '-o', 'pid=,pgid=,uid=,stat='],
      { encoding: 'utf8', shell: false, timeout: 250, maxBuffer: 1024, killSignal: 'SIGKILL' });
    if (result.error) return unavailable(result.error.code === 'ETIMEDOUT' ? 'timeout' : 'command-error');
    if (result.status === 1 && !result.stdout?.trim() && !result.stderr?.trim()) return unavailable('absent');
    if (result.status !== 0) return unavailable('command-error');
    const fields = result.stdout.trim().split(/\s+/);
    if (fields.length !== 4 || !fields.slice(0, 3).every(value => /^\d+$/.test(value))) return unavailable('unparseable');
    const [observedPid, processGroupId, uid] = fields.slice(0, 3).map(Number);
    const processState = fields[3][0];
    if (observedPid !== pid || !Number.isSafeInteger(processGroupId) || processGroupId < 1 ||
      !Number.isSafeInteger(uid) || !['I', 'R', 'S', 'T', 'U', 'Z'].includes(processState)) return unavailable('unparseable');
    return Object.freeze({ state: 'observed', reason: null, pid: observedPid, processGroupId,
      uidMatchesObserver: typeof process.getuid === 'function' ? uid === process.getuid() : null, processState });
  } catch { return unavailable('command-error'); }
}

// The caller supplies only controller-built argv/environment, never input JSON.
export async function ownedNativeProcess(node, args, cwd, env, signal, { role, category } = {}) {
  const child = spawn(node, args, { cwd, env, detached: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] });
  let terminal = null; let intervention = 'none'; let bytes = 0; let stderrTail = '';
  let endpointResolve, endpointReject, waitingResolve, exitResolve;
  let endpointSeen = false; let waitingSeen = false; let cleanupPromise = null; let finishPromise = null;
  let cleanupFailure = null; let groupSignalled = false;
  const outputHash = createHash('sha256');
  const endpoint = new Promise((resolve, reject) => { endpointResolve = resolve; endpointReject = reject; });
  // Derived processes do not await an endpoint; still observe rejection immediately.
  endpoint.catch(() => {});
  const waiting = new Promise(resolve => { waitingResolve = resolve; });
  const exited = new Promise(resolve => { exitResolve = resolve; });
  const closed = new Promise(resolve => {
    child.once('error', error => { endpointReject(error); exitResolve({ error: 'spawn' }); resolve({ error: 'spawn' }); });
    child.once('exit', (exitCode, nativeSignal) => {
      terminal = { exitCode, signal: nativeSignal };
      endpointReject(new UnsupportedObservation('disconnect', 'Native exited before Inspector connection'));
      exitResolve({ outcome: terminal });
    });
    child.once('close', () => { resolve(terminal ? { outcome: terminal } : { error: 'spawn' }); });
  });
  function recordGroupFailure(error, caller, site, nativeSignal, reason) {
    if (processGroupFailures.has(error)) return;
    const pid = Number.isSafeInteger(child.pid) && child.pid > 1 ? child.pid : null;
    const processIdentity = failedProcessIdentity(pid);
    processGroupFailures.set(error, Object.freeze({
      caller: ['ownedNativeProcess.stop', 'ownedNativeProcess.cancel', 'ownedNativeProcess.finish',
        'observeOriginal:unexpected-error', 'observeOriginal:unsupported'].includes(caller) ? caller : null,
      site, signal: nativeSignal,
      role: ['original', 'derived'].includes(role) ? role : null,
      category: ['install', 'update', 'dedupe'].includes(category) ? category : null,
      errorCode: typeof error.code === 'string' && /^[A-Z0-9_]{1,32}$/.test(error.code) ? error.code : null,
      ownedPid: pid, targetPid: pid === null ? null : -pid,
      actualProcessGroupId: processIdentity.processGroupId, processIdentity, spawnDetached: true,
      terminal: terminal ? { exitCode: terminal.exitCode, signal: terminal.signal } : null,
      intervention, endpointSeen, waitingSeen, groupSignalled,
      reason: ['protocol', 'source', 'location', 'disconnect', 'timeout', 'cancelled', 'bounds', 'identity'].includes(reason) ? reason : null }));
  }
  function groupEmpty(caller, reason) {
    try { process.kill(-child.pid, 0); return false; }
    catch (error) { if (error.code === 'ESRCH') return true;
      recordGroupFailure(error, caller, 'groupEmpty', 0, reason); throw error; }
  }
  function signalGroup(nativeSignal, reason, caller) {
    try {
      process.kill(-child.pid, nativeSignal); groupSignalled = true;
      // A group-only retirement after leader exit must not rewrite native outcome.
      if (terminal === null && intervention === 'none') intervention = reason;
    } catch (error) { if (error.code !== 'ESRCH') {
      recordGroupFailure(error, caller, 'signalGroup', nativeSignal, reason); throw error; } }
  }
  function stop(reason, caller = 'ownedNativeProcess.stop') {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      if (groupEmpty(caller, reason)) return;
      const started = Date.now(); let escalated = false;
      signalGroup('SIGTERM', reason, caller);
      // Reap the owned leader before probing group retirement; descendants may still hold its pipes.
      let leaderSettled = terminal !== null;
      const leaderExit = exited.then(() => { leaderSettled = true; });
      while (!leaderSettled || !groupEmpty(caller, reason)) {
        if (!escalated && Date.now() - started >= 500) { escalated = true; signalGroup('SIGKILL', reason, caller); }
        if (Date.now() - started >= limits.cleanupMs) throw new Error('Owned native process-group cleanup unconfirmed');
        const poll = new Promise(resolve => setTimeout(resolve, 20));
        await (leaderSettled ? poll : Promise.race([leaderExit, poll]));
      }
    })();
    return cleanupPromise;
  }
  function cancel(reason, message) {
    endpointReject(new UnsupportedObservation(reason, message));
    // Keep asynchronous cleanup failures for finalization rather than discarding them.
    void stop(reason, 'ownedNativeProcess.cancel').catch(error => { cleanupFailure ??= error; });
  }
  function observe(chunk, stderr) {
    bytes += chunk.length; outputHash.update(chunk);
    if (bytes > limits.outputBytes) { cancel('bounds', 'Native output exceeded observation bound'); return; }
    if (!stderr) return;
    stderrTail = (stderrTail + chunk.toString('utf8')).slice(-4096);
    const matches = stderrTail.match(/Debugger listening on (ws:\/\/127\.0\.0\.1:\d+\/[a-f0-9-]{36})/);
    if (matches && !endpointSeen) { endpointSeen = true; clearTimeout(setup); endpointResolve(matches[1]); }
    if (stderrTail.includes('Waiting for the debugger to disconnect...') && !waitingSeen) {
      waitingSeen = true; waitingResolve({ waitingForDetach: true });
    }
  }
  child.stdout.on('data', chunk => observe(chunk, false)); child.stderr.on('data', chunk => observe(chunk, true));
  const setup = args[0] === '--inspect-brk=127.0.0.1:0' ? setTimeout(() => {
    if (!endpointSeen) cancel('timeout', 'Native Inspector endpoint setup exceeded bound');
  }, limits.setupMs) : null;
  const lifetime = setTimeout(() => cancel('timeout', 'Native lifetime exceeded observation bound'), limits.lifetimeMs);
  const abort = () => cancel('cancelled', 'Observer cancelled');
  signal?.addEventListener('abort', abort, { once: true });
  if (signal?.aborted) abort();
  exited.then(() => { clearTimeout(setup); clearTimeout(lifetime); signal?.removeEventListener('abort', abort); });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  requireValue(Number.isSafeInteger(child.pid) && child.pid > 1, 'Missing observed native PID');
  return { pid: child.pid, endpoint, waiting, closed, stop,
    get intervention() { return intervention; },
    get waitingForDetach() { return waitingSeen; },
    finish() {
      finishPromise ??= (async () => {
        await exited;
        // The leader can exit while a same-group child still owns inherited pipes.
        await stop('cancelled', 'ownedNativeProcess.finish');
        const result = await closed;
        if (cleanupFailure) throw cleanupFailure;
        requireValue(groupEmpty('ownedNativeProcess.finish', 'cancelled'), 'Owned native process group survived finalization');
        return { ...result, observerIntervention: intervention, outputBytes: bytes, outputSha256: outputHash.digest('hex'),
          cleanup: { ownedProcessExited: terminal !== null, ownedProcessGroupEmpty: true,
            ownedGroupSignalled: groupSignalled, independentAllDescendantsObserved: false }, debuggerDetachRequired: waitingSeen };
      })();
      return finishPromise;
    },
  };
}
