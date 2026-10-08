// Synthetic decision regressions only; these inputs establish no Inspector feasibility.
import assert from 'node:assert/strict';
import { summarizeOriginalObservation, validateOriginalObservationReport }
  from './vitest-native-worker/original-observer-contract.mjs';
import { UnsupportedObservation } from './vitest-native-worker/original-observer-contract.mjs';
import { originalHandlerLocation } from './vitest-native-worker/original-observer-source.mjs';
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
  settlement: { lineNumber: 110, columnNumber: 4 }, handlerName: 'handler5' };
const ids = new Map([['call-id', 'preCall'], ['entry-id', 'entry'], ['settled-id', 'settlement']]);
const resolved = new Set(['preCall', 'entry', 'settlement']);
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
  { functionName: 'handler5', location: located(points.entry) },
  { functionName: 'main5', location: located(points.preCall) },
] };
assert.equal(validateOriginalPauseFrame(pause, points, scriptId, ids, resolved).name, 'entry');
const sameLineCaller = structuredClone(pause); sameLineCaller.callFrames[1].location.columnNumber++;
assert.equal(validateOriginalPauseFrame(sameLineCaller, points, scriptId, ids, resolved).name, 'entry',
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
  rejectsCorrelation(name, () => validateOriginalPauseFrame(changed, points, scriptId, ids, resolved));
}
rejectsCorrelation('pause before script authentication', () => validateOriginalPauseFrame(pause, points, null, ids, resolved));
rejectsCorrelation('pause before all exact resolutions', () => validateOriginalPauseFrame(pause, points, scriptId, ids, new Set(['entry'])));
const selfOnly = { hitBreakpoints: ['entry-id'], callFrames: [{ functionName: 'handler5', location: located(points.entry) }] };
rejectsCorrelation('current frame cannot be its own caller', () => validateOriginalPauseFrame(selfOnly,
  { ...points, preCall: points.entry }, scriptId, ids, resolved));
// Generic programming faults must not be silently classified as supported/unsupported input.
assert.throws(() => validateOriginalPossibleLocation(null, points.entry, scriptId), TypeError);

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
console.log(JSON.stringify({ negativeCases, sourceSelectionNegatives, correlationNegatives, state: 'PASSED' , evidenceScope: 'source-contract',
  qualificationContractRevision: 2, completeness: false, productionEligible: false,
  inspectorFeasibilityMeasured: false }));
