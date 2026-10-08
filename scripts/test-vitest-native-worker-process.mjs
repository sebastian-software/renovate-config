#!/usr/bin/env node
// Opt-in source ownership regression: real fixed wrapper/manager/native processes.
// SIGSTOP schedules only kernel-observed children belonging to this fresh run.
// No operational worker proof, arbitrary command or caller PID selection.
import assert from 'node:assert/strict';
import * as fs from 'node:fs/promises';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { parseArgs } from 'node:util';
import { pathToFileURL } from 'node:url';
import { hash, seal, writeJson, leaves, consumer } from './test-vitest-production-fixture.mjs';
const { values } = parseArgs({ options: { fixture: { type: 'string' } }, allowPositionals: false });
assert(values.fixture && path.isAbsolute(values.fixture));
const original = JSON.parse(await fs.readFile(path.join(values.fixture, 'input.json')));
const { prepareNative } = await import(pathToFileURL(path.join(original.source.root, 'scripts/vitest-native/prepare.mjs')));
// Outside the selected capsule, the owned test source fixes which current
// driver bytes are under test. This rejects a stale capsule without baking
// a source hash into every future legitimate edit.
const expectedDriverSha256 = hash(await fs.readFile(new URL('./test-vitest-native-worker.mjs', import.meta.url)));
assert.equal(hash(await fs.readFile(path.join(original.source.root, 'scripts/test-vitest-native-worker.mjs'))), expectedDriverSha256, 'Frozen fixture executes a stale correction driver');
let caseDeadline = Infinity;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function table() {
  const text = execFileSync('/bin/ps', ['-axo', 'pid=,ppid=,pgid=,state=,command='],
    { encoding: 'utf8', timeout: 2_000, maxBuffer: 2_097_152 });
  return text.split('\n').map(line => /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/.exec(line)).filter(Boolean)
    .map(([, pid, parent, group, state, command]) => ({ pid: +pid, parent: +parent, group: +group, state, command }));
}
const alive = row => row && !row.state.includes('Z');
const signal = (pid, name, group = false) => { try { process.kill(group ? -pid : pid, name); } catch (error) { if (error.code !== 'ESRCH') throw error; } };
async function waitFor(check, ms, label) {
  const end = Math.min(Date.now() + ms, caseDeadline);
  while (Date.now() < end) { const value = check(table()); if (value) return value; await delay(15); }
  throw Error(`Bounded source process observation unavailable: ${label}`);
}
const results = [];
for (const [identity, interruption] of [['original', 'collection-kill'], ['derived', 'collection-kill'],
  ['original', 'SIGTERM'], ['derived', 'SIGINT']]) {
  const root = await fs.mkdtemp('/private/tmp/q2a-process-final-');
  const output = path.join(root, 'collection');
  const observation = path.join(root, 'observation');
  const prepared = await prepareNative({ archive: path.join(original.stock.artifactRoot, 'pnpm-11.17.0.tgz'),
    pnpmRoot: original.originalRoot, output: observation, receiptDirectory: path.join(output, 'native-receipts'),
    contextFile: path.join(output, 'context/context.json'), context: null,
    provenance: original.preparation.path, provenanceSha256: original.preparation.sha256, sourceRoot: original.source.root });
  await seal(observation);
  const input = structuredClone(original);
  input.profile = { path: path.join(observation, 'profile.json'), sha256: prepared.profileSha256 };
  const inventoryFile = path.join(root, 'observation-inventory.json');
  input.components.observation = { root: observation, inventoryFile,
    inventorySha256: await writeJson(inventoryFile, consumer(await leaves(observation))) };
  input.contextPlan = { path: path.join(root, 'context-plan.json'), sha256: await writeJson(path.join(root, 'context-plan.json'),
    { schemaVersion: 1, evidenceScope: 'source-fixture', contextFile: path.join(output, 'context/context.json'), worker: 'github-org' }) };
  const inputFile = path.join(root, 'input.json'); const inputPin = await writeJson(inputFile, input);
  const profileBefore = await fs.readFile(input.profile.path);
  const child = spawn(process.execPath, [path.join(input.source.root, 'scripts/test-vitest-native-worker.mjs'),
    '--input', inputFile, '--input-sha256', inputPin, '--output', output, '--source-fixture'],
    { detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', HOME: root, LANG: 'C', TZ: 'UTC' } });
  let stdout = ''; let stderr = ''; let over = false;
  for (const [stream, name] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']]) stream.on('data', data => {
    if (Buffer.byteLength(stdout) + Buffer.byteLength(stderr) + data.length > 65_536) { over = true; signal(child.pid, 'SIGKILL', true); }
    else if (name === 'stdout') stdout += data; else stderr += data;
  });
  const finished = new Promise(resolve => child.once('close', (code, signal) => resolve({ code, signal })));
  caseDeadline = Date.now() + 180_000;
  const timeline = [];
  const event = name => timeline.push({ event: name, milliseconds: performance.now() });
  event('public-started');
  const guard = setTimeout(() => signal(child.pid, 'SIGKILL', true), 180_000);
  let collection; let manager; let native; let wrapper; let survivor; let outcome;
  try {
    wrapper = await waitFor(rows => rows.find(row => row.parent === child.pid && row.group === row.pid && row.command.includes('/native_worker_fixture.py --input ' + inputFile)), 90_000, 'owned outer Python');
    collection = await waitFor(rows => rows.find(row => row.command.includes('/vitest-native-worker/collection.mjs --input ' + inputFile)), 90_000, 'fixed collection');
    manager = await waitFor(rows => rows.find(row => row.parent === collection.pid && row.group === row.pid &&
      row.command.includes('/test-vitest-native-runner.mjs --root ' + output + '/install-' + identity + ' ')), 60_000, identity + ' manager');
    // Stop the collection before runner native creation, preventing IPC forwarding.
    signal(collection.pid, 'SIGSTOP'); event('collection-stop');
    native = await waitFor(rows => rows.find(row => row.parent === manager.pid && row.group === row.pid && alive(row) && row.command.includes('pnpm install')), 10_000, 'actual detached native spawn');
    event('native-kernel-birth-observed');
    signal(native.pid, 'SIGSTOP', true); event('native-group-stop');
    const stoppedNative = await waitFor(rows => rows.find(row => row.pid === native.pid && row.group === native.group && row.state.includes('T')), 2_000, 'actual owned native group stopped');
    native = { ...native, stoppedState: stoppedNative.state };
    await delay(50); // The collection remains stopped while the manager observes its returned spawn.
    signal(manager.pid, 'SIGSTOP'); event('manager-stop');
    // The manager now owns a genuine native group while its IPC consumer is stopped.
    // Killing the collection must give that manager a grace to perform local cleanup.
    if (interruption === 'collection-kill') { signal(collection.pid, 'SIGKILL'); event('collection-kill'); }
    else { signal(child.pid, interruption); event('public-' + interruption); }
    await delay(200);
    signal(manager.pid, 'SIGCONT'); event('manager-continue');
    // Observe within the cleanup grace, before postflight work or the fixed
    // registry fetch timeout can hide a short-lived leaked group.
    const probeEnd = Date.now() + 2_300;
    do {
      survivor = table().find(row => row.group === native.group && alive(row));
      if (!survivor) { event('native-group-gone'); break; }
      await delay(15);
    } while (Date.now() < probeEnd);
    if (survivor) event('native-group-survived-grace');
    outcome = await Promise.race([finished, delay(20_000).then(() => { throw Error('Driver cleanup/report exceeded focused bound'); })]);
    await delay(200);
    assert.equal(hash(await fs.readFile(input.profile.path)), hash(profileBefore), 'Measured profile changed');
    const summary = JSON.parse(await fs.readFile(path.join(output, 'qualification-summary.json')));
    assert.equal(summary.completeness, false); assert.equal(summary.productionEligible, false);
    assert.equal(summary.cases.length, 48); assert(!summary.cases.some(record => record.state === 'PASSED'));
    assert.equal(outcome.code, 1); assert.equal(over, false);
    results.push({ identity, interruption, timeline, executedDriverSha256: expectedDriverSha256, root, inputPin, collection, manager, native, survivor: survivor ?? null,
      outcome, completeness: false, productionEligible: false, linuxProcessProof: false, scheduling: 'collection STOP before native; owned native PGID STOP until owner KILL; manager STOP; interruption; manager CONT' });
  } finally {
    // Only identities captured through this run's actual spawn ancestry are cleaned.
    if (native) signal(native.pid, 'SIGKILL', true);
    if (manager) { signal(manager.pid, 'SIGCONT'); signal(manager.pid, 'SIGKILL', true); }
    if (collection) { signal(collection.pid, 'SIGCONT'); signal(collection.pid, 'SIGKILL', true); }
    if (wrapper) signal(wrapper.pid, 'SIGKILL', true);
    signal(child.pid, 'SIGCONT'); signal(child.pid, 'SIGKILL', true);
    await Promise.race([finished, delay(2_000)]); clearTimeout(guard);
    await writeJson(path.join(root, 'process-regression.json'), { identity, interruption, timeline, executedDriverSha256: expectedDriverSha256, collection, manager, native,
      survivor: survivor ?? null, outcome: outcome ?? null, stdout, stderr, evidenceScope: 'source-process-ownership', linuxProcessProof: false });
    caseDeadline = Date.now() + 5_000;
    await waitFor(rows => !rows.some(row => [native?.group, manager?.group, collection?.group, wrapper?.group, child.pid].includes(row.group) && alive(row)),
      5_000, 'owned seeded group cleanup');
  }
}
console.log(JSON.stringify({ results, evidenceScope: 'source-process-ownership', linuxProcessProof: false }));
assert(results.every(result => result.survivor === null), 'Native group survived killed collection before native IPC forwarding');
