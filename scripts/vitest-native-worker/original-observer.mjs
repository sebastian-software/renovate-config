import * as fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { preflightOriginalObserver } from './original-observer-inputs.mjs';
import { ObserverProtocol } from './original-observer-protocol.mjs';
import { ownedNativeProcess } from './original-observer-process.mjs';
import { summarizeOriginalObservation, observerLimits as limits, UnsupportedObservation, createOriginalLifecycleDiagnostics } from './original-observer-contract.mjs';
import { prepareNative } from '../vitest-native/prepare.mjs';
import { dataOnlyEnvironment } from '../vitest-native/data-only.mjs';
import { sha256, jsonBytes, requireValue, ReleaseError } from '../vitest-release/files.mjs';

const categories = ['install', 'update', 'dedupe'];
const matches = (actual, expected, scriptId) => actual && actual.scriptId === scriptId &&
  actual.lineNumber === expected.lineNumber && actual.columnNumber === expected.columnNumber;
function measured(condition, message) {
  if (!condition) throw new UnsupportedObservation(/source|script/i.test(message) ? 'source' :
    /location|breakpoint|frame/i.test(message) ? 'location' : 'protocol', message);
}
// Pure internal seams share the actual controller's exact-location rejection rules.
export function validateOriginalPossibleLocation(possible, point, scriptId) {
  measured(possible.locations?.length === 1 && matches(possible.locations[0], point, scriptId),
    'Exact source token is not an independently resolved breakpoint');
}
export function validateOriginalResolvedLocation(params, points, scriptId, ids, resolved) {
  const name = ids.get(params.breakpointId);
  measured(name && scriptId !== null && !resolved.has(name) && matches(params.location, points[name], scriptId),
    'Unknown/replayed/nearest original breakpoint');
  return name;
}
export function validateOriginalPauseFrame(params, points, scriptId, ids, resolved) {
  measured(Array.isArray(params.callFrames) && params.callFrames.length > 0 && params.callFrames.length <= 64,
    'Unknown or unbounded debugger pause');
  const frame = params.callFrames[0]; const hits = params.hitBreakpoints ?? [];
  measured(hits.length === 1 && scriptId !== null && resolved.size === 3, 'Uncorrelated original pause');
  const name = ids.get(hits[0]);
  measured(name && matches(frame?.location, points[name], scriptId) && typeof frame.functionName === 'string' &&
    /^[A-Za-z0-9_$]{0,64}$/.test(frame.functionName), 'Current original frame differs from selected location');
  if (name === 'entry') measured(frame.functionName === points.handlerName && params.callFrames.slice(1).some(caller =>
    caller?.location?.scriptId === scriptId && caller.location.lineNumber === points.preCall.lineNumber),
  'Selected handler frame lacks authentic caller linkage');
  return { name, frame };
}
async function observeOriginal(selected, category, workspace, env, signal) {
  const points = selected.locations[category]; const events = []; let protocol = null;
  const lifecycle = createOriginalLifecycleDiagnostics({ recipe: selected.input.fixtureRecipe, category, role: 'original',
    launch: categories.indexOf(category) * 2 });
  const record = lifecycle.record;
  let scriptId = null; let initialPause = false; let pauses = 0; let detached = false; let failureDiagnostic = null;
  const ids = new Map(); const resolved = new Set();
  const native = await ownedNativeProcess(selected.input.node.path,
    ['--inspect-brk=127.0.0.1:0', path.join(selected.input.pnpm.root, 'bin/pnpm.mjs'), category,
      '--offline', '--ignore-scripts', '--reporter=silent'], workspace, env, signal, { role: 'original', category, record });
  record({ event: 'controller-launch-receipt' });
  const add = event => { requireValue(events.length < limits.events, 'Observer normalized events exceeded'); events.push({ ...event, sequence: events.length }); };
  add({ phase: 'launch' });
  try {
    protocol = new ObserverProtocol(await native.endpoint, pathToFileURL(selected.script).href, record);
    await protocol.enable();
    for (const [name, point] of [['preCall', points.preCall], ['entry', points.entry], ['settlement', points.settlement]]) {
      const response = await protocol.breakpoint(point);
      measured(typeof response.breakpointId === 'string' && Array.isArray(response.locations) && response.locations.length === 0,
        'Original script unexpectedly resolved before authenticated parsing');
      ids.set(response.breakpointId, name);
    }
    await protocol.start();
    while (!detached) {
      const next = await Promise.race([
        protocol.notification().then(message => ({ message })),
        native.waiting.then(() => ({ detach: true })), native.closed.then(() => ({ closed: true })),
      ]);
      record({ event: 'controller-receipt', site: next.detach ? 'shutdown-cue' : next.closed ? 'stream-close' : 'notification' });
      if (next.detach || next.closed) { detached = true; protocol.close(); break; }
      const { method, params } = next.message;
      if (method === 'Debugger.scriptParsed') {
        measured(scriptId === null && params.url === pathToFileURL(selected.script).href &&
          params.startLine === 0 && params.startColumn === 0 && !params.isLiveEdit,
          'Unknown/replayed original debugger script');
        const source = await protocol.source(params.scriptId);
        measured(typeof source.scriptSource === 'string' && sha256(Buffer.from(source.scriptSource)) === points.scriptSha256,
          'Actual Inspector script bytes differ from authenticated original');
        scriptId = params.scriptId;
        record({ event: 'script-authenticated' });
        for (const point of [points.preCall, points.entry, points.settlement]) {
          const possible = await protocol.possible(scriptId, point);
          validateOriginalPossibleLocation(possible, point, scriptId);
        }
        continue;
      }
      if (method === 'Debugger.breakpointResolved') {
        const name = validateOriginalResolvedLocation(params, points, scriptId, ids, resolved);
        resolved.add(name); record({ event: 'breakpoint-resolved', point: name }); continue;
      }
      measured(method === 'Debugger.paused' && ++pauses <= limits.pauses && Array.isArray(params.callFrames) &&
        params.callFrames.length > 0 && params.callFrames.length <= 64, 'Unknown or unbounded debugger pause');
      const frame = params.callFrames[0]; const hits = params.hitBreakpoints ?? [];
      if (!hits.length && !initialPause && scriptId === null) { initialPause = true; record({ event: 'initial-pause' }); await protocol.resume(); continue; }
      const { name } = validateOriginalPauseFrame(params, points, scriptId, ids, resolved);
      const phase = { preCall: 'pre-call-pause', entry: 'handler-entry', settlement: 'handler-settlement' }[name];
      measured(!events.some(event => event.phase === phase), 'Replayed original semantic phase');
      const location = { scriptSha256: points.scriptSha256, lineNumber: frame.location.lineNumber,
        columnNumber: frame.location.columnNumber, functionName: frame.functionName };
      record({ event: 'semantic-pause', point: name });
      add({ phase, location, ...(name === 'settlement' ? { settlement: 'resolved' } : {}) });
      await protocol.resume();
    }
  } catch (error) {
    record({ event: 'controller-receipt', site: 'failure' });
    record({ event: 'observer-failure', reason: error instanceof UnsupportedObservation ? error.reason : 'protocol' });
    if (!(error instanceof UnsupportedObservation)) {
      protocol?.close(); await native.stop('protocol', 'observeOriginal:unexpected-error'); await native.finish(); throw error;
    }
    const reason = signal?.aborted ? 'cancelled' : error.reason;
    failureDiagnostic = error.message;
    // Losing observation cancels this owned fixture. Never call that native completion.
    protocol?.close(); await native.stop(reason, 'observeOriginal:unsupported');
    add({ phase: 'observer-failure', reason, intervention: native.intervention === 'none' ? 'none' : 'signal-owned-process' });
  } finally { protocol?.close(); }
  const facts = await native.finish();
  if (facts.observerIntervention !== 'none' && !events.some(event => event.phase === 'observer-failure'))
    add({ phase: 'observer-failure', reason: facts.observerIntervention, intervention: 'signal-owned-process' });
  try { await selected.unchanged(); }
  catch (error) { if (!(error instanceof ReleaseError)) throw error;
    if (!events.some(event => event.phase === 'observer-failure')) add({ phase: 'observer-failure', reason: 'identity', intervention: 'none' }); }
  if (facts.outcome) add({ phase: 'native-terminal', outcome: facts.outcome });
  return { report: summarizeOriginalObservation({ category, events }), nativePid: native.pid,
    nativeFacts: facts, protocolCounts: protocol?.counts ?? null, actualScriptAuthenticated: scriptId !== null, failureDiagnostic,
    observerDetachedAtNativeShutdown: detached && native.waitingForDetach, lifecycleDiagnostics: lifecycle.snapshot() };
}
async function fixtureWorkspace(output, name, recipe) {
  const workspace = path.join(output, name); await fs.mkdir(workspace, { mode: 0o700 });
  await fs.writeFile(path.join(workspace, 'package.json'), jsonBytes({ name: 'bounded-original-observer-fixture',
    version: '1.0.0', private: true, packageManager: 'pnpm@11.17.0',
    ...(recipe === 'offline-miss-v1' ? { dependencies: { 'q2b1a-unavailable-offline-fixture': '0.0.0' } } : {}) }), { flag: 'wx', mode: 0o600 });
  return workspace;
}
async function lockIdentity(workspace) {
  try { const bytes = await fs.readFile(path.join(workspace, 'pnpm-lock.yaml')); return { present: true, sha256: sha256(bytes) }; }
  catch (error) { if (error.code === 'ENOENT') return { present: false, sha256: null }; throw error; }
}
export async function runOriginalObserver(inputFile, inputPin, output, { signal } = {}) {
  const selected = await preflightOriginalObserver(inputFile, inputPin, output);
  try {
    await fs.mkdir(output, { mode: 0o700 });
    const home = path.join(output, 'home'); await fs.mkdir(home, { mode: 0o700 });
    const observation = path.join(output, 'derived-observation');
    const prepared = await prepareNative({ archive: selected.input.pnpm.archive, pnpmRoot: selected.input.pnpm.root,
      output: observation, receiptDirectory: path.join(output, 'unused-receipts'),
      context: { worker: 'source-fixture', wrapperInvocation: 'source-fixture', containerId: '0'.repeat(64),
        imageId: `sha256:${'0'.repeat(64)}`, imageDigest: null } });
    requireValue(prepared.derivedBundleSha256 === selected.derivedBundleSha256, 'Derived source identity changed');
    const env = { PATH: `${path.dirname(selected.input.node.path)}:/usr/bin:/bin`, HOME: home, TMPDIR: home,
      LANG: 'C', TZ: 'UTC', CI: 'true', NO_COLOR: '1',
      pnpm_config_update_notifier: 'false',
      pnpm_config_manage_package_manager_versions: 'false', pnpm_config_store_dir: path.join(output, 'store'),
      ...dataOnlyEnvironment(observation) };
    const cases = [];
    for (const category of categories) {
      await selected.unchanged();
      const originalWorkspace = await fixtureWorkspace(output, `original-${category}`, selected.input.fixtureRecipe);
      const derivedWorkspace = await fixtureWorkspace(output, `derived-${category}`, selected.input.fixtureRecipe);
      const original = await observeOriginal(selected, category, originalWorkspace, env, signal);
      const derivedLifecycle = createOriginalLifecycleDiagnostics({ recipe: selected.input.fixtureRecipe, category, role: 'derived',
        launch: categories.indexOf(category) * 2 + 1 });
      const derived = await ownedNativeProcess(selected.input.node.path,
        [path.join(selected.input.pnpm.root, 'bin/pnpm.mjs'), category, '--offline', '--ignore-scripts', '--reporter=silent'],
        derivedWorkspace, { ...env, NODE_OPTIONS: `--import=${path.join(observation, 'loader.mjs')}`,
          VITEST_NATIVE_PROFILE_SHA256: prepared.profileSha256 }, signal, { role: 'derived', category, record: derivedLifecycle.record });
      const derivedFacts = await derived.finish();
      const originalLock = await lockIdentity(originalWorkspace); const derivedLock = await lockIdentity(derivedWorkspace);
      const equivalent = JSON.stringify(original.nativeFacts.outcome) === JSON.stringify(derivedFacts.outcome) &&
        JSON.stringify(originalLock) === JSON.stringify(derivedLock) && original.nativeFacts.observerIntervention === 'none';
      cases.push({ category, original, derived: { nativePid: derived.pid, nativeFacts: derivedFacts,
        debuggerEnabled: false, derivedBundleSha256: selected.derivedBundleSha256, lifecycleDiagnostics: derivedLifecycle.snapshot() }, originalLock, derivedLock, equivalent });
    }
    await selected.unchanged();
    const summary = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture',
      state: cases.every(item => item.original.report.state === 'supported' && item.equivalent) ? 'supported' : 'unsupported',
      completeness: false, productionEligible: false, platform: process.platform, arch: process.arch,
      node: { path: selected.input.node.path, sha256: selected.nodeIdentity.sha256, version: process.versions.node, v8: process.versions.v8,
        kernelExecutableIdentityObserved: false }, originalBundleSha256: selected.locations.install.scriptSha256,
      derivedBundleSha256: selected.derivedBundleSha256, controllerFiles: selected.input.controllerFiles,
      fixtureRecipe: selected.input.fixtureRecipe, cases,
      missingOperationalClaims: ['kernel-executable-identity', 'all-descendants', 'worker-namespace', 'immutable-image',
        'observed-mounts', 'independent-cleanup', 'data-only-enforcement', 'debugger-access-exclusion'],
      semanticLimitations: ['Rejected handler settlement has no authenticated error observation',
        'Debugger pauses and controlled detach change timing; unchanged bytes do not prove unchanged execution'] };
    const bytes = jsonBytes(summary); requireValue(bytes.length <= limits.summary, 'Observer report output exceeded');
    await fs.writeFile(path.join(output, 'summary.json'), bytes, { flag: 'wx', mode: 0o444 });
    return summary;
  } finally { await selected.close(); }
}
