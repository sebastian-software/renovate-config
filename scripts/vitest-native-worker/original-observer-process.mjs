import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { observerLimits as limits, UnsupportedObservation } from './original-observer-contract.mjs';
import { requireValue } from '../vitest-release/files.mjs';

// The caller supplies only controller-built argv/environment, never input JSON.
export async function ownedNativeProcess(node, args, cwd, env, signal) {
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
  function groupEmpty() {
    try { process.kill(-child.pid, 0); return false; }
    catch (error) { if (error.code === 'ESRCH') return true; throw error; }
  }
  function signalGroup(nativeSignal, reason) {
    try {
      process.kill(-child.pid, nativeSignal); groupSignalled = true;
      // A group-only retirement after leader exit must not rewrite native outcome.
      if (terminal === null && intervention === 'none') intervention = reason;
    } catch (error) { if (error.code !== 'ESRCH') throw error; }
  }
  function stop(reason) {
    if (cleanupPromise) return cleanupPromise;
    cleanupPromise = (async () => {
      if (groupEmpty()) return;
      const started = Date.now(); let escalated = false;
      signalGroup('SIGTERM', reason);
      while (!groupEmpty()) {
        if (!escalated && Date.now() - started >= 500) { escalated = true; signalGroup('SIGKILL', reason); }
        if (Date.now() - started >= limits.cleanupMs) throw new Error('Owned native process-group cleanup unconfirmed');
        await new Promise(resolve => setTimeout(resolve, 20));
      }
    })();
    return cleanupPromise;
  }
  function cancel(reason, message) {
    endpointReject(new UnsupportedObservation(reason, message));
    // Keep asynchronous cleanup failures for finalization rather than discarding them.
    void stop(reason).catch(error => { cleanupFailure ??= error; });
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
        await stop('cancelled');
        const result = await closed;
        if (cleanupFailure) throw cleanupFailure;
        requireValue(groupEmpty(), 'Owned native process group survived finalization');
        return { ...result, observerIntervention: intervention, outputBytes: bytes, outputSha256: outputHash.digest('hex'),
          cleanup: { ownedProcessExited: terminal !== null, ownedProcessGroupEmpty: true,
            ownedGroupSignalled: groupSignalled, independentAllDescendantsObserved: false }, debuggerDetachRequired: waitingSeen };
      })();
      return finishPromise;
    },
  };
}
