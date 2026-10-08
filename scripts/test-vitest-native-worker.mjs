#!/usr/bin/env node
// Bounded source qualification harness. No production launch or authority issuer.
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { spawn } from 'node:child_process';
import { preflight, safePath } from './vitest-native-worker/inputs.mjs';
import { slots, limits, summarizeQualification, qualificationExitCode } from './vitest-native-worker/contract.mjs';
import { requireValue, jsonBytes, readPinnedJson, hashFile } from './vitest-release/files.mjs';
export { summarizeQualification, qualificationExitCode } from './vitest-native-worker/contract.mjs';
export function parseWorkerArgs(args) {
  const { values } = parseArgs({ args, options: { inventory: { type: 'boolean' }, input: { type: 'string' },
    'input-sha256': { type: 'string' }, output: { type: 'string' }, 'source-fixture': { type: 'boolean' } },
  allowPositionals: false, strict: true });
  if (values.inventory) requireValue(Object.keys(values).length === 1, 'Inventory cannot select execution inputs');
  else requireValue(values.input && path.isAbsolute(values.input) && values.output && path.isAbsolute(values.output) &&
    /^[a-f0-9]{64}$/.test(values['input-sha256'] ?? ''), 'Fixed absolute selected input/output and outside pin required');
  if (!values.inventory) { safePath(values.input); safePath(values.output); }
  return values;
}
export async function runQualification(values) {
  const selected = await preflight(values.input, values['input-sha256'], values.output);
  await fs.mkdir(values.output, { mode: 0o700 });
  await fs.mkdir(path.join(values.output, 'context'), { mode: 0o700 });
  const fixture = path.join(selected.input.wrapper.root, 'roles/services/renovate/tests/fixtures/native_worker_fixture.py');
  const child = spawn(selected.pythonExe, ['-B', '-I', fixture, '--input', values.input,
    '--input-sha256', values['input-sha256'], '--output', values.output], {
    cwd: selected.input.wrapper.root, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'pipe'],
    env: { PATH: '/usr/bin:/bin', HOME: values.output, LANG: 'C', TZ: 'UTC', PYTHONDONTWRITEBYTECODE: '1' },
  });
  let bytes = 0; let failed = false; let forceTimer;
  const owned = new Map(); const managerGrace = new Map(); let registrations = 0; let controlBytes = 0; let pending = '';
  const signalGroup = (pid, signal) => { try { process.kill(-pid, signal); } catch {} };
  const retireManager = pid => {
    if (managerGrace.has(pid)) return;
    // A manager may own a native spawn whose IPC record never reached the
    // killed collection. TERM must reach its local owner before hard KILL.
    const entry = {};
    entry.promise = new Promise(resolve => {
      entry.finish = () => { clearTimeout(entry.timer); managerGrace.delete(pid); resolve(); };
      entry.timer = setTimeout(() => { signalGroup(pid, 'SIGKILL'); entry.finish(); }, 2_000);
    });
    managerGrace.set(pid, entry); signalGroup(pid, 'SIGTERM');
  };
  const killOwned = () => {
    for (const [pid, record] of owned) if (record.kind === 'native') signalGroup(pid, 'SIGKILL');
    for (const [pid] of owned) if (!managerGrace.has(pid)) signalGroup(pid, 'SIGKILL');
  };
  const stop = () => {
    if (failed) return; failed = true;
    for (const [pid, record] of owned) {
      if (record.kind === 'manager') retireManager(pid);
      else signalGroup(pid, record.kind === 'native' ? 'SIGKILL' : 'SIGTERM');
    }
    signalGroup(child.pid, 'SIGTERM');
    forceTimer = setTimeout(() => { killOwned(); signalGroup(child.pid, 'SIGKILL'); }, 2_000);
  };
  const exiting = () => { killOwned(); signalGroup(child.pid, 'SIGKILL'); };
  process.once('SIGTERM', stop); process.once('SIGINT', stop); process.once('exit', exiting);
  // Only the authenticated Python/collection producer holds this write side.
  // PID values are observations of owned spawns, never caller-selected input.
  child.stdio[3].on('data', part => {
    controlBytes += part.length;
    if (controlBytes > 32_768) { stop(); return; }
    pending += part.toString('utf8');
    while (pending.includes('\n')) {
      const index = pending.indexOf('\n'); const line = pending.slice(0, index); pending = pending.slice(index + 1);
      try {
        requireValue(Buffer.byteLength(line) <= 4_096, 'Source control record byte bound');
        const record = JSON.parse(line);
        requireValue(Object.keys(record).sort().join(',') === 'event,kind,owner,pid' &&
          ['spawn', 'close'].includes(record.event) && ['collection', 'manager', 'native'].includes(record.kind) &&
          Number.isSafeInteger(record.pid) && record.pid > 1 && record.pid !== process.pid && record.pid !== child.pid &&
          (record.kind === 'collection' ? record.owner === 0 : owned.get(record.owner)?.kind === 'collection'),
          'Unowned source control observation');
        if (record.event === 'spawn') {
          requireValue(++registrations <= 64 && !owned.has(record.pid), 'Source owned group cardinality/identity bound');
          owned.set(record.pid, record);
          if (failed) {
            if (record.kind === 'manager') retireManager(record.pid);
            else signalGroup(record.pid, 'SIGKILL');
          }
        } else {
          const started = owned.get(record.pid);
          requireValue(started?.kind === record.kind && started.owner === record.owner, 'Unmatched source group close');
          if (record.kind === 'collection') {
            // Retain managers through their TERM grace: they remain the owner
            // of actual detached native spawns not yet forwarded over IPC.
            for (const [pid, member] of owned) if (member.owner === record.pid) {
              if (member.kind === 'manager') retireManager(pid);
              else signalGroup(pid, 'SIGKILL');
            }
          }
          signalGroup(record.pid, 'SIGKILL');
          managerGrace.get(record.pid)?.finish(); owned.delete(record.pid);
        }
      } catch { stop(); }
    }
    if (Buffer.byteLength(pending) > 4_096) stop();
  });
  child.stdio[3].on('error', stop);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', chunk => {
    bytes += chunk.length; if (bytes > limits.leaf) stop();
  });
  const timer = setTimeout(stop, limits.totalMs);
  let result;
  try {
    result = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('close', (code, signal) => resolve({ code, signal }));
    });
  } finally {
    clearTimeout(timer); clearTimeout(forceTimer);
    for (const [pid, record] of owned) if (record.kind === 'manager') retireManager(pid);
    killOwned();
    // Outer close/final cleanup must not collapse a newly begun manager grace.
    await Promise.all([...managerGrace.values()].map(entry => entry.promise));
    killOwned();
    const until = Date.now() + 2_000;
    while (owned.size && Date.now() < until) {
      for (const [pid] of owned) { try { process.kill(-pid, 0); } catch { owned.delete(pid); } }
      if (owned.size) await new Promise(resolve => setTimeout(resolve, 25));
    }
    if (owned.size || pending) failed = true;
    process.removeListener('SIGTERM', stop); process.removeListener('SIGINT', stop); process.removeListener('exit', exiting);
  }
  try {
    await preflight(values.input, values['input-sha256'], values.output, { outputReady: true });
  } catch { failed = true; }
  let summary;
  try {
    const file = path.join(values.output, 'qualification-summary.json');
    const identity = await hashFile(file, limits.summary);
    const document = (await readPinnedJson(file, identity.sha256, limits.summary)).document;
    qualificationExitCode(document);
    summary = summarizeQualification({ cases: document.cases, evidenceScope: document.evidenceScope });
  } catch {
    summary = summarizeQualification({ cases: [], evidenceScope: 'source-fixture' });
  }
  if (failed || result.code !== 0 || result.signal) {
    summary = summarizeQualification({ cases: summary.cases.map(record => ({ ...record,
      state: 'FAILED', reason: 'Fixed source wrapper/collection failed or exceeded its bound' })), evidenceScope: 'source-fixture' });
  }
  // A retained summary can never establish whole-worker proof. Keep all
  // observations in the source scope even if the closed wrapper exits zero.
  const output = jsonBytes({ ...summary, sourceWrapperOutcome: { exitCode: result.code, signal: result.signal },
    actualWorkerNamespaceObserved: false, actualImageObserved: false });
  requireValue(output.length <= limits.summary, 'Summary report budget exceeded');
  const temporary = path.join(values.output, 'qualification-summary.new');
  await fs.writeFile(temporary, output, { flag: 'wx', mode: 0o444 });
  await fs.rename(temporary, path.join(values.output, 'qualification-summary.json'));
  return { summary, exitCode: qualificationExitCode(summary) };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const values = parseWorkerArgs(process.argv.slice(2));
    if (values.inventory) process.stdout.write(JSON.stringify({ schemaVersion: 1, evidenceScope: 'source-inventory',
      completeness: false, productionEligible: false, slots }) + '\n');
    else {
      const result = await runQualification(values); process.exitCode = result.exitCode;
      process.stdout.write(JSON.stringify({ evidenceScope: result.summary.evidenceScope, completeness: false,
        productionEligible: false, missingSlots: result.summary.missingSlots }) + '\n');
    }
  } catch {
    process.stderr.write('Fixed worker input/collection rejected; qualification is incomplete\n'); process.exitCode = 1;
  }
}
