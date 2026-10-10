// Synthetic decision regressions only; these inputs establish no Inspector feasibility.
import assert from 'node:assert/strict';
import childProcess from 'node:child_process';
import { EventEmitter } from 'node:events';
import { syncBuiltinESMExports } from 'node:module';
import { ownedNativeProcess } from './vitest-native-worker/original-observer-process.mjs';
import { createOriginalLifecycleDiagnostics, validateOriginalLifecycleDiagnostics, originalLifecycleLimits, observerLimits }
  from './vitest-native-worker/original-observer-contract.mjs';
import { ObserverProtocol } from './vitest-native-worker/original-observer-protocol.mjs';
import { summarizeOriginalObservation, validateOriginalObservationReport }
  from './vitest-native-worker/original-observer-contract.mjs';
import { UnsupportedObservation } from './vitest-native-worker/original-observer-contract.mjs';
import { originalHandlerLocation } from './vitest-native-worker/original-observer-source.mjs';
import * as originalSource from './vitest-native-worker/original-observer-source.mjs';
import { validateOriginalPossibleLocation, validateOriginalResolvedLocation, validateOriginalPauseFrame }
  from './vitest-native-worker/original-observer.mjs';

// These synthetic source snippets exercise the production-shared parser after its outer
// byte-authentication boundary. The real authenticated bundle is tested in the fixture suite.
const sourceSnippets = {
  install: 'async function handler5(opts3, _params, commands2) {\n  const include = {\n    dependencies: true\n  };\n  await installDeps(opts3, []);\n}\nasync function dryRunInstall(',
  update: 'async function handler13(opts3, params = [], commands2) {\n  const rebuildHandler = commands2?.rebuild;\n  return update(params, opts3, rebuildHandler);\n}\nasync function interactiveUpdate(',
  dedupe: 'async function handler6(opts3, _params, commands2) {\n  const include = {\n    dependencies: true\n  };\n  await installDeps(opts3, []);\n}\nvar commandNames6, recursiveByDefault2;',
};
let sourceSelectionNegatives = 0;
for (const [category, snippet] of Object.entries(sourceSnippets)) {
  const selected = originalHandlerLocation(snippet, category);
  assert.equal(selected.handlerName, { install: 'handler5', update: 'handler13', dedupe: 'handler6' }[category]);
  assert.deepEqual(selected.entry, category === 'update' ? { lineNumber: 2, columnNumber: 9 } : { lineNumber: 1, columnNumber: 18 });
  assert.deepEqual(selected.functionLocation, { lineNumber: 0, columnNumber: 6 });
  const anchor = category === 'update' ? '  return update(params, opts3, rebuildHandler);\n' : '  const include = {\n';
  const signature = snippet.slice(0, snippet.indexOf('\n') + 1);
  for (const [name, changed] of [
    ['missing-own-anchor', snippet.replace(anchor, '')],
    ['duplicate-own-anchor', snippet.replace(anchor, anchor + anchor)],
    ['anchor-in-different-handler', snippet.replace(anchor, '') + '\nasync function unrelated() {\n' + anchor + '}\n'],
    ['missing-handler', snippet.replace(signature, 'async function unrelated() {\n')],
    ['duplicate-handler', signature + snippet],
    ['entry-after-await', snippet.replace(anchor, '  await precedingOperation();\n' + anchor)],
    ['entry-after-yield', snippet.replace(anchor, '  yield precedingOperation();\n' + anchor)],
    ['early-body-boundary', snippet.replace(anchor, '}\n' + anchor)],
  ]) {
    assert.throws(() => originalHandlerLocation(changed, category), /source|handler|suspension/i,
      `${category}: ${name} accepted by the shared source selector`);
    sourceSelectionNegatives++;
  }
}
assert.throws(() => originalHandlerLocation(sourceSnippets.install, 'update'), /source/i);
sourceSelectionNegatives++;

// Synthetic protocol decisions use exactly the helpers called by the live controller.
// No socket, Inspector target, actual frame or pnpm runtime feasibility is measured here.
const scriptId = 'original-script';
const points = { preCall: { lineNumber: 100, columnNumber: 22 }, entry: { lineNumber: 42, columnNumber: 18 },
  settlement: { lineNumber: 110, columnNumber: 4 }, preCleanup: { lineNumber: 108, columnNumber: 12 },
  handlerName: 'handler5', functionLocation: { lineNumber: 41, columnNumber: 6 },
  dispatchFunctionName: '', dispatchFunctionLocation: { lineNumber: 90, columnNumber: 42 } };
const ids = new Map([['call-id', 'preCall'], ['entry-id', 'entry'], ['settled-id', 'settlement'], ['cleanup-id', 'preCleanup']]);
const resolved = new Set(['preCall', 'entry', 'preCleanup', 'settlement']);
const located = point => ({ scriptId, ...point });
let correlationNegatives = 0;
const rejectsCorrelation = (name, run) => {
  assert.throws(run, UnsupportedObservation, name); correlationNegatives++;
};
assert.doesNotThrow(() => validateOriginalPossibleLocation({ locations: [located(points.entry)] }, points.entry, scriptId));
for (const [name, locations] of [
  ['missing executable location', []], ['duplicate executable location', [located(points.entry), located(points.entry)]],
  ['nearest executable column', [{ ...located(points.entry), columnNumber: 19 }]],
  ['nearest executable line', [{ ...located(points.entry), lineNumber: 43 }]],
  ['wrong executable script', [{ ...located(points.entry), scriptId: 'derived-script' }]],
]) rejectsCorrelation(name, () => validateOriginalPossibleLocation({ locations }, points.entry, scriptId));
const resolution = { breakpointId: 'entry-id', location: located(points.entry) };
assert.equal(validateOriginalResolvedLocation(resolution, points, scriptId, ids, new Set()), 'entry');
for (const [name, changed, known, currentScript] of [
  ['unknown breakpoint', { ...resolution, breakpointId: 'unknown' }, new Set(), scriptId],
  ['replayed resolution', resolution, new Set(['entry']), scriptId],
  ['resolution before script authentication', resolution, new Set(), null],
  ['nearest resolved location', { ...resolution, location: { ...resolution.location, columnNumber: 19 } }, new Set(), scriptId],
  ['wrong resolved script', { ...resolution, location: { ...resolution.location, scriptId: 'derived-script' } }, new Set(), scriptId],
]) rejectsCorrelation(name, () => validateOriginalResolvedLocation(changed, points, currentScript, ids, known));
const pause = { hitBreakpoints: ['entry-id'], callFrames: [
  { functionName: 'handler5', functionLocation: located(points.functionLocation), location: located(points.entry) },
  { functionName: '', functionLocation: located(points.dispatchFunctionLocation), location: located(points.preCall) },
] };
const dispatchIdentity = { functionName: '', functionLocation: located(points.dispatchFunctionLocation) };
const stateFor = (observed = ['preCall'], preCallFrame = dispatchIdentity) =>
  ({ preCallFrame: structuredClone(preCallFrame), observed: new Set(observed), failed: false });
const checkedPauseFrame = (value, selected, authenticatedScript, knownIds, resolvedPoints, state = stateFor()) =>
  validateOriginalPauseFrame(value, selected, authenticatedScript, knownIds, resolvedPoints, state);
assert.equal(checkedPauseFrame(pause, points, scriptId, ids, resolved).name, 'entry');
const sameLineCaller = structuredClone(pause); sameLineCaller.callFrames[1].location.columnNumber++;
assert.equal(checkedPauseFrame(sameLineCaller, points, scriptId, ids, resolved).name, 'entry',
  'Caller continuation column must preserve the established original-script/dispatch-line rule');
for (const [name, mutate] of [
  ['missing frames', x => { x.callFrames = []; }],
  ['null current frame', x => { x.callFrames[0] = null; }],
  ['undefined current frame', x => { x.callFrames[0] = undefined; }],
  ['missing current-frame location', x => { delete x.callFrames[0].location; }],
  ['false current-frame location', x => { x.callFrames[0].location = false; }],
  ['null caller frame', x => { x.callFrames[1] = null; }],
  ['undefined caller frame', x => { x.callFrames[1] = undefined; }],
  ['missing caller-frame location', x => { delete x.callFrames[1].location; }],
  ['false caller-frame location', x => { x.callFrames[1].location = false; }],

  ['missing hit', x => { x.hitBreakpoints = []; }],
  ['duplicate hit', x => { x.hitBreakpoints.push('entry-id'); }],
  ['unknown hit', x => { x.hitBreakpoints = ['unknown']; }],
  ['wrong current script', x => { x.callFrames[0].location.scriptId = 'derived-script'; }],
  ['nearest paused column', x => { x.callFrames[0].location.columnNumber++; }],
  ['wrong handler frame', x => { x.callFrames[0].functionName = 'handler13'; }],
  ['invalid function name', x => { x.callFrames[0].functionName = 'handler5()'; }],
  ['missing caller', x => { x.callFrames.pop(); }],
  ['wrong caller script', x => { x.callFrames[1].location.scriptId = 'derived-script'; }],
  ['wrong caller line', x => { x.callFrames[1].location.lineNumber++; }],
]) {
  const changed = structuredClone(pause); mutate(changed);
  rejectsCorrelation(name, () => checkedPauseFrame(changed, points, scriptId, ids, resolved));
}
rejectsCorrelation('pause before script authentication', () => checkedPauseFrame(pause, points, null, ids, resolved));
rejectsCorrelation('pause before all exact resolutions', () => checkedPauseFrame(pause, points, scriptId, ids, new Set(['entry'])));
const selfOnly = { hitBreakpoints: ['entry-id'], callFrames: [{ functionName: 'handler5', location: located(points.entry) }] };
rejectsCorrelation('current frame cannot be its own caller', () => checkedPauseFrame(selfOnly,
  { ...points, preCall: points.entry }, scriptId, ids, resolved));
// Generic programming faults must not be silently classified as supported/unsupported input.
assert.throws(() => validateOriginalPossibleLocation(null, points.entry, scriptId), TypeError);

// The fourth point is diagnostic-only, but it shares exact point and callable
// authentication with the actual controller. State comes from authentic pauses.
const dispatchPause = name => ({ hitBreakpoints: [name === 'preCall' ? 'call-id' : name === 'preCleanup' ? 'cleanup-id' : 'settled-id'],
  callFrames: [{ ...structuredClone(dispatchIdentity), location: located(points[name]) }] });
assert.equal(checkedPauseFrame(dispatchPause('preCall'), points, scriptId, ids, resolved, stateFor([], null)).name, 'preCall');
assert.equal(checkedPauseFrame(dispatchPause('preCleanup'), points, scriptId, ids, resolved, stateFor(['preCall', 'entry'])).name, 'preCleanup');
assert.equal(checkedPauseFrame(dispatchPause('settlement'), points, scriptId, ids, resolved,
  stateFor(['preCall', 'entry', 'preCleanup'])).name, 'settlement');
for (const name of ['preCall', 'entry', 'preCleanup', 'settlement']) {
  const fewer = new Set(resolved); fewer.delete(name);
  rejectsCorrelation(`missing ${name} resolution`, () => checkedPauseFrame(dispatchPause('preCleanup'), points, scriptId, ids, fewer,
    stateFor(['preCall', 'entry'])));
}
for (const current of [new Set([...resolved, 'extra']), new Set(['preCall', 'entry', 'settlement', 'unknown'])])
  rejectsCorrelation('extra or substituted resolution', () => checkedPauseFrame(dispatchPause('preCleanup'), points, scriptId, ids, current,
    stateFor(['preCall', 'entry'])));
for (const alteredIds of [new Map([...ids].slice(1)), new Map([...ids, ['extra-id', 'preCleanup']]),
  new Map([...ids].map(([id, name]) => [id, name === 'settlement' ? 'preCleanup' : name]))])
  rejectsCorrelation('missing extra or duplicate point IDs', () => checkedPauseFrame(dispatchPause('preCleanup'), points, scriptId,
    alteredIds, resolved, stateFor(['preCall', 'entry'])));
for (const [name, mutate] of [
  ['wrong diagnostic script', x => { x.callFrames[0].location.scriptId = 'derived-script'; }],
  ['nearest diagnostic column', x => { x.callFrames[0].location.columnNumber++; }],
  ['nearest diagnostic line', x => { x.callFrames[0].location.lineNumber++; }],
  ['named outer function', x => { x.callFrames[0].functionName = 'main4'; }],
  ['missing dispatch callable', x => { delete x.callFrames[0].functionLocation; }],
  ['wrong dispatch callable script', x => { x.callFrames[0].functionLocation.scriptId = 'derived-script'; }],
  ['wrong dispatch callable line', x => { x.callFrames[0].functionLocation.lineNumber++; }],
  ['nearest dispatch callable column', x => { x.callFrames[0].functionLocation.columnNumber++; }],
  ['duplicate diagnostic hit', x => { x.hitBreakpoints.push('cleanup-id'); }],
  ['unknown diagnostic hit', x => { x.hitBreakpoints = ['unknown']; }],
  ['unbounded diagnostic frames', x => { x.callFrames = Array(65).fill(x.callFrames[0]); }],
]) {
  const changed = dispatchPause('preCleanup'); mutate(changed);
  rejectsCorrelation(name, () => checkedPauseFrame(changed, points, scriptId, ids, resolved, stateFor(['preCall', 'entry'])));
}
for (const [name, state] of [
  ['before pre-call', stateFor([], null)], ['before entry', stateFor(['preCall'])],
  ['replayed diagnostic', stateFor(['preCall', 'entry', 'preCleanup'])],
  ['late diagnostic', stateFor(['preCall', 'entry', 'preCleanup', 'settlement'])],
  ['after failure', { ...stateFor(['preCall', 'entry']), failed: true }],
  ['missing authenticated pre-call frame', stateFor(['preCall', 'entry'], null)],
  ['different authenticated pre-call frame', stateFor(['preCall', 'entry'],
    { ...dispatchIdentity, functionLocation: { ...dispatchIdentity.functionLocation, columnNumber: 43 } })],
]) rejectsCorrelation(name, () => checkedPauseFrame(dispatchPause('preCleanup'), points, scriptId, ids, resolved, state));
for (const [name, mutate] of [
  ['named caller function', x => { x.callFrames[1].functionName = 'main4'; }],
  ['wrong caller callable', x => { x.callFrames[1].functionLocation.lineNumber++; }],
  ['missing caller callable', x => { delete x.callFrames[1].functionLocation; }],
]) {
  const changed = structuredClone(pause); mutate(changed);
  rejectsCorrelation(name, () => checkedPauseFrame(changed, points, scriptId, ids, resolved));
}
rejectsCorrelation('settlement before diagnostic', () => checkedPauseFrame(dispatchPause('settlement'), points, scriptId, ids, resolved,
  stateFor(['preCall', 'entry'])));
rejectsCorrelation('replayed pre-call', () => checkedPauseFrame(dispatchPause('preCall'), points, scriptId, ids, resolved));
rejectsCorrelation('replayed entry', () => checkedPauseFrame(pause, points, scriptId, ids, resolved, stateFor(['preCall', 'entry'])));
const diagnosticResolution = { breakpointId: 'cleanup-id', location: located(points.preCleanup) };
assert.equal(validateOriginalResolvedLocation(diagnosticResolution, points, scriptId, ids, new Set()), 'preCleanup');
rejectsCorrelation('duplicate diagnostic resolution', () => validateOriginalResolvedLocation(diagnosticResolution, points, scriptId, ids,
  new Set(['preCleanup'])));
rejectsCorrelation('extra mapped diagnostic resolution', () => validateOriginalResolvedLocation(
  { breakpointId: 'extra-id', location: located(points.preCleanup) }, { ...points, extra: points.preCleanup }, scriptId,
  new Map([...ids, ['extra-id', 'extra']]), new Set()));

const events = [
  { phase: 'launch', sequence: 0 },
  { phase: 'pre-call-pause', sequence: 1 },
  { phase: 'native-terminal', sequence: 2, outcome: { exitCode: 0, signal: null } },
];
const before = structuredClone(events);
const report = summarizeOriginalObservation({ category: 'install', events });
assert.deepEqual(events, before, 'Observation assembly mutated retained native facts');
assert.equal(report.schemaVersion, 1);
assert.equal(report.qualificationContractRevision, 2);
assert.equal(report.evidenceScope, 'source-fixture');
assert(['incomplete', 'unsupported'].includes(report.state),
  'A pre-call pause and natural exit cannot establish handler execution');
assert(report.missingClaims.includes('handler-entry'),
  'A breakpoint before the selected call is not effective handler entry');
assert(report.missingClaims.includes('handler-settlement'),
  'Native process exit is not handler completion or error');
assert.deepEqual(report.nativeOutcome, { exitCode: 0, signal: null },
  'Missing observer evidence rewrote the actual native outcome');
assert.equal(report.completeness, false);
assert.equal(report.productionEligible, false);
assert.doesNotThrow(() => validateOriginalObservationReport(report));
for (const promotion of [{ completeness: true }, { productionEligible: true },
  { completeness: true, productionEligible: true }]) {
  assert.throws(() => validateOriginalObservationReport({ ...report, ...promotion }),
    /source|complete|eligible|promotion/i, 'A feasibility report accepted operational promotion');
}
// These are documentary state-contract negatives, not measured Inspector events.
const location = { scriptSha256: '1'.repeat(64), lineNumber: 10, columnNumber: 2, functionName: 'handler5' };
const complete = [
  { phase: 'launch', sequence: 0 },
  { phase: 'pre-call-pause', sequence: 1, location },
  { phase: 'handler-entry', sequence: 2, location },
  { phase: 'handler-settlement', sequence: 3, location, settlement: 'resolved' },
  { phase: 'native-terminal', sequence: 4, outcome: { exitCode: 0, signal: null } },
];
let negativeCases = 0;
const rejectsEvents = events => { assert.throws(() => summarizeOriginalObservation({ category: 'install', events })); negativeCases++; };
for (const phase of ['pre-call-pause', 'handler-entry', 'handler-settlement']) {
  for (const value of [null, false, 0, '', [], {}]) {
    const malformed = structuredClone(complete); malformed.find(event => event.phase === phase).location = value;
    rejectsEvents(malformed);
  }
}
for (const index of [2, 3]) {
  const missing = structuredClone(complete); delete missing[index].location; rejectsEvents(missing);
}
for (const mutation of [
  events => { events[2].sequence = 1; },
  events => { [events[1], events[2]] = [events[2], events[1]]; events.forEach((x, i) => { x.sequence = i; }); },
  events => { events.splice(2, 0, structuredClone(events[1])); events.forEach((x, i) => { x.sequence = i; }); },
  events => { events.push({ phase: 'pre-call-pause', sequence: 5 }); },
  events => { events[3].settlement = 'rejected'; },
  events => { events[2].location.columnNumber = -1; },
  events => { events[2].location.scriptSha256 = 'unknown'; },
  events => { events[2].extra = true; },
]) { const changed = structuredClone(complete); mutation(changed); rejectsEvents(changed); }
const missingEntry = complete.filter(event => event.phase !== 'handler-entry' && event.phase !== 'handler-settlement')
  .map((event, sequence) => ({ ...event, sequence }));
assert.equal(summarizeOriginalObservation({ category: 'install', events: missingEntry }).state, 'incomplete');
// Missing phases remain missing even with authentic-looking normalized locations and native
// terminals. This reducer validates documentary order; runtime script/frame/caller correlation
// belongs to the controller and is not claimed by these synthetic events.
for (const retained of [[], [0], [0, 1], [0, 1, 2], [0, 4], [0, 1, 4], [0, 1, 2, 4]]) {
  const events = retained.map((index, sequence) => ({ ...structuredClone(complete[index]), sequence }));
  const missing = summarizeOriginalObservation({ category: 'install', events });
  assert.equal(missing.state, 'incomplete');
  assert.equal(missing.completeness, false); assert.equal(missing.productionEligible, false);
  assert.deepEqual(missing.missingClaims, ['launch', 'pre-call-pause', 'handler-entry', 'handler-settlement', 'native-terminal']
    .filter(phase => !events.some(event => event.phase === phase)));
}
for (const nativeOutcome of [{ exitCode: 1, signal: null }, { exitCode: null, signal: 'SIGTERM' }]) {
  const missing = summarizeOriginalObservation({ category: 'update', events: [complete[0], complete[1], complete[2],
    { phase: 'native-terminal', sequence: 3, outcome: nativeOutcome }] });
  assert.deepEqual(missing.nativeOutcome, nativeOutcome);
  assert.deepEqual(missing.missingClaims, ['handler-settlement']);
  assert.equal(missing.state, 'incomplete', 'Native failure was promoted to authenticated rejected settlement');
}
for (const changed of [
  [complete[0], { ...complete[3], sequence: 1 }],
  [...structuredClone(complete), { ...complete[2], sequence: 5 }],
  [complete[0], complete[1], { ...complete[4], sequence: 2 }, { ...complete[2], sequence: 3 }],
]) rejectsEvents(changed);
const noTerminal = summarizeOriginalObservation({ category: 'dedupe', events: complete.slice(0, -1) });
assert.equal(noTerminal.state, 'incomplete'); assert.equal(noTerminal.nativeOutcome, null);
assert(noTerminal.missingClaims.includes('native-terminal'));
const failure = [complete[0], { phase: 'observer-failure', sequence: 1, reason: 'disconnect', intervention: 'none' },
  { phase: 'native-terminal', sequence: 2, outcome: { exitCode: 7, signal: null } }];
const partial = summarizeOriginalObservation({ category: 'install', events: failure });
assert.equal(partial.state, 'unsupported'); assert.deepEqual(partial.nativeOutcome, { exitCode: 7, signal: null });
rejectsEvents([failure[0], failure[1], { ...complete[1], sequence: 2 }, { ...failure[2], sequence: 3 }]);
const documentary = summarizeOriginalObservation({ category: 'dedupe', events: complete });
assert.equal(documentary.state, 'supported'); assert.equal(documentary.productionEligible, false);
for (const altered of [{ state: 'PASSED' }, { evidenceScope: 'release-owner' },
  { qualificationContractRevision: 1 }, { qualificationContractRevision: null },
  { nativeOutcome: { exitCode: 17, signal: null } }, { missingClaims: [] }, { observedPhases: [] }]) {
  assert.throws(() => validateOriginalObservationReport({ ...partial, ...altered })); negativeCases++;
}
const missingRevision = { ...partial }; delete missingRevision.qualificationContractRevision;
assert.throws(() => validateOriginalObservationReport(missingRevision)); negativeCases++;
// No blanket normalization may turn a programmer TypeError into a supported report.
assert.throws(() => summarizeOriginalObservation({ category: 'install', events: [null] }), TypeError);
// Synthetic protocol-seam regression only. The real client handles all requests,
// failures and promise fan-out; the socket and existing timer callbacks are owned
// fixed test data. No Inspector connection, native process or pnpm cause is measured.
// Proposed internal hook: optional third constructor argument record(event), with
// closed normalized fields. The launch recorder owns sequence/correlation/bounds;
// protocol diagnostics must never replace the existing rejected error object.
const protocolDiagnostics = [];
const testTimers = [];
let testSocket;
class SyntheticObserverSocket {
  static CONNECTING = 0; static OPEN = 1; static CLOSED = 3;
  readyState = SyntheticObserverSocket.CONNECTING;
  listeners = new Map(); sent = []; closeRequests = 0;
  constructor(endpoint) {
    assert.equal(endpoint, 'ws://127.0.0.1:12345/00000000-0000-0000-0000-000000000000');
    testSocket = this;
  }
  addEventListener(name, callback, options = {}) {
    assert(['open', 'error', 'message', 'close'].includes(name));
    const listeners = this.listeners.get(name) ?? [];
    listeners.push({ callback, once: options.once === true }); this.listeners.set(name, listeners);
  }
  emit(name, event = {}) {
    for (const listener of [...(this.listeners.get(name) ?? [])]) {
      if (listener.once) this.listeners.set(name, this.listeners.get(name).filter(value => value !== listener));
      listener.callback(event);
    }
  }
  send(bytes) {
    assert.equal(this.readyState, SyntheticObserverSocket.OPEN);
    this.sent.push(JSON.parse(bytes));
  }
  close() { this.closeRequests++; this.readyState = SyntheticObserverSocket.CLOSED; }
}
const savedProtocolGlobals = { WebSocket: globalThis.WebSocket,
  setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
try {
  globalThis.WebSocket = SyntheticObserverSocket;
  globalThis.setTimeout = (callback, milliseconds) => {
    const timer = { callback, milliseconds, cleared: false }; testTimers.push(timer); return timer;
  };
  globalThis.clearTimeout = timer => { if (timer) timer.cleared = true; };
  const protocol = new ObserverProtocol('ws://127.0.0.1:12345/00000000-0000-0000-0000-000000000000',
    'file:///synthetic-owned-pnpm.mjs', event => protocolDiagnostics.push(structuredClone(event)));
  testSocket.readyState = SyntheticObserverSocket.OPEN;
  testSocket.emit('open');
  const enabling = protocol.enable();
  await Promise.resolve();
  assert.deepEqual(testSocket.sent.map(message => message.method), ['Debugger.enable']);
  const enableId = testSocket.sent[0].id;
  testSocket.emit('message', { data: JSON.stringify({ id: enableId, result: {} }) });
  await enabling;
  const resumed = protocol.resume().then(() => null, error => error);
  const responseTimer = testTimers.at(-1);
  const notified = protocol.notification().then(() => null, error => error);
  const notificationTimer = testTimers.at(-1);
  assert.notStrictEqual(responseTimer, notificationTimer, 'The case must distinguish the two existing timer sites');
  const resumeId = testSocket.sent.at(-1).id;
  assert.deepEqual(testSocket.sent.map(message => message.method), ['Debugger.enable', 'Debugger.resume']);
  // Deliberately leave the resume response unacknowledged. The captured request
  // timer, rather than a real delay or replacement fail(), drives the real seam.
  responseTimer.callback();
  const [resumeFailure, notificationFailure] = await Promise.all([resumed, notified]);
  assert(resumeFailure instanceof UnsupportedObservation);
  assert.equal(resumeFailure.reason, 'timeout');
  assert.strictEqual(notificationFailure, resumeFailure, 'Failure fan-out must preserve the same original error object');
  assert.equal(protocol.failure, 'timeout');
  assert(responseTimer.cleared && notificationTimer.cleared, 'Failure must retain existing timer retirement');
  // Model a callback already delivered by the timer harness after cancellation.
  // Repeated failure and intentional/actual close must not replace first origin.
  notificationTimer.callback();
  protocol.close();
  assert.equal(testSocket.closeRequests, 1);
  testSocket.emit('close');
  const repeatedFailure = await protocol.notification().then(() => null, error => error);
  assert.strictEqual(repeatedFailure, resumeFailure);
  assert.equal(protocol.failure, 'timeout');
  assert(testTimers.every(timer => timer.cleared), 'Synthetic protocol case left an existing timer active');

  const firstOrigins = protocolDiagnostics.filter(event => event.event === 'protocol-failure' && event.alreadyFailed === false);
  assert.equal(firstOrigins.length, 1,
    'Missing unique first protocol failure origin for the pending resume response timeout');
  const firstOrigin = firstOrigins[0];
  assert.equal(firstOrigin.site, 'command-response');
  assert.equal(firstOrigin.reason, 'timeout');
  assert.equal(firstOrigin.method, 'Debugger.resume');
  assert.equal(firstOrigin.commandId, resumeId);
  const issuedIndex = protocolDiagnostics.findIndex(event => event.event === 'command-issued' &&
    event.method === 'Debugger.resume' && event.commandId === resumeId);
  const originIndex = protocolDiagnostics.indexOf(firstOrigin);
  const laterTimeoutIndex = protocolDiagnostics.findIndex(event => event.event === 'protocol-failure' &&
    event.site === 'notification-wait' && event.reason === 'timeout' && event.alreadyFailed === true);
  const closeRequestIndex = protocolDiagnostics.findIndex(event => event.event === 'protocol-close-request');
  const socketCloseIndex = protocolDiagnostics.findIndex(event => event.event === 'protocol-socket-close');
  assert(issuedIndex >= 0 && issuedIndex < originIndex && originIndex < laterTimeoutIndex &&
    laterTimeoutIndex < closeRequestIndex && closeRequestIndex < socketCloseIndex,
  'Controller recording order must distinguish issuance, first origin, late fan-out, close request and socket close');
  assert(!protocolDiagnostics.some(event => event.event === 'command-acknowledged' &&
    event.method === 'Debugger.resume' && event.commandId === resumeId),
  'A timeout must not manufacture acknowledgement of the pending resume');
} finally {
  globalThis.WebSocket = savedProtocolGlobals.WebSocket;
  globalThis.setTimeout = savedProtocolGlobals.setTimeout;
  globalThis.clearTimeout = savedProtocolGlobals.clearTimeout;
}

// The same real protocol seams must distinguish response, notification and
// connection failures. Synthetic callbacks are explicitly local observations.
let lifecycleCases = 0;
const correlation = { recipe: 'empty-v1', category: 'install', role: 'original', launch: 0 };
const validateAvailable = (diagnostic, expected = correlation) =>
  validateOriginalLifecycleDiagnostics(diagnostic, { requireAvailable: true, correlation: expected });
async function syntheticProtocol(run, { throws = false, connected = true } = {}) {
  const globals = { WebSocket: globalThis.WebSocket, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  testTimers.length = 0; testSocket = undefined;
  let ticks = 0;
  const lifecycle = createOriginalLifecycleDiagnostics(correlation, () => BigInt(ticks++) * 1_000_000n);
  let protocol;
  try {
    globalThis.WebSocket = SyntheticObserverSocket;
    globalThis.setTimeout = (callback, milliseconds) => {
      const timer = { callback, milliseconds, cleared: false }; testTimers.push(timer); return timer;
    };
    globalThis.clearTimeout = timer => { if (timer) timer.cleared = true; };
    protocol = new ObserverProtocol('ws://127.0.0.1:12345/00000000-0000-0000-0000-000000000000',
      'file:///synthetic-owned-pnpm.mjs', throws ? () => { throw Error('Synthetic recorder failure'); } : lifecycle.record);
    const socket = testSocket;
    if (connected) {
      socket.readyState = SyntheticObserverSocket.OPEN; socket.emit('open');
      const enabling = protocol.enable(); await Promise.resolve();
      socket.emit('message', { data: JSON.stringify({ id: socket.sent[0].id, result: {} }) }); await enabling;
    }
    await run({ protocol, socket, lifecycle, timers: testTimers });
    lifecycleCases++;
  } finally {
    protocol?.close(); testSocket?.emit('close');
    globalThis.WebSocket = globals.WebSocket; globalThis.setTimeout = globals.setTimeout; globalThis.clearTimeout = globals.clearTimeout;
  }
}
await syntheticProtocol(async ({ protocol, lifecycle, timers }) => {
  const opened = protocol.opened.catch(error => error);
  timers[0].callback();
  const failure = await opened; assert(failure instanceof UnsupportedObservation); assert.equal(failure.reason, 'timeout');
  const diagnostic = lifecycle.snapshot(); validateAvailable(diagnostic);
  assert.equal(diagnostic.events[diagnostic.firstFailure].site, 'connection');
  assert.equal(diagnostic.lastResumeIssued, null); assert.equal(diagnostic.lastResumeAcknowledged, null);
}, { connected: false });
let actualProtocolDiagnostic;
await syntheticProtocol(async ({ protocol, socket, lifecycle, timers }) => {
  const resumed = protocol.resume().then(() => null, error => error);
  const response = timers.at(-1);
  const waiting = protocol.notification().then(() => null, error => error);
  const notification = timers.at(-1);
  notification.callback();
  const [resumeError, waitError] = await Promise.all([resumed, waiting]);
  assert.strictEqual(resumeError, waitError); assert.equal(waitError.reason, 'timeout');
  response.callback(); protocol.close();
  let diagnostic = lifecycle.snapshot(); validateAvailable(diagnostic);
  assert.equal(diagnostic.events[diagnostic.firstFailure].site, 'notification-wait');
  assert.equal(diagnostic.lastResumeIssued, socket.sent.at(-1).id); assert.equal(diagnostic.lastResumeAcknowledged, null);
  assert(diagnostic.events.some(event => event.site === 'command-response' && event.alreadyFailed === true));
  assert(diagnostic.missingObservations.includes('protocol-socket-close'), 'Close request cannot manufacture socket close');
  socket.emit('close'); diagnostic = lifecycle.snapshot(); validateAvailable(diagnostic);
  assert(!diagnostic.missingObservations.includes('protocol-socket-close'));
  assert.equal(diagnostic.events[diagnostic.firstFailure].site, 'notification-wait');
  actualProtocolDiagnostic = diagnostic;
});
await syntheticProtocol(async ({ protocol, socket, lifecycle }) => {
  const resumed = protocol.resume(); const id = socket.sent.at(-1).id;
  socket.emit('message', { data: JSON.stringify({ id, result: {} }) }); await resumed;
  assert.equal(lifecycle.snapshot().lastResumeAcknowledged, id);
  const waiting = protocol.notification().then(() => null, error => error);
  socket.emit('message', { data: JSON.stringify({ id, result: {} }) });
  const failure = await waiting; assert.equal(failure.reason, 'protocol');
  assert.strictEqual(await protocol.notification().catch(error => error), failure);
  const diagnostic = lifecycle.snapshot(); validateAvailable(diagnostic);
  assert.equal(diagnostic.events.filter(event => event.event === 'command-acknowledged' && event.commandId === id).length, 1);
  assert.equal(diagnostic.events[diagnostic.firstFailure].site, 'message', 'Duplicate response must remain a protocol failure');
});
await syntheticProtocol(async ({ protocol, timers }) => {
  const resumed = protocol.resume().catch(error => error); const timer = timers.at(-1);
  const waiting = protocol.notification().catch(error => error);
  timer.callback();
  const [a, b] = await Promise.all([resumed, waiting]);
  assert.strictEqual(a, b); assert.equal(a.reason, 'timeout');
  protocol.close(); assert.strictEqual(await protocol.notification().catch(error => error), a);
}, { throws: true });
await syntheticProtocol(async ({ protocol, socket, lifecycle, timers }) => {
  const otherCorrelation = { recipe: 'offline-miss-v1', category: 'update', role: 'original', launch: 2 };
  const otherLifecycle = createOriginalLifecycleDiagnostics(otherCorrelation, () => 0n);
  const other = new ObserverProtocol('ws://127.0.0.1:12345/00000000-0000-0000-0000-000000000000',
    'file:///synthetic-owned-pnpm.mjs', otherLifecycle.record);
  const otherSocket = testSocket; otherSocket.readyState = SyntheticObserverSocket.OPEN; otherSocket.emit('open');
  const enabling = other.enable(); await Promise.resolve();
  otherSocket.emit('message', { data: JSON.stringify({ id: otherSocket.sent[0].id, result: {} }) }); await enabling;
  const first = protocol.resume().catch(error => error); const response = timers.at(-1);
  const second = other.notification().catch(error => error); const notification = timers.at(-1);
  notification.callback(); response.callback();
  const [a, b] = await Promise.all([first, second]); assert.notStrictEqual(a, b);
  validateAvailable(lifecycle.snapshot()); validateAvailable(otherLifecycle.snapshot(), otherCorrelation);
  assert.equal(lifecycle.snapshot().events[lifecycle.snapshot().firstFailure].site, 'command-response');
  assert.equal(otherLifecycle.snapshot().events[otherLifecycle.snapshot().firstFailure].site, 'notification-wait');
  other.close(); otherSocket.emit('close');
  assert.equal(socket.sent.filter(event => event.method === 'Debugger.resume').length, 1);
  assert.equal(otherSocket.sent.filter(event => event.method === 'Debugger.resume').length, 0);
});

// Exercise the actual process callback/timeout/cleanup implementation with a
// completely synthetic owned child. No OS child, PID signal or listener is added
// to product code. Existing exit and close callbacks remain separate facts.
for (const cueOrder of ['before-timeout', 'after-timeout', 'throwing-recorder']) {
  const globals = { spawn: childProcess.spawn, kill: process.kill, setTimeout: globalThis.setTimeout, clearTimeout: globalThis.clearTimeout };
  const timers = []; let child; let active = true;
  const lifecycle = createOriginalLifecycleDiagnostics(correlation, () => 0n);
  try {
    childProcess.spawn = () => {
      child = new EventEmitter(); child.pid = 424242; child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); return child;
    };
    syncBuiltinESMExports();
    globalThis.setTimeout = (callback, milliseconds) => { const timer = { callback, milliseconds, cleared: false }; timers.push(timer); return timer; };
    globalThis.clearTimeout = timer => { if (timer) timer.cleared = true; };
    process.kill = (pid, signal) => {
      assert.equal(pid, -424242, 'Synthetic helper must not signal any host PID');
      if (!active) throw Object.assign(new Error('Synthetic absent group'), { code: 'ESRCH' });
      if (signal === 0) return true;
      assert.equal(signal, 'SIGTERM'); active = false;
      queueMicrotask(() => {
        if (cueOrder === 'after-timeout') child.stderr.emit('data', Buffer.from('Waiting for the debugger to disconnect...\n'));
        child.emit('exit', null, 'SIGTERM');
      });
      return true;
    };
    const pending = ownedNativeProcess('/synthetic/node', ['-e', 'fixed-owned-child'], '/synthetic/workspace', {}, undefined,
      { role: 'original', category: 'install', record: cueOrder === 'throwing-recorder' ? () => { throw Error('Synthetic recorder failure'); } : lifecycle.record });
    child.emit('spawn'); const native = await pending;
    const endpointFailure = native.endpoint.catch(error => error);
    if (cueOrder === 'before-timeout') child.stderr.emit('data', Buffer.from('Waiting for the debugger to disconnect...\n'));
    timers.find(timer => timer.milliseconds === 30_000).callback();
    const error = await endpointFailure; assert(error instanceof UnsupportedObservation); assert.equal(error.reason, 'timeout');
    if (cueOrder !== 'throwing-recorder') {
      const partial = lifecycle.snapshot(); validateAvailable(partial);
      assert(partial.events.some(event => event.event === 'native-exit'));
      assert(partial.missingObservations.includes('native-stream-close'), 'Exit cannot manufacture stdio close');
      assert(partial.missingObservations.includes('controller-shutdown-receipt'), 'Cue callback cannot manufacture controller receipt');
    }
    child.emit('close'); const facts = await native.finish();
    assert.deepEqual(facts.outcome, { exitCode: null, signal: 'SIGTERM' });
    assert.equal(facts.observerIntervention, 'timeout'); assert.equal(facts.cleanup.ownedProcessGroupEmpty, true);
    // A leader-exit race may leave its existing bounded poll timer pending.
    // Deliver that owned callback instead of inventing timer cancellation.
    for (const timer of timers.filter(timer => !timer.cleared)) {
      assert.equal(timer.milliseconds, 20); timer.callback(); timer.fired = true;
    }
    assert(timers.every(timer => timer.cleared || timer.fired));
    if (cueOrder !== 'throwing-recorder') {
      const diagnostic = lifecycle.snapshot(); validateAvailable(diagnostic);
      const origin = diagnostic.firstFailure;
      const cue = diagnostic.events.findIndex(event => event.event === 'native-shutdown-cue');
      assert.equal(diagnostic.events[origin].site, 'lifetime');
      assert(cueOrder === 'before-timeout' ? cue < origin : cue > origin);
      const exit = diagnostic.events.findIndex(event => event.event === 'native-exit');
      assert(diagnostic.events.findIndex(event => event.event === 'native-stream-close') > exit);
    }
    lifecycleCases++;
  } finally {
    childProcess.spawn = globals.spawn; syncBuiltinESMExports(); process.kill = globals.kill;
    globalThis.setTimeout = globals.setTimeout; globalThis.clearTimeout = globals.clearTimeout;
  }
}

// Strict diagnostic validation cannot promote semantic or operational claims.
assert.deepEqual(Object.fromEntries(['commands', 'pauses', 'events', 'summary', 'operationMs', 'setupMs', 'lifetimeMs', 'cleanupMs']
  .map(name => [name, observerLimits[name]])),
{ commands: 32, pauses: 8, events: 32, summary: 65536, operationMs: 5000, setupMs: 10000, lifetimeMs: 30000, cleanupMs: 3000 });
assert.deepEqual(originalLifecycleLimits, { events: 96, bytes: 8192, eventFields: 12, eventBytes: 512, stringBytes: 64, elapsedMs: 120000 });
let lifecycleNegatives = 0;
for (const change of [
  x => { x.productionEligible = true; }, x => { x.completeness = true; }, x => { x.evidenceScope = 'release-owner'; },
  x => { x.role = 'derived'; }, x => { x.category = 'dedupe'; }, x => { x.recipe = 'offline-miss-v1'; }, x => { x.launch = 5; },
  x => { x.state = 'PASSED'; }, x => { x.firstFailure = null; }, x => { x.lastResumeAcknowledged = x.lastResumeIssued; },
  x => { x.missingObservations = []; }, x => { x.events[0].raw = 'forbidden'; }, x => { x.events[0].event = 'unknown'; },
  x => { x.events[0].elapsedMs = Infinity; }, x => { x.events[0].elapsedMs = -1; }, x => { x.events[0].elapsedMs = 120001; },
  x => { x.events[1].sequence = 0; }, x => { x.events[1].elapsedMs = -1; },
]) {
  const changed = structuredClone(actualProtocolDiagnostic); change(changed);
  assert.throws(() => validateAvailable(changed)); lifecycleNegatives++;
}
for (const missing of [null, undefined, {}]) { assert.throws(() => validateAvailable(missing)); lifecycleNegatives++; }
for (const event of [{ event: 'native-launch', endpoint: 'ws://private-fixture' },
  { event: 'native-stop-request', site: 'x'.repeat(65), reason: 'timeout' },
  { event: 'command-issued', method: 'Runtime.evaluate', commandId: 1 }]) {
  const lifecycle = createOriginalLifecycleDiagnostics(correlation, () => 0n); lifecycle.record(event);
  const diagnostic = lifecycle.snapshot(); assert.equal(diagnostic.state, 'unavailable');
  assert.equal(diagnostic.events.length, 0); assert(!JSON.stringify(diagnostic).includes('private-fixture'));
  assert.throws(() => validateAvailable(diagnostic)); lifecycleNegatives++;
}
for (const kind of ['event-bound', 'byte-bound']) {
  const lifecycle = createOriginalLifecycleDiagnostics(correlation, () => 0n);
  for (let i = 0; i < 110; i++) lifecycle.record(kind === 'event-bound' ? { event: 'native-launch' } :
    { event: 'native-stop-request', site: 'observeOriginal:unexpected-error', reason: 'protocol' });
  const diagnostic = lifecycle.snapshot(); assert.equal(diagnostic.state, 'truncated'); assert.equal(diagnostic.reason, kind);
  assert(Buffer.byteLength(JSON.stringify(diagnostic)) <= 8192); assert(diagnostic.events.length <= 96);
  assert.doesNotThrow(() => validateOriginalLifecycleDiagnostics(diagnostic));
  assert.throws(() => validateAvailable(diagnostic)); lifecycleNegatives++;
}
for (const clock of [() => { throw Error('Synthetic clock failure'); }, () => NaN, (() => { let calls = 0; return () => calls++ ? 9n : 10n; })()]) {
  const lifecycle = createOriginalLifecycleDiagnostics(correlation, clock); lifecycle.record({ event: 'native-launch' });
  const diagnostic = lifecycle.snapshot(); assert.equal(diagnostic.state, 'unavailable'); assert.equal(diagnostic.reason, 'invalid-clock');
  assert.throws(() => validateAvailable(diagnostic)); lifecycleNegatives++;
}

// Diagnostic observations cannot enter the semantic event or point vocabularies.
const noCleanup = createOriginalLifecycleDiagnostics(correlation, () => 0n).snapshot();
validateAvailable(noCleanup); assert(noCleanup.missingObservations.includes('pre-cleanup'));
const diagnosticLifecycle = createOriginalLifecycleDiagnostics(correlation, () => 0n);
diagnosticLifecycle.record({ event: 'breakpoint-resolved', point: 'preCleanup' });
diagnosticLifecycle.record({ event: 'semantic-pause', point: 'preCall' });
diagnosticLifecycle.record({ event: 'semantic-pause', point: 'entry' });
diagnosticLifecycle.record({ event: 'diagnostic-pause', point: 'preCleanup' });
const diagnosticSnapshot = diagnosticLifecycle.snapshot(); validateAvailable(diagnosticSnapshot);
assert(!diagnosticSnapshot.missingObservations.includes('pre-cleanup'));
assert(!diagnosticSnapshot.events.some(event => event.event === 'semantic-pause' && event.point === 'settlement'));
for (const previous of [[], [{ event: 'semantic-pause', point: 'preCall' }],
  [{ event: 'semantic-pause', point: 'preCall' }, { event: 'semantic-pause', point: 'entry' },
    { event: 'semantic-pause', point: 'settlement' }],
  [{ event: 'semantic-pause', point: 'preCall' }, { event: 'semantic-pause', point: 'entry' },
    { event: 'diagnostic-pause', point: 'preCleanup' }],
  [{ event: 'semantic-pause', point: 'preCall' }, { event: 'semantic-pause', point: 'entry' },
    { event: 'protocol-close-request' }]]) {
  const recorder = createOriginalLifecycleDiagnostics(correlation, () => 0n);
  previous.forEach(recorder.record); recorder.record({ event: 'diagnostic-pause', point: 'preCleanup' });
  assert.throws(() => validateAvailable(recorder.snapshot())); lifecycleNegatives++;
}
for (const value of [
  { event: 'semantic-pause', point: 'preCleanup' }, { event: 'diagnostic-pause', point: 'settlement' },
  { event: 'diagnostic-pause', point: 'preCleanup', settlement: 'resolved' },
  { event: 'diagnostic-pause', point: 'preCleanup', frame: {} },
]) {
  const recorder = createOriginalLifecycleDiagnostics(correlation, () => 0n); recorder.record(value);
  assert.throws(() => validateAvailable(recorder.snapshot())); lifecycleNegatives++;
}
const derivedCorrelation = { ...correlation, role: 'derived', launch: 1 };
const derivedDiagnostic = createOriginalLifecycleDiagnostics(derivedCorrelation, () => 0n);
assert(!derivedDiagnostic.snapshot().missingObservations.includes('pre-cleanup'));
derivedDiagnostic.record({ event: 'diagnostic-pause', point: 'preCleanup' });
assert.throws(() => validateOriginalLifecycleDiagnostics(derivedDiagnostic.snapshot(),
  { requireAvailable: true, correlation: derivedCorrelation })); lifecycleNegatives++;
for (const phase of ['diagnostic-pause', 'preCleanup']) {
  const promoted = structuredClone(complete);
  promoted.splice(3, 0, { phase, sequence: 3, location }); promoted.forEach((event, sequence) => { event.sequence = sequence; });
  rejectsEvents(promoted);
}

// The selected diagnostic boundary must be a fixed token in the same anonymous
// dispatch IIFE as the existing call, await and success continuation. This direct
// parser fixture authenticates no bytes or executable Inspector location.
assert.equal(typeof originalSource.originalDispatchLocations, 'function',
  'Missing authenticated pre-cleanup diagnostic source selector');
const dispatchBody = `  let { output, exitCode } = await (async () => {
    await new Promise((resolve4) => setTimeout(() => {
      resolve4();
    }, 0));
    if (config2.updateNotifier !== false && !config2.ci && cmd !== "self-update" && !config2.offline && !config2.preferOffline && !config2.fallbackCommandUsed && (cmd === "install" || cmd === "add")) {
      checkForUpdates(config2).catch(() => {
      });
    }
    if (config2.force === true && !config2.fallbackCommandUsed) {
      logger.warn({
        message: "using --force I sure hope you know what you are doing",
        prefix: config2.dir
      });
    }
    scopeLogger.debug({
      ...!cliOptions["recursive"] ? { selected: 1 } : {
        selected: Object.keys(context.selectedProjectsGraph).length,
        total: context.allProjects.length
      },
      ...workspaceDir ? { workspacePrefix: workspaceDir } : {}
    });
    let result2 = pnpmCmds[cmd ?? "help"](
      // Spread config (settings) and context (runtime state) into a single
      // options object for command handlers. The original split objects are
      // also passed for handlers that need them separated (e.g. config commands).
      // Named "_config"/"_context" to avoid clashing with the "--config" CLI option.
      { ...config2, ...context, _config: config2, _context: context },
      cliParams,
      pnpmCmds
    );
    try {
      if (result2 instanceof Promise) {
        result2 = await result2;
      }
    } finally {
      await finishWorkers();
    }
    executionTimeLogger.debug({
      startedAt: global["pnpm__startedAt"],
      endedAt: Date.now()
    });
    if (!result2) {
      return { output: null, exitCode: 0 };
    }
    if (typeof result2 === "string") {
      return { output: result2, exitCode: 0 };
    }
    return result2;
  })();
`;
const dispatchSource = '\n'.repeat(312305) + dispatchBody;
const dispatch = originalSource.originalDispatchLocations(dispatchSource);
assert.deepEqual(dispatch.preCleanup, { lineNumber: 312340, columnNumber: 12 });
const dispatchOpening = dispatchBody.slice(0, dispatchBody.indexOf('\n'));
const dispatchAsyncStart = { lineNumber: 312305, columnNumber: dispatchOpening.indexOf('async') };
assert.deepEqual(dispatchAsyncStart, { lineNumber: 312305, columnNumber: 36 });
assert.deepEqual(dispatch.dispatchFunctionLocation, dispatchAsyncStart,
  'Anonymous dispatch callable must begin at the structural async token');
assert.equal(dispatch.dispatchFunctionName, '', 'Dispatch belongs to the anonymous async IIFE, not main4');
for (const category of Object.keys(sourceSnippets)) {
  const selected = { ...dispatch, ...originalHandlerLocation(sourceSnippets[category], category) };
  const semantic = ['preCall', 'entry', 'settlement'];
  const pointNames = Object.keys(selected).filter(name => selected[name] &&
    typeof selected[name] === 'object' && !name.endsWith('FunctionLocation') && name !== 'functionLocation');
  assert.deepEqual(pointNames.sort(), [...semantic, 'preCleanup'].sort(),
    'Exactly four source points must retain the three semantic anchors');
  assert.equal(new Set(pointNames.map(name => JSON.stringify(selected[name]))).size, 4,
    'Diagnostic and semantic points must be distinct');
  assert(dispatch.preCall.lineNumber < dispatch.preCleanup.lineNumber &&
    dispatch.preCleanup.lineNumber < dispatch.settlement.lineNumber);
}
for (const [name, changed] of [
  ['missing cleanup', dispatchSource.replace('      await finishWorkers();\n', '')],
  ['duplicate cleanup', dispatchSource.replace('      await finishWorkers();\n', '      await finishWorkers();\n      await finishWorkers();\n')],
  ['cleanup outside finally', dispatchSource.replace('    } finally {\n      await finishWorkers();\n    }', '    }\n    await finishWorkers();')],
  ['cleanup in catch', dispatchSource.replace('    } finally {', '    } catch {')],
  ['missing dispatch await', dispatchSource.replace('        result2 = await result2;', '        result2 = result2;')],
  ['nearest cleanup column', dispatchSource.replace('      await finishWorkers();', '       await finishWorkers();')],
  ['moved cleanup line', dispatchSource.replace('      await finishWorkers();', '\n      await finishWorkers();')],
  ['named enclosing function', dispatchSource.replace('(async () => {', '(async function main4() {')],
  ['duplicate enclosing dispatch', dispatchSource + dispatchBody],
]) {
  assert.throws(() => originalSource.originalDispatchLocations(changed), /source|dispatch|cleanup|location|anchor|control|function/i,
    `${name} accepted by the shared diagnostic source selector`);
  sourceSelectionNegatives++;
}

// Connect source selection to the production-shared frame predicate. These
// scripted inputs establish no actual Inspector frame acceptance.
const selectedDispatchPoints = { ...points, ...dispatch };
const asyncStartPause = { hitBreakpoints: ['call-id'], callFrames: [{ functionName: '',
  functionLocation: located(dispatchAsyncStart), location: located(dispatch.preCall) }] };
const asyncStartRecorder = createOriginalLifecycleDiagnostics(correlation, () => 0n);
const acceptedAsyncStart = validateOriginalPauseFrame(asyncStartPause, selectedDispatchPoints, scriptId, ids, resolved,
  stateFor([], null), asyncStartRecorder.record);
assert.equal(acceptedAsyncStart.name, 'preCall');
assert.deepEqual(acceptedAsyncStart.frame.functionLocation, located(dispatchAsyncStart));
assert.deepEqual(asyncStartRecorder.snapshot().events, [], 'Accepted async start must publish no rejection');
const oldParameterStartPause = structuredClone(asyncStartPause);
oldParameterStartPause.callFrames[0].functionLocation.columnNumber = dispatchOpening.indexOf('() =>');
assert.equal(oldParameterStartPause.callFrames[0].functionLocation.columnNumber, 42);
const rejectedParameterStartState = stateFor([], null);
const rejectedParameterStartBefore = structuredClone(rejectedParameterStartState);
const oldParameterStartRecorder = createOriginalLifecycleDiagnostics(correlation, () => 0n);
assert.throws(() => validateOriginalPauseFrame(oldParameterStartPause, selectedDispatchPoints, scriptId, ids, resolved,
  rejectedParameterStartState, oldParameterStartRecorder.record),
  error => error instanceof UnsupportedObservation && error.reason === 'location' &&
    error.message === 'Original dispatch frame differs from authenticated pre-call callable');
assert.deepEqual(rejectedParameterStartState, rejectedParameterStartBefore,
  'Rejected parameter start must not mutate authenticated pause state');
oldParameterStartRecorder.record({ event: 'controller-receipt', site: 'failure' });
oldParameterStartRecorder.record({ event: 'observer-failure', reason: 'location' });
const oldParameterStartDiagnostic = oldParameterStartRecorder.snapshot();
validateAvailable(oldParameterStartDiagnostic);
const oldParameterStartRejection = oldParameterStartDiagnostic.events[0];
assert.equal(oldParameterStartRejection.event, 'frame-rejection');
assert.equal(oldParameterStartRejection.check, 'column');
assert.deepEqual(['name', 'expectedName', 'functionLocation', 'expectedLocation', 'script', 'line', 'column']
  .map(field => oldParameterStartRejection[field]),
  ['empty-match', 'match', 'object-truthy', 'object-truthy', 'match', 'match', 'number-mismatch']);
assert.equal(oldParameterStartDiagnostic.events[1].event, 'frame-rejection-coordinates');
assert.equal(oldParameterStartDiagnostic.events[1].lineNumber, dispatchAsyncStart.lineNumber);
assert.equal(oldParameterStartDiagnostic.events[1].columnNumber, 42);
assert.equal(oldParameterStartDiagnostic.events.length, 4);
assert.equal(oldParameterStartDiagnostic.firstFailure, 3);

// Rejected dispatch conjunction diagnostics preserve first failure, type/presence
// and short-circuit evaluation without retaining arbitrary names or script IDs.
let frameDiagnosticCases = 0;
const rejectedDispatch = (change, expectedCheck, selected = points) => {
  const recorder = createOriginalLifecycleDiagnostics(correlation, () => 0n);
  const params = dispatchPause('preCall'); change(params.callFrames[0]);
  const before = stateFor([], null);
  assert.throws(() => validateOriginalPauseFrame(params, selected, scriptId, ids, resolved, before, recorder.record),
    error => error instanceof UnsupportedObservation && error.reason === 'location' &&
      error.message === 'Original dispatch frame differs from authenticated pre-call callable');
  assert.equal(before.observed.size, 0); assert.equal(before.preCallFrame, null); assert.equal(before.failed, false);
  recorder.record({ event: 'controller-receipt', site: 'failure' });
  recorder.record({ event: 'observer-failure', reason: 'location' });
  const diagnostic = recorder.snapshot(); validateAvailable(diagnostic);
  const rejection = diagnostic.events[0];
  assert.equal(rejection.event, 'frame-rejection'); assert.equal(rejection.check, expectedCheck);
  assert.equal(rejection.point, 'preCall'); assert.equal(diagnostic.firstFailure, 3);
  assert.equal(Object.keys(rejection).length, 12);
  assert(diagnostic.events.every(event => Buffer.byteLength(JSON.stringify(event)) <= 512));
  assert(Buffer.byteLength(JSON.stringify(diagnostic)) <= 8192);
  assert(!JSON.stringify(diagnostic).includes('privateScript') && !JSON.stringify(diagnostic).includes('privateName'));
  frameDiagnosticCases++; return diagnostic;
};
const dispatchRejections = [];
for (const [change, check, field, status] of [
  [frame => { frame.functionName = 'privateName'; }, 'name', 'name', 'other-mismatch'],
  [frame => { delete frame.functionLocation; }, 'functionLocation', 'functionLocation', 'absent-falsy'],
  [frame => { frame.functionLocation = null; }, 'functionLocation', 'functionLocation', 'null-falsy'],
  [frame => { frame.functionLocation = false; }, 'functionLocation', 'functionLocation', 'boolean-falsy'],
  [frame => { frame.functionLocation = 0; }, 'functionLocation', 'functionLocation', 'number-falsy'],
  [frame => { frame.functionLocation = ''; }, 'functionLocation', 'functionLocation', 'string-falsy'],
  [frame => { frame.functionLocation = []; }, 'script', 'functionLocation', 'array-truthy'],
  [frame => { frame.functionLocation = 'malformed'; }, 'script', 'functionLocation', 'string-truthy'],
  [frame => { frame.functionLocation = 4; }, 'script', 'functionLocation', 'number-truthy'],
  [frame => { delete frame.functionLocation.scriptId; }, 'script', 'script', 'absent-mismatch'],
  [frame => { frame.functionLocation.scriptId = 'privateScript'; }, 'script', 'script', 'string-mismatch'],
  [frame => { frame.functionLocation.scriptId = 42; }, 'script', 'script', 'number-mismatch'],
  [frame => { delete frame.functionLocation.lineNumber; }, 'line', 'line', 'absent-mismatch'],
  [frame => { frame.functionLocation.lineNumber = null; }, 'line', 'line', 'null-mismatch'],
  [frame => { frame.functionLocation.lineNumber = '10'; }, 'line', 'line', 'string-mismatch'],
  [frame => { frame.functionLocation.lineNumber++; }, 'line', 'line', 'number-mismatch'],
  [frame => { delete frame.functionLocation.columnNumber; }, 'column', 'column', 'absent-mismatch'],
  [frame => { frame.functionLocation.columnNumber = false; }, 'column', 'column', 'boolean-mismatch'],
  [frame => { frame.functionLocation.columnNumber++; }, 'column', 'column', 'number-mismatch'],
]) {
  const diagnostic = rejectedDispatch(change, check);
  assert.equal(diagnostic.events[0][field], status); dispatchRejections.push(diagnostic);
}
for (const expected of [undefined, null, false, 0, '']) {
  const diagnostic = rejectedDispatch(() => {}, 'expectedLocation', { ...points, dispatchFunctionLocation: expected });
  assert.equal(diagnostic.events[0].functionLocation, 'object-truthy');
  assert.equal(diagnostic.events[0].script, 'not-evaluated');
}
const unexpectedName = rejectedDispatch(frame => { frame.functionName = 'privateName'; }, 'expectedName',
  { ...points, dispatchFunctionName: 'privateName' });
assert.equal(unexpectedName.events[0].name, 'other-match');
assert.equal(unexpectedName.events[0].expectedName, 'string-mismatch');
for (const value of [-1, 2_147_483_648, Infinity, NaN, 3.5]) {
  const diagnostic = rejectedDispatch(frame => { frame.functionLocation.lineNumber = value; }, 'line');
  assert.equal(diagnostic.events[1].lineNumber, null);
}
const boundedLine = rejectedDispatch(frame => { frame.functionLocation.lineNumber = 2_147_483_647; }, 'line');
assert.equal(boundedLine.events[1].lineNumber, 2_147_483_647);
assert.equal(boundedLine.events[1].columnNumber, null);
const boundedColumn = rejectedDispatch(frame => { frame.functionLocation.columnNumber++; }, 'column');
assert.equal(boundedColumn.events[1].lineNumber, points.dispatchFunctionLocation.lineNumber);
assert.equal(boundedColumn.events[1].columnNumber, points.dispatchFunctionLocation.columnNumber + 1);
for (const [first, skipped] of [['name', 'functionLocation'], ['script', 'lineNumber'], ['line', 'columnNumber']]) {
  let reads = 0;
  rejectedDispatch(frame => {
    if (first === 'name') frame.functionName = 'privateName';
    else frame.functionLocation[first === 'script' ? 'scriptId' : 'lineNumber'] = first === 'script' ? 'privateScript' : -1;
    Object.defineProperty(first === 'name' ? frame : frame.functionLocation, skipped,
      { get() { reads++; throw Error('Skipped operand was read'); } });
  }, first);
  assert.equal(reads, 0);
}
// matches() arguments are still evaluated before its own truthiness checks;
// expected-location truthiness itself remains skipped after absent actual data.
let expectedLocationReads = 0;
const expectedGetter = { ...points };
Object.defineProperty(expectedGetter, 'dispatchFunctionLocation', { get() { expectedLocationReads++; return points.dispatchFunctionLocation; } });
const absentActual = rejectedDispatch(frame => { delete frame.functionLocation; }, 'functionLocation', expectedGetter);
assert.equal(expectedLocationReads, 1); assert.equal(absentActual.events[0].expectedLocation, 'not-evaluated');
const successfulRecorder = createOriginalLifecycleDiagnostics(correlation, () => 0n);
assert.equal(validateOriginalPauseFrame(dispatchPause('preCall'), points, scriptId, ids, resolved, stateFor([], null),
  successfulRecorder.record).name, 'preCall');
assert.deepEqual(successfulRecorder.snapshot().events, []);
assert.throws(() => validateOriginalPauseFrame(dispatchPause('preCleanup'), { ...points, dispatchFunctionName: 'privateName' },
  scriptId, ids, resolved, stateFor(['preCall', 'entry']), () => { throw Error('Synthetic recorder failure'); }),
  error => error instanceof UnsupportedObservation && error.reason === 'location');
// A rejected earlier caller must not be published when a later caller authenticates.
const laterCaller = structuredClone(pause);
laterCaller.callFrames.splice(1, 0, { ...structuredClone(pause.callFrames[1]), functionName: 'privateName' });
assert.equal(validateOriginalPauseFrame(laterCaller, points, scriptId, ids, resolved, stateFor(), successfulRecorder.record).name, 'entry');
assert.deepEqual(successfulRecorder.snapshot().events, []);
for (const change of [
  value => { value.events[0].check = 'unknown'; },
  value => { value.events[0].name = 'privateName'; },
  value => { value.events[0].script = 'privateScript'; },
  value => { value.events[0].line = 'match'; },
  value => { value.events[0].expectedName = 'match'; },
  value => { value.events[0].functionLocation = 'object-falsy'; },
  value => { value.events[0].rawFrame = {}; },
  value => { value.events[1].lineNumber = 2_147_483_648; },
  value => { value.events[1].columnNumber = 42; },
  value => { value.events[1].point = 'entry'; },
  value => { value.events[3].reason = 'protocol'; },
  value => { value.events.splice(2, 1); value.events.forEach((event, sequence) => { event.sequence = sequence; }); value.firstFailure = 2; },
  value => { value.role = 'derived'; value.launch = 1; },
]) {
  const forged = structuredClone(dispatchRejections[0]); change(forged);
  assert.throws(() => validateAvailable(forged)); frameDiagnosticCases++;
}
const invalidRejection = createOriginalLifecycleDiagnostics(correlation, () => 0n);
invalidRejection.record({ ...dispatchRejections[0].events[0], sequence: undefined });
assert.equal(invalidRejection.snapshot().state, 'unavailable');
const truncatedRejection = createOriginalLifecycleDiagnostics(correlation, () => 0n);
for (let index = 0; index < 80; index++) truncatedRejection.record({ event: 'native-launch' });
for (const { sequence, elapsedMs, ...event } of boundedColumn.events) truncatedRejection.record(event);
assert.doesNotThrow(() => validateOriginalLifecycleDiagnostics(truncatedRejection.snapshot()));
assert(['available', 'truncated'].includes(truncatedRejection.snapshot().state));

console.log(JSON.stringify({ negativeCases, sourceSelectionNegatives, correlationNegatives, state: 'PASSED' , evidenceScope: 'source-contract',
  qualificationContractRevision: 2, completeness: false, productionEligible: false,
  inspectorFeasibilityMeasured: false, lifecycleCases, lifecycleNegatives, frameDiagnosticCases }));
