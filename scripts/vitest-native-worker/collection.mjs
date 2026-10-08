// Fixed test-owned callback. Actual manager/native bytes remain source evidence.
// No CLI/version switch, worker substitute or complete qualification is provided.
import * as fs from 'node:fs/promises';
import { writeSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, execFile } from 'node:child_process';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { parseArgs } from 'node:util';
import { preflight } from './inputs.mjs';
import { categories, slots, limits, summarizeQualification } from './contract.mjs';
import { hashFile, requireValue, sha256, jsonBytes, relativeName } from '../vitest-release/files.mjs';

// Actual fixed peer results, never declared namespace/qualification evidence.
export function concurrentSourceFailure(peers) {
  return peers.length !== 2 || peers.some(peer => peer.observerFailure || peer.markerExecutions.length ||
    peer.result.exitCode !== 0 || peer.result.signal ||
    peer.nativeOutcome && (peer.nativeOutcome.exitCode !== 0 || peer.nativeOutcome.signal));
}

export async function collectSource(inputFile, inputPin, output) {
  const selected = await preflight(inputFile, inputPin, output, { contextReady: true });
  const { input, profile, observation, nativeNode, parentNode, renovateRoot, executingRoot } = selected;
  requireValue(process.versions.node === '24.18.0' &&
    (await hashFile(process.execPath, 268_435_456)).sha256 === (await hashFile(parentNode, 268_435_456)).sha256,
  'Collection interpreter differs from selected authentic parent');
  const started = Date.now();
  const active = new Map(); let aborted = false;
  const control = (event, kind, pid) => writeSync(3, JSON.stringify({ event, kind, pid, owner: process.pid }) + '\n');
  const kill = (pid, signal = 'SIGKILL') => { try { process.kill(-pid, signal); } catch {} };
  const abort = () => {
    aborted = true;
    for (const entry of active.values()) {
      for (const pid of entry.nativeGroups) kill(pid);
      kill(entry.child.pid, 'SIGTERM');
      entry.force ??= setTimeout(() => kill(entry.child.pid), 1_000);
    }
  };
  const exiting = () => {
    for (const entry of active.values()) { for (const pid of entry.nativeGroups) kill(pid); kill(entry.child.pid); }
  };
  process.once('SIGTERM', abort); process.once('SIGINT', abort); process.once('exit', exiting);
  const raw = path.join(output, 'raw'); await fs.mkdir(raw);
  const receipts = path.join(output, 'native-receipts'); await fs.mkdir(receipts);
  const bin = path.join(output, 'bin'); await fs.mkdir(bin);
  await fs.symlink(nativeNode, path.join(bin, 'node'));
  await fs.symlink(path.join(input.originalRoot, 'bin/pnpm.mjs'), path.join(bin, 'pnpm'));
  await fs.chmod(bin, 0o555);
  const references = []; let retainedBytes = 0;
  async function retain(name, bytes) {
    relativeName(name);
    requireValue(bytes.length <= limits.leaf && references.length < limits.retainedFiles &&
      retainedBytes + bytes.length <= limits.retainedBytes, 'Raw evidence budget exceeded');
    const file = path.join(raw, name);
    await fs.writeFile(file, bytes, { flag: 'wx', mode: 0o444 });
    retainedBytes += bytes.length;
    const reference = { path: `raw/${name}`, sha256: sha256(bytes) }; references.push(reference); return reference;
  }
  const binding = { ...selected.binding, evidenceScope: 'source-fixture',
    workerContext: selected.context, actualWorkerNamespaceObserved: false, actualImageObserved: false };
  await retain('bindings.json', jsonBytes(binding));
  const delegationSource = await retain('selected-source-probe.mjs', await fs.readFile(path.join(observation, 'probe.mjs')));
  const packages = {};
  for (const version of ['1.0.0', '1.0.1']) packages[version] = await fs.readFile(path.join(input.registry.root, `native-fixture-${version}.tgz`));
  let origin; let requests = 0; let registryExceeded = false;
  const registry = createServer((request, response) => {
    if (++requests > 256 || request.method !== 'GET' || request.url.length > 256) {
      registryExceeded = true; response.writeHead(400); response.end(); return;
    }
    if (request.url === '/native-fixture') {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify({ name: 'native-fixture', 'dist-tags': { latest: '1.0.1' },
        versions: Object.fromEntries(Object.entries(packages).map(([version, bytes]) => [version, {
          name: 'native-fixture', version, dist: { tarball: `${origin}/native-fixture/-/native-fixture-${version}.tgz`,
            integrity: `sha512-${createHash('sha512').update(bytes).digest('base64')}` },
        }])) })); return;
    }
    const match = /^\/native-fixture\/-\/native-fixture-(1\.0\.[01])\.tgz$/.exec(request.url);
    if (!match) { response.writeHead(404); response.end(); return; }
    response.end(packages[match[1]]);
  });
  registry.requestTimeout = 5_000; registry.headersTimeout = 5_000;
  await new Promise((resolve, reject) => { registry.once('error', reject); registry.listen(0, '127.0.0.1', resolve); });
  origin = `http://127.0.0.1:${registry.address().port}`;
  const guardNames = ['script-executed', 'dependency-script-executed', 'hook-executed', 'preload-executed'];
  const outcomes = new Map(); const supporting = [];
  const git = promisify(execFile);
  const heads = new Map();
  async function workspace(name, version) {
    const directory = path.join(output, name); await fs.mkdir(directory);
    for (const leaf of await fs.readdir(input.workspace.root)) {
      const copy = path.join(directory, leaf);
      await fs.copyFile(path.join(input.workspace.root, leaf), copy);
      await fs.chmod(copy, 0o600); // Only the fresh controlled output copy is mutable.
    }
    const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json')));
    manifest.dependencies['native-fixture'] = version;
    await fs.writeFile(path.join(directory, 'package.json'), jsonBytes(manifest));
    const gitOptions = { cwd: directory, encoding: 'utf8', timeout: 1_000, maxBuffer: 4_096,
      env: { PATH: '/usr/bin:/bin', GIT_CONFIG_GLOBAL: '/dev/null', GIT_CONFIG_NOSYSTEM: '1', GIT_NO_LAZY_FETCH: '1' } };
    await git('/usr/bin/git', ['-c', 'core.hooksPath=/dev/null', 'init', '--quiet'], gitOptions);
    const tree = (await git('/usr/bin/git', ['hash-object', '-t', 'tree', '-w', '/dev/null'], gitOptions)).stdout.trim();
    const commit = `tree ${tree}\nauthor Source fixture <source-fixture@example.invalid> 1 +0000\ncommitter Source fixture <source-fixture@example.invalid> 1 +0000\n\nFixed source invocation ${name}\n`;
    const objectFile = path.join(directory, '.git/fixture-commit'); await fs.writeFile(objectFile, commit);
    const head = (await git('/usr/bin/git', ['hash-object', '-t', 'commit', '-w', objectFile], gitOptions)).stdout.trim();
    requireValue(/^[a-f0-9]{40}$/.test(head), 'Uncorrelated fixed workspace head');
    await fs.writeFile(path.join(directory, '.git/HEAD'), head + '\n'); heads.set(directory, head);
    await fs.writeFile(path.join(directory, '.npmrc'), `registry=${origin}/\nfetch-retries=0\nfetch-timeout=5000\n`);
    return directory;
  }
  async function guards(directory, remaining = { count: 20_000 }) {
    const found = [];
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      requireValue(--remaining.count >= 0, 'Workspace marker traversal budget exceeded');
      if (guardNames.includes(entry.name)) found.push(entry.name);
      if (entry.isDirectory() && entry.name !== 'home') found.push(...await guards(path.join(directory, entry.name), remaining));
    }
    return found;
  }
  async function manager(directory, category, identity, name) {
    requireValue(!aborted && Date.now() - started < limits.totalMs, 'Whole source collection aborted/deadline exceeded');
    const before = new Set(await fs.readdir(receipts));
    const home = path.join(directory, 'home'); await fs.mkdir(home, { recursive: true });
    requireValue(!aborted, 'Source collection cancelled before owned spawn');
    const child = spawn(parentNode, [path.join(executingRoot, 'scripts/test-vitest-native-runner.mjs'),
      '--root', directory, '--renovate', renovateRoot, '--bin', bin, '--category', category,
      '--profile-root', observation, '--profile-sha256', input.profile.sha256,
      '--context-sha256', process.env.VITEST_NATIVE_CONTEXT_SHA256], {
      cwd: directory, detached: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { PATH: `${bin}:/usr/bin:/bin`, HOME: home, LANG: 'C', TZ: 'UTC', CI: 'true',
        XDG_CONFIG_HOME: path.join(home, 'config'), XDG_CACHE_HOME: path.join(home, 'cache'),
        VITEST_NATIVE_PROFILE_SHA256: input.profile.sha256,
        VITEST_NATIVE_CONTEXT_SHA256: process.env.VITEST_NATIVE_CONTEXT_SHA256,
        NODE_OPTIONS: identity === 'derived' ? `--import=${observation}/loader.mjs` : '' },
    });
    let stdout = Buffer.alloc(0); let stderrBytes = 0; let observerFailure = null; let killed = false;
    const entry = { child, nativeGroups: new Set(), force: null, closed: null }; active.set(child.pid, entry);
    control('spawn', 'manager', child.pid);
    child.on('message', record => {
      try {
        requireValue(record && Object.keys(record).sort().join(',') === 'event,pid' &&
          ['spawn', 'close'].includes(record.event) && Number.isSafeInteger(record.pid) && record.pid > 1 &&
          record.pid !== process.pid && record.pid !== child.pid, 'Invalid fixed manager spawn observation');
        if (record.event === 'spawn') {
          requireValue(entry.nativeGroups.size < 8 && !entry.nativeGroups.has(record.pid), 'Owned native group bound');
          entry.nativeGroups.add(record.pid); control('spawn', 'native', record.pid);
          if (aborted) kill(record.pid);
        } else {
          requireValue(entry.nativeGroups.has(record.pid), 'Unmatched actual native close');
          kill(record.pid); entry.nativeGroups.delete(record.pid); control('close', 'native', record.pid);
        }
      } catch { observerFailure ??= 'invalid-source-control'; abort(); }
    });
    entry.closed = new Promise(resolve => child.once('close', () => {
      for (const pid of entry.nativeGroups) { kill(pid); control('close', 'native', pid); }
      entry.nativeGroups.clear(); clearTimeout(entry.force); active.delete(child.pid);
      control('close', 'manager', child.pid); resolve();
    }));
    function stop(reason) {
      if (killed) return; killed = true; observerFailure = reason;
      for (const pid of entry.nativeGroups) kill(pid);
      kill(child.pid, 'SIGTERM'); entry.force ??= setTimeout(() => kill(child.pid), 1_000);
    }
    child.stdout.on('data', bytes => {
      if (stdout.length + bytes.length > limits.leaf) stop('output-budget');
      else stdout = Buffer.concat([stdout, bytes]);
    });
    child.stderr.on('data', bytes => { stderrBytes += bytes.length; if (stderrBytes > limits.leaf) stop('output-budget'); });
    const timer = setTimeout(() => stop('deadline'), Math.min(limits.commandMs, limits.totalMs - (Date.now() - started)));
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, signal) => resolve({ exitCode: code, signal }));
    }).finally(() => clearTimeout(timer));
    let managerResult = null;
    try { managerResult = JSON.parse(stdout.toString('utf8').trim().split('\n').at(-1)); }
    catch { observerFailure ??= 'unreadable-manager-output'; }
    const retained = [await retain(`${name}-manager.json`, jsonBytes({ category, runtimeIdentity: identity,
      managerOutcome: result, managerError: managerResult?.error ?? null, observerFailure,
      stderrBytes, cleanupIndependentlyObserved: false }))];
    if (stdout.length && !observerFailure) retained.push(await retain(`${name}-manager-output.json`, stdout));
    let lock = null;
    try { lock = await fs.readFile(path.join(directory, 'pnpm-lock.yaml')); retained.push(await retain(`${name}.lock`, lock)); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const nativeReceipts = [];
    for (const filename of (await fs.readdir(receipts)).filter(file => file.endsWith('.json') && !before.has(file)).sort()) {
      requireValue(/^[a-f0-9]{32}\.json$/.test(filename), 'Unexpected native receipt name');
      const bytes = await fs.readFile(path.join(receipts, filename));
      const receipt = JSON.parse(bytes);
      if (receipt.inputHead !== heads.get(directory)) continue;
      const reference = await retain(`${name}-${filename}`, bytes); retained.push(reference);
      nativeReceipts.push(receipt);
    }
    const markerExecutions = await guards(directory);
    supporting.push({ name, category, runtimeIdentity: identity, managerOutcome: result,
      observerFailure, markerExecutions, references: retained });
    return { result, lock, nativeReceipts, references: retained, observerFailure, markerExecutions,
      nativeOutcome: nativeReceipts.length === 1 ? { exitCode: nativeReceipts[0].nativeExit, signal: nativeReceipts[0].nativeSignal } : null };
  }
  try {
    for (const category of categories) {
      for (const identity of ['original', 'derived']) {
        const directory = await workspace(`${category}-${identity}`, category === 'install' ? '1.0.1' : '1.0.0');
        if (category !== 'install') {
          const warmup = await manager(directory, 'install', identity, `${category}-${identity}-warmup`);
          requireValue(warmup.result.exitCode === 0 && warmup.lock && !warmup.observerFailure, 'Controlled warmup failed');
          if (category === 'update') {
            const manifest = JSON.parse(await fs.readFile(path.join(directory, 'package.json')));
            manifest.dependencies['native-fixture'] = '1.0.1';
            await fs.writeFile(path.join(directory, 'package.json'), jsonBytes(manifest));
          }
        }
        outcomes.set(`${category}-${identity}`, await manager(directory, category, identity, `${category}-${identity}`));
      }
    }
    // Supporting invocations, not extra mandatory slots. The immutable native
    // profile and UUID collector retain separation across the two real managers.
    const concurrent = await Promise.all(['a', 'b'].map(name => workspace(`concurrency-${name}`, '1.0.1')));
    const concurrentOutcomes = await Promise.all(concurrent.map((directory, index) => manager(directory, 'install', 'derived', `concurrency-${index}`)));
    const cases = slots.map(slot => {
      const outcome = outcomes.get(`${slot.category}-${slot.runtimeIdentity}`);
      const original = outcomes.get(`${slot.category}-original`);
      const derived = outcomes.get(`${slot.category}-derived`);
      const divergent = original && derived && (!original.lock || !derived.lock || !original.lock.equals(derived.lock) ||
        JSON.stringify(original.result) !== JSON.stringify(derived.result));
      const concurrentCase = slot.scenario === 'concurrency' && slot.category === 'install';
      const observedFailure = outcome && (outcome.observerFailure || outcome.markerExecutions.length || outcome.result.exitCode !== 0 || outcome.result.signal) ||
        concurrentCase && concurrentSourceFailure(concurrentOutcomes);
      const baseline = slot.kind === 'baseline';
      const supportedPartial = baseline || ['data-only', 'script-suppression', 'hook-suppression'].includes(slot.scenario) || concurrentCase;
      const observedReferences = concurrentCase ? supporting.filter(item => item.name.startsWith('concurrency-'))
        .flatMap(item => item.references) : supportedPartial ? outcome?.references ?? [] :
        slot.scenario === 'delegation' ? [delegationSource] : [];
      let reason = 'Required held worker namespace, measured mounts and independent descendant cleanup are unavailable';
      if (slot.runtimeIdentity === 'original') reason = 'Stock native outcomes/locks retained; authentic original phase/interpreter evidence is unavailable';
      if (slot.scenario === 'delegation') reason = 'Selected native probe rejects unowned-delegation; no authentic frozen child path or challenge was invoked';
      if (divergent || observedFailure || registryExceeded) reason = 'Observed source native equivalence, suppression or collection failed';
      return { id: slot.id, state: divergent || observedFailure || registryExceeded ? 'FAILED' :
        supportedPartial || slot.scenario === 'delegation' ? 'UNSUPPORTED' : 'UNRUN', reason,
      references: observedReferences,
      ...(supportedPartial && !concurrentCase && outcome?.nativeOutcome ? { nativeOutcome: outcome.nativeOutcome } : {}) };
    });
    // Recheck the frozen capsule, actual interpreter aliases, metadata and
    // selected source bytes after collection; drift cannot reuse earlier pins.
    await preflight(inputFile, inputPin, output, { contextReady: true });
    const summary = summarizeQualification({ cases, evidenceScope: 'source-fixture' });
    const support = jsonBytes({ schemaVersion: 1, evidenceScope: 'source-fixture', binding,
      supportingInvocations: supporting, registryRequests: requests, registryExceeded,
      retainedBytes, linuxProcessProof: false, productionEligible: false });
    await retain('supporting-source-collection.json', support);
    // Full compatibility/lifecycle proof documents are deliberately absent.
    const bytes = jsonBytes(summary); requireValue(bytes.length <= limits.summary, 'Summary budget exceeded');
    await fs.writeFile(path.join(output, 'qualification-summary.json'), bytes, { flag: 'wx', mode: 0o444 });
    return summary;
  } catch {
    // Retain already observed native outcomes even if a later observer or
    // callback stage fails. Their failure/exit fields never become success.
    const cases = slots.map(slot => {
      const observed = outcomes.get(`${slot.category}-${slot.runtimeIdentity}`);
      return { id: slot.id, state: 'FAILED', reason: 'Source collection is incomplete after a bounded observer/input/output failure',
        references: observed?.references ?? [],
        ...(observed?.nativeOutcome ? { nativeOutcome: observed.nativeOutcome } : {}) };
    });
    const summary = summarizeQualification({ cases, evidenceScope: 'source-fixture' });
    await fs.writeFile(path.join(output, 'qualification-summary.json'), jsonBytes(summary), { flag: 'wx', mode: 0o444 });
    throw Error('Incomplete source collection');
  } finally {
    abort();
    await Promise.allSettled([...active.values()].map(entry => entry.closed));
    process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); process.removeListener('exit', exiting);
    registry.closeAllConnections(); await new Promise(resolve => registry.close(resolve));
  }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({ options: { input: { type: 'string' }, 'input-sha256': { type: 'string' }, output: { type: 'string' } }, allowPositionals: false });
    requireValue(values.input && values['input-sha256'] && values.output, 'Fixed selected callback inputs required');
    const summary = await collectSource(values.input, values['input-sha256'], values.output);
    process.stdout.write(JSON.stringify({ evidenceScope: summary.evidenceScope, completeness: false, productionEligible: false,
      missingSlots: summary.missingSlots.length }) + '\n');
  } catch {
    process.stderr.write('Fixed source collection failed; no qualification proof is available\n'); process.exitCode = 1;
  }
}
