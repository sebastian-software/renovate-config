// Documentary state regression only; these events establish no Inspector feasibility.
import assert from 'node:assert/strict';
import { summarizeOriginalObservation, validateOriginalObservationReport }
  from './vitest-native-worker/original-observer-contract.mjs';

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
console.log(JSON.stringify({ negativeCases, state: 'PASSED' , evidenceScope: 'source-contract',
  qualificationContractRevision: 2, completeness: false, productionEligible: false,
  inspectorFeasibilityMeasured: false }));
