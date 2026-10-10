// Pure source-report decisions. Synthetic events never authenticate Inspector execution.
import { requireValue } from '../vitest-release/files.mjs';

export const observerLimits = Object.freeze({ events: 32, summary: 65_536, commands: 32,
  messages: 4096, protocolBytes: 40_000_000, messageBytes: 20_000_000,
  operationMs: 5000, setupMs: 10_000, lifetimeMs: 30_000, cleanupMs: 3000,
  outputBytes: 131_072, pauses: 8 });
export class UnsupportedObservation extends Error {
  constructor(reason, message) { super(message); this.name = 'UnsupportedObservation'; this.reason = reason; }
}
export function exact(value, keys, message = 'Unknown observer contract fields') {
  requireValue(value && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).sort().join(',') === [...keys].sort().join(','), message);
}
const phases = ['launch', 'pre-call-pause', 'handler-entry', 'handler-settlement', 'native-terminal'];
function outcome(value) {
  exact(value, ['exitCode', 'signal']);
  requireValue(value.exitCode === null || Number.isInteger(value.exitCode) && value.exitCode >= 0 && value.exitCode <= 255,
    'Invalid observed native exit');
  requireValue(value.signal === null || ['SIGTERM', 'SIGINT', 'SIGKILL'].includes(value.signal), 'Invalid observed native signal');
  requireValue((value.exitCode === null) !== (value.signal === null), 'Native terminal needs one actual exit or signal');
}
export function summarizeOriginalObservation({ category, events }) {
  requireValue(['install', 'update', 'dedupe'].includes(category), 'Unsupported fixed observer category');
  requireValue(Array.isArray(events) && events.length <= observerLimits.events, 'Observer event bound exceeded');
  const seen = new Set(); let failed = false; let terminal = false; let nativeOutcome = null;
  for (const [index, event] of events.entries()) {
    const extra = event.phase === 'native-terminal' ? ['outcome'] :
      event.phase === 'observer-failure' ? ['reason', 'intervention'] :
      event.phase === 'launch' ? [] : event.phase === 'handler-settlement' ? ['location', 'settlement'] :
      event.phase === 'pre-call-pause' && !('location' in event) ? [] : ['location'];
    exact(event, ['phase', 'sequence', ...extra]);
    requireValue(event.sequence === index && !terminal && !seen.has(event.phase), 'Replayed, late or unordered observer event');
    requireValue(phases.includes(event.phase) || event.phase === 'observer-failure', 'Unknown observer phase');
    if (event.phase !== 'launch') requireValue(seen.has('launch'), 'Observer event before native launch');
    if (event.phase === 'handler-entry') requireValue(seen.has('pre-call-pause') && !failed, 'Handler entry lacks authentic call ordering');
    if (event.phase === 'handler-settlement') requireValue(seen.has('handler-entry') && !failed && event.settlement === 'resolved',
      'Handler settlement cannot be inferred from process exit');
    if ('location' in event) {
      exact(event.location, ['scriptSha256', 'lineNumber', 'columnNumber', 'functionName']);
      requireValue(/^[a-f0-9]{64}$/.test(event.location.scriptSha256) &&
        Number.isInteger(event.location.lineNumber) && event.location.lineNumber >= 0 &&
        Number.isInteger(event.location.columnNumber) && event.location.columnNumber >= 0 &&
        typeof event.location.functionName === 'string' && /^[A-Za-z0-9_$]{0,64}$/.test(event.location.functionName),
      'Invalid normalized source location');
    }
    if (failed) requireValue(event.phase === 'native-terminal', 'Semantic event after observer failure');
    if (event.phase === 'observer-failure') {
      requireValue(['protocol', 'source', 'location', 'disconnect', 'timeout', 'cancelled', 'bounds', 'identity'].includes(event.reason) &&
        ['none', 'resume-disconnect', 'signal-owned-process'].includes(event.intervention), 'Unknown observer failure');
      failed = true;
    }
    if (event.phase === 'native-terminal') { outcome(event.outcome); nativeOutcome = structuredClone(event.outcome); terminal = true; }
    seen.add(event.phase);
  }
  const missingClaims = phases.filter(phase => !seen.has(phase));
  const report = { schemaVersion: 1, qualificationContractRevision: 2, evidenceScope: 'source-fixture',
    category, state: failed ? 'unsupported' : missingClaims.length ? 'incomplete' : 'supported',
    completeness: false, productionEligible: false, observedPhases: phases.filter(phase => seen.has(phase)),
    missingClaims, nativeOutcome, events: structuredClone(events) };
  requireValue(Buffer.byteLength(JSON.stringify(report)) <= observerLimits.summary, 'Observer summary bound exceeded');
  return report;
}
export function validateOriginalObservationReport(report) {
  exact(report, ['schemaVersion', 'qualificationContractRevision', 'evidenceScope', 'category', 'state',
    'completeness', 'productionEligible', 'observedPhases', 'missingClaims', 'nativeOutcome', 'events']);
  requireValue(report.schemaVersion === 1 && report.qualificationContractRevision === 2 &&
    report.evidenceScope === 'source-fixture' && report.completeness === false && report.productionEligible === false,
  'Source report completeness or eligibility promotion');
  const expected = summarizeOriginalObservation(report);
  requireValue(JSON.stringify(report) === JSON.stringify(expected), 'Source report differs from its normalized observations');
  return report;
}


// Closed source-fixture lifecycle diagnostics. These facts describe synchronous
// controller callback/continuation order, never target-side timestamps or causality.
export const originalLifecycleLimits = Object.freeze({ events: 96, bytes: 8192,
  eventFields: 12, eventBytes: 512, stringBytes: 64, elapsedMs: 120_000 });
const lifecycleMethods = ['Debugger.enable', 'Debugger.setBreakpointByUrl', 'Debugger.getScriptSource',
  'Debugger.getPossibleBreakpoints', 'Debugger.resume', 'Runtime.runIfWaitingForDebugger'];
const lifecycleReasons = ['protocol', 'source', 'location', 'disconnect', 'timeout', 'cancelled', 'bounds', 'identity'];
const lifecycleStatuses = ['available', 'unavailable', 'truncated'];
const lifecycleStatusReasons = ['invalid-correlation', 'invalid-clock', 'invalid-event', 'recorder-error', 'event-bound', 'byte-bound'];
const lifecycleFields = {
  'native-launch': [], 'controller-launch-receipt': [], 'endpoint-observed': [], 'protocol-open': [],
  'command-issued': ['method', 'commandId'], 'command-acknowledged': ['method', 'commandId', 'accepted'],
  'protocol-response-error': ['method', 'commandId'],
  'protocol-close-request': [], 'protocol-socket-close': ['intentional'],
  'script-authenticated': [], 'breakpoint-resolved': ['point'], 'semantic-pause': ['point'], 'diagnostic-pause': ['point'], 'initial-pause': [],
  'controller-receipt': ['site'], 'observer-failure': ['reason'],
  'frame-rejection': ['point', 'check', 'name', 'expectedName', 'functionLocation', 'expectedLocation', 'script', 'line', 'column'],
  'frame-rejection-coordinates': ['point', 'lineNumber', 'columnNumber'],
  'native-shutdown-cue': [], 'native-lifetime-expired': [], 'native-stream-close': [],
  'native-exit': ['exitCode', 'signal'], 'native-failure': ['site', 'reason'],
  'native-cancel-request': ['reason'], 'native-stop-request': ['site', 'reason'],
  'native-signal-request': ['signal'], 'native-owned-signal': ['signal'], 'native-group-empty': [],
  'native-group-failure': ['site', 'signal', 'reason'],
};
const frameChecks = ['name', 'expectedName', 'functionLocation', 'expectedLocation', 'script', 'line', 'column'];
const frameKinds = ['absent', 'null', 'array', 'string', 'number', 'boolean', 'object', 'other'];
function frameRejection(value) {
  requireValue(frameChecks.includes(value.check), 'Unknown dispatch rejection check');
  const failed = frameChecks.indexOf(value.check);
  for (const [index, field] of frameChecks.entries()) {
    const status = value[field];
    const location = ['functionLocation', 'expectedLocation'].includes(field);
    const pass = field === 'name' ? ['empty-match', 'other-match', 'absent-match', 'malformed-match'].includes(status) :
      location ? frameKinds.map(kind => `${kind}-truthy`).includes(status) : status === 'match';
    const fail = field === 'name' ? ['empty-mismatch', 'other-mismatch', 'absent-mismatch', 'malformed-mismatch'].includes(status) :
      location ? frameKinds.map(kind => `${kind}-falsy`).includes(status) : frameKinds.map(kind => `${kind}-mismatch`).includes(status);
    requireValue(index < failed ? pass : index === failed ? fail : status === 'not-evaluated',
      'Inconsistent dispatch rejection evaluation');
    if (location) requireValue(!['absent-truthy', 'null-truthy', 'object-falsy', 'array-falsy'].includes(status),
      'Impossible dispatch location presence/type');
  }
}
function lifecycleCorrelation(value) {
  exact(value, ['recipe', 'category', 'role', 'launch']);
  requireValue(['empty-v1', 'offline-miss-v1'].includes(value.recipe) &&
    ['install', 'update', 'dedupe'].includes(value.category) && ['original', 'derived'].includes(value.role) &&
    value.launch === ['install', 'update', 'dedupe'].indexOf(value.category) * 2 + (value.role === 'derived' ? 1 : 0),
  'Unknown lifecycle launch correlation');
}
function lifecycleEvent(value, sequenced) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Unknown lifecycle event');
  const fields = value.event === 'protocol-failure' ? ['site', 'reason', 'alreadyFailed',
    ...('method' in value || 'commandId' in value ? ['method', 'commandId'] : [])] : lifecycleFields[value.event];
  requireValue(fields, 'Unknown lifecycle event kind');
  exact(value, ['event', ...fields, ...(sequenced ? ['sequence', 'elapsedMs'] : [])]);
  requireValue(Object.keys(value).length <= originalLifecycleLimits.eventFields &&
    Buffer.byteLength(JSON.stringify(value)) <= originalLifecycleLimits.eventBytes &&
    Object.values(value).every(item => item === null || typeof item === 'boolean' ||
      typeof item === 'number' && Number.isSafeInteger(item) ||
      typeof item === 'string' && Buffer.byteLength(item) <= originalLifecycleLimits.stringBytes),
  'Lifecycle field or byte bound exceeded');
  if (sequenced) requireValue(Number.isInteger(value.sequence) && value.sequence >= 0 && value.sequence < originalLifecycleLimits.events &&
    Number.isInteger(value.elapsedMs) && value.elapsedMs >= 0 && value.elapsedMs <= originalLifecycleLimits.elapsedMs,
  'Invalid lifecycle sequence or elapsed offset');
  if ('method' in value) requireValue(lifecycleMethods.includes(value.method) &&
    Number.isInteger(value.commandId) && value.commandId >= 1 && value.commandId <= observerLimits.commands,
  'Unknown lifecycle command linkage');
  if ('reason' in value) requireValue(lifecycleReasons.includes(value.reason) ||
    value.event === 'native-group-failure' && value.reason === null, 'Unknown lifecycle failure reason');
  if ('point' in value) requireValue((value.event.startsWith('frame-rejection') ? ['preCall', 'entry', 'preCleanup', 'settlement'] :
    value.event === 'diagnostic-pause' ? ['preCleanup'] :
    value.event === 'breakpoint-resolved' ? ['preCall', 'entry', 'preCleanup', 'settlement'] :
      ['preCall', 'entry', 'settlement']).includes(value.point), 'Unknown lifecycle source point');
  if (value.event === 'frame-rejection') frameRejection(value);
  if (value.event === 'frame-rejection-coordinates') requireValue(['lineNumber', 'columnNumber'].every(field =>
    value[field] === null || Number.isInteger(value[field]) && value[field] >= 0 && value[field] <= 2_147_483_647),
  'Invalid bounded dispatch rejection coordinate');
  if (value.event === 'protocol-failure') requireValue(typeof value.alreadyFailed === 'boolean' &&
    ['connection', 'command-response', 'notification-wait', 'socket-error', 'socket-close', 'message', 'intentional-close', 'external'].includes(value.site) &&
    (value.site === 'command-response') === ('method' in value), 'Unknown lifecycle protocol failure site');
  if (value.event === 'command-acknowledged') requireValue(typeof value.accepted === 'boolean', 'Unknown lifecycle response state');
  if (value.event === 'protocol-socket-close') requireValue(typeof value.intentional === 'boolean', 'Unknown lifecycle close state');
  if (value.event === 'controller-receipt') requireValue(['notification', 'shutdown-cue', 'stream-close', 'failure'].includes(value.site),
    'Unknown lifecycle controller receipt');
  if (value.event === 'native-failure') requireValue(['endpoint-setup', 'lifetime', 'output-bound', 'cancellation', 'spawn', 'endpoint-exit'].includes(value.site),
    'Unknown lifecycle native failure site');
  if (value.event === 'native-stop-request') requireValue(['ownedNativeProcess.stop', 'ownedNativeProcess.cancel', 'ownedNativeProcess.finish',
    'observeOriginal:unexpected-error', 'observeOriginal:unsupported'].includes(value.site), 'Unknown lifecycle stop site');
  if (value.event === 'native-group-failure') requireValue(['groupEmpty', 'signalGroup'].includes(value.site), 'Unknown lifecycle group site');
  if (value.event === 'native-exit') outcome({ exitCode: value.exitCode, signal: value.signal });
  else if ('signal' in value) requireValue(['SIGTERM', 'SIGKILL'].includes(value.signal) ||
    value.event === 'native-group-failure' && value.signal === 0, 'Unknown lifecycle owned signal');
}
function lifecycleDiagnosticOrder(event, role, previous) {
  if (event.event.startsWith('frame-rejection')) {
    requireValue(role === 'original', 'Derived launch cannot emit dispatch rejection diagnostics');
    if (event.event === 'frame-rejection') requireValue(!previous.some(item => item.event.startsWith('frame-rejection') ||
      ['observer-failure', 'protocol-failure', 'protocol-close-request', 'native-exit', 'native-stream-close'].includes(item.event)),
    'Replayed or late dispatch rejection');
    else {
      const rejection = previous.at(-1);
      requireValue(rejection?.event === 'frame-rejection' && rejection.point === event.point,
        'Unlinked dispatch rejection coordinates');
      for (const [field, coordinate] of [['line', 'lineNumber'], ['column', 'columnNumber']])
        requireValue(event[coordinate] === null || ['match', 'number-mismatch'].includes(rejection[field]),
          'Coordinate retained for skipped or nonnumeric dispatch comparison');
    }
  }
  if (event.event === 'breakpoint-resolved' || event.event === 'diagnostic-pause')
    requireValue(role === 'original', 'Derived launch cannot emit original breakpoint diagnostics');
  if (event.event !== 'diagnostic-pause') return;
  requireValue(['preCall', 'entry'].every(point => previous.some(item => item.event === 'semantic-pause' && item.point === point)) &&
    !previous.some(item => item.event === 'diagnostic-pause' || item.event === 'semantic-pause' && item.point === 'settlement' ||
      ['observer-failure', 'protocol-failure', 'protocol-close-request', 'native-exit', 'native-stream-close'].includes(item.event)),
  'Replayed, late or unordered pre-cleanup diagnostic pause');
}
function lifecycleOrigin(event) {
  return event.event === 'protocol-failure' ? !event.alreadyFailed && event.site !== 'intentional-close' :
    ['native-failure', 'native-group-failure', 'protocol-response-error', 'observer-failure'].includes(event.event);
}
function lifecycleMissing(document) {
  const has = (event, site) => document.events.some(item => item.event === event && (site === undefined || item.site === site));
  const expected = [['native-exit', 'native-exit'], ['native-stream-close', 'native-stream-close'], ['group-empty', 'native-group-empty']];
  if (document.role === 'original') expected.push(['resume-issued', 'command-issued'], ['resume-acknowledged', 'command-acknowledged'],
    ['shutdown-cue', 'native-shutdown-cue'], ['controller-shutdown-receipt', 'controller-receipt', 'shutdown-cue'],
    ['protocol-close-request', 'protocol-close-request'], ['protocol-socket-close', 'protocol-socket-close'],
    ['pre-cleanup', 'diagnostic-pause']);
  return expected.filter(([name, event, site]) => name === 'resume-issued' ? document.lastResumeIssued === null :
    name === 'resume-acknowledged' ? document.lastResumeAcknowledged === null : !has(event, site)).map(([name]) => name);
}
// Guard optional diagnostic callbacks so observation can never replace native errors.
export function recordOriginalLifecycle(record, event) {
  try { if (typeof record === 'function') record(event); } catch { /* Native facts remain authoritative. */ }
}
export function createOriginalLifecycleDiagnostics(correlation, clock = () => process.hrtime.bigint()) {
  let started = null; let lastTime = null; let lastElapsed = 0;
  const document = { schemaVersion: 1, evidenceScope: 'source-fixture', recipe: null, category: null, role: null, launch: null,
    state: 'available', reason: null, firstFailure: null, lastResumeIssued: null, lastResumeAcknowledged: null,
    events: [], missingObservations: [] };
  const stop = (state, reason) => { if (document.state === 'available') { document.state = state; document.reason = reason; } };
  try { lifecycleCorrelation(correlation); Object.assign(document, correlation); }
  catch { for (const key of ['recipe', 'category', 'role', 'launch']) document[key] = null;
    stop('unavailable', 'invalid-correlation'); }
  try { started = clock(); lastTime = started; if (typeof started !== 'bigint') stop('unavailable', 'invalid-clock'); }
  catch { stop('unavailable', 'invalid-clock'); }
  function record(value) {
    if (document.state !== 'available') return;
    try {
      try { lifecycleEvent(value, false); lifecycleDiagnosticOrder(value, document.role, document.events); } catch { stop('unavailable', 'invalid-event'); return; }
      let now;
      try { now = clock(); } catch { stop('unavailable', 'invalid-clock'); return; }
      if (typeof now !== 'bigint' || now < lastTime) { stop('unavailable', 'invalid-clock'); return; }
      const elapsedMs = Number((now - started) / 1_000_000n);
      if (!Number.isSafeInteger(elapsedMs) || elapsedMs < lastElapsed || elapsedMs > originalLifecycleLimits.elapsedMs) {
        stop('unavailable', 'invalid-clock'); return;
      }
      if (document.events.length >= originalLifecycleLimits.events) { stop('truncated', 'event-bound'); return; }
      const event = { ...value, sequence: document.events.length, elapsedMs };
      lifecycleEvent(event, true);
      // Reserve room for the terminal status/reason and all fixed missing markers.
      const candidate = { ...document, events: [...document.events, event], missingObservations: lifecycleMissing(document) };
      if (Buffer.byteLength(JSON.stringify(candidate)) > originalLifecycleLimits.bytes - 512) { stop('truncated', 'byte-bound'); return; }
      document.events.push(event); lastTime = now; lastElapsed = elapsedMs;
      if (document.firstFailure === null && lifecycleOrigin(event)) document.firstFailure = event.sequence;
      if (event.method === 'Debugger.resume' && event.event === 'command-issued') document.lastResumeIssued = event.commandId;
      if (event.method === 'Debugger.resume' && event.event === 'command-acknowledged') document.lastResumeAcknowledged = event.commandId;
    } catch { stop('unavailable', 'recorder-error'); }
  }
  function snapshot() {
    // Only bounded, controller-created primitives are retained. Never retain the
    // supplied event object, protocol payloads, endpoint, frames or native output.
    try {
      document.missingObservations = lifecycleMissing(document);
      return JSON.parse(JSON.stringify(document));
    } catch {
      const fallback = { ...document, state: 'unavailable', reason: 'recorder-error', events: [],
        firstFailure: null, lastResumeIssued: null, lastResumeAcknowledged: null, missingObservations: [] };
      fallback.missingObservations = lifecycleMissing(fallback);
      return fallback;
    }
  }
  return { record, snapshot };
}
export function validateOriginalLifecycleDiagnostics(document, { requireAvailable = false, correlation = null } = {}) {
  exact(document, ['schemaVersion', 'evidenceScope', 'recipe', 'category', 'role', 'launch', 'state', 'reason',
    'firstFailure', 'lastResumeIssued', 'lastResumeAcknowledged', 'events', 'missingObservations']);
  requireValue(document.schemaVersion === 1 && document.evidenceScope === 'source-fixture' && lifecycleStatuses.includes(document.state) &&
    (document.state === 'available' ? document.reason === null : document.state === 'truncated' ?
      ['event-bound', 'byte-bound'].includes(document.reason) : lifecycleStatusReasons.slice(0, 4).includes(document.reason)) &&
    (!requireAvailable || document.state === 'available'), 'Unavailable, truncated or unknown lifecycle diagnostics');
  if (document.reason === 'invalid-correlation') requireValue(['recipe', 'category', 'role', 'launch'].every(key => document[key] === null),
    'Invalid lifecycle correlation was retained');
  else lifecycleCorrelation({ recipe: document.recipe, category: document.category, role: document.role, launch: document.launch });
  if (correlation !== null) { lifecycleCorrelation(correlation);
    requireValue(Object.entries(correlation).every(([key, value]) => document[key] === value), 'Lifecycle diagnostic correlation differs'); }
  requireValue(Array.isArray(document.events) && document.events.length <= originalLifecycleLimits.events &&
    Buffer.byteLength(JSON.stringify(document)) <= originalLifecycleLimits.bytes, 'Lifecycle diagnostic bound exceeded');
  let elapsed = 0; let firstFailure = null; let issued = null; let acknowledged = null;
  const commands = new Map(); const acknowledgements = new Set();
  for (const [index, event] of document.events.entries()) {
    lifecycleEvent(event, true); lifecycleDiagnosticOrder(event, document.role, document.events.slice(0, index));
    requireValue(event.sequence === index && event.elapsedMs >= elapsed, 'Replayed or unordered lifecycle event'); elapsed = event.elapsedMs;
    if (firstFailure === null && lifecycleOrigin(event)) firstFailure = index;
    if (event.event === 'command-issued') {
      requireValue(!commands.has(event.commandId), 'Replayed lifecycle command'); commands.set(event.commandId, event.method);
      if (event.method === 'Debugger.resume') issued = event.commandId;
    }
    if (event.event === 'command-acknowledged' || event.event === 'protocol-response-error' ||
      event.event === 'protocol-failure' && event.site === 'command-response') requireValue(commands.get(event.commandId) === event.method,
      'Uncorrelated lifecycle response/timeout');
    if (event.event === 'command-acknowledged') {
      requireValue(!acknowledgements.has(event.commandId), 'Replayed lifecycle acknowledgement'); acknowledgements.add(event.commandId);
      if (event.method === 'Debugger.resume') acknowledged = event.commandId;
    }
  }
  const rejection = document.events.findIndex(event => event.event === 'frame-rejection');
  if (rejection !== -1 && document.state === 'available') requireValue(
    document.events[rejection + 1]?.event === 'frame-rejection-coordinates' &&
    document.events[rejection + 2]?.event === 'controller-receipt' && document.events[rejection + 2].site === 'failure' &&
    document.events[rejection + 3]?.event === 'observer-failure' && document.events[rejection + 3].reason === 'location',
  'Dispatch rejection lacks its unchanged observer failure linkage');
  requireValue(document.firstFailure === firstFailure && document.lastResumeIssued === issued && document.lastResumeAcknowledged === acknowledged &&
    JSON.stringify(document.missingObservations) === JSON.stringify(lifecycleMissing(document)), 'Lifecycle diagnostic summary differs');
  return document;
}
